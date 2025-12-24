"""
Content Agent
=============
An autonomous agent specialized in content creation and management.
Can write articles, reports, social media posts, and more.

Capabilities:
- Article and blog post writing
- Report generation
- Social media content
- Email drafting
- Documentation writing
- Content optimization

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
logger = logging.getLogger("ContentAgent")


@dataclass
class ContentTask:
    """A content creation task."""
    content_type: str  # article, report, social, email, documentation
    topic: str
    tone: str = "professional"  # professional, casual, formal, friendly
    length: str = "medium"  # short, medium, long
    audience: str = "general"
    additional_instructions: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class ContentResult:
    """Result of a content creation task."""
    task: ContentTask
    content: str
    metadata: Dict
    variations: Optional[List[str]] = None
    seo_suggestions: Optional[Dict] = None
    completed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class ContentAgent:
    """
    Autonomous Content Agent
    
    This agent creates high-quality content by:
    1. Understanding the content requirements
    2. Researching the topic (if needed)
    3. Creating an outline
    4. Writing the content
    5. Optimizing for the target audience
    """
    
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        self.http_client = httpx.AsyncClient(timeout=120.0)
        self.task_history: List[ContentResult] = []
        
        # Content type configurations
        self.content_configs = {
            "article": {
                "short": 500,
                "medium": 1200,
                "long": 2500
            },
            "report": {
                "short": 1000,
                "medium": 2500,
                "long": 5000
            },
            "social": {
                "short": 100,
                "medium": 200,
                "long": 280
            },
            "email": {
                "short": 100,
                "medium": 250,
                "long": 500
            },
            "documentation": {
                "short": 500,
                "medium": 1500,
                "long": 3000
            }
        }
    
    async def create_content(
        self,
        content_type: str,
        topic: str,
        tone: str = "professional",
        length: str = "medium",
        audience: str = "general",
        additional_instructions: Optional[str] = None
    ) -> ContentResult:
        """
        Create content based on specifications.
        
        Args:
            content_type: Type of content (article, report, social, email, documentation)
            topic: The topic or subject
            tone: Writing tone
            length: Content length
            audience: Target audience
            additional_instructions: Any extra requirements
        
        Returns:
            ContentResult with the created content
        """
        task = ContentTask(
            content_type=content_type,
            topic=topic,
            tone=tone,
            length=length,
            audience=audience,
            additional_instructions=additional_instructions
        )
        
        logger.info(f"Creating {content_type} about: {topic}")
        
        # Route to appropriate content creator
        if content_type == "article":
            content, metadata = await self._create_article(task)
        elif content_type == "report":
            content, metadata = await self._create_report(task)
        elif content_type == "social":
            content, metadata = await self._create_social_post(task)
        elif content_type == "email":
            content, metadata = await self._create_email(task)
        elif content_type == "documentation":
            content, metadata = await self._create_documentation(task)
        else:
            content, metadata = await self._create_generic(task)
        
        # Generate SEO suggestions for articles
        seo_suggestions = None
        if content_type in ["article", "documentation"]:
            seo_suggestions = await self._generate_seo_suggestions(topic, content)
        
        result = ContentResult(
            task=task,
            content=content,
            metadata=metadata,
            seo_suggestions=seo_suggestions
        )
        
        self.task_history.append(result)
        return result
    
    async def _create_article(self, task: ContentTask) -> tuple[str, Dict]:
        """Create a blog article or news piece."""
        word_count = self.content_configs["article"][task.length]
        
        prompt = f"""Write a {task.tone} article about: {task.topic}

Target audience: {task.audience}
Target length: approximately {word_count} words
{f"Additional instructions: {task.additional_instructions}" if task.additional_instructions else ""}

Structure:
1. Engaging headline
2. Hook/introduction that captures attention
3. Main body with clear sections and subheadings
4. Practical insights or takeaways
5. Strong conclusion with call-to-action

Write in a {task.tone} tone that resonates with {task.audience} readers.
Use markdown formatting with proper headings (##, ###)."""
        
        content = await self._call_ai(prompt)
        
        metadata = {
            "type": "article",
            "word_count": len(content.split()),
            "reading_time_minutes": len(content.split()) // 200,
            "tone": task.tone,
            "audience": task.audience
        }
        
        return content, metadata
    
    async def _create_report(self, task: ContentTask) -> tuple[str, Dict]:
        """Create a professional report."""
        word_count = self.content_configs["report"][task.length]
        
        prompt = f"""Write a professional report about: {task.topic}

Target audience: {task.audience}
Target length: approximately {word_count} words
Tone: {task.tone}
{f"Additional instructions: {task.additional_instructions}" if task.additional_instructions else ""}

Structure:
1. Executive Summary
2. Introduction/Background
3. Key Findings (with data points if applicable)
4. Analysis
5. Recommendations
6. Conclusion
7. References/Sources (if applicable)

Use markdown formatting with proper headings.
Include bullet points and numbered lists where appropriate.
Be data-driven and objective."""
        
        content = await self._call_ai(prompt)
        
        metadata = {
            "type": "report",
            "word_count": len(content.split()),
            "sections": content.count("##"),
            "tone": task.tone
        }
        
        return content, metadata
    
    async def _create_social_post(self, task: ContentTask) -> tuple[str, Dict]:
        """Create social media content."""
        char_limit = self.content_configs["social"][task.length]
        
        prompt = f"""Create a social media post about: {task.topic}

Platform guidelines:
- Maximum {char_limit} characters
- Tone: {task.tone}
- Target audience: {task.audience}
{f"Additional instructions: {task.additional_instructions}" if task.additional_instructions else ""}

Requirements:
1. Attention-grabbing opening
2. Clear message
3. Relevant hashtags (3-5)
4. Call-to-action if appropriate
5. Emoji usage appropriate for the tone

Also provide:
- 2 alternative versions
- Best posting time suggestion
- Engagement tips"""
        
        response = await self._call_ai(prompt)
        
        # Parse the response to extract main post and variations
        content = response
        
        metadata = {
            "type": "social",
            "character_count": len(response.split("\n")[0]) if response else 0,
            "platform_optimized": True,
            "tone": task.tone
        }
        
        return content, metadata
    
    async def _create_email(self, task: ContentTask) -> tuple[str, Dict]:
        """Create an email draft."""
        word_count = self.content_configs["email"][task.length]
        
        prompt = f"""Write a {task.tone} email about: {task.topic}

Target recipient: {task.audience}
Target length: approximately {word_count} words
{f"Additional instructions: {task.additional_instructions}" if task.additional_instructions else ""}

Provide:
1. Subject line (compelling and clear)
2. Email body with:
   - Professional greeting
   - Clear purpose statement
   - Main content
   - Call-to-action
   - Professional sign-off

Format as:
Subject: [subject line]

[email body]"""
        
        content = await self._call_ai(prompt)
        
        # Extract subject line
        subject = ""
        if "Subject:" in content:
            lines = content.split("\n")
            for line in lines:
                if line.startswith("Subject:"):
                    subject = line.replace("Subject:", "").strip()
                    break
        
        metadata = {
            "type": "email",
            "subject": subject,
            "word_count": len(content.split()),
            "tone": task.tone
        }
        
        return content, metadata
    
    async def _create_documentation(self, task: ContentTask) -> tuple[str, Dict]:
        """Create technical documentation."""
        word_count = self.content_configs["documentation"][task.length]
        
        prompt = f"""Write technical documentation about: {task.topic}

Target audience: {task.audience}
Target length: approximately {word_count} words
Tone: {task.tone}
{f"Additional instructions: {task.additional_instructions}" if task.additional_instructions else ""}

Structure:
1. Overview/Introduction
2. Prerequisites (if applicable)
3. Getting Started
4. Core Concepts
5. Usage Examples
6. API Reference (if applicable)
7. Troubleshooting
8. FAQ

Use markdown formatting with:
- Clear headings hierarchy
- Code blocks where appropriate
- Tables for structured data
- Bullet points for lists
- Notes/warnings/tips callouts"""
        
        content = await self._call_ai(prompt)
        
        metadata = {
            "type": "documentation",
            "word_count": len(content.split()),
            "code_blocks": content.count("```"),
            "sections": content.count("##")
        }
        
        return content, metadata
    
    async def _create_generic(self, task: ContentTask) -> tuple[str, Dict]:
        """Create generic content."""
        prompt = f"""Create content about: {task.topic}

Type: {task.content_type}
Tone: {task.tone}
Length: {task.length}
Audience: {task.audience}
{f"Additional instructions: {task.additional_instructions}" if task.additional_instructions else ""}

Create high-quality, engaging content appropriate for the specified parameters."""
        
        content = await self._call_ai(prompt)
        
        metadata = {
            "type": task.content_type,
            "word_count": len(content.split()),
            "tone": task.tone
        }
        
        return content, metadata
    
    async def _generate_seo_suggestions(self, topic: str, content: str) -> Dict:
        """Generate SEO optimization suggestions."""
        prompt = f"""Analyze this content for SEO and provide optimization suggestions:

Topic: {topic}

Content (first 1000 chars):
{content[:1000]}

Provide in JSON format:
{{
    "primary_keyword": "main keyword to target",
    "secondary_keywords": ["keyword1", "keyword2", "keyword3"],
    "meta_description": "150-160 character meta description",
    "title_suggestions": ["title option 1", "title option 2"],
    "improvements": ["suggestion 1", "suggestion 2"],
    "readability_score": "easy/medium/hard",
    "keyword_density_recommendation": "percentage"
}}"""
        
        response = await self._call_ai(prompt)
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"raw_suggestions": response}
    
    async def rewrite_content(
        self,
        content: str,
        new_tone: Optional[str] = None,
        new_audience: Optional[str] = None,
        improvements: Optional[List[str]] = None
    ) -> str:
        """Rewrite existing content with new parameters."""
        instructions = []
        if new_tone:
            instructions.append(f"Change the tone to: {new_tone}")
        if new_audience:
            instructions.append(f"Adapt for audience: {new_audience}")
        if improvements:
            instructions.append(f"Make these improvements: {', '.join(improvements)}")
        
        prompt = f"""Rewrite the following content with these changes:
{chr(10).join(instructions)}

Original content:
{content}

Maintain the core message while applying the requested changes."""
        
        return await self._call_ai(prompt)
    
    async def generate_variations(
        self,
        content: str,
        num_variations: int = 3
    ) -> List[str]:
        """Generate variations of content."""
        prompt = f"""Create {num_variations} different variations of this content.
Each variation should:
- Maintain the same core message
- Use different wording and structure
- Appeal to slightly different perspectives

Original content:
{content}

Format each variation clearly numbered."""
        
        response = await self._call_ai(prompt)
        
        # Parse variations from response
        variations = []
        current_variation = []
        
        for line in response.split("\n"):
            if line.strip().startswith(("1.", "2.", "3.", "4.", "5.", "Variation")):
                if current_variation:
                    variations.append("\n".join(current_variation).strip())
                current_variation = []
            current_variation.append(line)
        
        if current_variation:
            variations.append("\n".join(current_variation).strip())
        
        return variations[:num_variations]
    
    async def _call_ai(self, prompt: str) -> str:
        """Call AI model. Tries Gemini -> Claude -> OpenAI."""
        
        # Try Gemini first (good for content)
        if self.gemini_api_key:
            try:
                response = await self.http_client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.7}
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
                        "max_tokens": 4000,
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
                        "temperature": 0.7
                    },
                    headers={"Authorization": f"Bearer {self.openai_api_key}"}
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
            except Exception as e:
                logger.warning(f"OpenAI error: {e}")
        
        return "Unable to generate content - no AI API available."
    
    async def close(self):
        """Close the HTTP client."""
        await self.http_client.aclose()


# ============================================================================
# CLI Interface
# ============================================================================

async def main():
    """Run the Content Agent from command line."""
    import sys
    
    print("""
╔═══════════════════════════════════════════════════════════╗
║                  CONTENT AGENT v1.0                       ║
║            Autonomous Content Creation                    ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python content_agent.py <type> '<topic>' [tone] [length] [audience]")
        print("")
        print("Types: article, report, social, email, documentation")
        print("Tones: professional, casual, formal, friendly")
        print("Lengths: short, medium, long")
        print("")
        print("Example:")
        print("  python content_agent.py article 'AI in Healthcare' professional medium")
        sys.exit(1)
    
    content_type = sys.argv[1]
    topic = sys.argv[2]
    tone = sys.argv[3] if len(sys.argv) > 3 else "professional"
    length = sys.argv[4] if len(sys.argv) > 4 else "medium"
    audience = sys.argv[5] if len(sys.argv) > 5 else "general"
    
    agent = ContentAgent()
    
    try:
        print(f"\n✍️  Creating {content_type}...")
        print(f"📝 Topic: {topic}")
        print(f"🎯 Tone: {tone} | Length: {length} | Audience: {audience}")
        print("-" * 50)
        
        result = await agent.create_content(
            content_type=content_type,
            topic=topic,
            tone=tone,
            length=length,
            audience=audience
        )
        
        print("\n📄 Generated Content:")
        print("=" * 50)
        print(result.content)
        print("=" * 50)
        
        print(f"\n📊 Metadata:")
        for key, value in result.metadata.items():
            print(f"   {key}: {value}")
        
        if result.seo_suggestions:
            print(f"\n🔍 SEO Suggestions:")
            print(json.dumps(result.seo_suggestions, indent=2))
        
        # Save to file
        filename = f"{content_type}_{topic.replace(' ', '_')[:20]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        with open(filename, "w") as f:
            f.write(result.content)
        print(f"\n💾 Content saved to: {filename}")
        
    finally:
        await agent.close()


if __name__ == "__main__":
    asyncio.run(main())
