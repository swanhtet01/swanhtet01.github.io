# SuperMega Domain Verification And App Mapping

Current live app:
- `https://supermega-app-kr5v7kj3xa-as.a.run.app`

Target split:
- `https://supermega.dev` = public website
- `https://app.supermega.dev` = live shared app

## Manual blocker

Google Cloud Run custom-domain mapping requires the parent domain to be verified for the Google account doing the mapping.

The service account is already ready. The remaining manual step is domain verification for `supermega.dev` in Google Search Console.

## What to do

1. Sign in to Google Search Console with the Google user account that owns or administers SuperMega in Google.
2. Add a new property of type `Domain`.
3. Enter `supermega.dev`.
4. Google will show a TXT verification record.
5. Add that TXT record in Squarespace DNS for `supermega.dev`.
6. Wait for DNS to propagate.
7. Click `Verify` in Search Console.

Official references:
- [Search Console domain verification](https://support.google.com/webmasters/answer/9008080)
- [Cloud Run custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)

## What to run after verification

Create the mapping:

```powershell
gcloud beta run domain-mappings create `
  --service supermega-app `
  --domain app.supermega.dev `
  --region asia-southeast1 `
  --project supermega-468612
```

Describe the mapping and get the DNS records:

```powershell
gcloud beta run domain-mappings describe `
  --domain app.supermega.dev `
  --region asia-southeast1 `
  --project supermega-468612
```

Then add the exact returned DNS records in Squarespace.
