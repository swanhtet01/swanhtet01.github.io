# AgentOS Infrastructure Architecture

## Overview
This document outlines the architecture for **AgentOS**, a distributed AI agent operating system deployed on AWS. It leverages **OpenManus** for general-purpose agent orchestration and **LangGraph** for stateful, complex workflows (Logistics/Finance). The system is containerized using Docker and managed via a central API Gateway.

## Core Components

### 1. The "Brain" (Orchestrator)
*   **Role**: High-level task delegation and state management.
*   **Technology**: **OpenManus** (running in `direct` mode).
*   **Function**: Receives natural language commands from the CEO (User), breaks them down into sub-tasks, and routes them to specialized department agents.

### 2. Department Sub-machines (Specialized Agents)
*   **Logistics Core**:
    *   **Framework**: **LangGraph** (Stateful workflow).
    *   **Responsibility**: Inventory scanning, PO drafting, Shipping tracking.
    *   **Tools**: Google Sheets API, **ERPNext API**.
*   **Finance Reactor**:
    *   **Framework**: **LangGraph** (Stateful workflow).
    *   **Responsibility**: Invoice auditing, Cash flow forecasting, Stripe payments.
    *   **Tools**: **ERPNext API**, Stripe API, Banking APIs.
*   **Code Foundry**:
    *   **Framework**: **OpenManus** (Coding agent).
    *   **Responsibility**: System maintenance, feature development, self-healing.
    *   **Tools**: Git, Docker, AWS CLI.

### 3. The "Nervous System" (Communication)
*   **API Gateway**: A **FastAPI** server that exposes endpoints for the web dashboard to poll status and logs.
*   **Message Queue**: **Redis** for inter-agent communication and task queuing.
*   **Memory Store**: **PostgreSQL** (via ERPNext or standalone) for long-term agent memory and state persistence.

## Infrastructure Stack (Docker Compose)

```yaml
version: '3.8'
services:
  # The Brain
  orchestrator:
    image: openmanus/core:latest
    environment:
      - MODE=orchestrator
    depends_on:
      - redis
      - db

  # Department Agents
  logistics-core:
    build: ./agents/logistics
    environment:
      - AGENT_TYPE=logistics
      - GOOGLE_SHEETS_ID=...
    volumes:
      - ./logs:/app/logs

  finance-reactor:
    build: ./agents/finance
    environment:
      - AGENT_TYPE=finance
      - ERPNEXT_URL=...
    volumes:
      - ./logs:/app/logs

  # Infrastructure
  api-gateway:
    build: ./gateway
    ports:
      - "8000:8000"
    volumes:
      - ./logs:/app/logs

  redis:
    image: redis:alpine
  
  db:
    image: postgres:15
```

## Deployment Strategy
1.  **Provision AWS Instance**: EC2 (t3.xlarge or higher) or Lightsail.
2.  **Install Docker & Compose**: Standard setup.
3.  **Deploy Stack**: `docker-compose up -d`.
4.  **Connect Dashboard**: Point the React frontend to the AWS IP address (e.g., `http://aws-ip:8000`).

## Next Steps
1.  Create the `docker-compose.yml` file.
2.  Write the `Dockerfile` for the specialized agents.
3.  Develop the **FastAPI Gateway** to serve logs to the frontend.
