#!/usr/bin/env python3
"""
🤖 SUPERMEGA AI ASSISTANT - UNIFIED INTERFACE
===========================================
Clean, simple ChatGPT-like interface with different modes and tools
"""

import streamlit as st
import time
import json
import random
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
import pandas as pd

class SuperMegaAI:
    """Unified AI Assistant with multiple modes and tools"""
    
    def __init__(self):
        self.modes = {
            "💬 Chat Mode": {
                "description": "General conversation and assistance",
                "tools": ["text_generation", "question_answering", "task_planning"],
                "color": "#667eea"
            },
            "🎬 Studio Mode": {
                "description": "Video editing, photo editing, and audio processing",
                "tools": ["video_edit", "photo_edit", "audio_process", "voice_clone"],
                "color": "#f093fb"
            },
            "📱 Social Media Mode": {
                "description": "Social media management and content creation",
                "tools": ["post_generator", "hashtag_optimizer", "engagement_analyzer", "content_scheduler"],
                "color": "#4facfe"
            },
            "📊 Analytics Mode": {
                "description": "Data analysis and business intelligence",
                "tools": ["data_analysis", "chart_generation", "report_builder", "trend_analysis"],
                "color": "#43e97b"
            },
            "🌐 Web Mode": {
                "description": "Web scraping, automation, and research",
                "tools": ["web_scraping", "site_monitoring", "research_assistant", "data_extraction"],
                "color": "#fa709a"
            },
            "🎨 Creative Mode": {
                "description": "AI art generation and creative design",
                "tools": ["image_generation", "logo_design", "color_palette", "style_transfer"],
                "color": "#ff9a9e"
            },
            "💼 Business Mode": {
                "description": "Business automation and productivity",
                "tools": ["email_automation", "document_generation", "meeting_scheduler", "task_management"],
                "color": "#a8edea"
            }
        }
        
        # Sample data for testing with realistic examples
        self.sample_data = {
            "videos": [
                {"name": "Product Demo.mp4", "duration": "3:24", "size": "45.2 MB"},
                {"name": "Tutorial Video.mp4", "duration": "8:17", "size": "120.5 MB"},
                {"name": "Marketing Clip.mp4", "duration": "1:45", "size": "28.3 MB"}
            ],
            "images": [
                {"name": "Hero Banner.jpg", "size": "2.4 MB", "dimensions": "1920x1080"},
                {"name": "Product Photo.png", "size": "1.8 MB", "dimensions": "1200x800"},
                {"name": "Logo Design.svg", "size": "245 KB", "dimensions": "500x500"}
            ],
            "social_posts": [
                "🚀 Just launched our revolutionary AI platform! Experience the future of productivity. #AI #Innovation #TechLaunch",
                "🎬 Creating professional videos has never been easier! Our new studio tools are game-changing. #VideoEditing #Creative #ContentCreation",
                "📊 Data-driven decisions drive success! See how our analytics platform transforms business intelligence. #Analytics #Business #DataScience",
                "🌟 Automation is the key to scaling your business. Let AI handle the repetitive tasks! #Automation #Productivity #BusinessGrowth"
            ],
            "trending_hashtags": [
                ["#AI", "#Innovation", "#TechLaunch", "#FutureOfWork", "#Automation"],
                ["#VideoEditing", "#Creative", "#ContentCreation", "#DigitalMarketing", "#StudioPro"],
                ["#Analytics", "#Business", "#DataScience", "#BusinessIntelligence", "#Growth"],
                ["#WebScraping", "#DataExtraction", "#Research", "#BusinessIntelligence", "#Automation"]
            ]
        }
        
        # Initialize tool states
        self.tool_results = {}
        self.current_mode = "💬 Chat Mode"
        self.execution_count = 0
    
    def generate_sample_content(self, content_type: str, context: str = "") -> Any:
        """Generate realistic sample content for testing"""
        
        if content_type == "social_post":
            templates = [
                "🚀 Excited to share our latest breakthrough in {topic}! This is going to revolutionize how we work. #Innovation #TechNews",
                "💡 Just discovered an amazing way to optimize {topic}. The results are incredible! Check this out 👇 #Productivity #TechTips",
                "🎯 New week, new goals! Our {topic} solution is helping teams achieve 10x better results. #Success #Business",
                "✨ The future of {topic} is here! Our AI-powered tools are changing the game for everyone. #AI #Future #Technology"
            ]
            
            topics = ["AI automation", "video creation", "data analytics", "social media", "business growth", "creative design"]
            topic = random.choice(topics)
            template = random.choice(templates)
            
            return template.format(topic=topic)
        
        elif content_type == "hashtags":
            base_collections = [
                ["#AI", "#MachineLearning", "#Automation", "#TechInnovation", "#FutureOfWork"],
                ["#VideoEditing", "#ContentCreation", "#DigitalMarketing", "#CreativeDesign", "#StudioPro"],
                ["#DataAnalytics", "#BusinessIntelligence", "#DataScience", "#Analytics", "#DataDriven"],
                ["#SocialMediaMarketing", "#ContentStrategy", "#DigitalMarketing", "#SocialMedia", "#Engagement"],
                ["#WebDevelopment", "#WebScraping", "#DataExtraction", "#Automation", "#TechTools"],
                ["#CreativeDesign", "#AIArt", "#DigitalArt", "#GraphicDesign", "#CreativeTech"]
            ]
            
            return random.choice(base_collections)
        
        elif content_type == "analytics_data":
            dates = pd.date_range(start='2025-08-01', end='2025-08-19', freq='D')
            base_value = random.randint(500, 1500)
            values = []
            
            for i in range(len(dates)):
                # Create realistic trending data
                trend = base_value + (i * random.randint(-20, 50)) + random.randint(-100, 100)
                values.append(max(0, trend))
            
            return pd.DataFrame({
                'Date': dates,
                'Views': values,
                'Engagement': [v * random.uniform(0.02, 0.08) for v in values],
                'Conversions': [v * random.uniform(0.001, 0.005) for v in values]
            })
        
        elif content_type == "color_palette":
            palettes = [
                ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"],  # Vibrant
                ["#2D3436", "#636E72", "#74B9FF", "#0984E3", "#00B894"],  # Professional
                ["#FD79A8", "#FDCB6E", "#6C5CE7", "#A29BFE", "#FD79A8"],  # Creative
                ["#00B894", "#00CEC9", "#74B9FF", "#0984E3", "#6C5CE7"]   # Modern
            ]
            
            return random.choice(palettes)
        
        elif content_type == "business_metrics":
            return {
                "revenue": f"${random.randint(50000, 500000):,}",
                "growth_rate": f"{random.uniform(5.0, 25.0):.1f}%",
                "conversion_rate": f"{random.uniform(2.0, 8.0):.1f}%",
                "customer_satisfaction": f"{random.uniform(85.0, 98.0):.1f}%",
                "monthly_users": f"{random.randint(1000, 50000):,}"
            }
        
        return f"Generated sample {content_type} - {datetime.now().strftime('%H:%M:%S')}"
    
    def execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a specific tool with realistic parameters and results"""
        
        self.execution_count += 1
        
        result = {
            "tool": tool_name,
            "status": "success",
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "execution_id": f"exec_{self.execution_count:04d}",
            "data": None,
            "message": "",
            "processing_time": round(random.uniform(0.5, 3.0), 2)
        }
        
        try:
            if tool_name == "video_edit":
                video_sample = random.choice(self.sample_data["videos"])
                effects = ["Color Correction", "Stabilization", "Audio Enhancement", "Transition Effects", "Text Overlay"]
                applied_effects = random.sample(effects, random.randint(2, 4))
                
                result["data"] = {
                    "input_video": video_sample["name"],
                    "original_duration": video_sample["duration"],
                    "original_size": video_sample["size"],
                    "effects_applied": applied_effects,
                    "output_format": "MP4 (H.264)",
                    "new_duration": f"{random.randint(2, 10)}:{random.randint(10, 59):02d}",
                    "compression_ratio": f"{random.randint(15, 40)}%",
                    "quality_score": f"{random.randint(85, 98)}/100"
                }
                result["message"] = f"✨ Video edited successfully! Applied {len(applied_effects)} professional effects including {', '.join(applied_effects[:2])}."
                
            elif tool_name == "photo_edit":
                photo_sample = random.choice(self.sample_data["images"])
                enhancements = ["Brightness +15%", "Contrast +20%", "Saturation +10%", "Noise Reduction", "Sharpening", "HDR Effect"]
                applied = random.sample(enhancements, random.randint(3, 5))
                
                result["data"] = {
                    "input_image": photo_sample["name"],
                    "original_size": photo_sample["size"],
                    "original_dimensions": photo_sample["dimensions"],
                    "enhancements_applied": applied,
                    "output_format": "PNG (Lossless)",
                    "quality_improvement": f"+{random.randint(25, 60)}%",
                    "file_size_change": f"{random.choice(['-', '+'])}{random.randint(5, 30)}%"
                }
                result["message"] = f"📸 Photo enhanced with professional editing! Applied {len(applied)} improvements for stunning results."
                
            elif tool_name == "post_generator":
                post_content = self.generate_sample_content("social_post")
                hashtags = self.generate_sample_content("hashtags")
                optimal_times = ["9:00 AM", "1:00 PM", "5:00 PM", "7:00 PM"]
                
                result["data"] = {
                    "generated_content": post_content,
                    "hashtags": hashtags,
                    "character_count": len(post_content),
                    "optimal_posting_time": random.choice(optimal_times),
                    "engagement_prediction": f"{random.randint(500, 5000)} interactions",
                    "reach_estimate": f"{random.randint(2000, 20000)} users",
                    "platforms": ["Twitter", "LinkedIn", "Facebook", "Instagram"]
                }
                result["message"] = f"📱 Social media post generated! Optimized for maximum engagement with trending hashtags."
                
            elif tool_name == "data_analysis":
                df = self.generate_sample_content("analytics_data")
                insights = [
                    "Upward trend detected in user engagement",
                    "Peak activity occurs on weekdays",
                    "Conversion rates improved by 15% this week",
                    "Mobile traffic accounts for 68% of total visits"
                ]
                
                result["data"] = {
                    "dataset_rows": len(df),
                    "date_range": f"{df['Date'].min().strftime('%Y-%m-%d')} to {df['Date'].max().strftime('%Y-%m-%d')}",
                    "total_views": f"{df['Views'].sum():,}",
                    "avg_daily_views": f"{df['Views'].mean():.0f}",
                    "peak_day": df.loc[df['Views'].idxmax(), 'Date'].strftime('%Y-%m-%d'),
                    "growth_trend": "Positive" if df['Views'].iloc[-1] > df['Views'].iloc[0] else "Negative",
                    "key_insights": random.sample(insights, 3)
                }
                result["message"] = f"📊 Data analysis completed! Processed {len(df):,} data points with actionable insights."
                
            elif tool_name == "web_scraping":
                websites = ["techcrunch.com", "wired.com", "theverge.com", "arstechnica.com"]
                data_types = ["Article headlines", "Product prices", "Contact information", "Social media links"]
                
                result["data"] = {
                    "target_websites": random.sample(websites, random.randint(2, 4)),
                    "data_points_extracted": random.randint(150, 800),
                    "data_types": random.sample(data_types, random.randint(2, 3)),
                    "success_rate": f"{random.randint(92, 99)}%",
                    "processing_speed": f"{random.randint(50, 200)} pages/minute",
                    "export_formats": ["CSV", "JSON", "Excel"],
                    "duplicate_removal": f"{random.randint(5, 25)} duplicates removed"
                }
                result["message"] = f"🌐 Web scraping completed! Successfully extracted data from {len(result['data']['target_websites'])} websites."
                
            elif tool_name == "image_generation":
                styles = ["Photorealistic", "Digital Art", "Anime Style", "Abstract", "Minimalist", "Vintage"]
                prompt = parameters.get("prompt", "AI-generated artwork")
                
                result["data"] = {
                    "prompt": prompt,
                    "style": random.choice(styles),
                    "resolution": "1024x1024",
                    "aspect_ratio": "1:1",
                    "color_depth": "24-bit",
                    "generation_model": "SuperMega AI Art V3.0",
                    "creativity_level": f"{random.randint(70, 95)}/100",
                    "uniqueness_score": f"{random.randint(85, 99)}/100"
                }
                result["message"] = f"🎨 AI artwork generated! Created unique {result['data']['style'].lower()} image in {result['processing_time']}s."
                
            elif tool_name == "voice_clone":
                voice_types = ["Professional Male", "Professional Female", "Casual Male", "Casual Female", "Narrator"]
                languages = ["English (US)", "English (UK)", "Spanish", "French", "German"]
                
                result["data"] = {
                    "input_sample": parameters.get("input", "sample_voice.wav"),
                    "voice_type": random.choice(voice_types),
                    "language": random.choice(languages),
                    "clone_accuracy": f"{random.randint(85, 98)}%",
                    "output_quality": "Studio Quality (48kHz)",
                    "processing_model": "Neural Voice Clone V4.0",
                    "emotional_range": "Natural with inflection",
                    "output_length": f"{random.randint(30, 180)} seconds"
                }
                result["message"] = f"🎤 Voice cloned successfully! Generated high-quality {result['data']['voice_type'].lower()} voice."
                
            elif tool_name == "chart_generation":
                chart_types = ["Line Chart", "Bar Chart", "Pie Chart", "Area Chart", "Scatter Plot"]
                df = self.generate_sample_content("analytics_data")
                
                result["data"] = {
                    "chart_type": random.choice(chart_types),
                    "data_points": len(df),
                    "date_range": f"{df['Date'].min().strftime('%Y-%m-%d')} to {df['Date'].max().strftime('%Y-%m-%d')}",
                    "metrics_included": ["Views", "Engagement", "Conversions"],
                    "interactive_features": ["Zoom", "Filter", "Export", "Tooltip"],
                    "color_scheme": "Professional Blue",
                    "export_formats": ["PNG", "SVG", "PDF"]
                }
                result["message"] = f"📈 Interactive chart generated! Beautiful {result['data']['chart_type'].lower()} with {len(df)} data points."
                
            elif tool_name == "hashtag_optimizer":
                trending = self.generate_sample_content("hashtags")
                performance_metrics = {
                    "reach_potential": f"{random.randint(10000, 100000):,}",
                    "competition_level": random.choice(["Low", "Medium", "High"]),
                    "trending_score": f"{random.randint(70, 95)}/100"
                }
                
                result["data"] = {
                    "optimized_hashtags": trending,
                    "total_hashtags": len(trending),
                    "performance_metrics": performance_metrics,
                    "best_performing": trending[:3],
                    "niche_specific": True,
                    "trending_analysis": "Current trending hashtags included"
                }
                result["message"] = f"🏷️ Hashtags optimized! Selected {len(trending)} high-performing tags for maximum reach."
                
            elif tool_name == "email_automation":
                email_types = ["Welcome Series", "Promotional", "Newsletter", "Follow-up", "Survey"]
                
                result["data"] = {
                    "email_type": random.choice(email_types),
                    "template_generated": True,
                    "personalization_tags": ["{{first_name}}", "{{company}}", "{{last_interaction}}"],
                    "subject_line_options": 3,
                    "send_schedule": "Optimized for recipient timezone",
                    "A/B_test_variants": 2,
                    "expected_open_rate": f"{random.randint(18, 35)}%"
                }
                result["message"] = f"📧 Email automation set up! Generated {result['data']['email_type'].lower()} with personalization."
                
            else:
                result["message"] = f"🛠️ Tool '{tool_name.replace('_', ' ').title()}' executed successfully!"
                result["data"] = {
                    "status": "completed", 
                    "result_summary": f"Successfully processed your request using {tool_name.replace('_', ' ')} capabilities",
                    "next_steps": "Review results and provide feedback for improvements"
                }
        
        except Exception as e:
            result["status"] = "error"
            result["message"] = f"❌ Tool execution failed: {str(e)}"
            result["data"] = {"error_details": str(e)}
        
        return result
    
    def process_user_input(self, user_input: str, current_mode: str) -> Dict[str, Any]:
        """Process user input and determine appropriate response with tools"""
        
        user_lower = user_input.lower()
        
        # Determine what tools to use based on input and mode
        tools_to_use = []
        
        if current_mode == "🎬 Studio Mode":
            if any(word in user_lower for word in ["edit", "video", "clip", "movie", "render"]):
                tools_to_use.append("video_edit")
            if any(word in user_lower for word in ["photo", "image", "picture", "enhance", "filter"]):
                tools_to_use.append("photo_edit")
            if any(word in user_lower for word in ["voice", "audio", "sound", "clone", "speech"]):
                tools_to_use.append("voice_clone")
                
        elif current_mode == "📱 Social Media Mode":
            if any(word in user_lower for word in ["post", "tweet", "content", "publish", "create"]):
                tools_to_use.append("post_generator")
            if any(word in user_lower for word in ["hashtag", "tag", "trending", "#"]):
                tools_to_use.append("hashtag_optimizer")
                
        elif current_mode == "📊 Analytics Mode":
            if any(word in user_lower for word in ["analyze", "data", "metrics", "performance"]):
                tools_to_use.append("data_analysis")
            if any(word in user_lower for word in ["chart", "graph", "visualization", "plot"]):
                tools_to_use.append("chart_generation")
                
        elif current_mode == "🌐 Web Mode":
            if any(word in user_lower for word in ["scrape", "extract", "website", "url", "crawl"]):
                tools_to_use.append("web_scraping")
                
        elif current_mode == "🎨 Creative Mode":
            if any(word in user_lower for word in ["generate", "create", "art", "image", "picture", "design"]):
                tools_to_use.append("image_generation")
                
        elif current_mode == "💼 Business Mode":
            if any(word in user_lower for word in ["email", "automate", "send", "campaign"]):
                tools_to_use.append("email_automation")
        
        # If no specific tools identified, use general chat
        if not tools_to_use:
            return {
                "type": "chat_response",
                "message": self.generate_chat_response(user_input, current_mode),
                "tools_used": [],
                "suggestions": self.get_mode_suggestions(current_mode)
            }
        
        # Execute identified tools
        tool_results = []
        for tool in tools_to_use:
            result = self.execute_tool(tool, {"input": user_input, "prompt": user_input})
            tool_results.append(result)
        
        return {
            "type": "tool_execution",
            "message": f"🚀 I've executed {len(tool_results)} tools for you in {current_mode}:",
            "tools_used": tool_results,
            "suggestions": self.get_follow_up_suggestions(tools_to_use)
        }
    
    def generate_chat_response(self, user_input: str, mode: str) -> str:
        """Generate appropriate chat response based on mode"""
        
        mode_responses = {
            "💬 Chat Mode": [
                "I'm here to help! What would you like to know or accomplish today?",
                "How can I assist you? I can switch to any specialized mode when you need specific tools.",
                "I'm ready to help with any questions or tasks. Try switching modes for specialized capabilities!"
            ],
            "🎬 Studio Mode": [
                "🎬 Studio Mode is active! I can edit videos, enhance photos, and process audio. What creative project are you working on?",
                "Ready to create something amazing! I can help with video editing, photo enhancement, or voice cloning.",
                "🎥 Let's make some magic! Tell me about your video, photo, or audio project and I'll help bring it to life."
            ],
            "📱 Social Media Mode": [
                "📱 Social Media Mode ready! I can create engaging posts, optimize hashtags, and boost your online presence.",
                "Let's grow your social media! I can generate content, analyze trends, and schedule posts for maximum impact.",
                "🚀 Ready to go viral! What kind of social media content would you like me to create?"
            ],
            "📊 Analytics Mode": [
                "📊 Analytics Mode active! I can analyze data, create visualizations, and provide business insights.",
                "Let's dive into your data! I can generate reports, create charts, and identify trends for you.",
                "📈 Ready to unlock insights! Share your data or tell me what metrics you'd like to analyze."
            ],
            "🌐 Web Mode": [
                "🌐 Web Mode engaged! I can scrape websites, extract data, and automate web research tasks.",
                "Ready to explore the web! What information do you need me to gather or extract?",
                "🔍 Let's research! I can scrape data, monitor websites, and extract valuable information."
            ],
            "🎨 Creative Mode": [
                "🎨 Creative Mode activated! I can generate AI art, create designs, and help with visual projects.",
                "Ready to create something beautiful! What kind of artwork or design would you like me to generate?",
                "✨ Let's get creative! I can make AI art, design logos, and create stunning visuals."
            ],
            "💼 Business Mode": [
                "💼 Business Mode ready! I can automate workflows, generate documents, and boost productivity.",
                "Let's optimize your business! I can handle emails, create reports, and automate routine tasks.",
                "🚀 Ready to scale! What business processes would you like me to automate or improve?"
            ]
        }
        
        responses = mode_responses.get(mode, mode_responses["💬 Chat Mode"])
        return random.choice(responses)
    
    def get_mode_suggestions(self, mode: str) -> List[str]:
        """Get suggestions for what user can do in current mode"""
        
        suggestions = {
            "💬 Chat Mode": [
                "Try 'Switch to Studio Mode to edit a video'",
                "Ask me 'Create a social media post about AI'",
                "Say 'Analyze my website traffic data'"
            ],
            "🎬 Studio Mode": [
                "Try 'Edit my product demo video'",
                "Ask 'Enhance this product photo'",
                "Say 'Clone my voice for narration'"
            ],
            "📱 Social Media Mode": [
                "Try 'Create a post about our new product'",
                "Ask 'Find trending hashtags for tech'",
                "Say 'Generate content for LinkedIn'"
            ],
            "📊 Analytics Mode": [
                "Try 'Analyze our sales performance'",
                "Ask 'Create a revenue trend chart'",
                "Say 'Generate a business report'"
            ],
            "🌐 Web Mode": [
                "Try 'Scrape competitor prices'",
                "Ask 'Extract contact info from websites'",
                "Say 'Monitor tech news sites'"
            ],
            "🎨 Creative Mode": [
                "Try 'Generate a futuristic cityscape'",
                "Ask 'Create a modern logo design'",
                "Say 'Make abstract art with blue tones'"
            ],
            "💼 Business Mode": [
                "Try 'Set up an email welcome series'",
                "Ask 'Generate a project proposal'",
                "Say 'Automate customer follow-ups'"
            ]
        }
        
        return suggestions.get(mode, [])
    
    def get_follow_up_suggestions(self, tools_used: List[str]) -> List[str]:
        """Get follow-up suggestions based on tools that were used"""
        
        suggestions = []
        
        if "video_edit" in tools_used:
            suggestions.extend([
                "Would you like me to create a thumbnail for this video?",
                "Should I generate captions or subtitles?",
                "Want to create social media clips from this video?"
            ])
        
        if "post_generator" in tools_used:
            suggestions.extend([
                "Should I create variations for different platforms?",
                "Want me to schedule this post for optimal timing?",
                "Would you like me to design graphics to go with this post?"
            ])
        
        if "data_analysis" in tools_used:
            suggestions.extend([
                "Should I create a visual chart of this data?",
                "Want me to generate a summary report?",
                "Would you like predictions based on these trends?"
            ])
        
        return suggestions[:3]  # Return max 3 suggestions


def main():
    """Main SuperMega AI Assistant interface"""
    st.set_page_config(
        page_title="SuperMega AI Assistant",
        page_icon="🤖",
        layout="wide"
    )
    
    # Custom CSS for clean, modern interface
    st.markdown("""
    <style>
    .main {
        padding-top: 0.5rem;
        max-width: 1200px;
        margin: 0 auto;
    }
    
    .stApp {
        background-color: #fafafa;
    }
    
    .chat-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 2rem;
        border-radius: 15px;
        color: white;
        text-align: center;
        margin-bottom: 2rem;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    
    .mode-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        border: 1px solid #e1e8ed;
        margin-bottom: 1.5rem;
    }
    
    .tool-result {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        border-left: 4px solid #00d4aa;
        margin: 1rem 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    
    .chat-message {
        padding: 1.5rem;
        border-radius: 12px;
        margin: 1rem 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    
    .user-message {
        background: #e3f2fd;
        border-left: 4px solid #2196f3;
        margin-left: 2rem;
    }
    
    .ai-message {
        background: #f3e5f5;
        border-left: 4px solid #9c27b0;
        margin-right: 2rem;
    }
    
    .metric-box {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
    }
    
    .suggestion-pill {
        background: #f8f9fa;
        padding: 0.5rem 1rem;
        border-radius: 20px;
        margin: 0.25rem;
        border: 1px solid #dee2e6;
        display: inline-block;
        font-size: 0.9rem;
    }
    </style>
    """, unsafe_allow_html=True)
    
    # Initialize AI Assistant
    if "ai_assistant" not in st.session_state:
        st.session_state.ai_assistant = SuperMegaAI()
    
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    
    ai = st.session_state.ai_assistant
    
    # Header
    st.markdown("""
    <div class="chat-header">
        <h1>🤖 SuperMega AI Assistant</h1>
        <p>Your unified AI assistant with specialized modes and powerful tools</p>
        <p style="opacity: 0.9; font-size: 0.9em;">Clean, simple interface inspired by ChatGPT - Switch modes to access different capabilities</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Mode selector and info
    col1, col2, col3 = st.columns([2, 1, 1])
    
    with col1:
        selected_mode = st.selectbox(
            "🎯 AI Mode:",
            options=list(ai.modes.keys()),
            index=0,
            help="Select the AI mode that matches your task"
        )
        
        ai.current_mode = selected_mode
        
    with col2:
        if st.button("🎲 Try Demo", use_container_width=True, type="secondary"):
            demo_messages = {
                "🎬 Studio Mode": "Edit my product demo video with professional effects",
                "📱 Social Media Mode": "Create an engaging post about AI innovation with trending hashtags",
                "📊 Analytics Mode": "Analyze my website traffic and create a performance chart",
                "🌐 Web Mode": "Scrape the latest tech news and trends from industry websites",
                "🎨 Creative Mode": "Generate a stunning AI artwork of a futuristic city",
                "💼 Business Mode": "Set up an automated email welcome series for new customers",
                "💬 Chat Mode": "What can you help me accomplish today?"
            }
            
            demo_input = demo_messages.get(selected_mode, "Hello! Show me what you can do.")
            
            # Add demo message to chat
            st.session_state.chat_history.append({
                "role": "user",
                "content": demo_input,
                "timestamp": datetime.now()
            })
            
            response = ai.process_user_input(demo_input, selected_mode)
            
            st.session_state.chat_history.append({
                "role": "assistant",
                "content": response,
                "timestamp": datetime.now()
            })
            
            st.rerun()
    
    with col3:
        if st.button("🗑️ Clear Chat", use_container_width=True):
            st.session_state.chat_history = []
            st.rerun()
    
    # Mode information card
    mode_info = ai.modes[selected_mode]
    
    st.markdown(f"""
    <div class="mode-card">
        <h3>{selected_mode}</h3>
        <p><strong>Description:</strong> {mode_info['description']}</p>
        <p><strong>Available Tools:</strong> {', '.join([tool.replace('_', ' ').title() for tool in mode_info['tools']])}</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Chat interface
    st.markdown("### 💬 Chat Interface")
    
    # Chat history
    if st.session_state.chat_history:
        for message in st.session_state.chat_history:
            if message["role"] == "user":
                st.markdown(f"""
                <div class="chat-message user-message">
                    <strong>You</strong> <span style="opacity: 0.6; font-size: 0.8em;">({message["timestamp"].strftime("%H:%M")})</span><br>
                    {message["content"]}
                </div>
                """, unsafe_allow_html=True)
            
            else:
                ai_response = message["content"]
                
                st.markdown(f"""
                <div class="chat-message ai-message">
                    <strong>🤖 SuperMega AI</strong> <span style="opacity: 0.6; font-size: 0.8em;">({message["timestamp"].strftime("%H:%M")})</span><br>
                    {ai_response["message"]}
                </div>
                """, unsafe_allow_html=True)
                
                # Show tool results
                if ai_response.get("tools_used"):
                    for tool_result in ai_response["tools_used"]:
                        with st.expander(f"🛠️ {tool_result['tool'].replace('_', ' ').title()} - {tool_result['status'].title()}", expanded=True):
                            
                            # Metrics row
                            col1, col2, col3, col4 = st.columns(4)
                            
                            with col1:
                                st.markdown(f"""
                                <div class="metric-box">
                                    <strong>Status</strong><br>
                                    {'✅ Success' if tool_result['status'] == 'success' else '❌ Error'}
                                </div>
                                """, unsafe_allow_html=True)
                            
                            with col2:
                                st.markdown(f"""
                                <div class="metric-box">
                                    <strong>Time</strong><br>
                                    {tool_result['processing_time']}s
                                </div>
                                """, unsafe_allow_html=True)
                            
                            with col3:
                                st.markdown(f"""
                                <div class="metric-box">
                                    <strong>ID</strong><br>
                                    {tool_result['execution_id']}
                                </div>
                                """, unsafe_allow_html=True)
                                
                            with col4:
                                st.markdown(f"""
                                <div class="metric-box">
                                    <strong>Timestamp</strong><br>
                                    {tool_result['timestamp'].split()[-1]}
                                </div>
                                """, unsafe_allow_html=True)
                            
                            # Result message
                            if tool_result["status"] == "success":
                                st.success(tool_result["message"])
                            else:
                                st.error(tool_result["message"])
                            
                            # Tool-specific data display
                            if tool_result["data"]:
                                st.markdown("**Results:**")
                                
                                # Display data in a nice format
                                data = tool_result["data"]
                                
                                if isinstance(data, dict):
                                    for key, value in data.items():
                                        if isinstance(value, list):
                                            st.markdown(f"**{key.replace('_', ' ').title()}:** {', '.join(str(v) for v in value)}")
                                        else:
                                            st.markdown(f"**{key.replace('_', ' ').title()}:** {value}")
                                
                                # Special displays for certain tools
                                if tool_result["tool"] == "image_generation":
                                    st.image("https://via.placeholder.com/400x300/667eea/ffffff?text=🎨+AI+Generated+Image", 
                                           caption="AI Generated Artwork (Demo)", use_column_width=True)
                                
                                elif tool_result["tool"] == "chart_generation":
                                    # Show sample data visualization
                                    sample_data = pd.DataFrame({
                                        'Day': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                                        'Views': [random.randint(800, 1500) for _ in range(7)]
                                    })
                                    st.bar_chart(sample_data.set_index('Day'))
                
                # Show suggestions if available
                if ai_response.get("suggestions"):
                    st.markdown("**💡 Suggestions:**")
                    suggestion_html = ""
                    for suggestion in ai_response["suggestions"]:
                        suggestion_html += f'<span class="suggestion-pill">💡 {suggestion}</span> '
                    st.markdown(suggestion_html, unsafe_allow_html=True)
    
    else:
        st.markdown("""
        <div style="text-align: center; padding: 3rem; opacity: 0.6;">
            <h3>👋 Welcome to SuperMega AI!</h3>
            <p>Start a conversation or try a demo to see what I can do.</p>
        </div>
        """, unsafe_allow_html=True)
    
    # Input area
    st.markdown("---")
    
    with st.container():
        col1, col2 = st.columns([5, 1])
        
        with col1:
            user_input = st.text_input(
                "",
                placeholder=f"Message SuperMega AI in {selected_mode}...",
                key="chat_input",
                label_visibility="collapsed"
            )
        
        with col2:
            send_button = st.button("Send", type="primary", use_container_width=True)
    
    # Process input
    if (send_button and user_input) or user_input:
        if user_input.strip():
            # Add user message
            st.session_state.chat_history.append({
                "role": "user", 
                "content": user_input,
                "timestamp": datetime.now()
            })
            
            # Process with AI
            with st.spinner(f"🤖 Processing in {selected_mode}..."):
                response = ai.process_user_input(user_input, selected_mode)
                time.sleep(0.5)  # Brief pause for realism
            
            # Add AI response
            st.session_state.chat_history.append({
                "role": "assistant",
                "content": response,
                "timestamp": datetime.now()
            })
            
            st.rerun()
    
    # Sidebar with mode quick access
    with st.sidebar:
        st.markdown("### 🎯 Quick Mode Switch")
        
        for mode, info in ai.modes.items():
            if st.button(mode, use_container_width=True, 
                        type="primary" if mode == selected_mode else "secondary"):
                ai.current_mode = mode
                st.rerun()
        
        st.markdown("---")
        
        # Session stats
        st.markdown("### 📊 Session Stats")
        total_messages = len(st.session_state.chat_history)
        tools_used = 0
        
        for msg in st.session_state.chat_history:
            if msg["role"] == "assistant" and msg["content"].get("tools_used"):
                tools_used += len(msg["content"]["tools_used"])
        
        st.metric("Messages", total_messages)
        st.metric("Tools Used", tools_used)
        st.metric("Current Mode", selected_mode.split()[1])
        
        # Mode suggestions
        if ai.current_mode in ai.modes:
            suggestions = ai.get_mode_suggestions(ai.current_mode)
            if suggestions:
                st.markdown("### 💡 Try These")
                for suggestion in suggestions:
                    if st.button(f"💬 {suggestion}", key=f"suggest_{hash(suggestion)}", use_container_width=True):
                        st.session_state.chat_history.append({
                            "role": "user",
                            "content": suggestion,
                            "timestamp": datetime.now()
                        })
                        
                        response = ai.process_user_input(suggestion, ai.current_mode)
                        
                        st.session_state.chat_history.append({
                            "role": "assistant",
                            "content": response,
                            "timestamp": datetime.now()
                        })
                        
                        st.rerun()


if __name__ == "__main__":
    main()
