"""Offline exporter-bound tests; never configure a network exporter."""

import unittest
from unittest.mock import patch

from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan
from opentelemetry.trace import SpanContext, Status, StatusCode, TraceFlags

from supermega_runtime.telemetry.tracing import RedactingSpanProcessor


class RecordingExporter:
    def __init__(self):
        self.spans = []

    def export(self, spans):
        self.spans.extend(spans)


def sample_span():
    return ReadableSpan(
        name="shop.order.confirm",
        context=SpanContext(1, 2, False, TraceFlags(1)),
        resource=Resource({"service.name": "supermega-runtime"}),
        attributes={"order.line_count": 2},
        events=[Event("exception", {
            "exception.message": "private request contents",
            "exception.stacktrace": "private local stack path",
            "order.line_count": 2,
        }, timestamp=2)],
        status=Status(StatusCode.ERROR, "private request contents"),
        start_time=1,
        end_time=3,
    )


class SpanProcessorTests(unittest.TestCase):
    def test_event_and_status_payloads_cannot_bypass_attribute_redaction(self):
        exporter = RecordingExporter()
        original = sample_span()
        RedactingSpanProcessor(exporter).on_end(original)
        self.assertEqual(len(exporter.spans), 1)
        safe = exporter.spans[0]
        self.assertEqual(safe.status.status_code, StatusCode.ERROR)
        self.assertIsNone(safe.status.description)
        self.assertEqual(safe.attributes["order.line_count"], 2)
        self.assertEqual(safe.events[0].name, "exception")
        self.assertEqual(safe.events[0].timestamp, 2)
        self.assertEqual(dict(safe.events[0].attributes), {"order.line_count": 2})
        self.assertNotIn("private", safe.to_json())
        self.assertEqual(original.status.description, "private request contents")
        self.assertIn("exception.message", original.events[0].attributes)

    def test_exporter_failure_is_nonfatal_and_does_not_log_exception_content(self):
        exporter = RecordingExporter()
        with patch.object(exporter, "export", side_effect=RuntimeError("private exporter detail")):
            with self.assertLogs("supermega.telemetry", level="WARNING") as logs:
                RedactingSpanProcessor(exporter).on_end(sample_span())
        self.assertEqual(len(logs.output), 1)
        self.assertNotIn("private", str(logs.output))
        self.assertIsNone(logs.records[0].exc_info)

    def test_scrub_failure_drops_span_without_logging_payload(self):
        exporter = RecordingExporter()
        processor = RedactingSpanProcessor(exporter)
        with patch.object(processor, "_sanitized_copy", side_effect=ValueError("private scrub detail")):
            with self.assertLogs("supermega.telemetry", level="WARNING") as logs:
                processor.on_end(sample_span())
        self.assertEqual(exporter.spans, [])
        self.assertNotIn("private", str(logs.output))
        self.assertIsNone(logs.records[0].exc_info)


if __name__ == "__main__":
    unittest.main()
