#!/usr/bin/env python3
"""
Super Mega Content Generation Agent
Professional content creation with brand consistency and SEO optimization
"""

import os
import json
import openai
from datetime import datetime
from typing import Dict, List, Optional
import requests

class ContentGenerationAgent:
    """
    Professional content generation agent with multi-format support
    """
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.brand_voice = {
            'professional': 'Clear, authoritative, and business-focused',
            'technical': 'Precise, detailed, and expertise-driven',
            'casual': 'Conversational, approachable, and engaging',
            'creative': 'Innovative, inspiring, and thought-provoking'
        }
        
        self.content_templates = {
            'social_media': {
                'structure': 'Hook + Value + Call to Action',
                'max_length': 280,
                'hashtags': True,
                'engagement_focus': True
            },
            'blog_article': {
                'structure': 'Title + Introduction + Body + Conclusion',
                'min_length': 800,
                'seo_focus': True,
                'headers': True
            },
            'email_campaign': {
                'structure': 'Subject + Greeting + Value + CTA',
                'personalization': True,
                'conversion_focus': True
            },
            'product_description': {
                'structure': 'Benefits + Features + Specifications',
                'persuasion_focus': True,
                'seo_keywords': True
            }
        }
        
        # Initialize OpenAI if API key is available
        if self.api_key:
            openai.api_key = self.api_key
            self.ai_enabled = True
        else:
            self.ai_enabled = False
            print("⚠️ OpenAI API key not found. Using template-based generation.")
    
    def generate_content(self, 
                        content_type: str, 
                        topic: str, 
                        tone: str = 'professional',
                        target_length: str = 'medium',
                        additional_context: str = '') -> Dict:
        """
        Generate content based on parameters
        
        Args:
            content_type: Type of content (social_media, blog_article, email_campaign, product_description)
            topic: Main topic or keywords
            tone: Brand voice tone
            target_length: short, medium, or long
            additional_context: Extra context or requirements
            
        Returns:
            Dict with generated content and metadata
        """
        
        if self.ai_enabled:
            return self._generate_ai_content(content_type, topic, tone, target_length, additional_context)
        else:
            return self._generate_template_content(content_type, topic, tone, target_length)
    
    def _generate_ai_content(self, content_type: str, topic: str, tone: str, target_length: str, additional_context: str) -> Dict:
        """Generate content using OpenAI API"""
        
        template = self.content_templates.get(content_type, {})
        voice_description = self.brand_voice.get(tone, 'professional')
        
        length_guide = {
            'short': '50-150 words',
            'medium': '150-300 words', 
            'long': '300+ words'
        }
        
        prompt = f"""
        Create {content_type.replace('_', ' ')} content about: {topic}
        
        Requirements:
        - Tone: {voice_description}
        - Length: {length_guide.get(target_length, 'medium')}
        - Structure: {template.get('structure', 'Standard format')}
        - Additional context: {additional_context}
        
        Make it professional, engaging, and brand-appropriate for Super Mega Inc - an enterprise AI solutions company.
        """
        
        try:
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are a professional content creator for Super Mega Inc, specializing in enterprise AI solutions."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=800,
                temperature=0.7
            )
            
            content = response.choices[0].message.content
            
            return {
                'content': content,
                'type': content_type,
                'topic': topic,
                'tone': tone,
                'length': target_length,
                'generated_at': datetime.now().isoformat(),
                'word_count': len(content.split()),
                'ai_generated': True,
                'quality_score': self._calculate_quality_score(content, content_type)
            }
            
        except Exception as e:
            print(f"AI generation failed: {e}")
            return self._generate_template_content(content_type, topic, tone, target_length)
    
    def _generate_template_content(self, content_type: str, topic: str, tone: str, target_length: str) -> Dict:
        """Generate content using templates (fallback)"""
        
        templates = {
            'social_media': f"""🚀 Exciting developments in {topic}! 

Our latest insights reveal significant opportunities in this space. As leaders in enterprise AI solutions, Super Mega Inc continues to innovate and deliver results that matter.

Ready to transform your approach to {topic}? Let's discuss how our AI agents can help.

#Innovation #{topic.replace(' ', '')} #EnterpriseAI #SuperMega""",
            
            'blog_article': f"""# Mastering {topic}: A Professional Guide

## Introduction

In today's rapidly evolving business landscape, {topic} has become a critical factor for success. Understanding how to leverage this effectively can provide significant competitive advantages.

## Key Insights

Our experience with enterprise clients has shown that a strategic approach to {topic} yields measurable results. Here's what you need to know:

### Best Practices
- Focus on strategic implementation
- Measure performance consistently  
- Adapt based on real data

## Conclusion

{topic} represents both an opportunity and a challenge. With the right approach and tools, organizations can achieve remarkable results.

Contact Super Mega Inc to learn how our AI solutions can optimize your {topic} strategy.""",
            
            'email_campaign': f"""Subject: Transform Your {topic} Strategy with AI

Dear [Name],

We hope this message finds you well. At Super Mega Inc, we've been working with enterprise clients to revolutionize their approach to {topic}.

Our AI-powered solutions have helped organizations achieve:
• 40% improvement in efficiency
• Reduced operational costs
• Better strategic outcomes

Would you be interested in a brief conversation about how we could help optimize your {topic} processes?

Best regards,
The Super Mega Team

P.S. We're offering complimentary strategy sessions this month.""",
            
            'product_description': f"""# Professional {topic} Solution

Transform your {topic} capabilities with our enterprise-grade AI platform. Designed for organizations that demand excellence, reliability, and measurable results.

## Key Benefits
- **Efficiency**: Streamline operations and reduce manual effort
- **Accuracy**: AI-powered precision in every task
- **Scalability**: Grows with your business needs
- **Integration**: Seamless connection with existing systems

## Features
- Advanced AI algorithms
- Real-time monitoring
- Comprehensive analytics
- 24/7 professional support

## Why Choose Super Mega?
Our {topic} solution combines cutting-edge technology with proven business expertise. No fake metrics, no inflated promises - just reliable results.

Ready to upgrade your {topic} strategy? Contact us for a personalized demonstration."""
        }
        
        content = templates.get(content_type, f"Professional content about {topic} - {tone} tone")
        
        return {
            'content': content,
            'type': content_type,
            'topic': topic,
            'tone': tone,
            'length': target_length,
            'generated_at': datetime.now().isoformat(),
            'word_count': len(content.split()),
            'ai_generated': False,
            'template_based': True,
            'quality_score': self._calculate_quality_score(content, content_type)
        }
    
    def _calculate_quality_score(self, content: str, content_type: str) -> float:
        """Calculate content quality score based on various factors"""
        
        score = 100.0
        word_count = len(content.split())
        
        # Length appropriateness
        if content_type == 'social_media' and word_count > 50:
            score -= 5
        elif content_type == 'blog_article' and word_count < 200:
            score -= 10
            
        # Brand mentions
        if 'super mega' in content.lower():
            score += 5
            
        # Call to action presence
        cta_words = ['contact', 'learn more', 'discover', 'get started', 'try now']
        if any(word in content.lower() for word in cta_words):
            score += 5
            
        # Professional language
        if any(word in content.lower() for word in ['professional', 'enterprise', 'solution']):
            score += 5
            
        return min(100.0, max(60.0, score))
    
    def optimize_for_seo(self, content: str, target_keywords: List[str]) -> str:
        """Optimize content for SEO"""
        
        # Simple SEO optimization (can be enhanced with AI)
        optimized = content
        
        # Ensure keywords appear naturally
        for keyword in target_keywords:
            if keyword.lower() not in content.lower():
                # Add keyword naturally if missing
                optimized += f"\n\nLearn more about {keyword} solutions from Super Mega Inc."
        
        return optimized
    
    def generate_social_media_variants(self, base_content: str, platforms: List[str]) -> Dict:
        """Generate platform-specific variants"""
        
        variants = {}
        
        platform_specs = {
            'twitter': {'max_length': 280, 'hashtag_limit': 3},
            'linkedin': {'max_length': 1300, 'professional_tone': True},
            'facebook': {'max_length': 500, 'engagement_focus': True},
            'instagram': {'visual_focus': True, 'hashtag_limit': 10}
        }
        
        for platform in platforms:
            spec = platform_specs.get(platform, {})
            
            # Basic platform adaptation (can be enhanced with AI)
            if platform == 'twitter' and len(base_content) > 280:
                variants[platform] = base_content[:270] + "... 1/2"
            elif platform == 'linkedin':
                variants[platform] = f"Professional insight:\n\n{base_content}\n\n#Enterprise #AI #Innovation"
            else:
                variants[platform] = base_content
                
        return variants

# Usage example and testing
if __name__ == "__main__":
    agent = ContentGenerationAgent()
    
    # Test content generation
    result = agent.generate_content(
        content_type='social_media',
        topic='AI automation',
        tone='professional',
        target_length='short'
    )
    
    print("Generated Content:")
    print("=" * 50)
    print(result['content'])
    print("\nMetadata:")
    print(f"Quality Score: {result['quality_score']}/100")
    print(f"Word Count: {result['word_count']}")
    print(f"AI Generated: {result.get('ai_generated', False)}")
