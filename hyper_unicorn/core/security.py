"""
Security Layer
===============
Authentication, authorization, rate limiting, and audit logging.

Features:
- API key management
- JWT authentication
- Role-based access control
- Rate limiting
- Audit logging
- Encryption utilities

Author: Manus AI for SuperMega.dev
"""

import os
import json
import time
import asyncio
import hashlib
import secrets
import hmac
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
import logging
import base64

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("security")


# ============================================================================
# Data Models
# ============================================================================

class Permission(Enum):
    """System permissions."""
    # Agent permissions
    AGENT_READ = "agent:read"
    AGENT_WRITE = "agent:write"
    AGENT_EXECUTE = "agent:execute"
    AGENT_DELETE = "agent:delete"
    
    # Task permissions
    TASK_READ = "task:read"
    TASK_WRITE = "task:write"
    TASK_DELETE = "task:delete"
    
    # System permissions
    SYSTEM_READ = "system:read"
    SYSTEM_WRITE = "system:write"
    SYSTEM_ADMIN = "system:admin"
    
    # Data permissions
    DATA_READ = "data:read"
    DATA_WRITE = "data:write"
    DATA_DELETE = "data:delete"
    
    # API permissions
    API_READ = "api:read"
    API_WRITE = "api:write"


class Role(Enum):
    """User roles."""
    ADMIN = "admin"
    OPERATOR = "operator"
    DEVELOPER = "developer"
    VIEWER = "viewer"
    SERVICE = "service"


# Role to permissions mapping
ROLE_PERMISSIONS = {
    Role.ADMIN: [p for p in Permission],  # All permissions
    Role.OPERATOR: [
        Permission.AGENT_READ, Permission.AGENT_WRITE, Permission.AGENT_EXECUTE,
        Permission.TASK_READ, Permission.TASK_WRITE,
        Permission.SYSTEM_READ,
        Permission.DATA_READ, Permission.DATA_WRITE,
        Permission.API_READ, Permission.API_WRITE
    ],
    Role.DEVELOPER: [
        Permission.AGENT_READ, Permission.AGENT_WRITE, Permission.AGENT_EXECUTE,
        Permission.TASK_READ, Permission.TASK_WRITE,
        Permission.DATA_READ, Permission.DATA_WRITE,
        Permission.API_READ
    ],
    Role.VIEWER: [
        Permission.AGENT_READ,
        Permission.TASK_READ,
        Permission.SYSTEM_READ,
        Permission.DATA_READ,
        Permission.API_READ
    ],
    Role.SERVICE: [
        Permission.AGENT_EXECUTE,
        Permission.TASK_READ, Permission.TASK_WRITE,
        Permission.DATA_READ, Permission.DATA_WRITE,
        Permission.API_READ, Permission.API_WRITE
    ]
}


@dataclass
class APIKey:
    """An API key."""
    key_id: str
    key_hash: str
    name: str
    role: Role
    permissions: List[Permission]
    created_at: datetime
    expires_at: Optional[datetime] = None
    last_used: Optional[datetime] = None
    is_active: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class User:
    """A system user."""
    user_id: str
    username: str
    email: str
    password_hash: str
    role: Role
    permissions: List[Permission]
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AuditLog:
    """An audit log entry."""
    log_id: str
    timestamp: datetime
    user_id: Optional[str]
    api_key_id: Optional[str]
    action: str
    resource: str
    resource_id: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    status: str  # success, failure, denied
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RateLimitEntry:
    """A rate limit entry."""
    key: str
    count: int
    window_start: float
    window_size: int  # seconds


# ============================================================================
# Encryption Utilities
# ============================================================================

class Encryption:
    """Encryption utilities."""
    
    @staticmethod
    def hash_password(password: str, salt: str = None) -> tuple:
        """Hash a password with salt."""
        if salt is None:
            salt = secrets.token_hex(16)
        
        hash_obj = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode(),
            salt.encode(),
            100000
        )
        
        return base64.b64encode(hash_obj).decode(), salt
    
    @staticmethod
    def verify_password(password: str, hash_str: str, salt: str) -> bool:
        """Verify a password against a hash."""
        new_hash, _ = Encryption.hash_password(password, salt)
        return hmac.compare_digest(new_hash, hash_str)
    
    @staticmethod
    def generate_api_key() -> tuple:
        """Generate an API key and its hash."""
        key = f"sk_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        return key, key_hash
    
    @staticmethod
    def hash_api_key(key: str) -> str:
        """Hash an API key."""
        return hashlib.sha256(key.encode()).hexdigest()
    
    @staticmethod
    def generate_token(payload: Dict[str, Any], secret: str, expires_in: int = 3600) -> str:
        """Generate a simple JWT-like token."""
        header = {"alg": "HS256", "typ": "JWT"}
        
        payload["exp"] = int(time.time()) + expires_in
        payload["iat"] = int(time.time())
        
        header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        
        signature = hmac.new(
            secret.encode(),
            f"{header_b64}.{payload_b64}".encode(),
            hashlib.sha256
        ).digest()
        signature_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
        
        return f"{header_b64}.{payload_b64}.{signature_b64}"
    
    @staticmethod
    def verify_token(token: str, secret: str) -> Optional[Dict[str, Any]]:
        """Verify and decode a token."""
        try:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            
            header_b64, payload_b64, signature_b64 = parts
            
            # Verify signature
            expected_sig = hmac.new(
                secret.encode(),
                f"{header_b64}.{payload_b64}".encode(),
                hashlib.sha256
            ).digest()
            expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")
            
            if not hmac.compare_digest(signature_b64, expected_sig_b64):
                return None
            
            # Decode payload
            padding = 4 - len(payload_b64) % 4
            payload_b64 += "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            
            # Check expiration
            if payload.get("exp", 0) < time.time():
                return None
            
            return payload
        except Exception:
            return None


# ============================================================================
# Rate Limiter
# ============================================================================

class RateLimiter:
    """
    Token bucket rate limiter.
    """
    
    def __init__(self):
        self.entries: Dict[str, RateLimitEntry] = {}
        self.default_limit = 100  # requests per window
        self.default_window = 60  # seconds
        
        # Custom limits by key prefix
        self.limits = {
            "api_key:": {"limit": 1000, "window": 60},
            "user:": {"limit": 100, "window": 60},
            "ip:": {"limit": 50, "window": 60},
            "agent:": {"limit": 500, "window": 60}
        }
    
    def _get_limit(self, key: str) -> tuple:
        """Get limit and window for a key."""
        for prefix, config in self.limits.items():
            if key.startswith(prefix):
                return config["limit"], config["window"]
        return self.default_limit, self.default_window
    
    def check(self, key: str) -> tuple:
        """
        Check if request is allowed.
        Returns (allowed, remaining, reset_time).
        """
        limit, window = self._get_limit(key)
        now = time.time()
        
        entry = self.entries.get(key)
        
        if entry is None or now - entry.window_start >= entry.window_size:
            # New window
            entry = RateLimitEntry(
                key=key,
                count=1,
                window_start=now,
                window_size=window
            )
            self.entries[key] = entry
            return True, limit - 1, int(now + window)
        
        if entry.count >= limit:
            # Rate limited
            reset_time = int(entry.window_start + entry.window_size)
            return False, 0, reset_time
        
        # Increment count
        entry.count += 1
        remaining = limit - entry.count
        reset_time = int(entry.window_start + entry.window_size)
        
        return True, remaining, reset_time
    
    def reset(self, key: str):
        """Reset rate limit for a key."""
        if key in self.entries:
            del self.entries[key]


# ============================================================================
# Audit Logger
# ============================================================================

class AuditLogger:
    """
    Audit logging system.
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path
        self.logs: List[AuditLog] = []
        self.max_logs = 10000
    
    def _generate_id(self) -> str:
        """Generate a log ID."""
        return f"log_{secrets.token_hex(8)}"
    
    def log(
        self,
        action: str,
        resource: str,
        status: str,
        user_id: str = None,
        api_key_id: str = None,
        resource_id: str = None,
        ip_address: str = None,
        user_agent: str = None,
        details: Dict[str, Any] = None
    ) -> AuditLog:
        """Log an audit event."""
        log_entry = AuditLog(
            log_id=self._generate_id(),
            timestamp=datetime.utcnow(),
            user_id=user_id,
            api_key_id=api_key_id,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
            details=details or {}
        )
        
        self.logs.append(log_entry)
        
        # Trim old logs
        if len(self.logs) > self.max_logs:
            self.logs = self.logs[-self.max_logs:]
        
        # Log to file
        logger.info(f"AUDIT: {action} on {resource} - {status}")
        
        # Save to storage
        self._save()
        
        return log_entry
    
    def query(
        self,
        user_id: str = None,
        api_key_id: str = None,
        action: str = None,
        resource: str = None,
        status: str = None,
        start_time: datetime = None,
        end_time: datetime = None,
        limit: int = 100
    ) -> List[AuditLog]:
        """Query audit logs."""
        results = []
        
        for log in reversed(self.logs):
            if user_id and log.user_id != user_id:
                continue
            if api_key_id and log.api_key_id != api_key_id:
                continue
            if action and log.action != action:
                continue
            if resource and log.resource != resource:
                continue
            if status and log.status != status:
                continue
            if start_time and log.timestamp < start_time:
                continue
            if end_time and log.timestamp > end_time:
                continue
            
            results.append(log)
            
            if len(results) >= limit:
                break
        
        return results
    
    def _save(self):
        """Save logs to storage."""
        if not self.storage_path:
            return
        
        # Only save recent logs
        recent = self.logs[-1000:]
        
        data = [
            {
                "log_id": log.log_id,
                "timestamp": log.timestamp.isoformat(),
                "user_id": log.user_id,
                "api_key_id": log.api_key_id,
                "action": log.action,
                "resource": log.resource,
                "resource_id": log.resource_id,
                "ip_address": log.ip_address,
                "status": log.status,
                "details": log.details
            }
            for log in recent
        ]
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)


# ============================================================================
# Security Manager
# ============================================================================

class SecurityManager:
    """
    Main security manager.
    """
    
    def __init__(self, secret_key: str = None, storage_path: str = None):
        self.secret_key = secret_key or os.getenv("SECRET_KEY", secrets.token_hex(32))
        self.storage_path = storage_path
        
        self.api_keys: Dict[str, APIKey] = {}
        self.users: Dict[str, User] = {}
        
        self.rate_limiter = RateLimiter()
        self.audit_logger = AuditLogger()
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    # -------------------------------------------------------------------------
    # API Key Management
    # -------------------------------------------------------------------------
    
    def create_api_key(
        self,
        name: str,
        role: Role = Role.SERVICE,
        permissions: List[Permission] = None,
        expires_in_days: int = None
    ) -> tuple:
        """Create a new API key. Returns (key, key_id)."""
        key, key_hash = Encryption.generate_api_key()
        key_id = f"key_{secrets.token_hex(8)}"
        
        if permissions is None:
            permissions = ROLE_PERMISSIONS.get(role, [])
        
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        api_key = APIKey(
            key_id=key_id,
            key_hash=key_hash,
            name=name,
            role=role,
            permissions=permissions,
            created_at=datetime.utcnow(),
            expires_at=expires_at
        )
        
        self.api_keys[key_id] = api_key
        self._save()
        
        self.audit_logger.log(
            action="api_key_created",
            resource="api_key",
            resource_id=key_id,
            status="success",
            details={"name": name, "role": role.value}
        )
        
        return key, key_id
    
    def validate_api_key(self, key: str) -> Optional[APIKey]:
        """Validate an API key."""
        key_hash = Encryption.hash_api_key(key)
        
        for api_key in self.api_keys.values():
            if api_key.key_hash == key_hash:
                if not api_key.is_active:
                    return None
                if api_key.expires_at and api_key.expires_at < datetime.utcnow():
                    return None
                
                # Update last used
                api_key.last_used = datetime.utcnow()
                self._save()
                
                return api_key
        
        return None
    
    def revoke_api_key(self, key_id: str) -> bool:
        """Revoke an API key."""
        if key_id not in self.api_keys:
            return False
        
        self.api_keys[key_id].is_active = False
        self._save()
        
        self.audit_logger.log(
            action="api_key_revoked",
            resource="api_key",
            resource_id=key_id,
            status="success"
        )
        
        return True
    
    # -------------------------------------------------------------------------
    # User Management
    # -------------------------------------------------------------------------
    
    def create_user(
        self,
        username: str,
        email: str,
        password: str,
        role: Role = Role.VIEWER
    ) -> User:
        """Create a new user."""
        user_id = f"user_{secrets.token_hex(8)}"
        password_hash, salt = Encryption.hash_password(password)
        
        user = User(
            user_id=user_id,
            username=username,
            email=email,
            password_hash=f"{password_hash}:{salt}",
            role=role,
            permissions=ROLE_PERMISSIONS.get(role, []),
            created_at=datetime.utcnow()
        )
        
        self.users[user_id] = user
        self._save()
        
        self.audit_logger.log(
            action="user_created",
            resource="user",
            resource_id=user_id,
            status="success",
            details={"username": username, "role": role.value}
        )
        
        return user
    
    def authenticate_user(self, username: str, password: str) -> Optional[str]:
        """Authenticate a user and return a token."""
        for user in self.users.values():
            if user.username == username and user.is_active:
                hash_str, salt = user.password_hash.split(":")
                if Encryption.verify_password(password, hash_str, salt):
                    # Update last login
                    user.last_login = datetime.utcnow()
                    self._save()
                    
                    # Generate token
                    token = Encryption.generate_token(
                        {"user_id": user.user_id, "role": user.role.value},
                        self.secret_key
                    )
                    
                    self.audit_logger.log(
                        action="user_login",
                        resource="user",
                        resource_id=user.user_id,
                        status="success"
                    )
                    
                    return token
        
        self.audit_logger.log(
            action="user_login",
            resource="user",
            status="failure",
            details={"username": username}
        )
        
        return None
    
    def validate_token(self, token: str) -> Optional[User]:
        """Validate a token and return the user."""
        payload = Encryption.verify_token(token, self.secret_key)
        if not payload:
            return None
        
        user_id = payload.get("user_id")
        if user_id and user_id in self.users:
            user = self.users[user_id]
            if user.is_active:
                return user
        
        return None
    
    # -------------------------------------------------------------------------
    # Authorization
    # -------------------------------------------------------------------------
    
    def check_permission(
        self,
        entity: Any,  # User or APIKey
        permission: Permission
    ) -> bool:
        """Check if an entity has a permission."""
        if entity is None:
            return False
        
        return permission in entity.permissions
    
    def require_permission(self, permission: Permission):
        """Decorator to require a permission."""
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                # Get entity from context (implementation depends on framework)
                entity = kwargs.get("_auth_entity")
                
                if not self.check_permission(entity, permission):
                    self.audit_logger.log(
                        action=func.__name__,
                        resource="function",
                        status="denied",
                        details={"required_permission": permission.value}
                    )
                    raise PermissionError(f"Permission denied: {permission.value}")
                
                return await func(*args, **kwargs)
            return wrapper
        return decorator
    
    # -------------------------------------------------------------------------
    # Rate Limiting
    # -------------------------------------------------------------------------
    
    def check_rate_limit(
        self,
        key: str,
        ip_address: str = None
    ) -> tuple:
        """Check rate limit for a key."""
        # Check API key limit
        allowed, remaining, reset = self.rate_limiter.check(f"api_key:{key}")
        
        if not allowed:
            self.audit_logger.log(
                action="rate_limit_exceeded",
                resource="api",
                status="denied",
                api_key_id=key,
                ip_address=ip_address
            )
        
        return allowed, remaining, reset
    
    # -------------------------------------------------------------------------
    # Storage
    # -------------------------------------------------------------------------
    
    def _save(self):
        """Save security data to storage."""
        if not self.storage_path:
            return
        
        data = {
            "api_keys": [
                {
                    "key_id": k.key_id,
                    "key_hash": k.key_hash,
                    "name": k.name,
                    "role": k.role.value,
                    "permissions": [p.value for p in k.permissions],
                    "created_at": k.created_at.isoformat(),
                    "expires_at": k.expires_at.isoformat() if k.expires_at else None,
                    "is_active": k.is_active
                }
                for k in self.api_keys.values()
            ],
            "users": [
                {
                    "user_id": u.user_id,
                    "username": u.username,
                    "email": u.email,
                    "password_hash": u.password_hash,
                    "role": u.role.value,
                    "permissions": [p.value for p in u.permissions],
                    "created_at": u.created_at.isoformat(),
                    "is_active": u.is_active
                }
                for u in self.users.values()
            ]
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load security data from storage."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        for k_data in data.get("api_keys", []):
            api_key = APIKey(
                key_id=k_data["key_id"],
                key_hash=k_data["key_hash"],
                name=k_data["name"],
                role=Role(k_data["role"]),
                permissions=[Permission(p) for p in k_data["permissions"]],
                created_at=datetime.fromisoformat(k_data["created_at"]),
                expires_at=datetime.fromisoformat(k_data["expires_at"]) if k_data["expires_at"] else None,
                is_active=k_data["is_active"]
            )
            self.api_keys[api_key.key_id] = api_key
        
        for u_data in data.get("users", []):
            user = User(
                user_id=u_data["user_id"],
                username=u_data["username"],
                email=u_data["email"],
                password_hash=u_data["password_hash"],
                role=Role(u_data["role"]),
                permissions=[Permission(p) for p in u_data["permissions"]],
                created_at=datetime.fromisoformat(u_data["created_at"]),
                is_active=u_data["is_active"]
            )
            self.users[user.user_id] = user


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Security Layer."""
    security = SecurityManager()
    
    # Create API key
    key, key_id = security.create_api_key("Test Service", Role.SERVICE)
    print(f"Created API key: {key[:20]}... (ID: {key_id})")
    
    # Validate API key
    api_key = security.validate_api_key(key)
    print(f"Validated: {api_key.name if api_key else 'Invalid'}")
    
    # Create user
    user = security.create_user("admin", "admin@supermega.dev", "password123", Role.ADMIN)
    print(f"Created user: {user.username}")
    
    # Authenticate
    token = security.authenticate_user("admin", "password123")
    print(f"Token: {token[:30]}...")
    
    # Validate token
    validated_user = security.validate_token(token)
    print(f"Validated user: {validated_user.username if validated_user else 'Invalid'}")
    
    # Check permission
    has_perm = security.check_permission(api_key, Permission.AGENT_EXECUTE)
    print(f"Has AGENT_EXECUTE: {has_perm}")
    
    # Rate limiting
    for i in range(5):
        allowed, remaining, reset = security.check_rate_limit(key_id)
        print(f"Request {i+1}: allowed={allowed}, remaining={remaining}")


if __name__ == "__main__":
    asyncio.run(main())
