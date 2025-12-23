"""
Memory Cortex v2.0
==================
The persistent, compounding knowledge base for the HYPER UNICORN architecture.
Enables agents to learn, remember, and improve over time.

Features:
- Short-term memory (Redis) for active context
- Long-term memory (Qdrant) for semantic knowledge
- Episodic memory for task history
- Working memory for active reasoning

Author: Manus AI
Date: December 2025
"""

import os
import json
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MemoryCortex")


# ============================================================================
# Memory Types
# ============================================================================

class MemoryType(Enum):
    """Types of memory in the cortex."""
    WORKING = "working"      # Active reasoning context
    SHORT_TERM = "short"     # Recent interactions (hours)
    LONG_TERM = "long"       # Persistent knowledge (forever)
    EPISODIC = "episodic"    # Task/event history
    SEMANTIC = "semantic"    # Facts and concepts
    PROCEDURAL = "procedural"  # How to do things


@dataclass
class Memory:
    """A single memory unit."""
    id: str
    content: str
    memory_type: MemoryType
    metadata: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    accessed_at: str = field(default_factory=lambda: datetime.now().isoformat())
    access_count: int = 0
    importance: float = 0.5  # 0-1 scale
    decay_rate: float = 0.1  # How fast it fades
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "content": self.content,
            "memory_type": self.memory_type.value,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "accessed_at": self.accessed_at,
            "access_count": self.access_count,
            "importance": self.importance
        }


# ============================================================================
# Embedding Service
# ============================================================================

class EmbeddingService:
    """Generate embeddings for semantic search."""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = "text-embedding-3-small"
        self.dimensions = 1536
        self._cache = {}
    
    async def embed(self, text: str) -> List[float]:
        """Generate embedding for text."""
        # Check cache
        cache_key = hashlib.md5(text.encode()).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        if not self.api_key:
            # Return dummy embedding if no API key
            logger.warning("No OpenAI API key, returning dummy embedding")
            return [0.0] * self.dimensions
        
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "input": text}
            )
            
            if response.status_code == 200:
                data = response.json()
                embedding = data["data"][0]["embedding"]
                self._cache[cache_key] = embedding
                return embedding
        
        return [0.0] * self.dimensions
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        tasks = [self.embed(text) for text in texts]
        return await asyncio.gather(*tasks)


# ============================================================================
# Vector Store (Qdrant)
# ============================================================================

class VectorStore:
    """Vector database interface for semantic memory."""
    
    def __init__(self, collection_name: str = "agent_memory"):
        self.collection_name = collection_name
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.embedding_service = EmbeddingService()
        self._initialized = False
    
    async def initialize(self):
        """Initialize the vector store collection."""
        if self._initialized:
            return
        
        import httpx
        async with httpx.AsyncClient() as client:
            # Check if collection exists
            response = await client.get(
                f"{self.qdrant_url}/collections/{self.collection_name}"
            )
            
            if response.status_code == 404:
                # Create collection
                await client.put(
                    f"{self.qdrant_url}/collections/{self.collection_name}",
                    json={
                        "vectors": {
                            "size": self.embedding_service.dimensions,
                            "distance": "Cosine"
                        }
                    }
                )
                logger.info(f"Created collection: {self.collection_name}")
        
        self._initialized = True
    
    async def store(self, memory: Memory) -> bool:
        """Store a memory in the vector database."""
        await self.initialize()
        
        # Generate embedding if not present
        if not memory.embedding:
            memory.embedding = await self.embedding_service.embed(memory.content)
        
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.qdrant_url}/collections/{self.collection_name}/points",
                json={
                    "points": [{
                        "id": hash(memory.id) % (2**63),  # Qdrant needs int IDs
                        "vector": memory.embedding,
                        "payload": memory.to_dict()
                    }]
                }
            )
            
            return response.status_code == 200
    
    async def search(
        self, 
        query: str, 
        limit: int = 10,
        memory_type: Optional[MemoryType] = None,
        min_score: float = 0.5
    ) -> List[Tuple[Memory, float]]:
        """Search for similar memories."""
        await self.initialize()
        
        # Generate query embedding
        query_embedding = await self.embedding_service.embed(query)
        
        # Build filter
        filter_conditions = []
        if memory_type:
            filter_conditions.append({
                "key": "memory_type",
                "match": {"value": memory_type.value}
            })
        
        import httpx
        async with httpx.AsyncClient() as client:
            request_body = {
                "vector": query_embedding,
                "limit": limit,
                "with_payload": True,
                "score_threshold": min_score
            }
            
            if filter_conditions:
                request_body["filter"] = {"must": filter_conditions}
            
            response = await client.post(
                f"{self.qdrant_url}/collections/{self.collection_name}/points/search",
                json=request_body
            )
            
            if response.status_code != 200:
                return []
            
            results = []
            for point in response.json().get("result", []):
                payload = point["payload"]
                memory = Memory(
                    id=payload["id"],
                    content=payload["content"],
                    memory_type=MemoryType(payload["memory_type"]),
                    metadata=payload.get("metadata", {}),
                    created_at=payload.get("created_at", ""),
                    accessed_at=payload.get("accessed_at", ""),
                    access_count=payload.get("access_count", 0),
                    importance=payload.get("importance", 0.5)
                )
                results.append((memory, point["score"]))
            
            return results


# ============================================================================
# Short-Term Memory (Redis)
# ============================================================================

class ShortTermMemory:
    """Redis-based short-term memory for active context."""
    
    def __init__(self, ttl_hours: int = 24):
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.ttl = ttl_hours * 3600
        self._client = None
    
    async def _get_client(self):
        """Get Redis client."""
        if self._client is None:
            try:
                import redis.asyncio as redis
                self._client = redis.from_url(self.redis_url)
            except ImportError:
                logger.warning("Redis not available, using in-memory fallback")
                self._client = InMemoryCache()
        return self._client
    
    async def store(self, key: str, value: Any, ttl: Optional[int] = None):
        """Store a value with TTL."""
        client = await self._get_client()
        ttl = ttl or self.ttl
        await client.setex(f"stm:{key}", ttl, json.dumps(value))
    
    async def get(self, key: str) -> Optional[Any]:
        """Get a value."""
        client = await self._get_client()
        value = await client.get(f"stm:{key}")
        if value:
            return json.loads(value)
        return None
    
    async def delete(self, key: str):
        """Delete a value."""
        client = await self._get_client()
        await client.delete(f"stm:{key}")
    
    async def get_conversation_context(self, session_id: str, limit: int = 10) -> List[Dict]:
        """Get recent conversation context."""
        client = await self._get_client()
        messages = await client.lrange(f"conv:{session_id}", -limit, -1)
        return [json.loads(m) for m in messages] if messages else []
    
    async def add_to_conversation(self, session_id: str, message: Dict):
        """Add a message to conversation history."""
        client = await self._get_client()
        await client.rpush(f"conv:{session_id}", json.dumps(message))
        await client.ltrim(f"conv:{session_id}", -100, -1)  # Keep last 100
        await client.expire(f"conv:{session_id}", self.ttl)


class InMemoryCache:
    """Fallback in-memory cache when Redis is unavailable."""
    
    def __init__(self):
        self._data = {}
        self._lists = {}
    
    async def setex(self, key: str, ttl: int, value: str):
        self._data[key] = value
    
    async def get(self, key: str) -> Optional[str]:
        return self._data.get(key)
    
    async def delete(self, key: str):
        self._data.pop(key, None)
    
    async def lrange(self, key: str, start: int, end: int) -> List[str]:
        lst = self._lists.get(key, [])
        return lst[start:end+1] if end != -1 else lst[start:]
    
    async def rpush(self, key: str, value: str):
        if key not in self._lists:
            self._lists[key] = []
        self._lists[key].append(value)
    
    async def ltrim(self, key: str, start: int, end: int):
        if key in self._lists:
            self._lists[key] = self._lists[key][start:end+1] if end != -1 else self._lists[key][start:]
    
    async def expire(self, key: str, ttl: int):
        pass  # No-op for in-memory


# ============================================================================
# Episodic Memory
# ============================================================================

@dataclass
class Episode:
    """A single episode (task/event) in memory."""
    id: str
    task: str
    outcome: str  # "success", "failure", "partial"
    actions: List[Dict]
    learnings: List[str]
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    duration_seconds: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class EpisodicMemory:
    """Memory of past tasks and events."""
    
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store
        self.episodes: Dict[str, Episode] = {}
    
    async def record_episode(self, episode: Episode):
        """Record a completed episode."""
        self.episodes[episode.id] = episode
        
        # Store in vector DB for semantic search
        memory = Memory(
            id=f"episode:{episode.id}",
            content=f"Task: {episode.task}\nOutcome: {episode.outcome}\nLearnings: {'; '.join(episode.learnings)}",
            memory_type=MemoryType.EPISODIC,
            metadata={
                "outcome": episode.outcome,
                "duration": episode.duration_seconds,
                "action_count": len(episode.actions)
            },
            importance=0.8 if episode.outcome == "success" else 0.6
        )
        await self.vector_store.store(memory)
    
    async def recall_similar_episodes(
        self, 
        task_description: str, 
        limit: int = 5
    ) -> List[Tuple[Episode, float]]:
        """Recall episodes similar to a task."""
        results = await self.vector_store.search(
            task_description,
            limit=limit,
            memory_type=MemoryType.EPISODIC
        )
        
        # Convert to episodes
        episodes = []
        for memory, score in results:
            episode_id = memory.id.replace("episode:", "")
            if episode_id in self.episodes:
                episodes.append((self.episodes[episode_id], score))
        
        return episodes


# ============================================================================
# Memory Cortex (Main Class)
# ============================================================================

class MemoryCortex:
    """
    The central memory system for the HYPER UNICORN architecture.
    Manages all types of memory and provides unified access.
    """
    
    def __init__(self, agent_id: str = "default"):
        self.agent_id = agent_id
        self.vector_store = VectorStore(f"agent_{agent_id}_memory")
        self.short_term = ShortTermMemory()
        self.episodic = EpisodicMemory(self.vector_store)
        self.embedding_service = EmbeddingService()
        
        # Working memory (in-process)
        self.working_memory: Dict[str, Any] = {}
    
    async def remember(
        self,
        content: str,
        memory_type: MemoryType = MemoryType.LONG_TERM,
        importance: float = 0.5,
        metadata: Optional[Dict] = None
    ) -> str:
        """Store a new memory."""
        memory_id = hashlib.md5(
            f"{content}{datetime.now().isoformat()}".encode()
        ).hexdigest()[:16]
        
        memory = Memory(
            id=memory_id,
            content=content,
            memory_type=memory_type,
            metadata=metadata or {},
            importance=importance
        )
        
        # Store based on type
        if memory_type == MemoryType.WORKING:
            self.working_memory[memory_id] = memory
        elif memory_type == MemoryType.SHORT_TERM:
            await self.short_term.store(memory_id, memory.to_dict())
        else:
            await self.vector_store.store(memory)
        
        logger.info(f"Stored memory: {memory_id} ({memory_type.value})")
        return memory_id
    
    async def recall(
        self,
        query: str,
        memory_types: Optional[List[MemoryType]] = None,
        limit: int = 10
    ) -> List[Tuple[Memory, float]]:
        """Recall relevant memories."""
        memory_types = memory_types or [
            MemoryType.LONG_TERM,
            MemoryType.SEMANTIC,
            MemoryType.PROCEDURAL
        ]
        
        all_results = []
        
        # Search vector store
        for mem_type in memory_types:
            if mem_type not in [MemoryType.WORKING, MemoryType.SHORT_TERM]:
                results = await self.vector_store.search(
                    query, limit=limit, memory_type=mem_type
                )
                all_results.extend(results)
        
        # Check working memory
        if MemoryType.WORKING in memory_types:
            query_embedding = await self.embedding_service.embed(query)
            for memory in self.working_memory.values():
                if memory.embedding:
                    score = self._cosine_similarity(query_embedding, memory.embedding)
                    if score > 0.5:
                        all_results.append((memory, score))
        
        # Sort by relevance and return top results
        all_results.sort(key=lambda x: x[1], reverse=True)
        return all_results[:limit]
    
    async def get_context_for_task(
        self,
        task_description: str,
        session_id: Optional[str] = None
    ) -> Dict:
        """Get relevant context for a task."""
        context = {
            "relevant_memories": [],
            "similar_episodes": [],
            "conversation_history": [],
            "working_context": {}
        }
        
        # Get relevant memories
        memories = await self.recall(task_description, limit=5)
        context["relevant_memories"] = [
            {"content": m.content, "type": m.memory_type.value, "score": s}
            for m, s in memories
        ]
        
        # Get similar past episodes
        episodes = await self.episodic.recall_similar_episodes(task_description, limit=3)
        context["similar_episodes"] = [
            {
                "task": e.task,
                "outcome": e.outcome,
                "learnings": e.learnings,
                "score": s
            }
            for e, s in episodes
        ]
        
        # Get conversation history if session provided
        if session_id:
            context["conversation_history"] = await self.short_term.get_conversation_context(
                session_id, limit=10
            )
        
        # Include working memory
        context["working_context"] = {
            k: v.content if isinstance(v, Memory) else v
            for k, v in self.working_memory.items()
        }
        
        return context
    
    async def learn_from_task(
        self,
        task: str,
        outcome: str,
        actions: List[Dict],
        learnings: List[str]
    ):
        """Learn from a completed task."""
        episode = Episode(
            id=hashlib.md5(f"{task}{datetime.now().isoformat()}".encode()).hexdigest()[:16],
            task=task,
            outcome=outcome,
            actions=actions,
            learnings=learnings
        )
        
        await self.episodic.record_episode(episode)
        
        # Store learnings as semantic memories
        for learning in learnings:
            await self.remember(
                learning,
                memory_type=MemoryType.SEMANTIC,
                importance=0.7,
                metadata={"source": "task_learning", "task": task}
            )
        
        logger.info(f"Learned from task: {task} ({outcome})")
    
    def set_working_memory(self, key: str, value: Any):
        """Set a value in working memory."""
        self.working_memory[key] = value
    
    def get_working_memory(self, key: str) -> Optional[Any]:
        """Get a value from working memory."""
        return self.working_memory.get(key)
    
    def clear_working_memory(self):
        """Clear working memory."""
        self.working_memory.clear()
    
    @staticmethod
    def _cosine_similarity(a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        import math
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0
        return dot_product / (norm_a * norm_b)
    
    async def get_stats(self) -> Dict:
        """Get memory statistics."""
        return {
            "working_memory_items": len(self.working_memory),
            "episodic_memories": len(self.episodic.episodes),
            "agent_id": self.agent_id
        }


# ============================================================================
# Singleton Instance
# ============================================================================

_cortex_instances: Dict[str, MemoryCortex] = {}

def get_memory_cortex(agent_id: str = "default") -> MemoryCortex:
    """Get a Memory Cortex instance for an agent."""
    if agent_id not in _cortex_instances:
        _cortex_instances[agent_id] = MemoryCortex(agent_id)
    return _cortex_instances[agent_id]


# ============================================================================
# Export
# ============================================================================

__all__ = [
    'MemoryCortex',
    'get_memory_cortex',
    'Memory',
    'MemoryType',
    'Episode',
    'VectorStore',
    'ShortTermMemory',
    'EpisodicMemory'
]
