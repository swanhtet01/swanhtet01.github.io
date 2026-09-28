import unittest
import urllib.error
from unittest.mock import MagicMock
from tools.check_acceptance_auth_transport import AUTH_HEALTH, check


class AuthTransportTests(unittest.TestCase):
    def test_expected_statuses_and_no_credentials(self):
        for status in (200, 401):
            response = MagicMock(status=status, url=AUTH_HEALTH)
            opener = MagicMock()
            opener.return_value.__enter__.return_value = response
            result = check(opener)
            self.assertTrue(result['ok'])
            self.assertFalse(result['authentication_proven'])
            request = opener.call_args.args[0]
            self.assertEqual(request.full_url, AUTH_HEALTH)
            self.assertEqual(request.header_items(), [])
            self.assertIsNone(request.data)

    def test_http_errors(self):
        for status in (401, 403, 404, 429, 500, 503):
            opener = MagicMock(side_effect=urllib.error.HTTPError(AUTH_HEALTH, status, 'private body', {}, None))
            result = check(opener)
            self.assertEqual(result['ok'], status == 401)
            self.assertNotIn('private body', str(result))

    def test_transport_error_does_not_expose_details(self):
        result = check(MagicMock(side_effect=urllib.error.URLError('private diagnostic')))
        self.assertFalse(result['ok'])
        self.assertEqual(result['failure'], 'transport_unavailable')
        self.assertNotIn('private diagnostic', str(result))

    def test_redirect_does_not_count_as_auth_reachability(self):
        opener = MagicMock()
        opener.return_value.__enter__.return_value = MagicMock(status=200,url='https://example.com/login')
        self.assertEqual(check(opener)['failure'], 'unexpected_redirect')

if __name__ == '__main__':
    unittest.main()
