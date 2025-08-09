# Onboarding Guide: Super Mega AI Agent Platform

## 1. Setup
- Clone the repository
- Create and activate a Python virtual environment
- Install dependencies from `requirements.txt`
- Copy `.env.example` to `.env` and fill in secrets

## 2. Running the Backend
- Start the server with `uvicorn main:app --reload` from the `backend` directory
- Test endpoints `/health` and `/test` in your browser

## 3. Adding Agents
- Add new agent classes in `src/agents/`
- Register agents in `src/agent_manager.py`
- Use Pydantic for data validation

## 4. Data Quality
- Validate all inputs/outputs with schemas
- Normalize data using utilities in `src/agents/utils.py`

## 5. Monitoring & Logging
- Check logs in `logs/`
- Use `/metrics` endpoint for Prometheus/Grafana

## 6. Troubleshooting
- If you see import errors, recreate your virtual environment and reinstall dependencies
- Check `.env` for missing or incorrect values
- Review logs for error details

## 7. Contributing
- Follow PEP8 and type annotation standards
- Add docstrings and comments
- Submit PRs and issues via GitHub
