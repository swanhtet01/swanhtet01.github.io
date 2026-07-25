"""Fail-closed compatibility surface for the retired AgentOS prototype."""

from fastapi import FastAPI, HTTPException


app = FastAPI(
    title="Retired SuperMega AgentOS Gateway",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def _retired() -> None:
    raise HTTPException(
        status_code=410,
        detail="legacy_agent_os_retired_use_canonical_managed_queue",
    )


@app.get("/")
def service_status() -> dict[str, object]:
    return {
        "service": "legacy-agent-os-gateway",
        "status": "retired",
        "ready": False,
        "writes_enabled": False,
        "replacement": "canonical-managed-agent-queue",
    }


@app.get("/health")
def health() -> dict[str, object]:
    return service_status()


@app.get("/logs/{agent_type}")
def get_agent_logs(agent_type: str) -> None:
    del agent_type
    _retired()


@app.get("/status")
def get_system_status() -> None:
    _retired()
