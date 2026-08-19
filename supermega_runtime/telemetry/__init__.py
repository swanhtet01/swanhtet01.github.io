"""OpenTelemetry Phase A instrumentation for the SuperMega runtime.

Phase A is local-only: no hosted collector, no managed writes. See
``hq/research/opentelemetry-implementation-plan-2026-08.md`` for the full
plan. This package exists to be imported additively from
``supermega_runtime.runtime`` — importing it must never change API
behaviour, response shape, or write paths.
"""

from __future__ import annotations

__all__: list[str] = []
