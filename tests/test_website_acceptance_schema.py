"""Source-bound trigger checks; no database connection or writes."""
from copy import deepcopy
from pathlib import Path
import re
import unittest

from supermega_runtime.website_acceptance_schema import (
    ACCEPTANCE_TRIGGERS, acceptance_triggers_verified,
)


class AcceptanceSchemaTests(unittest.TestCase):
    def setUp(self):
        source = (Path(__file__).resolve().parents[1] /
                  "supabase/migrations/20260918011500_website_customer_acceptance.sql").read_text(encoding="utf-8")
        self.rows = []
        for (table, trigger), (mask, function, _) in ACCEPTANCE_TRIGGERS.items():
            match = re.search(r"create function app_private\." + re.escape(function)
                              + r"\(\).*?as \$\$(.*?)\$\$;", source, re.S)
            self.assertIsNotNone(match)
            self.rows.append(dict(table_name=table, trigger_name=trigger, event_mask=mask,
                enabled="O", function_schema="app_private", function_name=function,
                function_language="plpgsql", security_definer=False,
                function_config=["search_path=pg_catalog, app_private"],
                function_source=match.group(1), **{key: True for key in (
                    "no_when_clause", "no_arguments", "no_column_filter", "no_constraint_link",
                    "not_deferrable", "not_initially_deferred", "no_transition_tables")}))

    def test_exact_source_guards(self):
        self.assertTrue(acceptance_triggers_verified(self.rows))

    def test_missing_or_duplicate_guard(self):
        for rows in ([], self.rows[:1], self.rows[1:], [self.rows[0]] * 2,
                     self.rows + self.rows[:1]):
            self.assertFalse(acceptance_triggers_verified(rows))

    def test_each_guard_security_property_fails_closed(self):
        changes = dict(event_mask=0, enabled="D", function_schema="public",
            function_name="untrusted", function_language="sql", security_definer=True,
            function_config=["search_path=public"], function_source="begin return new; end;")
        for key in ("no_when_clause", "no_arguments", "no_column_filter", "no_constraint_link",
                    "not_deferrable", "not_initially_deferred", "no_transition_tables"):
            changes[key] = False
        for index in range(2):
            for key, value in changes.items():
                with self.subTest(index=index, key=key):
                    rows = deepcopy(self.rows)
                    rows[index][key] = value
                    self.assertFalse(acceptance_triggers_verified(rows))

    def test_missing_security_property_is_not_assumed_safe(self):
        for index in range(2):
            for key in self.rows[index]:
                with self.subTest(index=index, key=key):
                    rows = deepcopy(self.rows)
                    del rows[index][key]
                    self.assertFalse(acceptance_triggers_verified(rows))

    def test_literal_case_or_spacing_change_is_not_normalized_away(self):
        for old, new in (("'INSERT'", "'insert'"),
                         ("'read committed'", "'read  committed'")):
            rows = deepcopy(self.rows)
            rows[0]["function_source"] = rows[0]["function_source"].replace(old, new)
            self.assertFalse(acceptance_triggers_verified(rows))


if __name__ == "__main__":
    unittest.main()
