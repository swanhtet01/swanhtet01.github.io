"""
Learning System
================
Agents improve from feedback and experience.

Features:
- Feedback collection
- Performance tracking
- Strategy adaptation
- Prompt optimization
- Experience replay

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging
import statistics
import random

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("learning_system")


# ============================================================================
# Data Models
# ============================================================================

class FeedbackType(Enum):
    """Types of feedback."""
    RATING = "rating"           # 1-5 star rating
    THUMBS = "thumbs"           # Up/down
    CORRECTION = "correction"   # User provides correct answer
    PREFERENCE = "preference"   # User prefers A over B
    COMMENT = "comment"         # Free-form feedback


class OutcomeType(Enum):
    """Task outcome types."""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    ERROR = "error"


@dataclass
class Feedback:
    """User feedback on agent output."""
    feedback_id: str
    timestamp: datetime
    task_id: str
    agent_id: str
    feedback_type: FeedbackType
    value: Any  # Rating, thumbs, correction text, etc.
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Experience:
    """A recorded experience (task execution)."""
    experience_id: str
    timestamp: datetime
    agent_id: str
    task_type: str
    task_description: str
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    outcome: OutcomeType
    execution_time_ms: int
    tokens_used: int
    model_used: str
    strategy_used: str
    feedback: Optional[Feedback] = None
    reward: float = 0.0  # Computed reward


@dataclass
class Strategy:
    """An agent strategy configuration."""
    strategy_id: str
    name: str
    description: str
    parameters: Dict[str, Any]
    performance_score: float = 0.5
    usage_count: int = 0
    success_count: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class PromptTemplate:
    """A prompt template with performance tracking."""
    template_id: str
    name: str
    template: str
    variables: List[str]
    task_type: str
    performance_score: float = 0.5
    usage_count: int = 0
    avg_rating: float = 0.0


# ============================================================================
# Reward Calculator
# ============================================================================

class RewardCalculator:
    """
    Calculate rewards from feedback and outcomes.
    """
    
    def __init__(self):
        # Reward weights
        self.outcome_rewards = {
            OutcomeType.SUCCESS: 1.0,
            OutcomeType.PARTIAL: 0.5,
            OutcomeType.FAILURE: -0.5,
            OutcomeType.TIMEOUT: -0.3,
            OutcomeType.ERROR: -0.7
        }
        
        self.feedback_weights = {
            FeedbackType.RATING: 0.3,
            FeedbackType.THUMBS: 0.2,
            FeedbackType.CORRECTION: 0.4,
            FeedbackType.PREFERENCE: 0.3,
            FeedbackType.COMMENT: 0.1
        }
    
    def calculate(
        self,
        outcome: OutcomeType,
        feedback: Feedback = None,
        execution_time_ms: int = 0,
        expected_time_ms: int = 10000
    ) -> float:
        """Calculate reward for an experience."""
        reward = 0.0
        
        # Outcome reward
        reward += self.outcome_rewards.get(outcome, 0.0)
        
        # Feedback reward
        if feedback:
            weight = self.feedback_weights.get(feedback.feedback_type, 0.1)
            
            if feedback.feedback_type == FeedbackType.RATING:
                # Normalize 1-5 to -1 to 1
                rating_reward = (feedback.value - 3) / 2
                reward += rating_reward * weight
            
            elif feedback.feedback_type == FeedbackType.THUMBS:
                thumbs_reward = 1.0 if feedback.value else -1.0
                reward += thumbs_reward * weight
            
            elif feedback.feedback_type == FeedbackType.CORRECTION:
                # Correction means we were wrong
                reward -= 0.3 * weight
            
            elif feedback.feedback_type == FeedbackType.PREFERENCE:
                # If we were preferred
                if feedback.value.get("preferred") == "agent":
                    reward += 0.5 * weight
                else:
                    reward -= 0.3 * weight
        
        # Time efficiency bonus/penalty
        if expected_time_ms > 0:
            time_ratio = execution_time_ms / expected_time_ms
            if time_ratio < 0.5:
                reward += 0.1  # Fast bonus
            elif time_ratio > 2.0:
                reward -= 0.1  # Slow penalty
        
        # Clamp to [-1, 1]
        return max(-1.0, min(1.0, reward))


# ============================================================================
# Strategy Optimizer
# ============================================================================

class StrategyOptimizer:
    """
    Optimize agent strategies using multi-armed bandit approach.
    """
    
    def __init__(self, exploration_rate: float = 0.1):
        self.exploration_rate = exploration_rate
        self.strategies: Dict[str, Strategy] = {}
    
    def add_strategy(self, strategy: Strategy):
        """Add a strategy."""
        self.strategies[strategy.strategy_id] = strategy
    
    def select_strategy(self, task_type: str = None) -> Strategy:
        """
        Select a strategy using epsilon-greedy.
        """
        if not self.strategies:
            raise ValueError("No strategies available")
        
        # Exploration: random selection
        if random.random() < self.exploration_rate:
            return random.choice(list(self.strategies.values()))
        
        # Exploitation: select best performing
        best = max(
            self.strategies.values(),
            key=lambda s: s.performance_score
        )
        
        return best
    
    def update_strategy(
        self,
        strategy_id: str,
        reward: float,
        learning_rate: float = 0.1
    ):
        """Update strategy performance based on reward."""
        if strategy_id not in self.strategies:
            return
        
        strategy = self.strategies[strategy_id]
        strategy.usage_count += 1
        
        if reward > 0:
            strategy.success_count += 1
        
        # Exponential moving average update
        strategy.performance_score = (
            (1 - learning_rate) * strategy.performance_score +
            learning_rate * ((reward + 1) / 2)  # Normalize reward to [0, 1]
        )
    
    def get_best_strategies(self, n: int = 3) -> List[Strategy]:
        """Get top N performing strategies."""
        sorted_strategies = sorted(
            self.strategies.values(),
            key=lambda s: s.performance_score,
            reverse=True
        )
        return sorted_strategies[:n]


# ============================================================================
# Prompt Optimizer
# ============================================================================

class PromptOptimizer:
    """
    Optimize prompts based on performance.
    """
    
    def __init__(self):
        self.templates: Dict[str, PromptTemplate] = {}
        self.template_ratings: Dict[str, List[float]] = {}
    
    def add_template(self, template: PromptTemplate):
        """Add a prompt template."""
        self.templates[template.template_id] = template
        self.template_ratings[template.template_id] = []
    
    def select_template(self, task_type: str) -> PromptTemplate:
        """Select best template for task type."""
        matching = [
            t for t in self.templates.values()
            if t.task_type == task_type
        ]
        
        if not matching:
            # Return any template
            return list(self.templates.values())[0] if self.templates else None
        
        # Select by performance score
        return max(matching, key=lambda t: t.performance_score)
    
    def record_rating(
        self,
        template_id: str,
        rating: float,
        learning_rate: float = 0.1
    ):
        """Record a rating for a template."""
        if template_id not in self.templates:
            return
        
        template = self.templates[template_id]
        template.usage_count += 1
        
        # Update average rating
        ratings = self.template_ratings.get(template_id, [])
        ratings.append(rating)
        
        # Keep last 100 ratings
        if len(ratings) > 100:
            ratings = ratings[-100:]
        
        self.template_ratings[template_id] = ratings
        template.avg_rating = statistics.mean(ratings)
        
        # Update performance score
        normalized_rating = (rating - 1) / 4  # Normalize 1-5 to 0-1
        template.performance_score = (
            (1 - learning_rate) * template.performance_score +
            learning_rate * normalized_rating
        )
    
    def generate_variations(
        self,
        template_id: str,
        n: int = 3
    ) -> List[str]:
        """Generate prompt variations for A/B testing."""
        if template_id not in self.templates:
            return []
        
        template = self.templates[template_id].template
        variations = [template]
        
        # Simple variations
        variation_techniques = [
            lambda t: t.replace("Please", "Kindly"),
            lambda t: t.replace(".", ".\n"),
            lambda t: "Think step by step.\n" + t,
            lambda t: t + "\nBe concise.",
            lambda t: t + "\nProvide detailed explanation.",
        ]
        
        for technique in variation_techniques[:n-1]:
            try:
                variations.append(technique(template))
            except Exception:
                pass
        
        return variations[:n]


# ============================================================================
# Experience Replay Buffer
# ============================================================================

class ExperienceReplayBuffer:
    """
    Store and sample experiences for learning.
    """
    
    def __init__(self, max_size: int = 10000):
        self.max_size = max_size
        self.experiences: List[Experience] = []
        self.priority_weights: List[float] = []
    
    def add(self, experience: Experience):
        """Add an experience."""
        self.experiences.append(experience)
        
        # Priority based on absolute reward (learn from both good and bad)
        priority = abs(experience.reward) + 0.1
        self.priority_weights.append(priority)
        
        # Trim if over capacity
        if len(self.experiences) > self.max_size:
            self.experiences = self.experiences[-self.max_size:]
            self.priority_weights = self.priority_weights[-self.max_size:]
    
    def sample(self, n: int = 32) -> List[Experience]:
        """Sample experiences with priority weighting."""
        if not self.experiences:
            return []
        
        n = min(n, len(self.experiences))
        
        # Normalize weights
        total = sum(self.priority_weights)
        probs = [w / total for w in self.priority_weights]
        
        # Sample with replacement
        indices = random.choices(
            range(len(self.experiences)),
            weights=probs,
            k=n
        )
        
        return [self.experiences[i] for i in indices]
    
    def get_recent(self, n: int = 10) -> List[Experience]:
        """Get most recent experiences."""
        return self.experiences[-n:]
    
    def get_by_outcome(self, outcome: OutcomeType, n: int = 10) -> List[Experience]:
        """Get experiences by outcome type."""
        matching = [e for e in self.experiences if e.outcome == outcome]
        return matching[-n:]
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get buffer statistics."""
        if not self.experiences:
            return {"count": 0}
        
        rewards = [e.reward for e in self.experiences]
        outcomes = {}
        for e in self.experiences:
            outcomes[e.outcome.value] = outcomes.get(e.outcome.value, 0) + 1
        
        return {
            "count": len(self.experiences),
            "avg_reward": statistics.mean(rewards),
            "max_reward": max(rewards),
            "min_reward": min(rewards),
            "outcomes": outcomes
        }


# ============================================================================
# Learning System
# ============================================================================

class LearningSystem:
    """
    Main learning system that coordinates all learning components.
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path
        
        self.reward_calculator = RewardCalculator()
        self.strategy_optimizer = StrategyOptimizer()
        self.prompt_optimizer = PromptOptimizer()
        self.experience_buffer = ExperienceReplayBuffer()
        
        self.feedback_history: List[Feedback] = []
        
        # Initialize default strategies
        self._init_default_strategies()
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def _init_default_strategies(self):
        """Initialize default agent strategies."""
        default_strategies = [
            Strategy(
                strategy_id="react",
                name="ReAct",
                description="Reason and Act iteratively",
                parameters={"max_iterations": 5, "reflection": True}
            ),
            Strategy(
                strategy_id="cot",
                name="Chain of Thought",
                description="Step-by-step reasoning",
                parameters={"detailed": True}
            ),
            Strategy(
                strategy_id="direct",
                name="Direct",
                description="Direct answer without reasoning",
                parameters={"concise": True}
            ),
            Strategy(
                strategy_id="plan_execute",
                name="Plan and Execute",
                description="Plan first, then execute",
                parameters={"planning_depth": 3}
            ),
            Strategy(
                strategy_id="reflexion",
                name="Reflexion",
                description="Self-reflection and improvement",
                parameters={"max_reflections": 3}
            )
        ]
        
        for strategy in default_strategies:
            self.strategy_optimizer.add_strategy(strategy)
    
    def record_experience(
        self,
        agent_id: str,
        task_type: str,
        task_description: str,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
        outcome: OutcomeType,
        execution_time_ms: int,
        tokens_used: int,
        model_used: str,
        strategy_used: str
    ) -> Experience:
        """Record a task execution experience."""
        import secrets
        
        experience = Experience(
            experience_id=f"exp_{secrets.token_hex(8)}",
            timestamp=datetime.utcnow(),
            agent_id=agent_id,
            task_type=task_type,
            task_description=task_description,
            input_data=input_data,
            output_data=output_data,
            outcome=outcome,
            execution_time_ms=execution_time_ms,
            tokens_used=tokens_used,
            model_used=model_used,
            strategy_used=strategy_used
        )
        
        # Calculate initial reward
        experience.reward = self.reward_calculator.calculate(
            outcome=outcome,
            execution_time_ms=execution_time_ms
        )
        
        # Add to buffer
        self.experience_buffer.add(experience)
        
        # Update strategy
        self.strategy_optimizer.update_strategy(strategy_used, experience.reward)
        
        self._save()
        
        return experience
    
    def record_feedback(
        self,
        task_id: str,
        agent_id: str,
        feedback_type: FeedbackType,
        value: Any,
        context: Dict[str, Any] = None
    ) -> Feedback:
        """Record user feedback."""
        import secrets
        
        feedback = Feedback(
            feedback_id=f"fb_{secrets.token_hex(8)}",
            timestamp=datetime.utcnow(),
            task_id=task_id,
            agent_id=agent_id,
            feedback_type=feedback_type,
            value=value,
            context=context or {}
        )
        
        self.feedback_history.append(feedback)
        
        # Find and update related experience
        for exp in reversed(self.experience_buffer.experiences):
            if exp.experience_id == task_id or exp.agent_id == agent_id:
                exp.feedback = feedback
                
                # Recalculate reward with feedback
                exp.reward = self.reward_calculator.calculate(
                    outcome=exp.outcome,
                    feedback=feedback,
                    execution_time_ms=exp.execution_time_ms
                )
                
                # Update strategy with new reward
                self.strategy_optimizer.update_strategy(
                    exp.strategy_used,
                    exp.reward
                )
                
                break
        
        # Trim feedback history
        if len(self.feedback_history) > 5000:
            self.feedback_history = self.feedback_history[-5000:]
        
        self._save()
        
        return feedback
    
    def select_strategy(self, task_type: str = None) -> Strategy:
        """Select best strategy for a task."""
        return self.strategy_optimizer.select_strategy(task_type)
    
    def get_learning_insights(self) -> Dict[str, Any]:
        """Get insights from learning data."""
        buffer_stats = self.experience_buffer.get_statistics()
        best_strategies = self.strategy_optimizer.get_best_strategies()
        
        # Feedback analysis
        feedback_counts = {}
        for fb in self.feedback_history[-100:]:
            feedback_counts[fb.feedback_type.value] = (
                feedback_counts.get(fb.feedback_type.value, 0) + 1
            )
        
        # Calculate improvement over time
        recent = self.experience_buffer.get_recent(50)
        older = self.experience_buffer.experiences[:50] if len(self.experience_buffer.experiences) > 50 else []
        
        improvement = 0.0
        if recent and older:
            recent_avg = statistics.mean([e.reward for e in recent])
            older_avg = statistics.mean([e.reward for e in older])
            improvement = recent_avg - older_avg
        
        return {
            "total_experiences": buffer_stats.get("count", 0),
            "avg_reward": buffer_stats.get("avg_reward", 0),
            "outcome_distribution": buffer_stats.get("outcomes", {}),
            "best_strategies": [
                {
                    "name": s.name,
                    "score": s.performance_score,
                    "success_rate": s.success_count / max(s.usage_count, 1)
                }
                for s in best_strategies
            ],
            "feedback_distribution": feedback_counts,
            "improvement_trend": improvement,
            "total_feedback": len(self.feedback_history)
        }
    
    def _save(self):
        """Save learning data."""
        if not self.storage_path:
            return
        
        data = {
            "strategies": [
                {
                    "strategy_id": s.strategy_id,
                    "name": s.name,
                    "description": s.description,
                    "parameters": s.parameters,
                    "performance_score": s.performance_score,
                    "usage_count": s.usage_count,
                    "success_count": s.success_count
                }
                for s in self.strategy_optimizer.strategies.values()
            ],
            "experiences": [
                {
                    "experience_id": e.experience_id,
                    "timestamp": e.timestamp.isoformat(),
                    "agent_id": e.agent_id,
                    "task_type": e.task_type,
                    "outcome": e.outcome.value,
                    "execution_time_ms": e.execution_time_ms,
                    "model_used": e.model_used,
                    "strategy_used": e.strategy_used,
                    "reward": e.reward
                }
                for e in self.experience_buffer.experiences[-1000:]
            ],
            "feedback": [
                {
                    "feedback_id": f.feedback_id,
                    "timestamp": f.timestamp.isoformat(),
                    "task_id": f.task_id,
                    "agent_id": f.agent_id,
                    "feedback_type": f.feedback_type.value,
                    "value": f.value
                }
                for f in self.feedback_history[-500:]
            ]
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load learning data."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        # Load strategies
        for s_data in data.get("strategies", []):
            strategy = Strategy(
                strategy_id=s_data["strategy_id"],
                name=s_data["name"],
                description=s_data["description"],
                parameters=s_data["parameters"],
                performance_score=s_data["performance_score"],
                usage_count=s_data["usage_count"],
                success_count=s_data["success_count"]
            )
            self.strategy_optimizer.strategies[strategy.strategy_id] = strategy


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Learning System."""
    learning = LearningSystem()
    
    print("=== Learning System Demo ===\n")
    
    # Simulate some experiences
    outcomes = [OutcomeType.SUCCESS, OutcomeType.SUCCESS, OutcomeType.PARTIAL, 
                OutcomeType.SUCCESS, OutcomeType.FAILURE]
    
    for i, outcome in enumerate(outcomes):
        strategy = learning.select_strategy()
        
        exp = learning.record_experience(
            agent_id="research_agent",
            task_type="research",
            task_description=f"Research task {i+1}",
            input_data={"query": f"test query {i+1}"},
            output_data={"result": f"result {i+1}"},
            outcome=outcome,
            execution_time_ms=random.randint(1000, 5000),
            tokens_used=random.randint(500, 2000),
            model_used="gpt-4o",
            strategy_used=strategy.strategy_id
        )
        
        print(f"Experience {i+1}: {outcome.value}, Strategy: {strategy.name}, Reward: {exp.reward:.2f}")
    
    # Add some feedback
    learning.record_feedback(
        task_id="exp_1",
        agent_id="research_agent",
        feedback_type=FeedbackType.RATING,
        value=5
    )
    
    learning.record_feedback(
        task_id="exp_2",
        agent_id="research_agent",
        feedback_type=FeedbackType.THUMBS,
        value=True
    )
    
    # Get insights
    print("\n=== Learning Insights ===")
    insights = learning.get_learning_insights()
    print(f"Total Experiences: {insights['total_experiences']}")
    print(f"Average Reward: {insights['avg_reward']:.2f}")
    print(f"Improvement Trend: {insights['improvement_trend']:.2f}")
    print("\nBest Strategies:")
    for s in insights['best_strategies']:
        print(f"  - {s['name']}: score={s['score']:.2f}, success_rate={s['success_rate']:.1%}")


if __name__ == "__main__":
    asyncio.run(main())
