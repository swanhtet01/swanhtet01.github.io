from datetime import datetime, timezone
import unittest
from uuid import uuid4
from tools.acceptance_auth_fixture import PROJECT, temporary_users, require_authority


class FakeApi:
    def __init__(self, fail_login=False):
        self.created=[]; self.deleted=[]; self.current=None; self.fail_login=fail_login
    def request(self, method, path, payload=None, **kwargs):
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
    def test_cleanup_after_caller_failure(self):
        api=FakeApi()
        with self.assertRaisesRegex(RuntimeError,'caller failed'):
            with temporary_users(api,project=PROJECT,approved=True) as users:
                self.assertEqual(len(users),2)
                raise RuntimeError('caller failed')
        self.assertCountEqual(api.created,api.deleted)
    def test_cleanup_after_login_failure(self):
        api=FakeApi(fail_login=True)
        with self.assertRaises(RuntimeError):
            with temporary_users(api,project=PROJECT,approved=True): pass
        self.assertEqual(api.created,api.deleted)
    def test_reject_production_and_expiry(self):
        for project,approved,now in [('zvtzwcimpvvtkowflhda',True,None),(PROJECT,False,None),(PROJECT,True,datetime(2026,9,29,11,3,tzinfo=timezone.utc))]:
            with self.assertRaises(ValueError): require_authority(project,approved,now)

if __name__=='__main__': unittest.main()
