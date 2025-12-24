"""
Health Check & Auto-Recovery System
====================================
Monitors system health and automatically recovers from failures.

Features:
- Service health monitoring
- Resource usage tracking
- Automatic restart on failure
- Alert notifications
- Self-healing capabilities

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import subprocess
import psutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("health_check")


# ============================================================================
# Data Models
# ============================================================================

class HealthStatus(Enum):
    """Health status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class ServiceType(Enum):
    """Types of services to monitor."""
    HTTP = "http"
    DOCKER = "docker"
    PROCESS = "process"
    DATABASE = "database"
    REDIS = "redis"


@dataclass
class ServiceConfig:
    """Configuration for a monitored service."""
    name: str
    service_type: ServiceType
    endpoint: str  # URL, container name, or process name
    check_interval: int = 30  # seconds
    timeout: int = 10  # seconds
    retries: int = 3
    restart_command: Optional[str] = None
    critical: bool = True  # If critical, trigger alerts


@dataclass
class HealthCheckResult:
    """Result of a health check."""
    service_name: str
    status: HealthStatus
    response_time: float = 0.0
    message: str = ""
    timestamp: datetime = field(default_factory=datetime.utcnow)
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SystemMetrics:
    """System resource metrics."""
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    network_io: Dict[str, int]
    timestamp: datetime = field(default_factory=datetime.utcnow)


# ============================================================================
# Health Checker
# ============================================================================

class HealthChecker:
    """
    Performs health checks on services.
    """
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=10.0)
    
    async def check_http(self, config: ServiceConfig) -> HealthCheckResult:
        """Check HTTP service health."""
        start_time = datetime.now()
        
        try:
            response = await self.http_client.get(
                config.endpoint,
                timeout=config.timeout
            )
            
            response_time = (datetime.now() - start_time).total_seconds()
            
            if response.status_code == 200:
                return HealthCheckResult(
                    service_name=config.name,
                    status=HealthStatus.HEALTHY,
                    response_time=response_time,
                    message=f"HTTP 200 OK in {response_time:.2f}s"
                )
            elif response.status_code < 500:
                return HealthCheckResult(
                    service_name=config.name,
                    status=HealthStatus.DEGRADED,
                    response_time=response_time,
                    message=f"HTTP {response.status_code}"
                )
            else:
                return HealthCheckResult(
                    service_name=config.name,
                    status=HealthStatus.UNHEALTHY,
                    response_time=response_time,
                    message=f"HTTP {response.status_code}"
                )
                
        except httpx.TimeoutException:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNHEALTHY,
                message="Request timeout"
            )
        except Exception as e:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNHEALTHY,
                message=str(e)
            )
    
    async def check_docker(self, config: ServiceConfig) -> HealthCheckResult:
        """Check Docker container health."""
        try:
            result = subprocess.run(
                ["docker", "inspect", "--format", "{{.State.Status}}", config.endpoint],
                capture_output=True,
                text=True,
                timeout=config.timeout
            )
            
            status = result.stdout.strip()
            
            if status == "running":
                return HealthCheckResult(
                    service_name=config.name,
                    status=HealthStatus.HEALTHY,
                    message="Container running"
                )
            elif status in ["paused", "restarting"]:
                return HealthCheckResult(
                    service_name=config.name,
                    status=HealthStatus.DEGRADED,
                    message=f"Container {status}"
                )
            else:
                return HealthCheckResult(
                    service_name=config.name,
                    status=HealthStatus.UNHEALTHY,
                    message=f"Container {status or 'not found'}"
                )
                
        except Exception as e:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNKNOWN,
                message=str(e)
            )
    
    async def check_process(self, config: ServiceConfig) -> HealthCheckResult:
        """Check if a process is running."""
        try:
            for proc in psutil.process_iter(['name', 'cmdline']):
                try:
                    if config.endpoint in proc.info['name'] or \
                       any(config.endpoint in cmd for cmd in (proc.info['cmdline'] or [])):
                        return HealthCheckResult(
                            service_name=config.name,
                            status=HealthStatus.HEALTHY,
                            message=f"Process running (PID: {proc.pid})",
                            details={"pid": proc.pid}
                        )
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNHEALTHY,
                message="Process not found"
            )
            
        except Exception as e:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNKNOWN,
                message=str(e)
            )
    
    async def check_redis(self, config: ServiceConfig) -> HealthCheckResult:
        """Check Redis health."""
        try:
            import redis
            
            # Parse endpoint (host:port)
            parts = config.endpoint.split(":")
            host = parts[0]
            port = int(parts[1]) if len(parts) > 1 else 6379
            
            start_time = datetime.now()
            r = redis.Redis(host=host, port=port, socket_timeout=config.timeout)
            r.ping()
            response_time = (datetime.now() - start_time).total_seconds()
            
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.HEALTHY,
                response_time=response_time,
                message=f"Redis PONG in {response_time:.2f}s"
            )
            
        except ImportError:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNKNOWN,
                message="Redis library not installed"
            )
        except Exception as e:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNHEALTHY,
                message=str(e)
            )
    
    async def check(self, config: ServiceConfig) -> HealthCheckResult:
        """Perform health check based on service type."""
        if config.service_type == ServiceType.HTTP:
            return await self.check_http(config)
        elif config.service_type == ServiceType.DOCKER:
            return await self.check_docker(config)
        elif config.service_type == ServiceType.PROCESS:
            return await self.check_process(config)
        elif config.service_type == ServiceType.REDIS:
            return await self.check_redis(config)
        else:
            return HealthCheckResult(
                service_name=config.name,
                status=HealthStatus.UNKNOWN,
                message=f"Unknown service type: {config.service_type}"
            )


# ============================================================================
# Auto-Recovery System
# ============================================================================

class AutoRecovery:
    """
    Automatically recovers failed services.
    """
    
    def __init__(self):
        self.recovery_attempts: Dict[str, int] = {}
        self.max_attempts = 3
        self.cooldown_period = 300  # 5 minutes
        self.last_recovery: Dict[str, datetime] = {}
    
    async def recover(self, config: ServiceConfig) -> bool:
        """
        Attempt to recover a failed service.
        
        Returns True if recovery was attempted, False if skipped.
        """
        service_name = config.name
        
        # Check cooldown
        if service_name in self.last_recovery:
            elapsed = (datetime.utcnow() - self.last_recovery[service_name]).total_seconds()
            if elapsed < self.cooldown_period:
                logger.info(f"Skipping recovery for {service_name} - in cooldown")
                return False
        
        # Check attempt limit
        attempts = self.recovery_attempts.get(service_name, 0)
        if attempts >= self.max_attempts:
            logger.warning(f"Max recovery attempts reached for {service_name}")
            return False
        
        # Attempt recovery
        logger.info(f"Attempting recovery for {service_name} (attempt {attempts + 1})")
        
        try:
            if config.restart_command:
                # Use custom restart command
                result = subprocess.run(
                    config.restart_command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode == 0:
                    logger.info(f"Recovery successful for {service_name}")
                    self.recovery_attempts[service_name] = 0
                    return True
                else:
                    logger.error(f"Recovery failed: {result.stderr}")
            
            elif config.service_type == ServiceType.DOCKER:
                # Restart Docker container
                result = subprocess.run(
                    ["docker", "restart", config.endpoint],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode == 0:
                    logger.info(f"Docker container {config.endpoint} restarted")
                    self.recovery_attempts[service_name] = 0
                    return True
            
            else:
                logger.warning(f"No recovery method for {service_name}")
            
        except Exception as e:
            logger.error(f"Recovery error for {service_name}: {e}")
        
        # Update attempts
        self.recovery_attempts[service_name] = attempts + 1
        self.last_recovery[service_name] = datetime.utcnow()
        
        return False
    
    def reset_attempts(self, service_name: str):
        """Reset recovery attempts for a service."""
        self.recovery_attempts[service_name] = 0


# ============================================================================
# Alert Manager
# ============================================================================

class AlertManager:
    """
    Manages alerts and notifications.
    """
    
    def __init__(self):
        self.alerts: List[Dict[str, Any]] = []
        self.alert_handlers: List[Callable] = []
        self.suppressed_alerts: Dict[str, datetime] = {}
        self.suppression_period = 300  # 5 minutes
    
    def add_handler(self, handler: Callable):
        """Add an alert handler."""
        self.alert_handlers.append(handler)
    
    async def send_alert(
        self,
        service_name: str,
        status: HealthStatus,
        message: str,
        severity: str = "warning"
    ):
        """Send an alert notification."""
        # Check suppression
        key = f"{service_name}:{status.value}"
        if key in self.suppressed_alerts:
            elapsed = (datetime.utcnow() - self.suppressed_alerts[key]).total_seconds()
            if elapsed < self.suppression_period:
                return  # Suppress duplicate alert
        
        alert = {
            "service": service_name,
            "status": status.value,
            "message": message,
            "severity": severity,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.alerts.append(alert)
        self.suppressed_alerts[key] = datetime.utcnow()
        
        logger.warning(f"ALERT [{severity.upper()}] {service_name}: {message}")
        
        # Call handlers
        for handler in self.alert_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(alert)
                else:
                    handler(alert)
            except Exception as e:
                logger.error(f"Alert handler error: {e}")
    
    def get_recent_alerts(self, hours: int = 24) -> List[Dict]:
        """Get alerts from the last N hours."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return [
            a for a in self.alerts
            if datetime.fromisoformat(a["timestamp"]) > cutoff
        ]


# ============================================================================
# Health Monitor
# ============================================================================

class HealthMonitor:
    """
    Main health monitoring system.
    
    Combines health checking, auto-recovery, and alerting.
    """
    
    # Default services to monitor
    DEFAULT_SERVICES = [
        ServiceConfig(
            name="MCA API",
            service_type=ServiceType.HTTP,
            endpoint="http://localhost:8080/health",
            restart_command="docker restart hyper_unicorn_mca"
        ),
        ServiceConfig(
            name="Alfred Dashboard",
            service_type=ServiceType.HTTP,
            endpoint="http://localhost:8501",
            restart_command="docker restart hyper_unicorn_dashboard"
        ),
        ServiceConfig(
            name="n8n",
            service_type=ServiceType.HTTP,
            endpoint="http://localhost:5678",
            restart_command="docker restart hyper_unicorn_n8n"
        ),
        ServiceConfig(
            name="Redis",
            service_type=ServiceType.REDIS,
            endpoint="localhost:6379",
            restart_command="docker restart hyper_unicorn_redis"
        ),
        ServiceConfig(
            name="Qdrant",
            service_type=ServiceType.HTTP,
            endpoint="http://localhost:6333/health",
            restart_command="docker restart hyper_unicorn_qdrant"
        )
    ]
    
    def __init__(self, services: List[ServiceConfig] = None):
        self.services = services or self.DEFAULT_SERVICES
        self.checker = HealthChecker()
        self.recovery = AutoRecovery()
        self.alerts = AlertManager()
        
        self.results: Dict[str, HealthCheckResult] = {}
        self.metrics_history: List[SystemMetrics] = []
        self.running = False
    
    def add_service(self, config: ServiceConfig):
        """Add a service to monitor."""
        self.services.append(config)
    
    def remove_service(self, name: str):
        """Remove a service from monitoring."""
        self.services = [s for s in self.services if s.name != name]
    
    async def check_all(self) -> Dict[str, HealthCheckResult]:
        """Check health of all services."""
        results = {}
        
        for config in self.services:
            result = await self.checker.check(config)
            results[config.name] = result
            self.results[config.name] = result
            
            # Handle unhealthy services
            if result.status == HealthStatus.UNHEALTHY:
                await self.alerts.send_alert(
                    config.name,
                    result.status,
                    result.message,
                    severity="critical" if config.critical else "warning"
                )
                
                # Attempt recovery
                if config.restart_command:
                    await self.recovery.recover(config)
            
            elif result.status == HealthStatus.DEGRADED:
                await self.alerts.send_alert(
                    config.name,
                    result.status,
                    result.message,
                    severity="warning"
                )
            
            elif result.status == HealthStatus.HEALTHY:
                # Reset recovery attempts on healthy
                self.recovery.reset_attempts(config.name)
        
        return results
    
    def collect_system_metrics(self) -> SystemMetrics:
        """Collect system resource metrics."""
        net_io = psutil.net_io_counters()
        
        metrics = SystemMetrics(
            cpu_percent=psutil.cpu_percent(interval=1),
            memory_percent=psutil.virtual_memory().percent,
            disk_percent=psutil.disk_usage('/').percent,
            network_io={
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv
            }
        )
        
        self.metrics_history.append(metrics)
        
        # Keep only last 24 hours
        cutoff = datetime.utcnow() - timedelta(hours=24)
        self.metrics_history = [
            m for m in self.metrics_history
            if m.timestamp > cutoff
        ]
        
        return metrics
    
    def get_status_summary(self) -> Dict[str, Any]:
        """Get overall system status summary."""
        healthy = sum(1 for r in self.results.values() if r.status == HealthStatus.HEALTHY)
        degraded = sum(1 for r in self.results.values() if r.status == HealthStatus.DEGRADED)
        unhealthy = sum(1 for r in self.results.values() if r.status == HealthStatus.UNHEALTHY)
        
        # Determine overall status
        if unhealthy > 0:
            overall = HealthStatus.UNHEALTHY
        elif degraded > 0:
            overall = HealthStatus.DEGRADED
        elif healthy > 0:
            overall = HealthStatus.HEALTHY
        else:
            overall = HealthStatus.UNKNOWN
        
        # Get latest metrics
        metrics = self.collect_system_metrics()
        
        return {
            "overall_status": overall.value,
            "services": {
                "healthy": healthy,
                "degraded": degraded,
                "unhealthy": unhealthy,
                "total": len(self.services)
            },
            "system": {
                "cpu_percent": metrics.cpu_percent,
                "memory_percent": metrics.memory_percent,
                "disk_percent": metrics.disk_percent
            },
            "recent_alerts": len(self.alerts.get_recent_alerts(hours=1)),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def run(self, interval: int = 30):
        """
        Run continuous health monitoring.
        
        Args:
            interval: Check interval in seconds
        """
        self.running = True
        logger.info(f"Health Monitor started - checking {len(self.services)} services every {interval}s")
        
        while self.running:
            try:
                # Check all services
                await self.check_all()
                
                # Collect metrics
                self.collect_system_metrics()
                
                # Log summary
                summary = self.get_status_summary()
                logger.info(
                    f"Health: {summary['overall_status']} | "
                    f"Services: {summary['services']['healthy']}/{summary['services']['total']} healthy | "
                    f"CPU: {summary['system']['cpu_percent']:.1f}% | "
                    f"Memory: {summary['system']['memory_percent']:.1f}%"
                )
                
            except Exception as e:
                logger.error(f"Health Monitor error: {e}")
            
            await asyncio.sleep(interval)
    
    def stop(self):
        """Stop the health monitor."""
        self.running = False
        logger.info("Health Monitor stopped")


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Health Monitor."""
    monitor = HealthMonitor()
    
    # Add custom alert handler
    def log_alert(alert):
        print(f"🚨 ALERT: {alert['service']} - {alert['message']}")
    
    monitor.alerts.add_handler(log_alert)
    
    # Check all services once
    results = await monitor.check_all()
    
    for name, result in results.items():
        status_emoji = {
            HealthStatus.HEALTHY: "✅",
            HealthStatus.DEGRADED: "⚠️",
            HealthStatus.UNHEALTHY: "❌",
            HealthStatus.UNKNOWN: "❓"
        }
        print(f"{status_emoji[result.status]} {name}: {result.message}")
    
    # Get summary
    summary = monitor.get_status_summary()
    print(f"\nOverall Status: {summary['overall_status']}")
    print(f"System: CPU {summary['system']['cpu_percent']:.1f}%, Memory {summary['system']['memory_percent']:.1f}%")


if __name__ == "__main__":
    asyncio.run(main())
