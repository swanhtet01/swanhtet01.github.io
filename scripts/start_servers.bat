@echo off
start cmd /k "cd docs/demo && python -m http.server 8000"
start cmd /k "python -m uvicorn team_api:app --host 0.0.0.0 --port 8080 --reload"
