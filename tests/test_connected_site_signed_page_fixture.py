"""Cross-language synthetic page bytes; not a production feed signer."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

from supermega_runtime.connected_site_v15 import canonical_json, digest
from tests.connected_site_signed_page_fixture import build_signed_v41_fixture


_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "mobile/shop_pos/test/fixtures/v41_python_signed_page.json"
)


class SignedPageFixtureTest(unittest.TestCase):
    def test_python_wire_type_bytes_match_retained_native_fixture(self):
        retained = _FIXTURE.read_text(encoding="utf-8").strip()
        generated = build_signed_v41_fixture()
        self.assertEqual(retained, canonical_json(generated))
        page = json.loads(generated["pageJson"])
        proof = json.loads(generated["proofJson"])
        request = json.loads(generated["requestJson"])
        self.assertEqual(page["pageDigest"], digest({
            key: value for key, value in page.items() if key != "pageDigest"
        }))
        self.assertEqual(page["requestDigest"], digest(request))
        self.assertEqual(proof["pageDigest"], page["pageDigest"])
        self.assertEqual(proof["requestDigest"], page["requestDigest"])


if __name__ == "__main__":
    unittest.main()
