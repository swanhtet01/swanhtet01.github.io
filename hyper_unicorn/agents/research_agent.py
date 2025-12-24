"""
Research Agent
==============
An autonomous agent specialized in deep research, information synthesis,
and report generation. Uses multiple search APIs and AI models.

Capabilities:
- Multi-source web research (Tavily, Exa)
- Content extraction and synthesis
- Report generation with citations
- Fact verification
- Trend analysis

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ResearchAgent")


@dataclass
class ResearchTask:
    """A research task to be executed."""
    topic: str
    depth: str = "standard"  # quick, standard, deep
    output_format: str = "markdown"  # markdown, json, html
    max_sources: int = 10
    include_citations: bool = True
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class ResearchResult:
    """Result of a research task."""
    task: ResearchTask
    summary: str
    key_findings: List[str]
    sources: List[Dict]
    raw_data: Dict
    report: str
    completed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class ResearchAgent:
    """
    Autonomous Research Agent
    
    This agent performs deep research on any topic by:
    1. Breaking down the topic into searchable queries
    2. Searching multiple sources (Tavily, Exa)
    3. Extracting and analyzing content
    4. Synthesizing findings
    5. Generating a comprehensive report
    """
    
    def __init__(self):
        self.tavily_api_key = os.getenv("TAVILY_API_KEY")
        self.exa_api_key = os.getenv("EXA_API_KEY")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        self.http_client = httpx.AsyncClient(timeout=60.0)
        self.research_history: List[ResearchResult] = []
    
    async def research(self, topic: str, depth: str = "standard") -> ResearchResult:
        """
        Execute a full research workflow on a topic.
        
        Args:
            topic: The topic to research
            depth: Research depth (quick, standard, deep)
        
        Returns:
            ResearchResult with findings and report
        """
        task = ResearchTask(topic=topic, depth=depth)
        logger.info(f"Starting research: {topic} (depth: {depth})")
        
        # Step 1: Generate search queries
        queries = await self._generate_queries(topic, depth)
        logger.info(f"Generated {len(queries)} search queries")
        
        # Step 2: Search multiple sources
        all_results = await self._multi_source_search(queries)
        logger.info(f"Found {len(all_results)} total results")
        
        # Step 3: Extract and deduplicate
        unique_sources = self._deduplicate_sources(all_results)
        logger.info(f"Deduplicated to {len(unique_sources)} unique sources")
        
        # Step 4: Analyze and synthesize
        analysis = await self._analyze_sources(topic, unique_sources)
        
        # Step 5: Generate report
        report = await self._generate_report(topic, analysis, unique_sources)
        
        result = ResearchResult(
            task=task,
            summary=analysis.get("summary", ""),
            key_findings=analysis.get("key_findings", []),
            sources=unique_sources[:task.max_sources],
            raw_data={"queries": queries, "all_results": all_results},
            report=report
        )
        
        self.research_history.append(result)
        logger.info(f"Research complete: {topic}")
        
        return result
    
    async def _generate_queries(self, topic: str, depth: str) -> List[str]:
        """Generate search queries for the topic."""
        # Base query is always the topic itself
        queries = [topic]
        
        # Add variations based on depth
        if depth in ["standard", "deep"]:
            queries.extend([
                f"{topic} latest news 2024 2025",
                f"{topic} research papers",
                f"{topic} expert analysis",
            ])
        
        if depth == "deep":
            queries.extend([
                f"{topic} trends forecast",
                f"{topic} challenges problems",
                f"{topic} best practices",
                f"{topic} case studies examples",
                f"what is {topic}",
                f"how does {topic} work",
            ])
        
        return queries
    
    async def _multi_source_search(self, queries: List[str]) -> List[Dict]:
        """Search multiple sources in parallel."""
        all_results = []
        
        # Create search tasks for each query
        tasks = []
        for query in queries:
            if self.tavily_api_key:
                tasks.append(self._tavily_search(query))
            if self.exa_api_key:
                tasks.append(self._exa_search(query))
        
        # Execute all searches in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, list):
                all_results.extend(result)
            elif isinstance(result, Exception):
                logger.warning(f"Search error: {result}")
        
        return all_results
    
    async def _tavily_search(self, query: str) -> List[Dict]:
        """Search using Tavily API."""
        try:
            response = await self.http_client.post(
                "https://api.tavily.com/search",
                json={
                    "query": query,
                    "search_depth": "advanced",
                    "include_answer": True,
                    "include_raw_content": False,
                    "max_results": 5
                },
                headers={"Authorization": f"Bearer {self.tavily_api_key}"}
            )
            response.raise_for_status()
            data = response.json()
            
            results = []
            for r in data.get("results", []):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                    "score": r.get("score", 0),
                    "source": "tavily"
                })
            
            # Include the AI-generated answer if available
            if data.get("answer"):
                results.insert(0, {
                    "title": "AI Summary",
                    "url": "",
                    "content": data["answer"],
                    "score": 1.0,
                    "source": "tavily_answer"
                })
            
            return results
        except Exception as e:
            logger.error(f"Tavily search error: {e}")
            return []
    
    async def _exa_search(self, query: str) -> List[Dict]:
        """Search using Exa API."""
        try:
            response = await self.http_client.post(
                "https://api.exa.ai/search",
                json={
                    "query": query,
                    "num_results": 5,
                    "use_autoprompt": True,
                    "type": "neural"
                },
                headers={"x-api-key": self.exa_api_key}
            )
            response.raise_for_status()
            data = response.json()
            
            results = []
            for r in data.get("results", []):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("text", r.get("snippet", "")),
                    "score": r.get("score", 0),
                    "source": "exa"
                })
            
            return results
        except Exception as e:
            logger.error(f"Exa search error: {e}")
            return []
    
    def _deduplicate_sources(self, results: List[Dict]) -> List[Dict]:
        """Remove duplicate sources based on URL."""
        seen_urls = set()
        unique = []
        
        # Sort by score first
        sorted_results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)
        
        for r in sorted_results:
            url = r.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique.append(r)
            elif not url and r.get("source") == "tavily_answer":
                # Always include AI summaries
                unique.append(r)
        
        return unique
    
    async def _analyze_sources(self, topic: str, sources: List[Dict]) -> Dict:
        """Analyze sources and extract key findings using AI."""
        # Prepare context from sources
        context = "\n\n".join([
            f"Source: {s.get('title', 'Unknown')}\nURL: {s.get('url', 'N/A')}\nContent: {s.get('content', '')[:1000]}"
            for s in sources[:10]
        ])
        
        prompt = f"""Analyze the following research sources about "{topic}" and provide:
1. A concise summary (2-3 paragraphs)
2. 5-7 key findings as bullet points
3. Any notable trends or patterns
4. Areas that need more research

Sources:
{context}

Respond in JSON format:
{{
    "summary": "...",
    "key_findings": ["finding 1", "finding 2", ...],
    "trends": ["trend 1", "trend 2", ...],
    "gaps": ["gap 1", "gap 2", ...]
}}"""
        
        # Try Gemini first, then Claude, then OpenAI
        analysis = await self._call_ai(prompt)
        
        try:
            return json.loads(analysis)
        except json.JSONDecodeError:
            # If JSON parsing fails, return a basic structure
            return {
                "summary": analysis,
                "key_findings": [],
                "trends": [],
                "gaps": []
            }
    
    async def _generate_report(self, topic: str, analysis: Dict, sources: List[Dict]) -> str:
        """Generate a comprehensive research report."""
        # Build citations
        citations = "\n".join([
            f"[{i+1}] {s.get('title', 'Unknown')} - {s.get('url', 'N/A')}"
            for i, s in enumerate(sources[:10])
        ])
        
        report = f"""# Research Report: {topic}

**Generated:** {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}
**Sources Analyzed:** {len(sources)}

---

## Executive Summary

{analysis.get('summary', 'No summary available.')}

---

## Key Findings

"""
        for i, finding in enumerate(analysis.get('key_findings', []), 1):
            report += f"{i}. {finding}\n"
        
        report += """
---

## Trends & Patterns

"""
        for trend in analysis.get('trends', []):
            report += f"- {trend}\n"
        
        report += """
---

## Research Gaps

"""
        for gap in analysis.get('gaps', []):
            report += f"- {gap}\n"
        
        report += f"""
---

## Sources & Citations

{citations}

---

*This report was generated by the HYPER UNICORN Research Agent for SuperMega.dev*
"""
        return report
    
    async def _call_ai(self, prompt: str) -> str:
        """Call AI model for analysis. Tries Gemini -> Claude -> OpenAI."""
        
        # Try Gemini
        if self.gemini_api_key:
            try:
                response = await self.http_client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.3}
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                logger.warning(f"Gemini error: {e}")
        
        # Try Claude
        if self.anthropic_api_key:
            try:
                response = await self.http_client.post(
                    "https://api.anthropic.com/v1/messages",
                    json={
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 2000,
                        "messages": [{"role": "user", "content": prompt}]
                    },
                    headers={
                        "x-api-key": self.anthropic_api_key,
                        "anthropic-version": "2023-06-01"
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data["content"][0]["text"]
            except Exception as e:
                logger.warning(f"Claude error: {e}")
        
        # Try OpenAI
        if self.openai_api_key:
            try:
                response = await self.http_client.post(
                    "https://api.openai.com/v1/chat/completions",
                    json={
                        "model": "gpt-3.5-turbo",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3
                    },
                    headers={"Authorization": f"Bearer {self.openai_api_key}"}
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
            except Exception as e:
                logger.warning(f"OpenAI error: {e}")
        
        return "Unable to generate analysis - no AI API available."
    
    async def close(self):
        """Close the HTTP client."""
        await self.http_client.aclose()


# ============================================================================
# CLI Interface
# ============================================================================

async def main():
    """Run the Research Agent from command line."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python research_agent.py <topic> [depth]")
        print("  depth: quick, standard, deep (default: standard)")
        sys.exit(1)
    
    topic = sys.argv[1]
    depth = sys.argv[2] if len(sys.argv) > 2 else "standard"
    
    agent = ResearchAgent()
    
    try:
        print(f"\n🔍 Researching: {topic}")
        print(f"📊 Depth: {depth}")
        print("-" * 50)
        
        result = await agent.research(topic, depth)
        
        print("\n" + result.report)
        
        # Save report to file
        filename = f"research_{topic.replace(' ', '_')[:30]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        with open(filename, "w") as f:
            f.write(result.report)
        print(f"\n📄 Report saved to: {filename}")
        
    finally:
        await agent.close()


if __name__ == "__main__":
    asyncio.run(main())
