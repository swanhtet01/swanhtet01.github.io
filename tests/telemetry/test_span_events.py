"""Span events must not carry customer content to an exporter.

The regression these cover: OpenTelemetry's own exception recording attaches
`exception.message` (the verbatim `str(exc)`) and `exception.stacktrace` to a
span event whenever an instrumented request raises. `RedactingSpanProcessor`
scrubbed the span's name and attributes but copied its events through
untouched, so a failure whose message named a customer exported that name.

`test_exception_message_never_reaches_exporter` is the one that would have
caught it: it drives a real FastAPI app through the real instrumentation and
asserts on what the exporter actually received.
"""

from __future__ import annotations

import unittest

from supermega_runtime.telemetry import redact


class ScrubEventAttributesTests(unittest.TestCase):
    def test_exception_message_is_digested_not_copied(self) -> None:
        scrubbed = redact.scrub_event_attributes(
            {
                "exception.type": "RuntimeError",
                "exception.message": "customer Ma Thida owes 45,000 MMK",
                "exception.stacktrace": 'File "runtime.py", line 3\n  name = "Ma Thida"\n',
            }
        )
        self.assertNotIn("exception.message", scrubbed)
        self.assertNotIn("exception.stacktrace", scrubbed)
        self.assertIn("exception.message_digest", scrubbed)
        self.assertEqual(scrubbed["exception.type"], "RuntimeError")
        blob = repr(scrubbed)
        for leaked in ("Ma Thida", "45,000", "runtime.py"):
            self.assertNotIn(leaked, blob)

    def test_digest_is_stable_and_discriminating(self) -> None:
        first = redact.message_text_digest("order ORD-1042 failed")
        again = redact.message_text_digest("order ORD-1042 failed")
        other = redact.message_text_digest("order ORD-1043 failed")
        self.assertEqual(first, again)
        self.assertNotEqual(first, other)
        self.assertEqual(len(first), 12)

    def test_message_digest_agrees_with_the_error_lane(self) -> None:
        """One fault must digest identically on both paths, or they cannot be
        correlated in a backend."""

        from supermega_runtime.telemetry import errors

        exc = RuntimeError("customer Ma Thida owes 45,000 MMK")
        self.assertEqual(
            redact.message_text_digest(f"{type(exc).__name__}:{exc}"),
            errors.message_digest(exc),
        )

    def test_unprintable_message_does_not_propagate(self) -> None:
        class Hostile:
            def __str__(self) -> str:
                raise ValueError("nope")

        digest = redact.message_text_digest(Hostile())
        self.assertEqual(len(digest), 12)

    def test_dynamic_exception_class_name_cannot_smuggle_content(self) -> None:
        scrubbed = redact.scrub_event_attributes(
            {"exception.type": "Error_09776123456_failed"}
        )
        self.assertEqual(scrubbed["exception.type"], "[redacted]")

    def test_non_exception_event_attributes_still_whitelisted(self) -> None:
        scrubbed = redact.scrub_event_attributes(
            {"customer_name": "Ma Thida", "http.method": "GET"}
        )
        self.assertNotIn("customer_name", scrubbed)

    def test_none_attributes_are_tolerated(self) -> None:
        self.assertEqual(redact.scrub_event_attributes(None), {})


class ScrubEventsTests(unittest.TestCase):
    def test_event_name_is_scrubbed(self) -> None:
        class FakeEvent:
            name = "09776123456"
            attributes = {"http.method": "GET"}
            timestamp = 1

        scrubbed = redact.scrub_events([FakeEvent()])
        self.assertEqual(scrubbed[0].name, "[redacted]")

    def test_malformed_event_is_dropped_not_exported(self) -> None:
        class Hostile:
            @property
            def name(self) -> str:
                raise RuntimeError("boom")

        self.assertEqual(redact.scrub_events([Hostile()]), [])

    def test_empty_and_none_inputs(self) -> None:
        self.assertEqual(redact.scrub_events(None), [])
        self.assertEqual(redact.scrub_events([]), [])


class ExportedSpanTests(unittest.TestCase):
    """End-to-end through the real FastAPI instrumentation and processor."""

    def _export_failing_request(self):
        from fastapi import FastAPI
        from starlette.testclient import TestClient
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
            InMemorySpanExporter,
        )
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        from supermega_runtime.telemetry.tracing import RedactingSpanProcessor

        # RedactingSpanProcessor wraps an exporter directly (it *is* the
        # processor and calls `export` itself), so it is registered alone.
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(RedactingSpanProcessor(exporter))

        app = FastAPI()

        @app.get("/boom")
        def boom():  # pragma: no cover - body is the point, not the coverage
            raise RuntimeError("customer Ma Thida on 09776123456 owes 45,000 MMK")

        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
        TestClient(app, raise_server_exceptions=False).get("/boom")
        return exporter.get_finished_spans()

    def test_exception_message_never_reaches_exporter(self) -> None:
        spans = self._export_failing_request()
        self.assertTrue(spans, "instrumentation exported no spans")
        blob = "\n".join(
            f"{s.name} {dict(s.attributes or {})} "
            + " ".join(f"{e.name} {dict(e.attributes or {})}" for e in s.events)
            for s in spans
        )
        for leaked in ("Ma Thida", "09776123456", "45,000 MMK"):
            self.assertNotIn(leaked, blob, f"{leaked!r} reached the exporter")

    def test_the_exception_is_still_observable(self) -> None:
        """Scrubbing must not blind the lane: the fault is still reportable."""

        spans = self._export_failing_request()
        events = [e for s in spans for e in s.events if e.name == "exception"]
        self.assertTrue(events, "the exception event was dropped entirely")
        attrs = dict(events[0].attributes or {})
        self.assertEqual(attrs.get("exception.type"), "RuntimeError")
        self.assertIn("exception.message_digest", attrs)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
