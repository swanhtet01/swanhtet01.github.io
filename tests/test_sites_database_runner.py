import unittest
from tools.verify_sites_database import acceptance_result


class SitesDatabaseAcceptanceTests(unittest.TestCase):
    def test_skipped_integration_tests_cannot_be_reported_as_acceptance(self):
        result = unittest.TestResult()
        result.testsRun = 5
        result.skipped = [('synthetic', 'opt-in missing')]
        self.assertTrue(result.wasSuccessful())
        self.assertFalse(acceptance_result(result)['ok'])

    def test_empty_or_failed_suite_is_not_acceptance(self):
        result = unittest.TestResult()
        self.assertFalse(acceptance_result(result)['ok'])
        result.testsRun = 1
        result.failures = [('synthetic', 'failure')]
        self.assertFalse(acceptance_result(result)['ok'])

    def test_pass_remains_local_database_evidence(self):
        result = unittest.TestResult()
        result.testsRun = 1
        report = acceptance_result(result)
        self.assertTrue(report['ok'])
        self.assertFalse(report['realProviderStorage'])
        self.assertFalse(report['managedAuth'])
        self.assertFalse(report['hostedAcceptance'])
