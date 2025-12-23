"""
Intelligence Fabric v2.0
========================
The multi-model, multi-layered reasoning engine for the HYPER UNICORN architecture.
Routes tasks to the optimal AI brain based on task type, complexity, and cost.

This is the "Constellation of Models" approach used by Sierra AI ($10B valuation).
Instead of one model, we use 10+ specialized models working in concert.

Author: Manus AI
Date: December 2025
"""

import os
import json
import asyncio
import hashlib
import logging
from enum import Enum
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
import httpx
from abc import ABC, abstractmethod

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IntelligenceFabric")


# ============================================================================
# Model Definitions
# ============================================================================

class ModelCapability(Enum):
    """Capabilities that models can have."""
    REASONING = "reasoning"
    CODING = "coding"
    CREATIVE = "creative"
    ANALYSIS = "analysis"
    VISION = "vision"
    FAST = "fast"
    LONG_CONTEXT = "long_context"
    TOOL_USE = "tool_use"
    MATH = "math"


@dataclass
class ModelSpec:
    """Specification for an AI model."""
    name: str
    provider: str
    model_id: str
    capabilities: List[ModelCapability]
    max_tokens: int
    cost_per_1k_input: float
    cost_per_1k_output: float
    latency_ms: int  # Average latency
    context_window: int
    priority: int = 1  # Higher = preferred


# The Constellation of Models
MODEL_CONSTELLATION = {
    # =========== TIER 1: Flagship Models (Best Quality) ===========
    "claude-opus": ModelSpec(
        name="Claude 3.5 Opus",
        provider="anthropic",
        model_id="claude-3-5-opus-20241022",
        capabilities=[
            ModelCapability.REASONING, ModelCapability.CODING, 
            ModelCapability.ANALYSIS, ModelCapability.LONG_CONTEXT,
            ModelCapability.TOOL_USE
        ],
        max_tokens=8192,
        cost_per_1k_input=0.015,
        cost_per_1k_output=0.075,
        latency_ms=2000,
        context_window=200000,
        priority=10
    ),
    "claude-sonnet": ModelSpec(
        name="Claude 3.5 Sonnet",
        provider="anthropic",
        model_id="claude-3-5-sonnet-20241022",
        capabilities=[
            ModelCapability.REASONING, ModelCapability.CODING,
            ModelCapability.ANALYSIS, ModelCapability.TOOL_USE,
            ModelCapability.VISION
        ],
        max_tokens=8192,
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        latency_ms=1500,
        context_window=200000,
        priority=9
    ),
    "gpt-4o": ModelSpec(
        name="GPT-4o",
        provider="openai",
        model_id="gpt-4o",
        capabilities=[
            ModelCapability.REASONING, ModelCapability.CODING,
            ModelCapability.CREATIVE, ModelCapability.VISION,
            ModelCapability.TOOL_USE
        ],
        max_tokens=16384,
        cost_per_1k_input=0.005,
        cost_per_1k_output=0.015,
        latency_ms=1200,
        context_window=128000,
        priority=8
    ),
    
    # =========== TIER 2: Fast Models (Best Speed) ===========
    "gemini-flash": ModelSpec(
        name="Gemini 2.0 Flash",
        provider="google",
        model_id="gemini-2.0-flash-exp",
        capabilities=[
            ModelCapability.FAST, ModelCapability.REASONING,
            ModelCapability.VISION, ModelCapability.TOOL_USE,
            ModelCapability.LONG_CONTEXT
        ],
        max_tokens=8192,
        cost_per_1k_input=0.00035,
        cost_per_1k_output=0.0014,
        latency_ms=500,
        context_window=1000000,
        priority=7
    ),
    "claude-haiku": ModelSpec(
        name="Claude 3.5 Haiku",
        provider="anthropic",
        model_id="claude-3-5-haiku-20241022",
        capabilities=[
            ModelCapability.FAST, ModelCapability.CODING,
            ModelCapability.TOOL_USE
        ],
        max_tokens=8192,
        cost_per_1k_input=0.001,
        cost_per_1k_output=0.005,
        latency_ms=400,
        context_window=200000,
        priority=6
    ),
    "gpt-4o-mini": ModelSpec(
        name="GPT-4o Mini",
        provider="openai",
        model_id="gpt-4o-mini",
        capabilities=[
            ModelCapability.FAST, ModelCapability.REASONING,
            ModelCapability.TOOL_USE
        ],
        max_tokens=16384,
        cost_per_1k_input=0.00015,
        cost_per_1k_output=0.0006,
        latency_ms=300,
        context_window=128000,
        priority=5
    ),
    
    # =========== TIER 3: Specialized Models ===========
    "o1-preview": ModelSpec(
        name="o1 Preview",
        provider="openai",
        model_id="o1-preview",
        capabilities=[
            ModelCapability.REASONING, ModelCapability.MATH,
            ModelCapability.CODING, ModelCapability.ANALYSIS
        ],
        max_tokens=32768,
        cost_per_1k_input=0.015,
        cost_per_1k_output=0.06,
        latency_ms=10000,  # Slow but powerful
        context_window=128000,
        priority=10  # Best for complex reasoning
    ),
    "deepseek-coder": ModelSpec(
        name="DeepSeek Coder V3",
        provider="deepseek",
        model_id="deepseek-coder",
        capabilities=[
            ModelCapability.CODING, ModelCapability.FAST
        ],
        max_tokens=8192,
        cost_per_1k_input=0.00014,
        cost_per_1k_output=0.00028,
        latency_ms=600,
        context_window=128000,
        priority=8  # Best for code
    ),
}


# ============================================================================
# Task Classification
# ============================================================================

@dataclass
class TaskProfile:
    """Profile of a task for model routing."""
    task_type: str
    complexity: str  # "simple", "moderate", "complex", "expert"
    required_capabilities: List[ModelCapability]
    max_latency_ms: Optional[int] = None
    max_cost_per_call: Optional[float] = None
    context_length: int = 0
    priority: str = "normal"  # "low", "normal", "high", "critical"


class TaskClassifier:
    """Classifies tasks to determine optimal model routing."""
    
    TASK_PATTERNS = {
        "code_generation": {
            "keywords": ["write code", "implement", "create function", "build", "develop"],
            "capabilities": [ModelCapability.CODING],
            "default_complexity": "moderate"
        },
        "code_review": {
            "keywords": ["review", "debug", "fix bug", "optimize code"],
            "capabilities": [ModelCapability.CODING, ModelCapability.ANALYSIS],
            "default_complexity": "moderate"
        },
        "research": {
            "keywords": ["research", "analyze", "investigate", "study", "compare"],
            "capabilities": [ModelCapability.REASONING, ModelCapability.ANALYSIS],
            "default_complexity": "complex"
        },
        "creative_writing": {
            "keywords": ["write", "draft", "compose", "create content"],
            "capabilities": [ModelCapability.CREATIVE],
            "default_complexity": "moderate"
        },
        "data_analysis": {
            "keywords": ["analyze data", "statistics", "trends", "metrics"],
            "capabilities": [ModelCapability.ANALYSIS, ModelCapability.MATH],
            "default_complexity": "complex"
        },
        "quick_task": {
            "keywords": ["quick", "simple", "just", "only"],
            "capabilities": [ModelCapability.FAST],
            "default_complexity": "simple"
        },
        "complex_reasoning": {
            "keywords": ["explain why", "reason through", "step by step", "prove"],
            "capabilities": [ModelCapability.REASONING, ModelCapability.MATH],
            "default_complexity": "expert"
        },
        "vision_task": {
            "keywords": ["image", "screenshot", "picture", "visual", "look at"],
            "capabilities": [ModelCapability.VISION],
            "default_complexity": "moderate"
        }
    }
    
    @classmethod
    def classify(cls, prompt: str, context_length: int = 0) -> TaskProfile:
        """Classify a task based on the prompt."""
        prompt_lower = prompt.lower()
        
        # Detect task type
        detected_type = "general"
        detected_capabilities = []
        detected_complexity = "moderate"
        
        for task_type, pattern in cls.TASK_PATTERNS.items():
            if any(kw in prompt_lower for kw in pattern["keywords"]):
                detected_type = task_type
                detected_capabilities.extend(pattern["capabilities"])
                detected_complexity = pattern["default_complexity"]
                break
        
        # Adjust complexity based on prompt length
        if len(prompt) > 5000:
            detected_complexity = "complex"
        elif len(prompt) < 100:
            detected_complexity = "simple"
        
        # Add long context capability if needed
        if context_length > 50000:
            detected_capabilities.append(ModelCapability.LONG_CONTEXT)
        
        return TaskProfile(
            task_type=detected_type,
            complexity=detected_complexity,
            required_capabilities=list(set(detected_capabilities)),
            context_length=context_length
        )


# ============================================================================
# Model Router
# ============================================================================

class ModelRouter:
    """Routes tasks to the optimal model based on task profile."""
    
    def __init__(self, models: Dict[str, ModelSpec] = None):
        self.models = models or MODEL_CONSTELLATION
        self.usage_stats = {}  # Track model usage for optimization
    
    def select_model(self, task: TaskProfile) -> ModelSpec:
        """Select the best model for a task."""
        candidates = []
        
        for name, spec in self.models.items():
            # Check if model has required capabilities
            has_capabilities = all(
                cap in spec.capabilities 
                for cap in task.required_capabilities
            )
            
            if not has_capabilities:
                continue
            
            # Check latency constraint
            if task.max_latency_ms and spec.latency_ms > task.max_latency_ms:
                continue
            
            # Check context window
            if task.context_length > spec.context_window:
                continue
            
            # Calculate score
            score = self._calculate_score(spec, task)
            candidates.append((name, spec, score))
        
        if not candidates:
            # Fallback to Gemini Flash (most versatile)
            return self.models["gemini-flash"]
        
        # Sort by score (higher is better)
        candidates.sort(key=lambda x: x[2], reverse=True)
        
        selected = candidates[0][1]
        logger.info(f"Selected model: {selected.name} (score: {candidates[0][2]:.2f})")
        
        return selected
    
    def _calculate_score(self, spec: ModelSpec, task: TaskProfile) -> float:
        """Calculate a score for model-task match."""
        score = spec.priority * 10
        
        # Bonus for matching capabilities
        matching_caps = sum(
            1 for cap in task.required_capabilities 
            if cap in spec.capabilities
        )
        score += matching_caps * 5
        
        # Adjust for complexity
        if task.complexity == "expert":
            # Prefer high-quality models
            score += spec.priority * 2
        elif task.complexity == "simple":
            # Prefer fast, cheap models
            if ModelCapability.FAST in spec.capabilities:
                score += 20
            score -= spec.cost_per_1k_output * 100
        
        # Adjust for priority
        if task.priority == "critical":
            score += spec.priority * 3
        elif task.priority == "low":
            score -= spec.cost_per_1k_output * 200
        
        return score


# ============================================================================
# Model Providers
# ============================================================================

class BaseProvider(ABC):
    """Base class for AI model providers."""
    
    @abstractmethod
    async def generate(
        self, 
        model_id: str, 
        messages: List[Dict], 
        **kwargs
    ) -> Dict:
        pass


class AnthropicProvider(BaseProvider):
    """Anthropic Claude provider."""
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.base_url = "https://api.anthropic.com/v1/messages"
    
    async def generate(
        self, 
        model_id: str, 
        messages: List[Dict],
        max_tokens: int = 4096,
        **kwargs
    ) -> Dict:
        if not self.api_key:
            return {"success": False, "error": "Anthropic API key not configured"}
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self.base_url,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": model_id,
                    "max_tokens": max_tokens,
                    "messages": messages,
                    **kwargs
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "content": data.get("content", [{}])[0].get("text", ""),
                    "usage": data.get("usage", {}),
                    "model": model_id
                }
            
            return {
                "success": False, 
                "error": f"API error: {response.status_code}",
                "details": response.text
            }


class OpenAIProvider(BaseProvider):
    """OpenAI provider."""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    
    async def generate(
        self, 
        model_id: str, 
        messages: List[Dict],
        max_tokens: int = 4096,
        **kwargs
    ) -> Dict:
        if not self.api_key:
            return {"success": False, "error": "OpenAI API key not configured"}
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model_id,
                    "max_tokens": max_tokens,
                    "messages": messages,
                    **kwargs
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "content": data.get("choices", [{}])[0].get("message", {}).get("content", ""),
                    "usage": data.get("usage", {}),
                    "model": model_id
                }
            
            return {
                "success": False, 
                "error": f"API error: {response.status_code}",
                "details": response.text
            }


class GoogleProvider(BaseProvider):
    """Google Gemini provider."""
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")
    
    async def generate(
        self, 
        model_id: str, 
        messages: List[Dict],
        max_tokens: int = 4096,
        **kwargs
    ) -> Dict:
        if not self.api_key:
            return {"success": False, "error": "Gemini API key not configured"}
        
        # Convert messages to Gemini format
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg["content"]}]
            })
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={self.api_key}"
            response = await client.post(
                url,
                json={
                    "contents": contents,
                    "generationConfig": {"maxOutputTokens": max_tokens}
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {
                    "success": True,
                    "content": text,
                    "usage": data.get("usageMetadata", {}),
                    "model": model_id
                }
            
            return {
                "success": False, 
                "error": f"API error: {response.status_code}",
                "details": response.text
            }


# ============================================================================
# Intelligence Fabric (Main Class)
# ============================================================================

class IntelligenceFabric:
    """
    The central intelligence routing system.
    Routes tasks to optimal models and manages the constellation.
    """
    
    def __init__(self):
        self.router = ModelRouter()
        self.classifier = TaskClassifier()
        self.providers = {
            "anthropic": AnthropicProvider(),
            "openai": OpenAIProvider(),
            "google": GoogleProvider()
        }
        self.call_history = []
        self.total_cost = 0.0
    
    async def think(
        self,
        prompt: str,
        context: Optional[str] = None,
        force_model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        **kwargs
    ) -> Dict:
        """
        Main entry point for intelligence requests.
        Automatically routes to the best model.
        """
        # Build full context
        full_prompt = prompt
        if context:
            full_prompt = f"{context}\n\n{prompt}"
        
        # Classify task
        task_profile = self.classifier.classify(full_prompt, len(full_prompt))
        
        # Select model
        if force_model and force_model in MODEL_CONSTELLATION:
            model = MODEL_CONSTELLATION[force_model]
        else:
            model = self.router.select_model(task_profile)
        
        # Build messages
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": full_prompt})
        
        # Get provider
        provider = self.providers.get(model.provider)
        if not provider:
            return {"success": False, "error": f"Unknown provider: {model.provider}"}
        
        # Make the call
        start_time = datetime.now()
        result = await provider.generate(model.model_id, messages, **kwargs)
        elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        # Track usage
        if result["success"]:
            usage = result.get("usage", {})
            input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", 0))
            output_tokens = usage.get("output_tokens", usage.get("completion_tokens", 0))
            cost = (
                (input_tokens / 1000) * model.cost_per_1k_input +
                (output_tokens / 1000) * model.cost_per_1k_output
            )
            self.total_cost += cost
            
            self.call_history.append({
                "timestamp": datetime.now().isoformat(),
                "model": model.name,
                "task_type": task_profile.task_type,
                "complexity": task_profile.complexity,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost": cost,
                "latency_ms": elapsed_ms
            })
            
            result["metadata"] = {
                "model_used": model.name,
                "task_type": task_profile.task_type,
                "complexity": task_profile.complexity,
                "latency_ms": elapsed_ms,
                "cost": cost
            }
        
        return result
    
    async def parallel_think(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[Dict]:
        """Execute multiple prompts in parallel."""
        tasks = [self.think(prompt, **kwargs) for prompt in prompts]
        return await asyncio.gather(*tasks)
    
    async def consensus_think(
        self,
        prompt: str,
        models: List[str] = None,
        **kwargs
    ) -> Dict:
        """
        Get responses from multiple models and synthesize.
        Useful for critical decisions.
        """
        models = models or ["claude-sonnet", "gpt-4o", "gemini-flash"]
        
        # Get responses from all models
        tasks = [
            self.think(prompt, force_model=model, **kwargs)
            for model in models
        ]
        results = await asyncio.gather(*tasks)
        
        # Synthesize responses
        successful = [r for r in results if r["success"]]
        if not successful:
            return {"success": False, "error": "All models failed"}
        
        # Use Claude to synthesize
        synthesis_prompt = f"""You are synthesizing responses from multiple AI models to a question.

Question: {prompt}

Responses:
{chr(10).join(f"Model {i+1}: {r['content'][:2000]}" for i, r in enumerate(successful))}

Provide a synthesized response that:
1. Identifies points of agreement
2. Notes any disagreements
3. Provides the most accurate and complete answer
"""
        
        synthesis = await self.think(
            synthesis_prompt,
            force_model="claude-sonnet",
            system_prompt="You are a synthesis expert. Combine multiple AI responses into one authoritative answer."
        )
        
        synthesis["individual_responses"] = successful
        return synthesis
    
    def get_stats(self) -> Dict:
        """Get usage statistics."""
        if not self.call_history:
            return {"total_calls": 0, "total_cost": 0}
        
        return {
            "total_calls": len(self.call_history),
            "total_cost": self.total_cost,
            "avg_latency_ms": sum(c["latency_ms"] for c in self.call_history) / len(self.call_history),
            "calls_by_model": {
                model: len([c for c in self.call_history if c["model"] == model])
                for model in set(c["model"] for c in self.call_history)
            },
            "calls_by_task_type": {
                task: len([c for c in self.call_history if c["task_type"] == task])
                for task in set(c["task_type"] for c in self.call_history)
            }
        }


# ============================================================================
# Singleton Instance
# ============================================================================

_fabric_instance = None

def get_intelligence_fabric() -> IntelligenceFabric:
    """Get the singleton Intelligence Fabric instance."""
    global _fabric_instance
    if _fabric_instance is None:
        _fabric_instance = IntelligenceFabric()
    return _fabric_instance


# ============================================================================
# Convenience Functions
# ============================================================================

async def think(prompt: str, **kwargs) -> Dict:
    """Quick access to the Intelligence Fabric."""
    fabric = get_intelligence_fabric()
    return await fabric.think(prompt, **kwargs)


async def code(prompt: str, **kwargs) -> Dict:
    """Optimized for coding tasks."""
    fabric = get_intelligence_fabric()
    return await fabric.think(
        prompt,
        force_model="claude-sonnet",  # Best for code
        system_prompt="You are an expert software engineer. Write clean, efficient, well-documented code.",
        **kwargs
    )


async def research(prompt: str, **kwargs) -> Dict:
    """Optimized for research tasks."""
    fabric = get_intelligence_fabric()
    return await fabric.think(
        prompt,
        force_model="claude-opus",  # Best for deep research
        system_prompt="You are a research analyst. Provide thorough, well-sourced analysis.",
        **kwargs
    )


async def quick(prompt: str, **kwargs) -> Dict:
    """Optimized for quick, simple tasks."""
    fabric = get_intelligence_fabric()
    return await fabric.think(
        prompt,
        force_model="gemini-flash",  # Fastest
        **kwargs
    )


# ============================================================================
# Export
# ============================================================================

__all__ = [
    'IntelligenceFabric',
    'get_intelligence_fabric',
    'think',
    'code',
    'research',
    'quick',
    'ModelCapability',
    'ModelSpec',
    'MODEL_CONSTELLATION'
]
