import unittest
from tools.prepare_pooler_host_correction import prepare, PROJECT, TARGET_HOST

OLD_HOST = "aws-0-us-east-1.pooler.supabase.com"  # synthetic fixture, not a live finding
URL = f"postgresql://supermega_trial_login.{PROJECT}:PRIVATE%40secret%2Fvalue@{OLD_HOST}:6543/postgres?sslmode=verify-full&sslrootcert=%2Fprivate%2Froot.crt"


class PoolerHostCorrectionTests(unittest.TestCase):
    def test_only_hostname_changes_without_exposing_secret_in_repr(self):
        result = prepare(URL, expected_current_host=OLD_HOST)
        self.assertEqual(result.corrected_url, URL.replace("@" + OLD_HOST + ":", "@" + TARGET_HOST + ":"))
        self.assertNotIn("PRIVATE", repr(result))
        self.assertFalse(result.production_write_authorized)

    def test_host_text_inside_password_is_preserved(self):
        original = URL.replace("PRIVATE%40secret%2Fvalue", OLD_HOST)
        result = prepare(original, expected_current_host=OLD_HOST)
        self.assertIn(":" + OLD_HOST + "@" + TARGET_HOST, result.corrected_url)

    def test_rejects_changed_target_unsafe_parameters_and_missing_tls(self):
        for changed in [URL.replace(PROJECT, "twflgmlwfkykgzsxnegc"),
                        URL.replace("supermega_trial_login.", "postgres."),
                        URL.replace(":6543/", ":5432/"),
                        URL.replace("/postgres?", "/other?"),
                        URL.replace("verify-full", "disable"),
                        URL + "&sslmode=require", URL + "&options=unsafe",
                        URL + "#PRIVATE", URL.replace(OLD_HOST, TARGET_HOST),
                        URL.replace("PRIVATE%40secret%2Fvalue", ""), "PRIVATE"]:
            with self.subTest(), self.assertRaisesRegex(ValueError, "^pooler_host_correction_preconditions_failed$") as raised:
                prepare(changed, expected_current_host=OLD_HOST)
            self.assertNotIn("PRIVATE", str(raised.exception))
            self.assertTrue(raised.exception.__suppress_context__)

    def test_requires_current_host_match(self):
        with self.assertRaises(ValueError):
            prepare(URL, expected_current_host="aws-9-us-east-1.pooler.supabase.com")
