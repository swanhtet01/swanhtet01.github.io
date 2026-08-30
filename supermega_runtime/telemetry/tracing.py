"""OpenTelemetry wiring for the SuperMega FastAPI runtime — Phase A.

Phase A (see the implementation plan, section 6) is local-only:

* Default behaviour (no ``OTEL_LOCAL`` env var) exports spans to the
  process console only. No network call is made. This mirrors CLAUDE.md's
  "any capability that needs a key fails closed and makes no network call
  when the key is absent" principle, applied here to "no collector
  configured."
* Setting ``OTEL_LOCAL=1`` switches to an OTLP gRPC exporter pointed at
  ``OTEL_EXPORTER_OTLP_ENDPOINT`` (default ``localhost:4317`` — a local
  Jaeger, see ``docker-compose.telemetry.yml``).
* Every exporter, console or OTLP, sits behind the same
  ``RedactingSpanProcessor``. There is no code path that reaches an
  exporter without going through the scrubber first.

Nothing in this module is imported by default from
``supermega_runtime.runtime`` unless ``configure_tracing`` is called
explicitly from ``create_app()``, and every call here is wrapped so that a
missing/broken OTEL dependency degrades to a no-op rather than breaking the
API — instrumentation must never change existing behaviour.
"""

from __future__ import annotations

from contextlib import contextmanager
import json
import logging
import os
from collections.abc import Iterator
from typing import Any

from supermega_runtime.telemetry import redact
from supermega_runtime.telemetry.errors import build_error_event


_LOGGER = logging.getLogger("supermega.telemetry")
SERVICE_NAME = "supermega-runtime"
_DEFAULT_OTLP_ENDPOINT = "localhost:4317"

_tracer_provider: Any = None
_psycopg_instrumented = False


def _flag(name: str) -> bool:
    value = str(os.getenv(name) or "").strip().casefold()
    return value in {"1", "true", "yes", "on"}


def tracing_enabled() -> bool:
    """Tracing is opt-out via `SUPERMEGA_OTEL_DISABLED=1`, never opt-in.

    Phase A instrumentation is additive and must not require configuration
    to exist; the console exporter has no external dependency and makes no
    network call, so it is safe to run by default. An explicit escape hatch
    is kept for environments (e.g. a constrained CI sandbox) that want it
    off entirely.
    """

    return not _flag("SUPERMEGA_OTEL_DISABLED")


class RedactingSpanProcessor:
    """Scrubs every span's attributes before handing it to a real exporter.

    This does not subclass a fixed ``SpanExporter``/``SpanProcessor`` pair
    at import time — the OTEL SDK types are resolved lazily inside
    `configure_tracing` so this module can be imported (and its pure-Python
    helpers unit tested) even when the `opentelemetry-sdk` package is not
    installed.
    """

    def __init__(self, exporter: Any):
        self._exporter = exporter

    def on_start(self, span: Any, parent_context: Any = None) -> None:  # noqa: D401
        return None

    def _on_ending(self, span: Any) -> None:  # noqa: D401 - required by SpanProcessor's newer lifecycle hook
        return None

    def on_end(self, span: Any) -> None:
        try:
            context = span.get_span_context() if hasattr(span, "get_span_context") else span.context
            if context is not None and not context.trace_flags.sampled:
                return
        except Exception:  # pragma: no cover - defensive, never blocks a scrub
            pass
        try:
            sanitized = self._sanitized_copy(span)
        except Exception:  # pragma: no cover - a scrub bug must never leak a span
            _LOGGER.exception("supermega.telemetry: span scrub failed; dropping span")
            return
        self._exporter.export((sanitized,))

    def shutdown(self) -> None:
        self._exporter.shutdown()

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        flush = getattr(self._exporter, "force_flush", None)
        if callable(flush):
            try:
                return bool(flush(timeout_millis))
            except Exception:  # pragma: no cover
                return False
        return True

    @staticmethod
    def _sanitized_copy(span: Any) -> Any:
        """Build a new, exporter-bound ReadableSpan with scrubbed name/attributes.

        `ReadableSpan.attributes` is an immutable `BoundedAttributes` by the
        time a span reaches `on_end` (`immutable=True` is the SDK's default
        once a span ends), so it cannot be edited in place. Constructing a
        fresh `ReadableSpan` via its public constructor — rather than
        reaching into `_immutable`/`_attributes` to force a mutation — keeps
        this scrubber independent of that private implementation detail.

        Events are scrubbed too, and that is not a formality. When an
        instrumented request raises, the ASGI instrumentation calls
        `Span.record_exception`, which attaches `exception.message`
        (`str(exc)` verbatim) and `exception.stacktrace` as a span event.
        An earlier version of this method copied `events=span.events`
        straight through, so a `RuntimeError` naming a customer, a phone
        number, or an MMK amount reached the exporter in full even though
        the span's own attributes were clean. `redact.scrub_events` digests
        the message and drops the stacktrace; see
        `tests/telemetry/test_span_events.py` for the end-to-end proof
        through the real FastAPI instrumentation.
        """

        from opentelemetry.sdk.trace import ReadableSpan

        current = dict(span.attributes or {})
        if any(key in current for key in redact.FORBIDDEN_ATTRIBUTE_KEYS):
            current = redact.enrich_and_scrub_db_attributes(current)
        sanitized_attributes = redact.scrub_attributes(current)
        sanitized_name = redact.scrub_span_name(span.name)
        return ReadableSpan(
            name=sanitized_name,
            context=span.context,
            parent=span.parent,
            resource=span.resource,
            attributes=sanitized_attributes,
            events=redact.scrub_events(span.events),
            links=span.links,
            kind=span.kind,
            status=span.status,
            start_time=span.start_time,
            end_time=span.end_time,
            instrumentation_scope=getattr(span, "instrumentation_scope", None),
        )


def _build_exporter() -> Any:
    from opentelemetry.sdk.trace.export import ConsoleSpanExporter

    if not _flag("OTEL_LOCAL"):
        return ConsoleSpanExporter()
    try:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
    except ImportError:  # pragma: no cover - exporter dependency missing
        _LOGGER.warning(
            "supermega.telemetry: OTEL_LOCAL=1 but the OTLP exporter is not "
            "installed; falling back to the console exporter."
        )
        return ConsoleSpanExporter()
    endpoint = str(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or _DEFAULT_OTLP_ENDPOINT).strip()
    return OTLPSpanExporter(endpoint=endpoint, insecure=True)


def configure_tracing() -> Any | None:
    """Idempotently build (or return) the process TracerProvider.

    Returns ``None`` when tracing is disabled or the OTEL SDK is
    unavailable — callers must treat that as "instrumentation is off," not
    as an error.
    """

    global _tracer_provider
    if _tracer_provider is not None:
        return _tracer_provider
    if not tracing_enabled():
        return None
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
    except ImportError:  # pragma: no cover - OTEL SDK not installed
        _LOGGER.warning("supermega.telemetry: opentelemetry-sdk is not installed; tracing is off.")
        return None

    resource = Resource.create({"service.name": SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    processor = RedactingSpanProcessor(_build_exporter())
    provider.add_span_processor(processor)  # type: ignore[arg-type]

    # `set_tracer_provider` warns (and no-ops) if called twice in the same
    # process — tests re-import this module often, so only call it once.
    current = trace.get_tracer_provider()
    if type(current).__name__ != "TracerProvider":
        trace.set_tracer_provider(provider)
    _tracer_provider = provider
    return provider


def get_tracer(instrumenting_module_name: str = __name__) -> Any:
    """Return a tracer bound to the configured provider, or a real no-op tracer."""

    provider = configure_tracing()
    from opentelemetry import trace

    if provider is None:
        # `trace.get_tracer` with no provider configured returns the SDK's
        # own `NoOpTracer` — spans it starts are inert but the context
        # manager protocol still works, so callers never need an `if`.
        return trace.get_tracer(instrumenting_module_name)
    return provider.get_tracer(instrumenting_module_name)


def instrument_fastapi_app(app: Any) -> None:
    """Attach OTEL's ASGI/FastAPI auto-instrumentation to `app`.

    This is what performs the actual W3C `traceparent`/`tracestate`
    extraction (plan step 3) — FastAPIInstrumentor wraps the ASGI app with
    `opentelemetry.instrumentation.asgi.OpenTelemetryMiddleware`, which
    calls the global propagator's `extract()` on every request before
    starting the root span, so an inbound `traceparent` header is honoured
    automatically. The span name it derives is the FastAPI *route template*
    (e.g. ``POST /api/trial/v1/commands``), never the literal request
    path — this codebase's routes carry no path parameters, so the route
    template already satisfies "not the raw HTTP path which could contain
    IDs" with no extra renaming required.
    """

    provider = configure_tracing()
    if provider is None:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    except ImportError:  # pragma: no cover
        _LOGGER.warning("supermega.telemetry: FastAPI instrumentation is not installed.")
        return
    if getattr(app.state, "_supermega_otel_instrumented", False):
        return
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    app.state._supermega_otel_instrumented = True


def instrument_psycopg() -> None:
    """Instrument Psycopg 3 with `db.statement` capture explicitly disabled.

    `PsycopgInstrumentor().instrument()` in the pinned library version
    (0.65b0) has no keyword that suppresses `db.statement`/`db.query.text`
    outright — `capture_parameters` only controls *bound parameter values*,
    while the raw SQL text is always attached to the span
    (`opentelemetry.instrumentation.dbapi._populate_span` calls
    `_set_db_statement` unconditionally). `capture_parameters=False` and
    `enable_attribute_commenter=False` are still passed here for defense in
    depth against parameter capture, but the actual guarantee that
    `db.statement` never reaches an exporter is enforced downstream by
    `RedactingSpanProcessor`, which always drops
    `schema.FORBIDDEN_ATTRIBUTE_KEYS` (see
    `redact.enrich_and_scrub_db_attributes`) after deriving the safe
    `db.operation` / `db.collection` attributes the plan asks for.
    """

    global _psycopg_instrumented
    if _psycopg_instrumented:
        return
    provider = configure_tracing()
    if provider is None:
        return
    try:
        from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    except ImportError:  # pragma: no cover
        _LOGGER.warning("supermega.telemetry: psycopg instrumentation is not installed.")
        return
    instrumentor = PsycopgInstrumentor()
    if instrumentor.is_instrumented_by_opentelemetry:
        _psycopg_instrumented = True
        return
    instrumentor.instrument(
        tracer_provider=provider,
        enable_commenter=False,
        capture_parameters=False,
        enable_attribute_commenter=False,
    )
    _psycopg_instrumented = True


async def _traceparent_middleware(request: Any, call_next: Any) -> Any:
    """Scope the customer-content deny-list to this request's lifetime.

    W3C trace-context propagation itself is handled by the ASGI layer added
    in `instrument_fastapi_app` — this middleware's job is narrower: read
    the (JSON) request body so `RedactingSpanProcessor` can check span
    attribute values against *this* request's customer-content fields
    before any span this request produces is exported (redaction rule 1).
    Reading `request.body()` here is safe: Starlette caches the raw bytes,
    so the route handler's own `await request.json()` still sees the same
    body — this middleware changes no request or response behaviour.
    """

    token = None
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type.lower():
            body_bytes = await request.body()
            if body_bytes:
                payload = json.loads(body_bytes)
                token = redact.push_customer_content_scope(payload)
    except Exception:  # pragma: no cover - malformed/oversized bodies are the route's problem
        token = None
    if token is None:
        token = redact.push_customer_content_scope(None)
    try:
        return await call_next(request)
    finally:
        redact.pop_customer_content_scope(token)


def install_traceparent_middleware(app: Any) -> None:
    """Register the request-scoped customer-content middleware on `app`."""

    if getattr(app.state, "_supermega_traceparent_middleware", False):
        return
    app.middleware("http")(_traceparent_middleware)
    app.state._supermega_traceparent_middleware = True


@contextmanager
def domain_span(name: str, **attributes: Any) -> Iterator[Any]:
    """Start a manual domain span with only whitelisted attributes attached.

    A thin convenience wrapper around `tracer.start_as_current_span` so
    call sites never hand-roll attribute dicts that might include a
    non-whitelisted (and therefore silently dropped downstream) key without
    noticing. Values are passed through as given — the `RedactingSpanProcessor`
    still re-checks every value at export time, so this is a courtesy for
    callers, not the security boundary.
    """

    tracer = get_tracer("supermega_runtime.telemetry")
    with tracer.start_as_current_span(name) as span:
        for key, value in attributes.items():
            if value is None:
                continue
            span.set_attribute(key, value)
        yield span


def install_error_lane(app: Any) -> None:
    """Record unhandled exceptions on the current span, then re-raise.

    The server half of the error lane the scorecard's observability
    recommendation 2 asks for ("an error lane on the existing no-PII beacon,
    not Sentry"); ``showroom/src/core/client-error-reporter.ts`` is the
    browser half. Attributes come from ``telemetry.errors``, where every key
    is whitelisted and the message text is reduced to a one-way digest.

    Two properties this must never lose:

    * It RE-RAISES the original exception. This handler observes; it does not
      handle. FastAPI's own error handling, status codes and response bodies
      are unchanged, so installing the lane cannot alter what a client sees.
    * It is fail-open. Any fault inside the lane is swallowed and the original
      exception still propagates — an observability bug must never convert a
      handled failure into an unhandled one, nor mask the real cause.

    ``supermega_runtime/runtime.py`` is digest-bound (verify_hq_contract's
    databaseImplementationPaths), so the lane is installed from here, through
    the ``instrument_app`` seam that runtime.py already calls, rather than by
    editing runtime.py and triggering the rehearsal cascade.
    """

    try:
        from starlette.middleware.base import BaseHTTPMiddleware
    except Exception:  # pragma: no cover - starlette absent: tracing is simply off
        _LOGGER.debug("supermega.telemetry: starlette unavailable; error lane not installed")
        return

    class _ErrorLaneMiddleware(BaseHTTPMiddleware):  # type: ignore[misc]
        async def dispatch(self, request: Any, call_next: Any) -> Any:
            try:
                return await call_next(request)
            except BaseException as exc:
                try:
                    from opentelemetry import trace as _trace

                    span = _trace.get_current_span()
                    attributes = build_error_event(exc, request=request)
                    if attributes and span is not None:
                        span.set_attributes(attributes)
                except Exception:  # pragma: no cover - never mask the real failure
                    _LOGGER.debug(
                        "supermega.telemetry: error lane could not annotate span",
                        exc_info=True,
                    )
                raise

    try:
        app.add_middleware(_ErrorLaneMiddleware)
    except Exception:  # pragma: no cover - a refused middleware must not break startup
        _LOGGER.debug("supermega.telemetry: error lane middleware not added", exc_info=True)


def instrument_app(app: Any) -> None:
    """One-call Phase A wiring: tracing provider + FastAPI + psycopg + middleware.

    Called from `supermega_runtime.runtime.create_app()`. Every step here is
    individually defensive (see the functions above), so a missing
    dependency or disabled flag degrades to "tracing is off," never to a
    broken app.
    """

    install_traceparent_middleware(app)
    instrument_fastapi_app(app)
    instrument_psycopg()
    install_error_lane(app)


__all__ = [
    "SERVICE_NAME",
    "tracing_enabled",
    "configure_tracing",
    "get_tracer",
    "instrument_fastapi_app",
    "instrument_psycopg",
    "install_traceparent_middleware",
    "instrument_app",
    "install_error_lane",
    "domain_span",
    "RedactingSpanProcessor",
]
