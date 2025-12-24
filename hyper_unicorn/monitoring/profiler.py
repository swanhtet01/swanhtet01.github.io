"""
Performance Profiler
====================
Profile and optimize agent operations.

Features:
- Execution time tracking
- Memory usage monitoring
- API call analytics
- Cost tracking
- Bottleneck detection
- Optimization recommendations

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import time
import asyncio
import functools
import tracemalloc
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass, field
from collections import defaultdict
from contextlib import contextmanager, asynccontextmanager
import logging
import json
import statistics

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("profiler")


# ============================================================================
# Data Models
# ============================================================================

@dataclass
class ExecutionMetrics:
    """Metrics for a single execution."""
    name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_ms: float = 0.0
    memory_start_mb: float = 0.0
    memory_end_mb: float = 0.0
    memory_peak_mb: float = 0.0
    success: bool = True
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class APICallMetrics:
    """Metrics for API calls."""
    provider: str
    model: str
    timestamp: datetime
    duration_ms: float
    input_tokens: int
    output_tokens: int
    cost_usd: float
    success: bool
    error: Optional[str] = None


@dataclass
class AgentMetrics:
    """Aggregated metrics for an agent."""
    agent_name: str
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    total_duration_ms: float = 0.0
    avg_duration_ms: float = 0.0
    min_duration_ms: float = float('inf')
    max_duration_ms: float = 0.0
    total_memory_mb: float = 0.0
    total_api_calls: int = 0
    total_cost_usd: float = 0.0


# ============================================================================
# Cost Calculator
# ============================================================================

class CostCalculator:
    """Calculate costs for API calls."""
    
    # Pricing per 1M tokens (as of 2024)
    PRICING = {
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
        "gpt-4": {"input": 30.00, "output": 60.00},
        "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
        "claude-3-opus": {"input": 15.00, "output": 75.00},
        "claude-3-sonnet": {"input": 3.00, "output": 15.00},
        "claude-3-haiku": {"input": 0.25, "output": 1.25},
        "gemini-1.5-pro": {"input": 3.50, "output": 10.50},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
        "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    }
    
    @classmethod
    def calculate(
        cls,
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> float:
        """Calculate cost in USD."""
        pricing = cls.PRICING.get(model, {"input": 1.0, "output": 3.0})
        
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        
        return round(input_cost + output_cost, 6)


# ============================================================================
# Profiler
# ============================================================================

class Profiler:
    """
    Performance profiler for agent operations.
    """
    
    def __init__(self):
        self.executions: List[ExecutionMetrics] = []
        self.api_calls: List[APICallMetrics] = []
        self.agent_metrics: Dict[str, AgentMetrics] = {}
        self.active_traces: Dict[str, ExecutionMetrics] = {}
        self.max_history = 10000
    
    def _get_memory_mb(self) -> float:
        """Get current memory usage in MB."""
        import psutil
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / (1024 * 1024)
    
    @contextmanager
    def profile(self, name: str, metadata: Dict[str, Any] = None):
        """
        Context manager for profiling synchronous code.
        
        Usage:
            with profiler.profile("my_operation"):
                do_something()
        """
        metrics = ExecutionMetrics(
            name=name,
            start_time=datetime.utcnow(),
            memory_start_mb=self._get_memory_mb(),
            metadata=metadata or {}
        )
        
        # Start memory tracking
        tracemalloc.start()
        start_time = time.perf_counter()
        
        try:
            yield metrics
            metrics.success = True
        except Exception as e:
            metrics.success = False
            metrics.error = str(e)
            raise
        finally:
            # Calculate duration
            metrics.duration_ms = (time.perf_counter() - start_time) * 1000
            metrics.end_time = datetime.utcnow()
            
            # Get memory stats
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            metrics.memory_end_mb = self._get_memory_mb()
            metrics.memory_peak_mb = peak / (1024 * 1024)
            
            # Store metrics
            self._store_execution(metrics)
    
    @asynccontextmanager
    async def profile_async(self, name: str, metadata: Dict[str, Any] = None):
        """
        Context manager for profiling async code.
        
        Usage:
            async with profiler.profile_async("my_operation"):
                await do_something()
        """
        metrics = ExecutionMetrics(
            name=name,
            start_time=datetime.utcnow(),
            memory_start_mb=self._get_memory_mb(),
            metadata=metadata or {}
        )
        
        start_time = time.perf_counter()
        
        try:
            yield metrics
            metrics.success = True
        except Exception as e:
            metrics.success = False
            metrics.error = str(e)
            raise
        finally:
            metrics.duration_ms = (time.perf_counter() - start_time) * 1000
            metrics.end_time = datetime.utcnow()
            metrics.memory_end_mb = self._get_memory_mb()
            
            self._store_execution(metrics)
    
    def profile_function(self, func: Callable) -> Callable:
        """
        Decorator for profiling functions.
        
        Usage:
            @profiler.profile_function
            def my_function():
                pass
        """
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            with self.profile(func.__name__):
                return func(*args, **kwargs)
        
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            async with self.profile_async(func.__name__):
                return await func(*args, **kwargs)
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper
    
    def _store_execution(self, metrics: ExecutionMetrics):
        """Store execution metrics."""
        self.executions.append(metrics)
        
        # Trim history
        if len(self.executions) > self.max_history:
            self.executions = self.executions[-self.max_history:]
        
        # Update agent metrics
        self._update_agent_metrics(metrics)
    
    def _update_agent_metrics(self, execution: ExecutionMetrics):
        """Update aggregated agent metrics."""
        name = execution.name
        
        if name not in self.agent_metrics:
            self.agent_metrics[name] = AgentMetrics(agent_name=name)
        
        metrics = self.agent_metrics[name]
        metrics.total_executions += 1
        
        if execution.success:
            metrics.successful_executions += 1
        else:
            metrics.failed_executions += 1
        
        metrics.total_duration_ms += execution.duration_ms
        metrics.avg_duration_ms = metrics.total_duration_ms / metrics.total_executions
        metrics.min_duration_ms = min(metrics.min_duration_ms, execution.duration_ms)
        metrics.max_duration_ms = max(metrics.max_duration_ms, execution.duration_ms)
        metrics.total_memory_mb += execution.memory_peak_mb
    
    def record_api_call(
        self,
        provider: str,
        model: str,
        duration_ms: float,
        input_tokens: int,
        output_tokens: int,
        success: bool = True,
        error: str = None
    ):
        """Record an API call."""
        cost = CostCalculator.calculate(model, input_tokens, output_tokens)
        
        metrics = APICallMetrics(
            provider=provider,
            model=model,
            timestamp=datetime.utcnow(),
            duration_ms=duration_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            success=success,
            error=error
        )
        
        self.api_calls.append(metrics)
        
        # Trim history
        if len(self.api_calls) > self.max_history:
            self.api_calls = self.api_calls[-self.max_history:]
    
    def get_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Get profiling summary for the last N hours."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        # Filter recent executions
        recent_executions = [
            e for e in self.executions
            if e.start_time >= cutoff
        ]
        
        # Filter recent API calls
        recent_api_calls = [
            a for a in self.api_calls
            if a.timestamp >= cutoff
        ]
        
        # Calculate execution stats
        if recent_executions:
            durations = [e.duration_ms for e in recent_executions]
            exec_stats = {
                "total": len(recent_executions),
                "successful": sum(1 for e in recent_executions if e.success),
                "failed": sum(1 for e in recent_executions if not e.success),
                "avg_duration_ms": statistics.mean(durations),
                "median_duration_ms": statistics.median(durations),
                "p95_duration_ms": sorted(durations)[int(len(durations) * 0.95)] if len(durations) > 20 else max(durations),
                "total_duration_ms": sum(durations)
            }
        else:
            exec_stats = {"total": 0}
        
        # Calculate API stats
        if recent_api_calls:
            api_stats = {
                "total_calls": len(recent_api_calls),
                "successful_calls": sum(1 for a in recent_api_calls if a.success),
                "total_tokens": sum(a.input_tokens + a.output_tokens for a in recent_api_calls),
                "total_cost_usd": sum(a.cost_usd for a in recent_api_calls),
                "by_provider": defaultdict(lambda: {"calls": 0, "cost": 0.0})
            }
            
            for call in recent_api_calls:
                api_stats["by_provider"][call.provider]["calls"] += 1
                api_stats["by_provider"][call.provider]["cost"] += call.cost_usd
            
            api_stats["by_provider"] = dict(api_stats["by_provider"])
        else:
            api_stats = {"total_calls": 0}
        
        return {
            "period_hours": hours,
            "executions": exec_stats,
            "api_calls": api_stats,
            "agent_metrics": {
                name: {
                    "total_executions": m.total_executions,
                    "success_rate": m.successful_executions / m.total_executions if m.total_executions > 0 else 0,
                    "avg_duration_ms": m.avg_duration_ms,
                    "total_cost_usd": m.total_cost_usd
                }
                for name, m in self.agent_metrics.items()
            }
        }
    
    def get_bottlenecks(self, top_n: int = 10) -> List[Dict[str, Any]]:
        """Identify performance bottlenecks."""
        if not self.executions:
            return []
        
        # Group by name and calculate stats
        by_name = defaultdict(list)
        for e in self.executions:
            by_name[e.name].append(e)
        
        bottlenecks = []
        for name, executions in by_name.items():
            durations = [e.duration_ms for e in executions]
            failures = sum(1 for e in executions if not e.success)
            
            bottlenecks.append({
                "name": name,
                "count": len(executions),
                "total_time_ms": sum(durations),
                "avg_time_ms": statistics.mean(durations),
                "max_time_ms": max(durations),
                "failure_rate": failures / len(executions),
                "impact_score": sum(durations) * (1 + failures / len(executions))
            })
        
        # Sort by impact score
        bottlenecks.sort(key=lambda x: x["impact_score"], reverse=True)
        
        return bottlenecks[:top_n]
    
    def get_recommendations(self) -> List[Dict[str, Any]]:
        """Generate optimization recommendations."""
        recommendations = []
        
        bottlenecks = self.get_bottlenecks()
        summary = self.get_summary()
        
        # Check for slow operations
        for b in bottlenecks[:5]:
            if b["avg_time_ms"] > 5000:  # > 5 seconds
                recommendations.append({
                    "type": "performance",
                    "severity": "high",
                    "component": b["name"],
                    "issue": f"Slow operation: avg {b['avg_time_ms']:.0f}ms",
                    "recommendation": "Consider caching, parallelization, or breaking into smaller tasks"
                })
        
        # Check for high failure rates
        for b in bottlenecks:
            if b["failure_rate"] > 0.1:  # > 10% failure
                recommendations.append({
                    "type": "reliability",
                    "severity": "high",
                    "component": b["name"],
                    "issue": f"High failure rate: {b['failure_rate']*100:.1f}%",
                    "recommendation": "Add retry logic, improve error handling, or investigate root cause"
                })
        
        # Check API costs
        api_stats = summary.get("api_calls", {})
        if api_stats.get("total_cost_usd", 0) > 10:  # > $10/day
            recommendations.append({
                "type": "cost",
                "severity": "medium",
                "component": "api_calls",
                "issue": f"High API costs: ${api_stats['total_cost_usd']:.2f}/day",
                "recommendation": "Consider using smaller models, caching responses, or batching requests"
            })
        
        # Check for memory issues
        for name, metrics in self.agent_metrics.items():
            avg_memory = metrics.total_memory_mb / metrics.total_executions if metrics.total_executions > 0 else 0
            if avg_memory > 500:  # > 500 MB
                recommendations.append({
                    "type": "memory",
                    "severity": "medium",
                    "component": name,
                    "issue": f"High memory usage: {avg_memory:.0f} MB average",
                    "recommendation": "Optimize data structures, stream large files, or use generators"
                })
        
        return recommendations
    
    def export_report(self, filepath: str):
        """Export profiling report to JSON file."""
        report = {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": self.get_summary(),
            "bottlenecks": self.get_bottlenecks(),
            "recommendations": self.get_recommendations(),
            "recent_executions": [
                {
                    "name": e.name,
                    "timestamp": e.start_time.isoformat(),
                    "duration_ms": e.duration_ms,
                    "success": e.success,
                    "memory_peak_mb": e.memory_peak_mb
                }
                for e in self.executions[-100:]
            ],
            "recent_api_calls": [
                {
                    "provider": a.provider,
                    "model": a.model,
                    "timestamp": a.timestamp.isoformat(),
                    "duration_ms": a.duration_ms,
                    "tokens": a.input_tokens + a.output_tokens,
                    "cost_usd": a.cost_usd
                }
                for a in self.api_calls[-100:]
            ]
        }
        
        with open(filepath, "w") as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Exported profiling report to {filepath}")


# ============================================================================
# Global Profiler Instance
# ============================================================================

# Global profiler instance
profiler = Profiler()


# ============================================================================
# Convenience Decorators
# ============================================================================

def profile(func: Callable) -> Callable:
    """Decorator to profile a function using the global profiler."""
    return profiler.profile_function(func)


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Performance Profiler."""
    p = Profiler()
    
    # Profile some operations
    with p.profile("sync_operation"):
        time.sleep(0.1)
    
    async with p.profile_async("async_operation"):
        await asyncio.sleep(0.1)
    
    # Record some API calls
    p.record_api_call(
        provider="openai",
        model="gpt-4-turbo",
        duration_ms=500,
        input_tokens=1000,
        output_tokens=500,
        success=True
    )
    
    p.record_api_call(
        provider="anthropic",
        model="claude-3-sonnet",
        duration_ms=300,
        input_tokens=500,
        output_tokens=200,
        success=True
    )
    
    # Get summary
    print("=== Profiling Summary ===")
    summary = p.get_summary()
    print(json.dumps(summary, indent=2, default=str))
    
    # Get bottlenecks
    print("\n=== Bottlenecks ===")
    for b in p.get_bottlenecks():
        print(f"  {b['name']}: {b['avg_time_ms']:.0f}ms avg, {b['impact_score']:.0f} impact")
    
    # Get recommendations
    print("\n=== Recommendations ===")
    for r in p.get_recommendations():
        print(f"  [{r['severity']}] {r['component']}: {r['issue']}")


if __name__ == "__main__":
    asyncio.run(main())
