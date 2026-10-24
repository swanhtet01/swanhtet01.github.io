"""Dependency-free source contract for the pending PostgreSQL v14 catalog."""

from pathlib import Path
import unittest

from supermega_runtime.core_security_catalog import (
    CORE_SECURITY_DIGESTS,
    CORE_SECURITY_PENDING_VERSIONS,
    core_security_catalog_verified,
)


ROOT = Path(__file__).resolve().parents[1]
CATALOG_SOURCE = ROOT / "supermega_runtime/core_security_catalog.py"


class _UnexpectedCursor:
    def execute(self, *_args, **_kwargs):
        raise AssertionError("pending catalog verification must fail before database access")


class CoreSecurityCatalogContractTests(unittest.TestCase):
    def test_v14_is_explicitly_pending_without_a_fabricated_digest(self) -> None:
        self.assertEqual(CORE_SECURITY_PENDING_VERSIONS, frozenset({14}))
        self.assertNotIn(14, CORE_SECURITY_DIGESTS)
        self.assertFalse(core_security_catalog_verified(_UnexpectedCursor(), 14))

    def test_v14_catalog_targets_exact_correction_tables_and_guards(self) -> None:
        source = CATALOG_SOURCE.read_text(encoding="utf-8")
        for target in (
            "'shop_correction_lineages'",
            "'shop_correction_consumptions'",
            "'guard_shop_correction_lineage'",
            "'guard_shop_correction_consumption'",
        ):
            with self.subTest(target=target):
                self.assertEqual(source.count(target), 1)

    def test_historical_digest_pins_remain_unchanged(self) -> None:
        self.assertEqual(
            CORE_SECURITY_DIGESTS,
            {
                10: "5cf6ab18484f2d4d52d357faab876bd1048904312eafd257ff97a4e4e729f322",
                11: "9e37eeb42c580724e93c0155e033a3814ebcba53404746ec2844fac60bd197ef",
                12: "0cf1bd35def7c0cfdf3843435c9b7e331dca2ef516fb96286e2c9506d1f8539a",
                13: "868e14c525efbe00e833594bb4018f26a84ac5913de263fc078184895f42af8f",
            },
        )


if __name__ == "__main__":
    unittest.main()
