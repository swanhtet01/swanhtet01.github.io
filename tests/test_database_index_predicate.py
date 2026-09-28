"""Exact partial-index predicates; no database or provider connection."""
import unittest
from tools.validate_supermega_database_url import _index_predicate_matches


class IndexPredicateTests(unittest.TestCase):
    def test_full_index_still_requires_absent_predicate(self):
        self.assertTrue(_index_predicate_matches({"no_predicate": True}, {}))
        for row in ({}, {"no_predicate": "true"}, {"no_predicate": False},
                    {"no_predicate": True, "predicate_expression": "true"}):
            with self.subTest(row=row):
                self.assertFalse(_index_predicate_matches(row, {}))

    def test_partial_index_requires_exact_declared_expression(self):
        expected = {"predicate_expression": "(status = 'active'::text)"}
        self.assertTrue(_index_predicate_matches({"no_predicate": False, **expected}, expected))
        for predicate in (None, "", True, "true", "(status = 'ACTIVE'::text)",
                          "(status <> 'active'::text)", "(status = 'active'::text) OR true",
                          "(status = 'active')", " (status = 'active'::text)"):
            with self.subTest(predicate=predicate):
                self.assertFalse(_index_predicate_matches(
                    {"no_predicate": False, "predicate_expression": predicate}, expected))
        self.assertFalse(_index_predicate_matches({"no_predicate": True, **expected}, expected))
        self.assertFalse(_index_predicate_matches({"no_predicate": False, **expected}, {}))

    def test_malformed_contract_cannot_allow_a_partial_index(self):
        for value in ("", " ", True, 1, [], {}):
            with self.subTest(value=value):
                self.assertFalse(_index_predicate_matches(
                    {"no_predicate": False, "predicate_expression": value},
                    {"predicate_expression": value}))


if __name__ == "__main__":
    unittest.main()
