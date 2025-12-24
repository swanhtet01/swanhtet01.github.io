"""
A/B Testing Framework
======================
Test different agent strategies and configurations.

Features:
- Experiment management
- Traffic splitting
- Metric collection
- Statistical analysis
- Auto-optimization

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
import random
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging
import statistics
import math

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ab_testing")


# ============================================================================
# Data Models
# ============================================================================

class ExperimentStatus(Enum):
    """Status of an experiment."""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


@dataclass
class Variant:
    """A variant in an A/B test."""
    variant_id: str
    name: str
    config: Dict[str, Any]
    weight: float = 0.5  # Traffic allocation
    impressions: int = 0
    conversions: int = 0
    total_value: float = 0.0
    metrics: Dict[str, List[float]] = field(default_factory=dict)


@dataclass
class Experiment:
    """An A/B test experiment."""
    experiment_id: str
    name: str
    description: str
    variants: List[Variant]
    status: ExperimentStatus = ExperimentStatus.DRAFT
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    target_sample_size: int = 1000
    primary_metric: str = "conversion_rate"
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExperimentResult:
    """Results of an experiment."""
    experiment_id: str
    winner: Optional[str]
    confidence: float
    lift: float
    sample_size: int
    duration_hours: float
    variant_results: Dict[str, Dict[str, Any]]
    recommendation: str


# ============================================================================
# Statistical Functions
# ============================================================================

def calculate_conversion_rate(conversions: int, impressions: int) -> float:
    """Calculate conversion rate."""
    if impressions == 0:
        return 0.0
    return conversions / impressions


def calculate_standard_error(rate: float, n: int) -> float:
    """Calculate standard error for a proportion."""
    if n == 0:
        return 0.0
    return math.sqrt(rate * (1 - rate) / n)


def calculate_z_score(rate_a: float, rate_b: float, se_a: float, se_b: float) -> float:
    """Calculate z-score for difference between two proportions."""
    pooled_se = math.sqrt(se_a**2 + se_b**2)
    if pooled_se == 0:
        return 0.0
    return (rate_b - rate_a) / pooled_se


def z_to_p_value(z: float) -> float:
    """Convert z-score to p-value (two-tailed)."""
    # Approximation of the normal CDF
    def norm_cdf(x):
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))
    
    return 2 * (1 - norm_cdf(abs(z)))


def calculate_sample_size(
    baseline_rate: float,
    minimum_effect: float,
    alpha: float = 0.05,
    power: float = 0.8
) -> int:
    """Calculate required sample size per variant."""
    # Z-scores for alpha and power
    z_alpha = 1.96  # 95% confidence
    z_beta = 0.84   # 80% power
    
    p1 = baseline_rate
    p2 = baseline_rate * (1 + minimum_effect)
    
    numerator = (z_alpha * math.sqrt(2 * p1 * (1 - p1)) + 
                 z_beta * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)))**2
    denominator = (p2 - p1)**2
    
    if denominator == 0:
        return 10000
    
    return int(math.ceil(numerator / denominator))


# ============================================================================
# A/B Testing Manager
# ============================================================================

class ABTestingManager:
    """
    Manage A/B testing experiments.
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path
        self.experiments: Dict[str, Experiment] = {}
        self.user_assignments: Dict[str, Dict[str, str]] = {}  # user_id -> {exp_id: variant_id}
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def _generate_id(self, prefix: str) -> str:
        """Generate a unique ID."""
        import uuid
        return f"{prefix}_{uuid.uuid4().hex[:8]}"
    
    def create_experiment(
        self,
        name: str,
        description: str,
        variants: List[Dict[str, Any]],
        target_sample_size: int = 1000,
        primary_metric: str = "conversion_rate"
    ) -> Experiment:
        """Create a new experiment."""
        experiment_id = self._generate_id("exp")
        
        # Create variants
        variant_objects = []
        for i, v in enumerate(variants):
            variant = Variant(
                variant_id=self._generate_id("var"),
                name=v.get("name", f"Variant {chr(65 + i)}"),
                config=v.get("config", {}),
                weight=v.get("weight", 1.0 / len(variants))
            )
            variant_objects.append(variant)
        
        # Normalize weights
        total_weight = sum(v.weight for v in variant_objects)
        for v in variant_objects:
            v.weight /= total_weight
        
        experiment = Experiment(
            experiment_id=experiment_id,
            name=name,
            description=description,
            variants=variant_objects,
            target_sample_size=target_sample_size,
            primary_metric=primary_metric
        )
        
        self.experiments[experiment_id] = experiment
        self._save()
        
        logger.info(f"Created experiment: {name} ({experiment_id})")
        
        return experiment
    
    def start_experiment(self, experiment_id: str) -> bool:
        """Start an experiment."""
        exp = self.experiments.get(experiment_id)
        if not exp:
            return False
        
        exp.status = ExperimentStatus.RUNNING
        exp.start_time = datetime.utcnow()
        exp.updated_at = datetime.utcnow()
        
        self._save()
        logger.info(f"Started experiment: {exp.name}")
        
        return True
    
    def stop_experiment(self, experiment_id: str) -> bool:
        """Stop an experiment."""
        exp = self.experiments.get(experiment_id)
        if not exp:
            return False
        
        exp.status = ExperimentStatus.COMPLETED
        exp.end_time = datetime.utcnow()
        exp.updated_at = datetime.utcnow()
        
        self._save()
        logger.info(f"Stopped experiment: {exp.name}")
        
        return True
    
    def get_variant(
        self,
        experiment_id: str,
        user_id: str
    ) -> Optional[Variant]:
        """Get the variant for a user (with sticky assignment)."""
        exp = self.experiments.get(experiment_id)
        if not exp or exp.status != ExperimentStatus.RUNNING:
            return None
        
        # Check for existing assignment
        if user_id in self.user_assignments:
            if experiment_id in self.user_assignments[user_id]:
                variant_id = self.user_assignments[user_id][experiment_id]
                for v in exp.variants:
                    if v.variant_id == variant_id:
                        return v
        
        # Assign to variant based on weights
        rand = random.random()
        cumulative = 0.0
        
        for variant in exp.variants:
            cumulative += variant.weight
            if rand <= cumulative:
                # Store assignment
                if user_id not in self.user_assignments:
                    self.user_assignments[user_id] = {}
                self.user_assignments[user_id][experiment_id] = variant.variant_id
                
                # Record impression
                variant.impressions += 1
                self._save()
                
                return variant
        
        # Fallback to first variant
        return exp.variants[0]
    
    def record_conversion(
        self,
        experiment_id: str,
        user_id: str,
        value: float = 1.0
    ) -> bool:
        """Record a conversion for a user."""
        exp = self.experiments.get(experiment_id)
        if not exp:
            return False
        
        # Get user's variant
        if user_id not in self.user_assignments:
            return False
        if experiment_id not in self.user_assignments[user_id]:
            return False
        
        variant_id = self.user_assignments[user_id][experiment_id]
        
        for variant in exp.variants:
            if variant.variant_id == variant_id:
                variant.conversions += 1
                variant.total_value += value
                self._save()
                return True
        
        return False
    
    def record_metric(
        self,
        experiment_id: str,
        user_id: str,
        metric_name: str,
        value: float
    ) -> bool:
        """Record a custom metric for a user."""
        exp = self.experiments.get(experiment_id)
        if not exp:
            return False
        
        if user_id not in self.user_assignments:
            return False
        if experiment_id not in self.user_assignments[user_id]:
            return False
        
        variant_id = self.user_assignments[user_id][experiment_id]
        
        for variant in exp.variants:
            if variant.variant_id == variant_id:
                if metric_name not in variant.metrics:
                    variant.metrics[metric_name] = []
                variant.metrics[metric_name].append(value)
                self._save()
                return True
        
        return False
    
    def get_results(self, experiment_id: str) -> Optional[ExperimentResult]:
        """Get experiment results with statistical analysis."""
        exp = self.experiments.get(experiment_id)
        if not exp:
            return None
        
        # Calculate metrics for each variant
        variant_results = {}
        
        for variant in exp.variants:
            rate = calculate_conversion_rate(variant.conversions, variant.impressions)
            se = calculate_standard_error(rate, variant.impressions)
            
            variant_results[variant.variant_id] = {
                "name": variant.name,
                "impressions": variant.impressions,
                "conversions": variant.conversions,
                "conversion_rate": rate,
                "standard_error": se,
                "confidence_interval": (
                    max(0, rate - 1.96 * se),
                    min(1, rate + 1.96 * se)
                ),
                "average_value": variant.total_value / max(variant.conversions, 1),
                "custom_metrics": {
                    name: {
                        "mean": statistics.mean(values) if values else 0,
                        "std": statistics.stdev(values) if len(values) > 1 else 0
                    }
                    for name, values in variant.metrics.items()
                }
            }
        
        # Find winner (if any)
        winner = None
        confidence = 0.0
        lift = 0.0
        
        if len(exp.variants) >= 2:
            control = exp.variants[0]
            treatment = exp.variants[1]
            
            control_rate = variant_results[control.variant_id]["conversion_rate"]
            treatment_rate = variant_results[treatment.variant_id]["conversion_rate"]
            
            control_se = variant_results[control.variant_id]["standard_error"]
            treatment_se = variant_results[treatment.variant_id]["standard_error"]
            
            z = calculate_z_score(control_rate, treatment_rate, control_se, treatment_se)
            p_value = z_to_p_value(z)
            confidence = 1 - p_value
            
            if control_rate > 0:
                lift = (treatment_rate - control_rate) / control_rate
            
            if confidence >= 0.95:
                if treatment_rate > control_rate:
                    winner = treatment.variant_id
                else:
                    winner = control.variant_id
        
        # Calculate duration
        duration_hours = 0.0
        if exp.start_time:
            end = exp.end_time or datetime.utcnow()
            duration_hours = (end - exp.start_time).total_seconds() / 3600
        
        # Generate recommendation
        total_samples = sum(v.impressions for v in exp.variants)
        
        if total_samples < exp.target_sample_size:
            recommendation = f"Continue experiment. Need {exp.target_sample_size - total_samples} more samples."
        elif confidence < 0.95:
            recommendation = "No statistically significant difference detected. Consider extending the experiment or increasing sample size."
        elif winner:
            winner_name = variant_results[winner]["name"]
            recommendation = f"Implement {winner_name}. {lift*100:.1f}% improvement with {confidence*100:.1f}% confidence."
        else:
            recommendation = "Results inconclusive. Review experiment design."
        
        return ExperimentResult(
            experiment_id=experiment_id,
            winner=winner,
            confidence=confidence,
            lift=lift,
            sample_size=total_samples,
            duration_hours=duration_hours,
            variant_results=variant_results,
            recommendation=recommendation
        )
    
    def get_experiment_summary(self, experiment_id: str) -> Dict[str, Any]:
        """Get a summary of an experiment."""
        exp = self.experiments.get(experiment_id)
        if not exp:
            return {}
        
        results = self.get_results(experiment_id)
        
        return {
            "experiment_id": experiment_id,
            "name": exp.name,
            "status": exp.status.value,
            "variants": [
                {
                    "name": v.name,
                    "impressions": v.impressions,
                    "conversions": v.conversions,
                    "conversion_rate": f"{calculate_conversion_rate(v.conversions, v.impressions)*100:.2f}%"
                }
                for v in exp.variants
            ],
            "winner": results.winner if results else None,
            "confidence": f"{results.confidence*100:.1f}%" if results else "N/A",
            "recommendation": results.recommendation if results else "N/A"
        }
    
    def list_experiments(
        self,
        status: ExperimentStatus = None
    ) -> List[Dict[str, Any]]:
        """List all experiments."""
        experiments = []
        
        for exp in self.experiments.values():
            if status and exp.status != status:
                continue
            
            experiments.append({
                "experiment_id": exp.experiment_id,
                "name": exp.name,
                "status": exp.status.value,
                "variants": len(exp.variants),
                "total_impressions": sum(v.impressions for v in exp.variants),
                "created_at": exp.created_at.isoformat()
            })
        
        return experiments
    
    def _save(self):
        """Save experiments to storage."""
        if not self.storage_path:
            return
        
        data = {
            "experiments": [
                {
                    "experiment_id": e.experiment_id,
                    "name": e.name,
                    "description": e.description,
                    "status": e.status.value,
                    "start_time": e.start_time.isoformat() if e.start_time else None,
                    "end_time": e.end_time.isoformat() if e.end_time else None,
                    "target_sample_size": e.target_sample_size,
                    "primary_metric": e.primary_metric,
                    "created_at": e.created_at.isoformat(),
                    "variants": [
                        {
                            "variant_id": v.variant_id,
                            "name": v.name,
                            "config": v.config,
                            "weight": v.weight,
                            "impressions": v.impressions,
                            "conversions": v.conversions,
                            "total_value": v.total_value,
                            "metrics": v.metrics
                        }
                        for v in e.variants
                    ]
                }
                for e in self.experiments.values()
            ],
            "user_assignments": self.user_assignments
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load experiments from storage."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        for e_data in data.get("experiments", []):
            variants = [
                Variant(
                    variant_id=v["variant_id"],
                    name=v["name"],
                    config=v["config"],
                    weight=v["weight"],
                    impressions=v["impressions"],
                    conversions=v["conversions"],
                    total_value=v["total_value"],
                    metrics=v.get("metrics", {})
                )
                for v in e_data["variants"]
            ]
            
            exp = Experiment(
                experiment_id=e_data["experiment_id"],
                name=e_data["name"],
                description=e_data["description"],
                variants=variants,
                status=ExperimentStatus(e_data["status"]),
                start_time=datetime.fromisoformat(e_data["start_time"]) if e_data["start_time"] else None,
                end_time=datetime.fromisoformat(e_data["end_time"]) if e_data["end_time"] else None,
                target_sample_size=e_data["target_sample_size"],
                primary_metric=e_data["primary_metric"],
                created_at=datetime.fromisoformat(e_data["created_at"])
            )
            
            self.experiments[exp.experiment_id] = exp
        
        self.user_assignments = data.get("user_assignments", {})


# ============================================================================
# Agent Strategy Testing
# ============================================================================

class AgentStrategyTester:
    """
    Test different agent strategies using A/B testing.
    """
    
    def __init__(self, ab_manager: ABTestingManager):
        self.ab_manager = ab_manager
    
    def create_model_experiment(
        self,
        name: str,
        models: List[str],
        task_type: str
    ) -> Experiment:
        """Create an experiment to test different AI models."""
        variants = [
            {
                "name": f"Model: {model}",
                "config": {"model": model, "task_type": task_type}
            }
            for model in models
        ]
        
        return self.ab_manager.create_experiment(
            name=name,
            description=f"Testing models for {task_type}",
            variants=variants,
            primary_metric="task_success_rate"
        )
    
    def create_prompt_experiment(
        self,
        name: str,
        prompts: List[Dict[str, str]],
        task_type: str
    ) -> Experiment:
        """Create an experiment to test different prompts."""
        variants = [
            {
                "name": p.get("name", f"Prompt {i+1}"),
                "config": {"prompt": p["prompt"], "task_type": task_type}
            }
            for i, p in enumerate(prompts)
        ]
        
        return self.ab_manager.create_experiment(
            name=name,
            description=f"Testing prompts for {task_type}",
            variants=variants,
            primary_metric="task_quality"
        )
    
    def create_agent_config_experiment(
        self,
        name: str,
        configs: List[Dict[str, Any]]
    ) -> Experiment:
        """Create an experiment to test different agent configurations."""
        variants = [
            {
                "name": c.get("name", f"Config {i+1}"),
                "config": c
            }
            for i, c in enumerate(configs)
        ]
        
        return self.ab_manager.create_experiment(
            name=name,
            description="Testing agent configurations",
            variants=variants,
            primary_metric="overall_performance"
        )


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the A/B Testing Framework."""
    manager = ABTestingManager()
    
    # Create an experiment
    exp = manager.create_experiment(
        name="Model Comparison",
        description="Compare GPT-4 vs Claude for research tasks",
        variants=[
            {"name": "GPT-4 Turbo", "config": {"model": "gpt-4-turbo"}},
            {"name": "Claude 3 Sonnet", "config": {"model": "claude-3-sonnet"}}
        ],
        target_sample_size=100
    )
    
    print(f"Created experiment: {exp.name}")
    
    # Start experiment
    manager.start_experiment(exp.experiment_id)
    
    # Simulate users
    for i in range(50):
        user_id = f"user_{i}"
        variant = manager.get_variant(exp.experiment_id, user_id)
        
        # Simulate conversion (GPT-4 has higher rate in this simulation)
        if variant.name == "GPT-4 Turbo":
            if random.random() < 0.25:
                manager.record_conversion(exp.experiment_id, user_id)
        else:
            if random.random() < 0.20:
                manager.record_conversion(exp.experiment_id, user_id)
    
    # Get results
    results = manager.get_results(exp.experiment_id)
    
    print("\n=== Experiment Results ===")
    print(f"Sample Size: {results.sample_size}")
    print(f"Confidence: {results.confidence*100:.1f}%")
    print(f"Lift: {results.lift*100:.1f}%")
    print(f"Winner: {results.winner}")
    print(f"Recommendation: {results.recommendation}")
    
    print("\n=== Variant Results ===")
    for variant_id, data in results.variant_results.items():
        print(f"  {data['name']}:")
        print(f"    Impressions: {data['impressions']}")
        print(f"    Conversions: {data['conversions']}")
        print(f"    Rate: {data['conversion_rate']*100:.2f}%")


if __name__ == "__main__":
    asyncio.run(main())
