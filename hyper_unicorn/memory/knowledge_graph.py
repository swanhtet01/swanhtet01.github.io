"""
Knowledge Graph
================
Connect and query information across agents.

Features:
- Entity extraction
- Relationship mapping
- Graph traversal
- Semantic search
- Knowledge inference
- Cross-agent knowledge sharing

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, List, Any, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import logging
import hashlib
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("knowledge_graph")


# ============================================================================
# Data Models
# ============================================================================

class EntityType(Enum):
    """Types of entities in the knowledge graph."""
    PERSON = "person"
    ORGANIZATION = "organization"
    PROJECT = "project"
    CONCEPT = "concept"
    DOCUMENT = "document"
    CODE = "code"
    TASK = "task"
    EVENT = "event"
    LOCATION = "location"
    TOOL = "tool"
    AGENT = "agent"
    CUSTOM = "custom"


class RelationType(Enum):
    """Types of relationships between entities."""
    # Organizational
    WORKS_FOR = "works_for"
    MANAGES = "manages"
    OWNS = "owns"
    MEMBER_OF = "member_of"
    
    # Project
    CREATED = "created"
    CONTRIBUTED_TO = "contributed_to"
    DEPENDS_ON = "depends_on"
    PART_OF = "part_of"
    
    # Knowledge
    RELATED_TO = "related_to"
    SIMILAR_TO = "similar_to"
    REFERENCES = "references"
    DERIVED_FROM = "derived_from"
    
    # Temporal
    BEFORE = "before"
    AFTER = "after"
    DURING = "during"
    
    # Custom
    CUSTOM = "custom"


@dataclass
class Entity:
    """An entity in the knowledge graph."""
    entity_id: str
    name: str
    entity_type: EntityType
    properties: Dict[str, Any] = field(default_factory=dict)
    embeddings: List[float] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    source_agent: str = "unknown"
    confidence: float = 1.0


@dataclass
class Relationship:
    """A relationship between two entities."""
    relationship_id: str
    source_id: str
    target_id: str
    relation_type: RelationType
    properties: Dict[str, Any] = field(default_factory=dict)
    weight: float = 1.0
    created_at: datetime = field(default_factory=datetime.utcnow)
    source_agent: str = "unknown"
    confidence: float = 1.0


@dataclass
class GraphQuery:
    """A query against the knowledge graph."""
    start_entity: Optional[str] = None
    entity_types: List[EntityType] = field(default_factory=list)
    relation_types: List[RelationType] = field(default_factory=list)
    max_depth: int = 3
    limit: int = 100
    include_properties: bool = True


# ============================================================================
# Knowledge Graph
# ============================================================================

class KnowledgeGraph:
    """
    In-memory knowledge graph with persistence.
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path
        
        # Graph storage
        self.entities: Dict[str, Entity] = {}
        self.relationships: Dict[str, Relationship] = {}
        
        # Indexes
        self.entity_by_name: Dict[str, Set[str]] = defaultdict(set)
        self.entity_by_type: Dict[EntityType, Set[str]] = defaultdict(set)
        self.outgoing_edges: Dict[str, Set[str]] = defaultdict(set)
        self.incoming_edges: Dict[str, Set[str]] = defaultdict(set)
        
        # Load from storage
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def _generate_id(self, prefix: str, content: str) -> str:
        """Generate a unique ID."""
        hash_input = f"{prefix}:{content}:{datetime.utcnow().isoformat()}"
        return f"{prefix}_{hashlib.md5(hash_input.encode()).hexdigest()[:12]}"
    
    def add_entity(
        self,
        name: str,
        entity_type: EntityType,
        properties: Dict[str, Any] = None,
        source_agent: str = "unknown",
        confidence: float = 1.0
    ) -> Entity:
        """Add an entity to the graph."""
        # Check for existing entity with same name and type
        existing = self.find_entity(name, entity_type)
        if existing:
            # Update existing entity
            existing.properties.update(properties or {})
            existing.updated_at = datetime.utcnow()
            existing.confidence = max(existing.confidence, confidence)
            return existing
        
        # Create new entity
        entity_id = self._generate_id("ent", name)
        entity = Entity(
            entity_id=entity_id,
            name=name,
            entity_type=entity_type,
            properties=properties or {},
            source_agent=source_agent,
            confidence=confidence
        )
        
        # Store entity
        self.entities[entity_id] = entity
        
        # Update indexes
        self.entity_by_name[name.lower()].add(entity_id)
        self.entity_by_type[entity_type].add(entity_id)
        
        logger.debug(f"Added entity: {name} ({entity_type.value})")
        
        return entity
    
    def find_entity(
        self,
        name: str,
        entity_type: EntityType = None
    ) -> Optional[Entity]:
        """Find an entity by name and optionally type."""
        entity_ids = self.entity_by_name.get(name.lower(), set())
        
        for entity_id in entity_ids:
            entity = self.entities.get(entity_id)
            if entity:
                if entity_type is None or entity.entity_type == entity_type:
                    return entity
        
        return None
    
    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Get an entity by ID."""
        return self.entities.get(entity_id)
    
    def add_relationship(
        self,
        source_id: str,
        target_id: str,
        relation_type: RelationType,
        properties: Dict[str, Any] = None,
        weight: float = 1.0,
        source_agent: str = "unknown",
        confidence: float = 1.0
    ) -> Optional[Relationship]:
        """Add a relationship between two entities."""
        # Verify entities exist
        if source_id not in self.entities or target_id not in self.entities:
            logger.warning(f"Cannot create relationship: entity not found")
            return None
        
        # Check for existing relationship
        for rel_id in self.outgoing_edges.get(source_id, set()):
            rel = self.relationships.get(rel_id)
            if rel and rel.target_id == target_id and rel.relation_type == relation_type:
                # Update existing relationship
                rel.properties.update(properties or {})
                rel.weight = max(rel.weight, weight)
                rel.confidence = max(rel.confidence, confidence)
                return rel
        
        # Create new relationship
        rel_id = self._generate_id("rel", f"{source_id}:{target_id}")
        relationship = Relationship(
            relationship_id=rel_id,
            source_id=source_id,
            target_id=target_id,
            relation_type=relation_type,
            properties=properties or {},
            weight=weight,
            source_agent=source_agent,
            confidence=confidence
        )
        
        # Store relationship
        self.relationships[rel_id] = relationship
        
        # Update indexes
        self.outgoing_edges[source_id].add(rel_id)
        self.incoming_edges[target_id].add(rel_id)
        
        logger.debug(f"Added relationship: {source_id} --{relation_type.value}--> {target_id}")
        
        return relationship
    
    def connect(
        self,
        source_name: str,
        source_type: EntityType,
        target_name: str,
        target_type: EntityType,
        relation_type: RelationType,
        **kwargs
    ) -> Optional[Relationship]:
        """Convenience method to connect two entities by name."""
        source = self.find_entity(source_name, source_type)
        if not source:
            source = self.add_entity(source_name, source_type)
        
        target = self.find_entity(target_name, target_type)
        if not target:
            target = self.add_entity(target_name, target_type)
        
        return self.add_relationship(
            source.entity_id,
            target.entity_id,
            relation_type,
            **kwargs
        )
    
    def get_neighbors(
        self,
        entity_id: str,
        relation_types: List[RelationType] = None,
        direction: str = "both"
    ) -> List[Tuple[Entity, Relationship]]:
        """Get neighboring entities."""
        neighbors = []
        
        # Outgoing edges
        if direction in ("out", "both"):
            for rel_id in self.outgoing_edges.get(entity_id, set()):
                rel = self.relationships.get(rel_id)
                if rel and (relation_types is None or rel.relation_type in relation_types):
                    target = self.entities.get(rel.target_id)
                    if target:
                        neighbors.append((target, rel))
        
        # Incoming edges
        if direction in ("in", "both"):
            for rel_id in self.incoming_edges.get(entity_id, set()):
                rel = self.relationships.get(rel_id)
                if rel and (relation_types is None or rel.relation_type in relation_types):
                    source = self.entities.get(rel.source_id)
                    if source:
                        neighbors.append((source, rel))
        
        return neighbors
    
    def traverse(
        self,
        start_id: str,
        max_depth: int = 3,
        relation_types: List[RelationType] = None
    ) -> Dict[str, Any]:
        """
        Traverse the graph from a starting entity.
        Returns a subgraph of connected entities.
        """
        visited = set()
        result = {
            "entities": {},
            "relationships": []
        }
        
        def _traverse(entity_id: str, depth: int):
            if depth > max_depth or entity_id in visited:
                return
            
            visited.add(entity_id)
            entity = self.entities.get(entity_id)
            if entity:
                result["entities"][entity_id] = {
                    "name": entity.name,
                    "type": entity.entity_type.value,
                    "properties": entity.properties
                }
            
            for neighbor, rel in self.get_neighbors(entity_id, relation_types, "out"):
                result["relationships"].append({
                    "source": entity_id,
                    "target": neighbor.entity_id,
                    "type": rel.relation_type.value,
                    "weight": rel.weight
                })
                _traverse(neighbor.entity_id, depth + 1)
        
        _traverse(start_id, 0)
        return result
    
    def search(
        self,
        query: str,
        entity_types: List[EntityType] = None,
        limit: int = 10
    ) -> List[Entity]:
        """Search for entities by name."""
        query_lower = query.lower()
        results = []
        
        for entity in self.entities.values():
            if entity_types and entity.entity_type not in entity_types:
                continue
            
            # Simple text matching
            if query_lower in entity.name.lower():
                results.append(entity)
            elif any(query_lower in str(v).lower() for v in entity.properties.values()):
                results.append(entity)
        
        # Sort by confidence
        results.sort(key=lambda e: e.confidence, reverse=True)
        
        return results[:limit]
    
    def find_path(
        self,
        source_id: str,
        target_id: str,
        max_depth: int = 5
    ) -> Optional[List[Tuple[Entity, Relationship]]]:
        """Find a path between two entities using BFS."""
        if source_id == target_id:
            return []
        
        visited = {source_id}
        queue = [(source_id, [])]
        
        while queue:
            current_id, path = queue.pop(0)
            
            for neighbor, rel in self.get_neighbors(current_id, direction="out"):
                if neighbor.entity_id == target_id:
                    return path + [(neighbor, rel)]
                
                if neighbor.entity_id not in visited and len(path) < max_depth:
                    visited.add(neighbor.entity_id)
                    queue.append((neighbor.entity_id, path + [(neighbor, rel)]))
        
        return None
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get graph statistics."""
        entity_counts = defaultdict(int)
        for entity in self.entities.values():
            entity_counts[entity.entity_type.value] += 1
        
        relation_counts = defaultdict(int)
        for rel in self.relationships.values():
            relation_counts[rel.relation_type.value] += 1
        
        return {
            "total_entities": len(self.entities),
            "total_relationships": len(self.relationships),
            "entity_types": dict(entity_counts),
            "relation_types": dict(relation_counts),
            "avg_connections": len(self.relationships) / max(len(self.entities), 1)
        }
    
    def _save(self):
        """Save graph to storage."""
        if not self.storage_path:
            return
        
        data = {
            "entities": [
                {
                    "entity_id": e.entity_id,
                    "name": e.name,
                    "entity_type": e.entity_type.value,
                    "properties": e.properties,
                    "created_at": e.created_at.isoformat(),
                    "updated_at": e.updated_at.isoformat(),
                    "source_agent": e.source_agent,
                    "confidence": e.confidence
                }
                for e in self.entities.values()
            ],
            "relationships": [
                {
                    "relationship_id": r.relationship_id,
                    "source_id": r.source_id,
                    "target_id": r.target_id,
                    "relation_type": r.relation_type.value,
                    "properties": r.properties,
                    "weight": r.weight,
                    "created_at": r.created_at.isoformat(),
                    "source_agent": r.source_agent,
                    "confidence": r.confidence
                }
                for r in self.relationships.values()
            ]
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load graph from storage."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        # Load entities
        for e_data in data.get("entities", []):
            entity = Entity(
                entity_id=e_data["entity_id"],
                name=e_data["name"],
                entity_type=EntityType(e_data["entity_type"]),
                properties=e_data.get("properties", {}),
                created_at=datetime.fromisoformat(e_data["created_at"]),
                updated_at=datetime.fromisoformat(e_data["updated_at"]),
                source_agent=e_data.get("source_agent", "unknown"),
                confidence=e_data.get("confidence", 1.0)
            )
            
            self.entities[entity.entity_id] = entity
            self.entity_by_name[entity.name.lower()].add(entity.entity_id)
            self.entity_by_type[entity.entity_type].add(entity.entity_id)
        
        # Load relationships
        for r_data in data.get("relationships", []):
            rel = Relationship(
                relationship_id=r_data["relationship_id"],
                source_id=r_data["source_id"],
                target_id=r_data["target_id"],
                relation_type=RelationType(r_data["relation_type"]),
                properties=r_data.get("properties", {}),
                weight=r_data.get("weight", 1.0),
                created_at=datetime.fromisoformat(r_data["created_at"]),
                source_agent=r_data.get("source_agent", "unknown"),
                confidence=r_data.get("confidence", 1.0)
            )
            
            self.relationships[rel.relationship_id] = rel
            self.outgoing_edges[rel.source_id].add(rel.relationship_id)
            self.incoming_edges[rel.target_id].add(rel.relationship_id)


# ============================================================================
# Entity Extractor
# ============================================================================

class EntityExtractor:
    """
    Extract entities and relationships from text.
    """
    
    def __init__(self, graph: KnowledgeGraph):
        self.graph = graph
        
        # Simple patterns for entity extraction
        self.patterns = {
            EntityType.PERSON: [
                r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b',  # Name pattern
            ],
            EntityType.ORGANIZATION: [
                r'\b([A-Z][a-z]+ (?:Inc|Corp|LLC|Ltd|Company|Co)\.?)\b',
                r'\b([A-Z][A-Z]+)\b',  # Acronyms
            ],
            EntityType.PROJECT: [
                r'\bproject[:\s]+([A-Za-z0-9_-]+)\b',
            ]
        }
    
    async def extract_from_text(
        self,
        text: str,
        source_agent: str = "extractor"
    ) -> Dict[str, Any]:
        """Extract entities and relationships from text."""
        extracted = {
            "entities": [],
            "relationships": []
        }
        
        # Extract entities using patterns
        for entity_type, patterns in self.patterns.items():
            for pattern in patterns:
                matches = re.findall(pattern, text)
                for match in matches:
                    entity = self.graph.add_entity(
                        name=match,
                        entity_type=entity_type,
                        source_agent=source_agent,
                        confidence=0.7
                    )
                    extracted["entities"].append({
                        "id": entity.entity_id,
                        "name": entity.name,
                        "type": entity_type.value
                    })
        
        return extracted
    
    async def extract_with_llm(
        self,
        text: str,
        llm_client: Any,
        source_agent: str = "llm_extractor"
    ) -> Dict[str, Any]:
        """Extract entities using an LLM for better accuracy."""
        prompt = f"""Extract entities and relationships from the following text.
Return JSON with:
- entities: list of {{name, type, properties}}
- relationships: list of {{source, target, relation}}

Entity types: person, organization, project, concept, document, code, task, event, location, tool
Relation types: works_for, manages, owns, created, contributed_to, depends_on, part_of, related_to, references

Text:
{text}

JSON:"""
        
        # This would call the LLM
        # For now, fall back to pattern extraction
        return await self.extract_from_text(text, source_agent)


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Knowledge Graph."""
    graph = KnowledgeGraph()
    
    # Add some entities
    swan = graph.add_entity("Swan Htet", EntityType.PERSON, {"role": "founder"})
    supermega = graph.add_entity("SuperMega.dev", EntityType.ORGANIZATION, {"type": "startup"})
    jarvis = graph.add_entity("JARVIS", EntityType.PROJECT, {"status": "active"})
    bangkok_node = graph.add_entity("Bangkok Node", EntityType.TOOL, {"type": "server"})
    
    # Add relationships
    graph.add_relationship(swan.entity_id, supermega.entity_id, RelationType.OWNS)
    graph.add_relationship(swan.entity_id, jarvis.entity_id, RelationType.CREATED)
    graph.add_relationship(jarvis.entity_id, bangkok_node.entity_id, RelationType.DEPENDS_ON)
    graph.add_relationship(jarvis.entity_id, supermega.entity_id, RelationType.PART_OF)
    
    # Search
    print("=== Search Results ===")
    results = graph.search("Swan")
    for entity in results:
        print(f"  {entity.name} ({entity.entity_type.value})")
    
    # Traverse
    print("\n=== Graph Traversal from Swan ===")
    subgraph = graph.traverse(swan.entity_id, max_depth=2)
    print(f"  Entities: {list(subgraph['entities'].keys())}")
    print(f"  Relationships: {len(subgraph['relationships'])}")
    
    # Find path
    print("\n=== Path Finding ===")
    path = graph.find_path(swan.entity_id, bangkok_node.entity_id)
    if path:
        print(f"  Path length: {len(path)}")
        for entity, rel in path:
            print(f"    --{rel.relation_type.value}--> {entity.name}")
    
    # Statistics
    print("\n=== Graph Statistics ===")
    stats = graph.get_statistics()
    print(f"  Total entities: {stats['total_entities']}")
    print(f"  Total relationships: {stats['total_relationships']}")
    print(f"  Entity types: {stats['entity_types']}")


if __name__ == "__main__":
    asyncio.run(main())
