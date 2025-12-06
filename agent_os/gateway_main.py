from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import redis
import json
import os

app = FastAPI(title="AgentOS Gateway")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis Connection
redis_client = redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

@app.get("/")
def health_check():
    return {"status": "online", "system": "AgentOS Gateway"}

@app.get("/logs/{agent_type}")
def get_agent_logs(agent_type: str):
    """
    Retrieve the latest logs for a specific agent type (logistics, finance, code).
    """
    # In a real scenario, we'd fetch from a persistent store or Redis stream
    # For now, we simulate reading from the shared volume or Redis key
    try:
        logs = redis_client.lrange(f"logs:{agent_type}", 0, 50)
        return {"agent": agent_type, "logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
def get_system_status():
    """
    Get the CPU/Memory status of all agents.
    """
    try:
        status = redis_client.get("system_status")
        if not status:
            return {"nodes": []}
        return json.loads(status)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
