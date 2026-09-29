"""Approved acceptance-only Auth fixture; credentials stay in memory, no email sends."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import secrets
import urllib.error
import urllib.request
from uuid import UUID, uuid4

PROJECT = 'twflgmlwfkykgzsxnegc'
ORIGIN = f'https://{PROJECT}.supabase.co'
EXPIRY = datetime(2026, 9, 29, 11, 3, tzinfo=timezone.utc)


def require_authority(project, approved, now=None):
    now = now or datetime.now(timezone.utc)
    if project != PROJECT or approved is not True or now >= EXPIRY:
        raise ValueError('acceptance_authority_invalid')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('acceptance_redirect_refused')


class AuthApi:
    def __init__(self, admin_key, public_key):
        self.admin_key = admin_key
        self.public_key = public_key
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, payload=None, admin=False, token=None):
        key = self.admin_key if admin else self.public_key
        headers = {'apikey': key, 'Content-Type': 'application/json'}
        if admin or token:
            headers['Authorization'] = 'Bearer ' + (self.admin_key if admin else token)
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(ORIGIN + '/auth/v1' + path, data=body, headers=headers, method=method)
        # Never log request, response, credentials, passwords or raw exceptions.
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read(100001)
                if len(raw) > 100000:
                    raise ValueError('acceptance_response_too_large')
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            error.close()
            raise RuntimeError('acceptance_auth_http_error') from None
        except (OSError, ValueError):
            raise RuntimeError('acceptance_auth_transport_error') from None


def list_users_page(api, page):
    result = api.request('GET', f'/admin/users?page={page}&per_page=100', admin=True)
    batch = result.get('users') if isinstance(result, dict) else None
    if not isinstance(batch, list) or any(not isinstance(user, dict) for user in batch):
        raise RuntimeError('acceptance_auth_list_invalid')
    return batch


@contextmanager
def temporary_users(api, *, project, approved, run_id=None):
    require_authority(project, approved)
    run_id = str(UUID(run_id)) if run_id else str(uuid4())
    users = []
    emails = [f'sm-accept-{run_id}-{i}@example.invalid' for i in range(2)]
    try:
        for email in emails:
            require_authority(project, approved)
            password = secrets.token_urlsafe(36)
            # Admin creation with confirmed synthetic addresses sends no invitation.
            created = api.request('POST', '/admin/users', {'email': email, 'password': password,
                'email_confirm': True, 'app_metadata': {'supermega_acceptance_run': run_id}}, admin=True)
            user_id = str(UUID(created['id']))
            users.append({'id': user_id, 'email': email})  # Track before the next request can fail.
            signed = api.request('POST', '/token?grant_type=password', {'email': email, 'password': password})
            token = signed['access_token']
            verified = api.request('GET', '/user', token=token)
            if verified['id'] != user_id:
                raise ValueError('acceptance_identity_mismatch')
            users[-1]['access_token'] = token
        yield users
    finally:
        # Cleanup is allowed after expiry; expiry must never strand a fixture.
        failed = False
        # Reconcile a create response lost after the server committed the user.
        try:
            known = {user['id'] for user in users}
            for page in range(1, 101):
                batch = list_users_page(api, page)
                for user in batch:
                    if (user.get('email') in emails
                            and user.get('app_metadata', {}).get('supermega_acceptance_run') == run_id
                            and user['id'] not in known):
                        users.append({'id': str(UUID(user['id'])), 'email': user['email']})
                        known.add(user['id'])
                if len(batch) < 100:
                    break
            else:
                failed = True
        except Exception:
            failed = True
        for user in reversed(users):
            try:
                if user.get('access_token'):
                    api.request('POST', '/logout?scope=global', token=user['access_token'])
            except Exception:
                failed = True
            try:
                api.request('DELETE', '/admin/users/' + user['id'], admin=True)
            except Exception:
                failed = True
        # A successful DELETE response alone is not cleanup evidence.
        try:
            for page in range(1, 101):
                batch = list_users_page(api, page)
                if any(user.get('email') in emails for user in batch):
                    failed = True
                if len(batch) < 100:
                    break
            else:
                failed = True
        except Exception:
            failed = True
        if failed:
            raise RuntimeError('acceptance_auth_cleanup_incomplete') from None
