"""
Cost Optimizer
===============
Automatic model selection based on task complexity and budget.

Features:
- Task complexity analysis
- Model cost comparison
- Budget management
- Auto-scaling model selection
- Cost tracking and reporting

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging
import statistics

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cost_optimizer")


# ============================================================================
# Data Models
# ============================================================================

class TaskComplexity(Enum):
    """Task complexity levels."""
    TRIVIAL = "trivial"      # Simple lookups, basic formatting
    SIMPLE = "simple"        # Basic Q&A, simple summaries
    MODERATE = "moderate"    # Analysis, multi-step reasoning
    COMPLEX = "complex"      # Deep analysis, code generation
    EXPERT = "expert"        # Research, complex problem solving


class ModelTier(Enum):
    """Model capability tiers."""
    ECONOMY = "economy"      # Cheapest, basic tasks
    STANDARD = "standard"    # Good balance
    PREMIUM = "premium"      # Best quality
    ULTRA = "ultra"          # Maximum capability


@dataclass
class ModelConfig:
    """Configuration for an AI model."""
    model_id: str
    provider: str
    tier: ModelTier
    input_cost_per_1m: float   # Cost per 1M input tokens
    output_cost_per_1m: float  # Cost per 1M output tokens
    max_tokens: int
    context_window: int
    speed_tokens_per_sec: float
    quality_score: float       # 0-1, subjective quality rating
    capabilities: List[str]    # e.g., ["code", "analysis", "creative"]
    is_available: bool = True


@dataclass
class CostRecord:
    """Record of API cost."""
    timestamp: datetime
    model_id: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    task_type: str
    complexity: TaskComplexity


@dataclass
class Budget:
    """Budget configuration."""
    daily_limit_usd: float
    monthly_limit_usd: float
    alert_threshold: float = 0.8  # Alert at 80% usage
    current_daily_spend: float = 0.0
    current_monthly_spend: float = 0.0
    last_reset_daily: datetime = field(default_factory=datetime.utcnow)
    last_reset_monthly: datetime = field(default_factory=datetime.utcnow)


# ============================================================================
# Model Registry
# ============================================================================

# Pre-configured models (prices as of late 2024)
DEFAULT_MODELS = [
    # OpenAI
    ModelConfig(
        model_id="gpt-4-turbo",
        provider="openai",
        tier=ModelTier.PREMIUM,
        input_cost_per_1m=10.00,
        output_cost_per_1m=30.00,
        max_tokens=4096,
        context_window=128000,
        speed_tokens_per_sec=80,
        quality_score=0.95,
        capabilities=["code", "analysis", "creative", "reasoning"]
    ),
    ModelConfig(
        model_id="gpt-4o",
        provider="openai",
        tier=ModelTier.PREMIUM,
        input_cost_per_1m=5.00,
        output_cost_per_1m=15.00,
        max_tokens=4096,
        context_window=128000,
        speed_tokens_per_sec=100,
        quality_score=0.93,
        capabilities=["code", "analysis", "creative", "vision"]
    ),
    ModelConfig(
        model_id="gpt-4o-mini",
        provider="openai",
        tier=ModelTier.STANDARD,
        input_cost_per_1m=0.15,
        output_cost_per_1m=0.60,
        max_tokens=16384,
        context_window=128000,
        speed_tokens_per_sec=150,
        quality_score=0.85,
        capabilities=["code", "analysis", "creative"]
    ),
    ModelConfig(
        model_id="gpt-3.5-turbo",
        provider="openai",
        tier=ModelTier.ECONOMY,
        input_cost_per_1m=0.50,
        output_cost_per_1m=1.50,
        max_tokens=4096,
        context_window=16385,
        speed_tokens_per_sec=200,
        quality_score=0.75,
        capabilities=["basic", "formatting"]
    ),
    
    # Anthropic
    ModelConfig(
        model_id="claude-3-opus",
        provider="anthropic",
        tier=ModelTier.ULTRA,
        input_cost_per_1m=15.00,
        output_cost_per_1m=75.00,
        max_tokens=4096,
        context_window=200000,
        speed_tokens_per_sec=50,
        quality_score=0.98,
        capabilities=["code", "analysis", "creative", "reasoning", "research"]
    ),
    ModelConfig(
        model_id="claude-3-5-sonnet",
        provider="anthropic",
        tier=ModelTier.PREMIUM,
        input_cost_per_1m=3.00,
        output_cost_per_1m=15.00,
        max_tokens=8192,
        context_window=200000,
        speed_tokens_per_sec=80,
        quality_score=0.94,
        capabilities=["code", "analysis", "creative", "reasoning"]
    ),
    ModelConfig(
        model_id="claude-3-5-haiku",
        provider="anthropic",
        tier=ModelTier.STANDARD,
        input_cost_per_1m=0.80,
        output_cost_per_1m=4.00,
        max_tokens=8192,
        context_window=200000,
        speed_tokens_per_sec=150,
        quality_score=0.85,
        capabilities=["code", "analysis", "basic"]
    ),
    
    # Google
    ModelConfig(
        model_id="gemini-2.0-flash",
        provider="google",
        tier=ModelTier.STANDARD,
        input_cost_per_1m=0.10,
        output_cost_per_1m=0.40,
        max_tokens=8192,
        context_window=1000000,
        speed_tokens_per_sec=200,
        quality_score=0.88,
        capabilities=["code", "analysis", "creative", "vision"]
    ),
    ModelConfig(
        model_id="gemini-1.5-pro",
        provider="google",
        tier=ModelTier.PREMIUM,
        input_cost_per_1m=3.50,
        output_cost_per_1m=10.50,
        max_tokens=8192,
        context_window=2000000,
        speed_tokens_per_sec=100,
        quality_score=0.92,
        capabilities=["code", "analysis", "creative", "reasoning", "vision"]
    ),
    ModelConfig(
        model_id="gemini-1.5-flash",
        provider="google",
        tier=ModelTier.ECONOMY,
        input_cost_per_1m=0.075,
        output_cost_per_1m=0.30,
        max_tokens=8192,
        context_window=1000000,
        speed_tokens_per_sec=250,
        quality_score=0.82,
        capabilities=["basic", "analysis", "vision"]
    ),
]


# ============================================================================
# Complexity Analyzer
# ============================================================================

class ComplexityAnalyzer:
    """
    Analyze task complexity.
    """
    
    def __init__(self):
        # Keywords indicating complexity
        self.complexity_keywords = {
            TaskComplexity.TRIVIAL: [
                "format", "convert", "list", "count", "simple"
            ],
            TaskComplexity.SIMPLE: [
                "summarize", "explain", "describe", "what is", "define"
            ],
            TaskComplexity.MODERATE: [
                "analyze", "compare", "evaluate", "suggest", "recommend"
            ],
            TaskComplexity.COMPLEX: [
                "code", "implement", "debug", "optimize", "design", "architecture"
            ],
            TaskComplexity.EXPERT: [
                "research", "investigate", "comprehensive", "in-depth", "strategy"
            ]
        }
        
        # Task type to complexity mapping
        self.task_type_complexity = {
            "formatting": TaskComplexity.TRIVIAL,
            "translation": TaskComplexity.SIMPLE,
            "summarization": TaskComplexity.SIMPLE,
            "qa": TaskComplexity.MODERATE,
            "analysis": TaskComplexity.MODERATE,
            "coding": TaskComplexity.COMPLEX,
            "debugging": TaskComplexity.COMPLEX,
            "research": TaskComplexity.EXPERT,
            "planning": TaskComplexity.EXPERT
        }
    
    def analyze(
        self,
        task_description: str,
        task_type: str = None,
        input_length: int = 0,
        expected_output_length: int = 0
    ) -> Tuple[TaskComplexity, Dict[str, Any]]:
        """
        Analyze task complexity.
        Returns (complexity, analysis_details).
        """
        scores = {c: 0 for c in TaskComplexity}
        
        # Check keywords
        description_lower = task_description.lower()
        for complexity, keywords in self.complexity_keywords.items():
            for keyword in keywords:
                if keyword in description_lower:
                    scores[complexity] += 1
        
        # Check task type
        if task_type and task_type in self.task_type_complexity:
            mapped_complexity = self.task_type_complexity[task_type]
            scores[mapped_complexity] += 3
        
        # Check input length (longer inputs = more complex)
        if input_length > 10000:
            scores[TaskComplexity.COMPLEX] += 2
        elif input_length > 5000:
            scores[TaskComplexity.MODERATE] += 1
        
        # Check expected output length
        if expected_output_length > 5000:
            scores[TaskComplexity.COMPLEX] += 2
        elif expected_output_length > 2000:
            scores[TaskComplexity.MODERATE] += 1
        
        # Find highest scoring complexity
        max_score = max(scores.values())
        if max_score == 0:
            complexity = TaskComplexity.MODERATE  # Default
        else:
            complexity = max(scores.keys(), key=lambda c: scores[c])
        
        return complexity, {
            "scores": {c.value: s for c, s in scores.items()},
            "task_type": task_type,
            "input_length": input_length,
            "expected_output_length": expected_output_length
        }


# ============================================================================
# Cost Optimizer
# ============================================================================

class CostOptimizer:
    """
    Optimize model selection based on cost and capability.
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path
        self.models: Dict[str, ModelConfig] = {m.model_id: m for m in DEFAULT_MODELS}
        self.complexity_analyzer = ComplexityAnalyzer()
        self.cost_history: List[CostRecord] = []
        self.budget = Budget(
            daily_limit_usd=10.0,
            monthly_limit_usd=100.0
        )
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def _get_tier_for_complexity(self, complexity: TaskComplexity) -> ModelTier:
        """Map complexity to model tier."""
        mapping = {
            TaskComplexity.TRIVIAL: ModelTier.ECONOMY,
            TaskComplexity.SIMPLE: ModelTier.ECONOMY,
            TaskComplexity.MODERATE: ModelTier.STANDARD,
            TaskComplexity.COMPLEX: ModelTier.PREMIUM,
            TaskComplexity.EXPERT: ModelTier.ULTRA
        }
        return mapping.get(complexity, ModelTier.STANDARD)
    
    def select_model(
        self,
        task_description: str,
        task_type: str = None,
        required_capabilities: List[str] = None,
        input_tokens: int = 0,
        expected_output_tokens: int = 0,
        prefer_speed: bool = False,
        prefer_quality: bool = False,
        max_cost_usd: float = None,
        provider_preference: str = None
    ) -> Tuple[ModelConfig, Dict[str, Any]]:
        """
        Select the optimal model for a task.
        Returns (model_config, selection_details).
        """
        # Analyze complexity
        complexity, analysis = self.complexity_analyzer.analyze(
            task_description,
            task_type,
            input_tokens,
            expected_output_tokens
        )
        
        # Get target tier
        target_tier = self._get_tier_for_complexity(complexity)
        
        # Filter available models
        candidates = []
        for model in self.models.values():
            if not model.is_available:
                continue
            
            # Check capabilities
            if required_capabilities:
                if not all(cap in model.capabilities for cap in required_capabilities):
                    continue
            
            # Check context window
            if input_tokens > model.context_window:
                continue
            
            # Check provider preference
            if provider_preference and model.provider != provider_preference:
                continue
            
            candidates.append(model)
        
        if not candidates:
            # Fall back to any available model
            candidates = [m for m in self.models.values() if m.is_available]
        
        if not candidates:
            raise ValueError("No models available")
        
        # Score candidates
        scored = []
        for model in candidates:
            score = 0
            
            # Tier match
            tier_order = [ModelTier.ECONOMY, ModelTier.STANDARD, ModelTier.PREMIUM, ModelTier.ULTRA]
            target_idx = tier_order.index(target_tier)
            model_idx = tier_order.index(model.tier)
            tier_diff = abs(target_idx - model_idx)
            score -= tier_diff * 10  # Penalty for tier mismatch
            
            # Cost efficiency
            estimated_cost = self._estimate_cost(model, input_tokens, expected_output_tokens)
            if max_cost_usd and estimated_cost > max_cost_usd:
                continue  # Skip if over budget
            
            # Normalize cost score (lower is better)
            cost_score = 1 / (1 + estimated_cost)
            score += cost_score * 20
            
            # Quality score
            if prefer_quality:
                score += model.quality_score * 30
            else:
                score += model.quality_score * 10
            
            # Speed score
            if prefer_speed:
                speed_score = model.speed_tokens_per_sec / 250  # Normalize to max ~1
                score += speed_score * 30
            else:
                speed_score = model.speed_tokens_per_sec / 250
                score += speed_score * 5
            
            scored.append((model, score, estimated_cost))
        
        if not scored:
            raise ValueError("No models meet the requirements")
        
        # Sort by score (highest first)
        scored.sort(key=lambda x: x[1], reverse=True)
        
        best_model, best_score, estimated_cost = scored[0]
        
        return best_model, {
            "complexity": complexity.value,
            "analysis": analysis,
            "target_tier": target_tier.value,
            "selected_model": best_model.model_id,
            "estimated_cost_usd": estimated_cost,
            "score": best_score,
            "alternatives": [
                {"model": m.model_id, "score": s, "cost": c}
                for m, s, c in scored[1:4]
            ]
        }
    
    def _estimate_cost(
        self,
        model: ModelConfig,
        input_tokens: int,
        output_tokens: int
    ) -> float:
        """Estimate cost for a model."""
        input_cost = (input_tokens / 1_000_000) * model.input_cost_per_1m
        output_cost = (output_tokens / 1_000_000) * model.output_cost_per_1m
        return round(input_cost + output_cost, 6)
    
    def record_cost(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        task_type: str,
        complexity: TaskComplexity
    ) -> CostRecord:
        """Record an API cost."""
        model = self.models.get(model_id)
        if not model:
            raise ValueError(f"Unknown model: {model_id}")
        
        cost = self._estimate_cost(model, input_tokens, output_tokens)
        
        record = CostRecord(
            timestamp=datetime.utcnow(),
            model_id=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            task_type=task_type,
            complexity=complexity
        )
        
        self.cost_history.append(record)
        
        # Update budget
        self._update_budget(cost)
        
        # Trim history
        if len(self.cost_history) > 10000:
            self.cost_history = self.cost_history[-10000:]
        
        self._save()
        
        return record
    
    def _update_budget(self, cost: float):
        """Update budget tracking."""
        now = datetime.utcnow()
        
        # Reset daily if needed
        if now.date() > self.budget.last_reset_daily.date():
            self.budget.current_daily_spend = 0.0
            self.budget.last_reset_daily = now
        
        # Reset monthly if needed
        if now.month != self.budget.last_reset_monthly.month:
            self.budget.current_monthly_spend = 0.0
            self.budget.last_reset_monthly = now
        
        self.budget.current_daily_spend += cost
        self.budget.current_monthly_spend += cost
    
    def check_budget(self) -> Dict[str, Any]:
        """Check budget status."""
        daily_usage = self.budget.current_daily_spend / self.budget.daily_limit_usd
        monthly_usage = self.budget.current_monthly_spend / self.budget.monthly_limit_usd
        
        return {
            "daily": {
                "spent": self.budget.current_daily_spend,
                "limit": self.budget.daily_limit_usd,
                "usage_percent": daily_usage * 100,
                "alert": daily_usage >= self.budget.alert_threshold
            },
            "monthly": {
                "spent": self.budget.current_monthly_spend,
                "limit": self.budget.monthly_limit_usd,
                "usage_percent": monthly_usage * 100,
                "alert": monthly_usage >= self.budget.alert_threshold
            }
        }
    
    def get_cost_report(self, days: int = 7) -> Dict[str, Any]:
        """Get cost report for the last N days."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        recent = [r for r in self.cost_history if r.timestamp >= cutoff]
        
        if not recent:
            return {"total_cost": 0, "records": 0}
        
        # Aggregate by model
        by_model = {}
        for record in recent:
            if record.model_id not in by_model:
                by_model[record.model_id] = {
                    "cost": 0,
                    "calls": 0,
                    "tokens": 0
                }
            by_model[record.model_id]["cost"] += record.cost_usd
            by_model[record.model_id]["calls"] += 1
            by_model[record.model_id]["tokens"] += record.input_tokens + record.output_tokens
        
        # Aggregate by task type
        by_task = {}
        for record in recent:
            if record.task_type not in by_task:
                by_task[record.task_type] = {"cost": 0, "calls": 0}
            by_task[record.task_type]["cost"] += record.cost_usd
            by_task[record.task_type]["calls"] += 1
        
        # Daily breakdown
        daily = {}
        for record in recent:
            date_str = record.timestamp.strftime("%Y-%m-%d")
            if date_str not in daily:
                daily[date_str] = 0
            daily[date_str] += record.cost_usd
        
        return {
            "period_days": days,
            "total_cost": sum(r.cost_usd for r in recent),
            "total_records": len(recent),
            "total_tokens": sum(r.input_tokens + r.output_tokens for r in recent),
            "avg_cost_per_call": statistics.mean([r.cost_usd for r in recent]),
            "by_model": by_model,
            "by_task_type": by_task,
            "daily_breakdown": daily
        }
    
    def set_budget(
        self,
        daily_limit: float = None,
        monthly_limit: float = None,
        alert_threshold: float = None
    ):
        """Update budget settings."""
        if daily_limit is not None:
            self.budget.daily_limit_usd = daily_limit
        if monthly_limit is not None:
            self.budget.monthly_limit_usd = monthly_limit
        if alert_threshold is not None:
            self.budget.alert_threshold = alert_threshold
        
        self._save()
    
    def _save(self):
        """Save optimizer state."""
        if not self.storage_path:
            return
        
        data = {
            "budget": {
                "daily_limit_usd": self.budget.daily_limit_usd,
                "monthly_limit_usd": self.budget.monthly_limit_usd,
                "alert_threshold": self.budget.alert_threshold,
                "current_daily_spend": self.budget.current_daily_spend,
                "current_monthly_spend": self.budget.current_monthly_spend,
                "last_reset_daily": self.budget.last_reset_daily.isoformat(),
                "last_reset_monthly": self.budget.last_reset_monthly.isoformat()
            },
            "cost_history": [
                {
                    "timestamp": r.timestamp.isoformat(),
                    "model_id": r.model_id,
                    "input_tokens": r.input_tokens,
                    "output_tokens": r.output_tokens,
                    "cost_usd": r.cost_usd,
                    "task_type": r.task_type,
                    "complexity": r.complexity.value
                }
                for r in self.cost_history[-1000:]  # Keep last 1000
            ]
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load optimizer state."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        if "budget" in data:
            b = data["budget"]
            self.budget = Budget(
                daily_limit_usd=b["daily_limit_usd"],
                monthly_limit_usd=b["monthly_limit_usd"],
                alert_threshold=b["alert_threshold"],
                current_daily_spend=b["current_daily_spend"],
                current_monthly_spend=b["current_monthly_spend"],
                last_reset_daily=datetime.fromisoformat(b["last_reset_daily"]),
                last_reset_monthly=datetime.fromisoformat(b["last_reset_monthly"])
            )
        
        for r_data in data.get("cost_history", []):
            record = CostRecord(
                timestamp=datetime.fromisoformat(r_data["timestamp"]),
                model_id=r_data["model_id"],
                input_tokens=r_data["input_tokens"],
                output_tokens=r_data["output_tokens"],
                cost_usd=r_data["cost_usd"],
                task_type=r_data["task_type"],
                complexity=TaskComplexity(r_data["complexity"])
            )
            self.cost_history.append(record)


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Cost Optimizer."""
    optimizer = CostOptimizer()
    
    # Test model selection
    test_tasks = [
        ("Format this JSON", "formatting", []),
        ("Summarize this article", "summarization", []),
        ("Analyze the market trends", "analysis", ["analysis"]),
        ("Write a Python function to process CSV files", "coding", ["code"]),
        ("Research the competitive landscape for AI startups", "research", ["research", "analysis"])
    ]
    
    print("=== Model Selection Demo ===\n")
    
    for description, task_type, capabilities in test_tasks:
        model, details = optimizer.select_model(
            task_description=description,
            task_type=task_type,
            required_capabilities=capabilities,
            input_tokens=1000,
            expected_output_tokens=500
        )
        
        print(f"Task: {description}")
        print(f"  Complexity: {details['complexity']}")
        print(f"  Selected: {model.model_id} ({model.provider})")
        print(f"  Estimated Cost: ${details['estimated_cost_usd']:.4f}")
        print()
    
    # Budget check
    print("=== Budget Status ===")
    budget = optimizer.check_budget()
    print(f"Daily: ${budget['daily']['spent']:.2f} / ${budget['daily']['limit']:.2f}")
    print(f"Monthly: ${budget['monthly']['spent']:.2f} / ${budget['monthly']['limit']:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
