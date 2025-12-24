"""
Multi-Tenant System
====================
Support for multiple isolated tenants (projects/clients).

Features:
- Tenant isolation
- Resource quotas
- Tenant-specific configurations
- Cross-tenant security
- Usage tracking per tenant

Author: Manus AI for SuperMega.dev
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from enum import Enum
import logging
import secrets

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("multi_tenant")


# ============================================================================
# Data Models
# ============================================================================

class TenantTier(Enum):
    """Tenant subscription tiers."""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class TenantStatus(Enum):
    """Tenant status."""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"
    ARCHIVED = "archived"


@dataclass
class ResourceQuota:
    """Resource quotas for a tenant."""
    max_agents: int = 5
    max_concurrent_tasks: int = 10
    max_storage_gb: float = 5.0
    max_api_calls_per_day: int = 1000
    max_compute_minutes_per_day: int = 60
    max_memory_gb: float = 4.0
    allowed_models: List[str] = field(default_factory=lambda: ["gemini-flash", "gpt-4o-mini"])
    allowed_tools: List[str] = field(default_factory=lambda: ["search", "code_execution"])


@dataclass
class TenantUsage:
    """Current usage for a tenant."""
    agents_active: int = 0
    concurrent_tasks: int = 0
    storage_used_gb: float = 0.0
    api_calls_today: int = 0
    compute_minutes_today: int = 0
    memory_used_gb: float = 0.0
    last_reset: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Tenant:
    """A tenant in the system."""
    tenant_id: str
    name: str
    tier: TenantTier
    status: TenantStatus
    owner_email: str
    created_at: datetime
    quota: ResourceQuota
    usage: TenantUsage
    settings: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    api_keys: List[str] = field(default_factory=list)


# ============================================================================
# Tier Configurations
# ============================================================================

TIER_QUOTAS = {
    TenantTier.FREE: ResourceQuota(
        max_agents=2,
        max_concurrent_tasks=3,
        max_storage_gb=1.0,
        max_api_calls_per_day=100,
        max_compute_minutes_per_day=15,
        max_memory_gb=1.0,
        allowed_models=["gemini-flash"],
        allowed_tools=["search"]
    ),
    TenantTier.STARTER: ResourceQuota(
        max_agents=5,
        max_concurrent_tasks=10,
        max_storage_gb=10.0,
        max_api_calls_per_day=1000,
        max_compute_minutes_per_day=60,
        max_memory_gb=4.0,
        allowed_models=["gemini-flash", "gemini-pro", "gpt-4o-mini"],
        allowed_tools=["search", "code_execution", "browser"]
    ),
    TenantTier.PROFESSIONAL: ResourceQuota(
        max_agents=20,
        max_concurrent_tasks=50,
        max_storage_gb=100.0,
        max_api_calls_per_day=10000,
        max_compute_minutes_per_day=480,
        max_memory_gb=16.0,
        allowed_models=["gemini-flash", "gemini-pro", "gpt-4o", "claude-sonnet"],
        allowed_tools=["search", "code_execution", "browser", "file_system", "database"]
    ),
    TenantTier.ENTERPRISE: ResourceQuota(
        max_agents=100,
        max_concurrent_tasks=200,
        max_storage_gb=1000.0,
        max_api_calls_per_day=100000,
        max_compute_minutes_per_day=2880,
        max_memory_gb=64.0,
        allowed_models=["*"],  # All models
        allowed_tools=["*"]  # All tools
    )
}


# ============================================================================
# Tenant Manager
# ============================================================================

class TenantManager:
    """
    Manage tenants and their resources.
    """
    
    def __init__(self, storage_path: str = None):
        self.tenants: Dict[str, Tenant] = {}
        self.api_key_to_tenant: Dict[str, str] = {}
        self.storage_path = storage_path
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def create_tenant(
        self,
        name: str,
        owner_email: str,
        tier: TenantTier = TenantTier.FREE
    ) -> Tenant:
        """Create a new tenant."""
        tenant_id = f"tenant_{secrets.token_hex(8)}"
        api_key = f"sk_{secrets.token_hex(16)}"
        
        tenant = Tenant(
            tenant_id=tenant_id,
            name=name,
            tier=tier,
            status=TenantStatus.ACTIVE,
            owner_email=owner_email,
            created_at=datetime.utcnow(),
            quota=TIER_QUOTAS[tier],
            usage=TenantUsage(),
            api_keys=[api_key]
        )
        
        self.tenants[tenant_id] = tenant
        self.api_key_to_tenant[api_key] = tenant_id
        
        self._save()
        logger.info(f"Created tenant {tenant_id}: {name}")
        
        return tenant
    
    def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        """Get a tenant by ID."""
        return self.tenants.get(tenant_id)
    
    def get_tenant_by_api_key(self, api_key: str) -> Optional[Tenant]:
        """Get a tenant by API key."""
        tenant_id = self.api_key_to_tenant.get(api_key)
        if tenant_id:
            return self.tenants.get(tenant_id)
        return None
    
    def update_tier(self, tenant_id: str, new_tier: TenantTier):
        """Update a tenant's tier."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            raise ValueError(f"Tenant not found: {tenant_id}")
        
        tenant.tier = new_tier
        tenant.quota = TIER_QUOTAS[new_tier]
        
        self._save()
        logger.info(f"Updated tenant {tenant_id} to tier {new_tier.value}")
    
    def suspend_tenant(self, tenant_id: str, reason: str = None):
        """Suspend a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            raise ValueError(f"Tenant not found: {tenant_id}")
        
        tenant.status = TenantStatus.SUSPENDED
        tenant.metadata["suspension_reason"] = reason
        tenant.metadata["suspended_at"] = datetime.utcnow().isoformat()
        
        self._save()
        logger.warning(f"Suspended tenant {tenant_id}: {reason}")
    
    def activate_tenant(self, tenant_id: str):
        """Activate a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            raise ValueError(f"Tenant not found: {tenant_id}")
        
        tenant.status = TenantStatus.ACTIVE
        tenant.metadata.pop("suspension_reason", None)
        tenant.metadata.pop("suspended_at", None)
        
        self._save()
        logger.info(f"Activated tenant {tenant_id}")
    
    def generate_api_key(self, tenant_id: str) -> str:
        """Generate a new API key for a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            raise ValueError(f"Tenant not found: {tenant_id}")
        
        api_key = f"sk_{secrets.token_hex(16)}"
        tenant.api_keys.append(api_key)
        self.api_key_to_tenant[api_key] = tenant_id
        
        self._save()
        return api_key
    
    def revoke_api_key(self, api_key: str):
        """Revoke an API key."""
        tenant_id = self.api_key_to_tenant.get(api_key)
        if tenant_id:
            tenant = self.tenants.get(tenant_id)
            if tenant and api_key in tenant.api_keys:
                tenant.api_keys.remove(api_key)
            del self.api_key_to_tenant[api_key]
            self._save()
    
    def check_quota(self, tenant_id: str, resource: str, amount: int = 1) -> bool:
        """Check if a tenant has quota for a resource."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return False
        
        if tenant.status != TenantStatus.ACTIVE:
            return False
        
        # Reset daily counters if needed
        self._reset_daily_usage(tenant)
        
        quota = tenant.quota
        usage = tenant.usage
        
        checks = {
            "agents": usage.agents_active + amount <= quota.max_agents,
            "tasks": usage.concurrent_tasks + amount <= quota.max_concurrent_tasks,
            "storage": usage.storage_used_gb + amount <= quota.max_storage_gb,
            "api_calls": usage.api_calls_today + amount <= quota.max_api_calls_per_day,
            "compute": usage.compute_minutes_today + amount <= quota.max_compute_minutes_per_day,
            "memory": usage.memory_used_gb + amount <= quota.max_memory_gb
        }
        
        return checks.get(resource, True)
    
    def consume_quota(self, tenant_id: str, resource: str, amount: int = 1) -> bool:
        """Consume quota for a resource."""
        if not self.check_quota(tenant_id, resource, amount):
            return False
        
        tenant = self.get_tenant(tenant_id)
        usage = tenant.usage
        
        if resource == "agents":
            usage.agents_active += amount
        elif resource == "tasks":
            usage.concurrent_tasks += amount
        elif resource == "storage":
            usage.storage_used_gb += amount
        elif resource == "api_calls":
            usage.api_calls_today += amount
        elif resource == "compute":
            usage.compute_minutes_today += amount
        elif resource == "memory":
            usage.memory_used_gb += amount
        
        self._save()
        return True
    
    def release_quota(self, tenant_id: str, resource: str, amount: int = 1):
        """Release quota for a resource."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return
        
        usage = tenant.usage
        
        if resource == "agents":
            usage.agents_active = max(0, usage.agents_active - amount)
        elif resource == "tasks":
            usage.concurrent_tasks = max(0, usage.concurrent_tasks - amount)
        elif resource == "memory":
            usage.memory_used_gb = max(0, usage.memory_used_gb - amount)
        
        self._save()
    
    def is_model_allowed(self, tenant_id: str, model: str) -> bool:
        """Check if a model is allowed for a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return False
        
        if "*" in tenant.quota.allowed_models:
            return True
        
        return model in tenant.quota.allowed_models
    
    def is_tool_allowed(self, tenant_id: str, tool: str) -> bool:
        """Check if a tool is allowed for a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return False
        
        if "*" in tenant.quota.allowed_tools:
            return True
        
        return tool in tenant.quota.allowed_tools
    
    def get_usage_report(self, tenant_id: str) -> Dict[str, Any]:
        """Get a usage report for a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return {}
        
        quota = tenant.quota
        usage = tenant.usage
        
        return {
            "tenant_id": tenant_id,
            "tier": tenant.tier.value,
            "status": tenant.status.value,
            "usage": {
                "agents": {"used": usage.agents_active, "limit": quota.max_agents},
                "tasks": {"used": usage.concurrent_tasks, "limit": quota.max_concurrent_tasks},
                "storage_gb": {"used": usage.storage_used_gb, "limit": quota.max_storage_gb},
                "api_calls": {"used": usage.api_calls_today, "limit": quota.max_api_calls_per_day},
                "compute_minutes": {"used": usage.compute_minutes_today, "limit": quota.max_compute_minutes_per_day},
                "memory_gb": {"used": usage.memory_used_gb, "limit": quota.max_memory_gb}
            },
            "allowed_models": quota.allowed_models,
            "allowed_tools": quota.allowed_tools,
            "last_reset": usage.last_reset.isoformat()
        }
    
    def list_tenants(self, status: TenantStatus = None) -> List[Tenant]:
        """List all tenants."""
        tenants = list(self.tenants.values())
        if status:
            tenants = [t for t in tenants if t.status == status]
        return tenants
    
    def _reset_daily_usage(self, tenant: Tenant):
        """Reset daily usage counters if needed."""
        now = datetime.utcnow()
        if now.date() > tenant.usage.last_reset.date():
            tenant.usage.api_calls_today = 0
            tenant.usage.compute_minutes_today = 0
            tenant.usage.last_reset = now
    
    def _save(self):
        """Save tenants to storage."""
        if not self.storage_path:
            return
        
        data = {
            "tenants": {
                tid: {
                    "tenant_id": t.tenant_id,
                    "name": t.name,
                    "tier": t.tier.value,
                    "status": t.status.value,
                    "owner_email": t.owner_email,
                    "created_at": t.created_at.isoformat(),
                    "quota": {
                        "max_agents": t.quota.max_agents,
                        "max_concurrent_tasks": t.quota.max_concurrent_tasks,
                        "max_storage_gb": t.quota.max_storage_gb,
                        "max_api_calls_per_day": t.quota.max_api_calls_per_day,
                        "max_compute_minutes_per_day": t.quota.max_compute_minutes_per_day,
                        "max_memory_gb": t.quota.max_memory_gb,
                        "allowed_models": t.quota.allowed_models,
                        "allowed_tools": t.quota.allowed_tools
                    },
                    "usage": {
                        "agents_active": t.usage.agents_active,
                        "concurrent_tasks": t.usage.concurrent_tasks,
                        "storage_used_gb": t.usage.storage_used_gb,
                        "api_calls_today": t.usage.api_calls_today,
                        "compute_minutes_today": t.usage.compute_minutes_today,
                        "memory_used_gb": t.usage.memory_used_gb,
                        "last_reset": t.usage.last_reset.isoformat()
                    },
                    "settings": t.settings,
                    "metadata": t.metadata,
                    "api_keys": t.api_keys
                }
                for tid, t in self.tenants.items()
            }
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load tenants from storage."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        for tid, t_data in data.get("tenants", {}).items():
            quota = ResourceQuota(**t_data["quota"])
            usage_data = t_data["usage"]
            usage = TenantUsage(
                agents_active=usage_data["agents_active"],
                concurrent_tasks=usage_data["concurrent_tasks"],
                storage_used_gb=usage_data["storage_used_gb"],
                api_calls_today=usage_data["api_calls_today"],
                compute_minutes_today=usage_data["compute_minutes_today"],
                memory_used_gb=usage_data["memory_used_gb"],
                last_reset=datetime.fromisoformat(usage_data["last_reset"])
            )
            
            tenant = Tenant(
                tenant_id=t_data["tenant_id"],
                name=t_data["name"],
                tier=TenantTier(t_data["tier"]),
                status=TenantStatus(t_data["status"]),
                owner_email=t_data["owner_email"],
                created_at=datetime.fromisoformat(t_data["created_at"]),
                quota=quota,
                usage=usage,
                settings=t_data.get("settings", {}),
                metadata=t_data.get("metadata", {}),
                api_keys=t_data.get("api_keys", [])
            )
            
            self.tenants[tid] = tenant
            for api_key in tenant.api_keys:
                self.api_key_to_tenant[api_key] = tid


# ============================================================================
# Tenant Context
# ============================================================================

class TenantContext:
    """
    Context manager for tenant-scoped operations.
    """
    
    _current_tenant: Optional[str] = None
    
    def __init__(self, tenant_manager: TenantManager, tenant_id: str):
        self.tenant_manager = tenant_manager
        self.tenant_id = tenant_id
        self._previous_tenant: Optional[str] = None
    
    def __enter__(self):
        self._previous_tenant = TenantContext._current_tenant
        TenantContext._current_tenant = self.tenant_id
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        TenantContext._current_tenant = self._previous_tenant
    
    @classmethod
    def get_current_tenant(cls) -> Optional[str]:
        """Get the current tenant ID."""
        return cls._current_tenant
    
    def check_quota(self, resource: str, amount: int = 1) -> bool:
        """Check quota in current context."""
        return self.tenant_manager.check_quota(self.tenant_id, resource, amount)
    
    def consume_quota(self, resource: str, amount: int = 1) -> bool:
        """Consume quota in current context."""
        return self.tenant_manager.consume_quota(self.tenant_id, resource, amount)
    
    def is_model_allowed(self, model: str) -> bool:
        """Check if model is allowed in current context."""
        return self.tenant_manager.is_model_allowed(self.tenant_id, model)
    
    def is_tool_allowed(self, tool: str) -> bool:
        """Check if tool is allowed in current context."""
        return self.tenant_manager.is_tool_allowed(self.tenant_id, tool)


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Demo the Multi-Tenant System."""
    manager = TenantManager()
    
    print("=== Multi-Tenant System Demo ===\n")
    
    # Create tenants
    tenant1 = manager.create_tenant(
        name="SuperMega.dev",
        owner_email="swan@supermega.dev",
        tier=TenantTier.PROFESSIONAL
    )
    
    tenant2 = manager.create_tenant(
        name="Demo Client",
        owner_email="demo@example.com",
        tier=TenantTier.STARTER
    )
    
    print(f"Created tenant: {tenant1.name} ({tenant1.tier.value})")
    print(f"Created tenant: {tenant2.name} ({tenant2.tier.value})")
    
    # Check quotas
    print(f"\n{tenant1.name} can use agents: {manager.check_quota(tenant1.tenant_id, 'agents', 5)}")
    print(f"{tenant2.name} can use agents: {manager.check_quota(tenant2.tenant_id, 'agents', 5)}")
    
    # Consume quota
    manager.consume_quota(tenant1.tenant_id, "api_calls", 100)
    manager.consume_quota(tenant1.tenant_id, "compute", 30)
    
    # Get usage report
    report = manager.get_usage_report(tenant1.tenant_id)
    print(f"\n{tenant1.name} Usage Report:")
    print(f"  API Calls: {report['usage']['api_calls']['used']}/{report['usage']['api_calls']['limit']}")
    print(f"  Compute: {report['usage']['compute_minutes']['used']}/{report['usage']['compute_minutes']['limit']} min")
    
    # Check model access
    print(f"\n{tenant1.name} can use gpt-4o: {manager.is_model_allowed(tenant1.tenant_id, 'gpt-4o')}")
    print(f"{tenant2.name} can use gpt-4o: {manager.is_model_allowed(tenant2.tenant_id, 'gpt-4o')}")
    
    # Use tenant context
    with TenantContext(manager, tenant1.tenant_id) as ctx:
        print(f"\nIn context of: {TenantContext.get_current_tenant()}")
        print(f"Can use claude-sonnet: {ctx.is_model_allowed('claude-sonnet')}")


if __name__ == "__main__":
    main()
