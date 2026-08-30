"""Golden corpus for the server-side error lane.

The implementation plan's own gate for the scrubber is "a passing golden test
corpus before any hosted export is enabled" (section 3). These are the error
lane's half of that: the cases that must hold before a single error attribute
is allowed off the process.

The adversarial cases matter more than the happy ones. An error lane that
quietly carries a customer name, a Myanmar phone number or an order total is
worse than no error lane, because it looks like observability while being a
data leak.
"""

from __future__ import annotations

import unittest

from supermega_runtime.telemetry import schema
from supermega_runtime.telemetry.errors import (
    ERROR_CLASSES,
    build_error_event,
    classify_exception,
    message_digest,
    route_template,
)


class _Route:
    def __init__(self, path: str) -> None:
        self.path = path


class _Request:
    def __init__(self, method: str = "POST", route_path: str | None = None) -> None:
        self.method = method
        self.scope: dict[str, object] = {}
        if route_path is not None:
            self.scope["route"] = _Route(route_path)


class ClassificationTests(unittest.TestCase):
    def test_every_class_is_in_the_closed_enum(self) -> None:
        for exc in (ValueError("x"), KeyError("k"), TimeoutError(), RuntimeError()):
            self.assertIn(classify_exception(exc), ERROR_CLASSES)

    def test_status_code_outranks_class_name(self) -> None:
        # A generic RuntimeError surfaced as a 409 is a conflict, not generic.
        self.assertEqual(classify_exception(RuntimeError("x"), status_code=409), "conflict")
        self.assertEqual(classify_exception(RuntimeError("x"), status_code=404), "not_found")
        self.assertEqual(classify_exception(RuntimeError("x"), status_code=403), "permission_denied")

    def test_class_name_markers(self) -> None:
        class ValidationError(Exception):
            pass

        class OperationalError(Exception):
            pass

        self.assertEqual(classify_exception(ValidationError("bad")), "validation")
        self.assertEqual(classify_exception(OperationalError("db down")), "database")
        self.assertEqual(classify_exception(TimeoutError()), "timeout")

    def test_non_exception_is_its_own_bucket(self) -> None:
        self.assertEqual(classify_exception("just a string"), "non_error")
        self.assertEqual(classify_exception(None), "non_error")

    def test_classification_never_raises(self) -> None:
        class Hostile(Exception):
            def __str__(self) -> str:
                raise RuntimeError("nope")

        self.assertIn(classify_exception(Hostile()), ERROR_CLASSES)


class DigestTests(unittest.TestCase):
    def test_digest_is_stable_and_short(self) -> None:
        a = message_digest(ValueError("stock conflict on SKU-1"))
        b = message_digest(ValueError("stock conflict on SKU-1"))
        self.assertEqual(a, b)
        self.assertEqual(len(a), 12)

    def test_digest_differs_for_different_messages(self) -> None:
        self.assertNotEqual(message_digest(ValueError("a")), message_digest(ValueError("b")))

    def test_digest_does_not_contain_the_message(self) -> None:
        secret = "Daw Khin Myo Chit"
        digest = message_digest(ValueError(f"customer {secret} not found"))
        self.assertNotIn("Khin", digest)
        self.assertNotIn(secret.lower(), digest.lower())

    def test_digest_survives_an_unprintable_exception(self) -> None:
        class Hostile(Exception):
            def __str__(self) -> str:
                raise RuntimeError("nope")

        self.assertEqual(len(message_digest(Hostile())), 12)


class RouteTemplateTests(unittest.TestCase):
    def test_returns_the_unfilled_template(self) -> None:
        request = _Request(route_path="/api/v1/commerce/orders/{order_id}")
        self.assertEqual(route_template(request), "/api/v1/commerce/orders/{order_id}")

    def test_missing_route_yields_none_rather_than_a_guess(self) -> None:
        self.assertIsNone(route_template(_Request()))
        self.assertIsNone(route_template(object()))


class EventTests(unittest.TestCase):
    def test_every_emitted_key_is_whitelisted(self) -> None:
        event = build_error_event(
            ValueError("boom"),
            request=_Request(route_path="/api/v1/commerce/orders/{order_id}"),
            status_code=500,
        )
        self.assertTrue(event)
        for key in event:
            self.assertIn(key, schema.ATTRIBUTE_WHITELIST, key)

    def test_event_shape(self) -> None:
        event = build_error_event(
            TimeoutError(),
            request=_Request(method="GET", route_path="/api/v1/health"),
            status_code=504,
        )
        self.assertEqual(event["error.type"], "timeout")
        self.assertEqual(event["http.method"], "GET")
        self.assertEqual(event["http.route"], "/api/v1/health")
        self.assertEqual(event["http.status_code"], 504)

    def test_a_customer_name_in_the_message_never_reaches_the_event(self) -> None:
        event = build_error_event(ValueError("no such customer: Daw Khin Myo Chit"))
        joined = " ".join(str(v) for v in event.values())
        self.assertNotIn("Khin", joined)
        self.assertNotIn("Daw", joined)

    def test_a_myanmar_phone_in_the_message_never_reaches_the_event(self) -> None:
        event = build_error_event(ValueError("contact 09776123456 unreachable"))
        joined = " ".join(str(v) for v in event.values())
        self.assertNotIn("09776123456", joined)

    def test_an_mmk_amount_in_the_message_never_reaches_the_event(self) -> None:
        event = build_error_event(ValueError("order total 45,000 MMK failed to settle"))
        joined = " ".join(str(v) for v in event.values())
        self.assertNotIn("45,000", joined)
        self.assertNotIn("45000", joined)

    def test_a_resolved_path_is_not_used_as_the_route(self) -> None:
        # A request whose scope has no route must not fall back to any path-like
        # attribute, even when one is present and looks convenient.
        request = _Request(method="POST")
        request.url = type("U", (), {"path": "/api/v1/orders/ORD-1042"})()  # type: ignore[attr-defined]
        event = build_error_event(ValueError("x"), request=request)
        joined = " ".join(str(v) for v in event.values())
        self.assertNotIn("ORD-1042", joined)
        self.assertNotIn("http.route", event)

    def test_the_lane_never_raises(self) -> None:
        class Hostile:
            @property
            def method(self):  # noqa: ANN201
                raise RuntimeError("nope")

        self.assertIsInstance(build_error_event(ValueError("x"), request=Hostile()), dict)
        self.assertIsInstance(build_error_event(None), dict)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
