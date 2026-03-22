# Credential Quarantine and Rotation

## Scope

Quarantined assets identified from `keystore-20260309T135435Z-1-001.zip` and related screenshot/doc artifacts.

## Rules

- Never commit raw API keys, OAuth secrets, tokens, or service account private keys.
- Keep credential files only in `.secrets/` or dedicated secret manager.
- Treat screenshot and document captures as potential key exposure.

## Immediate actions

1. Rotate all keys that appeared in screenshots or docs.
2. Revoke unused OAuth clients and regenerate minimal-scope clients.
3. Replace long-lived keys with short-lived tokens where possible.
4. Confirm `.gitignore` blocks accidental secret commits.

## Verification checklist

- New keys created and old keys revoked.
- `.env` references only file paths or secret IDs.
- No secrets present in tracked files:

```powershell
rg -n "sk-|AIza|client_secret|BEGIN PRIVATE KEY|oauth|api key" .
```

- Manus catalog marks sensitive files with `action=quarantine`.
