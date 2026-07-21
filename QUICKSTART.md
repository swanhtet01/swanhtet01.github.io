# SuperMega quickstart

Requirements: Node.js 24 and Python 3.12.

## Install

```powershell
npm.cmd install
npm.cmd --prefix showroom ci
python -m pip install -r requirements-test.txt
```

## Run the product app

```powershell
npm.cmd run dev
```

The Vite app proxies `/api` to `http://127.0.0.1:8788` by default. Start the canonical API separately when testing server routes:

```powershell
python -m uvicorn api_app:app --host 127.0.0.1 --port 8788
```

## Verify everything in scope

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
npm.cmd run app:build
npm.cmd run public:prebuilt
npm.cmd audit --omit=dev
npm.cmd --prefix showroom audit --omit=dev
git diff --check
```

## Managed database proof

Do not place credentials on the command line. Follow `docs/supermega-enterprise-activation.md` and validate from an ignored file:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-production-database-url.txt -ValidateOnly
```

This command is read-only and fails closed. It does not apply the migration or enable writes.

## Production

Do not deploy production from the local machine. Commit reviewed work, open a pull request, pass checks, and release from `main` through the verified public and app workflows. Both workflows verify an immutable preview before promoting that exact artifact.
