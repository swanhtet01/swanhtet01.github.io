from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_public_live_health as checker


def result(url: str, body: str | dict, *, status: int = 200) -> checker.HttpResult:
    encoded = json.dumps(body).encode() if isinstance(body, dict) else body.encode()
    return checker.HttpResult(url, status, {}, encoded)


class PublicHealthTests(unittest.TestCase):
    def test_page_reports_missing_tokens(self):
        check = checker.check_page("https://example/", ["present", "missing"], lambda _: result("https://example/", "present"))
        self.assertEqual(check["missing"], ["missing"])

    def test_json_reports_contract_mismatch(self):
        check = checker.check_json("https://example/api", {"status": "ready"}, lambda _: result("https://example/api", {"status": "bad"}))
        self.assertEqual(check["mismatches"]["status"]["actual"], "bad")

    def test_run_is_ready_for_current_contract(self):
        pages = {
            "https://supermega.dev/": "Operating software for shops and plants Shop Plant",
            "https://www.supermega.dev/": "Operating software for shops and plants Shop Plant",
            "https://supermega.dev/products/": "Open Shop Open Plant",
            "https://supermega.dev/offers/": "Talk to us",
            "https://supermega.dev/contact/": "Start a conversation What should become easier?",
            "https://app.supermega.dev/commerce-machine": "",
        }
        payloads = {
            "https://app.supermega.dev/api/health": {"status": "ready", "service": "supermega-service"},
            "https://pos.supermega.dev/api/health": {"status": "ready"},
            "https://supermega.dev/api/contact-submissions/status": {"status": "ready", "lead_ledger": "configured"},
        }
        def fake(url: str) -> checker.HttpResult:
            return result(url, pages.get(url, payloads.get(url, {})))
        self.assertEqual(checker.run(fake)["status"], "ready")


if __name__ == "__main__":
    unittest.main()
