from datetime import datetime, timezone
import unittest
from uuid import uuid4
from unittest.mock import patch
from tools.acceptance_auth_fixture import (
    PROJECT, APPROVAL_ACTION, APPROVAL_CONTRACT, AuthApi, NoRedirect,
    temporary_users, require_authority,
)


class FakeApi:
    def __init__(self, fail_login=False):
        self.created=[]; self.deleted=[]; self.current=None; self.fail_login=fail_login
    def request(self, method, path, payload=None, **kwargs):
        if path.startswith('/admin/users?'): return {'users': []}
        if path=='/admin/users':
            self.current=str(uuid4()); self.created.append(self.current)
            return {'id':self.current}
        if path.startswith('/token'):
            if self.fail_login: raise RuntimeError('synthetic failure')
            return {'access_token':'synthetic-token'}
        if path=='/user': return {'id':self.current}
        if method=='DELETE': self.deleted.append(path.rsplit('/',1)[-1])
        return {}


class AcceptanceAuthTests(unittest.TestCase):
    def setUp(self):
        clock=patch("tools.acceptance_auth_fixture.datetime").start()
        clock.now.return_value=datetime(2026,10,21,9,0,tzinfo=timezone.utc)
        clock.fromisoformat.side_effect=datetime.fromisoformat
        self.addCleanup(patch.stopall)
        self.approval = dict(contract=APPROVAL_CONTRACT, project_ref=PROJECT,
            action=APPROVAL_ACTION, synthetic_only=True, cleanup_required=True,
            approval_id=str(uuid4()), issued_at='2026-10-21T08:30:00Z',
            expires_at='2026-10-21T09:30:00Z')
    def test_cleanup_after_caller_failure(self):
        api=FakeApi()
        with self.assertRaisesRegex(RuntimeError,'caller failed'):
            with temporary_users(api,project=PROJECT,approved=self.approval) as users:
                self.assertEqual(len(users),2)
                raise RuntimeError('caller failed')
        self.assertCountEqual(api.created,api.deleted)
    def test_cleanup_after_login_failure(self):
        api=FakeApi(fail_login=True)
        with self.assertRaises(RuntimeError):
            with temporary_users(api,project=PROJECT,approved=self.approval): pass
        self.assertEqual(api.created,api.deleted)
    def test_reject_production_missing_approval_and_expiry(self):
        for project, approval, now in [
            ('zvtzwcimpvvtkowflhda', self.approval, None),
            (PROJECT, {}, None),
            (PROJECT, self.approval, datetime(2026,10,21,9,30,tzinfo=timezone.utc)),
        ]:
            with self.assertRaises(ValueError): require_authority(project, approval, now)

    def test_reject_wrong_target_action_and_excessive_window(self):
        for change in (
            {'project_ref': 'twflgmlwfkykgzsxnegc'},
            {'action': 'create_temporary_runtime_login'},
            {'expires_at': '2026-10-21T10:30:01Z'},
            {'approval_id': 'not-a-uuid'},
        ):
            with self.assertRaisesRegex(ValueError, 'acceptance_authority_invalid'):
                require_authority(PROJECT, dict(self.approval, **change))

    def test_ambiguous_create_is_reconciled_and_deleted(self):
        class LostResponse(FakeApi):
            def request(self, method, path, payload=None, **kwargs):
                if method == 'POST' and path == '/admin/users':
                    self.record = dict(payload, id=str(uuid4()))
                    raise OSError('response lost')
                if path.startswith('/admin/users?'):
                    return {'users': [] if self.deleted else [self.record]}
                return super().request(method, path, payload, **kwargs)
        api = LostResponse()
        with self.assertRaisesRegex(OSError, 'response lost'):
            with temporary_users(api, project=PROJECT, approved=self.approval): pass
        self.assertEqual(api.deleted, [api.record['id']])

    def test_delete_success_without_removal_fails_cleanup(self):
        class RetainedUser(FakeApi):
            def request(self, method, path, payload=None, **kwargs):
                if method == 'POST' and path == '/admin/users':
                    self.record = dict(payload, id=str(uuid4()))
                    raise OSError('response lost')
                if path.startswith('/admin/users?'):
                    return {'users': [self.record]}
                return super().request(method, path, payload, **kwargs)
        with self.assertRaisesRegex(RuntimeError, 'acceptance_auth_cleanup_incomplete'):
            with temporary_users(RetainedUser(), project=PROJECT, approved=self.approval): pass

    def test_redirects_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'acceptance_redirect_refused'):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid')

    def test_transport_exception_is_sanitized(self):
        api = AuthApi('private-admin', 'public-key')
        with patch.object(api.opener, 'open', side_effect=OSError('private-admin')):
            with self.assertRaisesRegex(RuntimeError, '^acceptance_auth_transport_error$'):
                api.request('GET', '/user')

if __name__=='__main__': unittest.main()
