"""Credential-free, exact-target Auth transport probe; never creates a session."""
import argparse
import json
import urllib.error
import urllib.request

AUTH_HEALTH = 'https://twflgmlwfkykgzsxnegc.supabase.co/auth/v1/health'

PRODUCTION_AUTH_HEALTH = 'https://zvtzwcimpvvtkowflhda.supabase.co/auth/v1/health'
AUTH_TARGETS = {'acceptance': AUTH_HEALTH, 'production': PRODUCTION_AUTH_HEALTH}


def check(opener=urllib.request.urlopen, *, target='acceptance'):
    if target not in AUTH_TARGETS:
        raise ValueError('unsupported_auth_target')
    health_url = AUTH_TARGETS[target]
    status = None
    failure = None
    request = urllib.request.Request(health_url, method='GET')
    try:
        with opener(request, timeout=15) as response:
            status = response.status
            if response.url != health_url:
                failure = 'unexpected_redirect'
    except urllib.error.HTTPError as exc:
        status = exc.code
        if exc.url != health_url:
            failure = 'unexpected_redirect'
        exc.close()
    except (urllib.error.URLError, OSError, TimeoutError):
        failure = 'transport_unavailable'
    ok = failure is None and status in (200, 401)
    return {'contract': 'supermega.acceptance-auth-transport.v1', 'ok': ok,
            'target': target, 'http_status': status, 'failure': failure or (None if ok else 'unexpected_http_status'),
            'scope': 'credential_free_reachability_only', 'authentication_proven': False,
            'managed_writes_performed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=tuple(AUTH_TARGETS), default='acceptance')
    result = check(target=parser.parse_args().target)
    print(json.dumps(result))
    raise SystemExit(0 if result['ok'] else 1)
