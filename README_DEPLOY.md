SuperMega.dev deployment and API keys

1) Social links
- LinkedIn: https://www.linkedin.com/company/supermega
- Instagram: https://www.instagram.com/supermega.dev/
- X (Twitter): https://x.com/ai_SuperMega

2) API keys and config
- For static GitHub Pages, do NOT put real API keys in the repo. Any keys must be used from server-side services only.
- If you run a backend (e.g., Flask) locally or on EC2, place keys in a .env file:
  - OPENAI_API_KEY=...
  - GEMINI_API_KEY=...
  - TWITTER_BEARER_TOKEN=...
  - TWITTER_CLIENT_ID=...
  - TWITTER_CLIENT_SECRET=...

3) GitHub Pages deploy
- Branch: clean-deploy
- Workflow: .github/workflows/pages-clean-deploy.yml
- It uploads the repository root as the Pages artifact.

4) How to publish new changes
- Commit to branch 'clean-deploy' and push.
- Wait for the GitHub Actions job 'Deploy site from clean-deploy to GitHub Pages' to finish.
- The page will be available at your repository Pages URL (see workflow logs for page_url).

5) Notes
- If you need dynamic features (chat with LLM, OAuth), host a backend service (e.g., on EC2 or Render) and call it from the frontend. Do not embed secrets client-side.
