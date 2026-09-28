"""Credential-free, exact-target Auth transport probe; never creates a session."""
import json
import urllib.error
import urllib.request

AUTH_HEALTH = 'https://twflgmlwfkykgzsxnegc.supabase.co/auth/v1/health'


def check(opener=urllib.request.urlopen):
    status = None
    failure = None
    request = urllib.request.Request(AUTH_HEALTH, method='GET')
    try:
        with opener(request, timeout=15) as response:
            status = response.status
            if response.url != AUTH_HEALTH:
                failure = 'unexpected_redirect'
    except urllib.error.HTTPError as exc:
        status = exc.code
        exc.close()
    except (urllib.error.URLError, OSError, TimeoutError):
        failure = 'transport_unavailable'
    ok = failure is None and status in (200, 401)
    return {'contract': 'supermega.acceptance-auth-transport.v1', 'ok': ok,
            'http_status': status, 'failure': failure or (None if ok else 'unexpected_http_status'),
            'scope': 'credential_free_reachability_only', 'authentication_proven': False,
            'managed_writes_performed': False}


if __name__ == '__main__':
    result = check()
    print(json.dumps(result))
    raise SystemExit(0 if result['ok'] else 1)
