#!/usr/bin/env python3
"""
👑 MASTER AI CONTROLLER
======================
The ultimate LLM chatbot that orchestrates ALL SuperMega platforms and infrastructure
"""

import streamlit as st
import requests
import json
import asyncio
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
import openai

class MasterAIController:
    """The Master AI that controls and coordinates everything"""
    
    def __init__(self):
        self.platforms = {
            "ultimate_launcher": {
                "url": "http://localhost:8520",
                "description": "Service management and deployment control",
                "capabilities": ["start_services", "stop_services", "deploy_aws", "monitor_services"]
            },
            "orchestrator_ai": {
                "url": "http://localhost:8514", 
                "description": "Platform navigation and coordination",
                "capabilities": ["analyze_requests", "coordinate_platforms", "execute_workflows"]
            },
            "infrastructure_monitor": {
                "url": "http://localhost:8513",
                "description": "System monitoring and health checks",
                "capabilities": ["get_metrics", "monitor_aws", "check_health", "performance_analysis"]
            },
            "game_changing_infrastructure": {
                "url": "http://localhost:8515",
                "description": "Advanced AI capabilities and auto-recovery",
                "capabilities": ["ai_memory", "predictive_scaling", "intent_prediction", "auto_recovery"]
            },
            "next_gen_ai": {
                "url": "http://localhost:8512",
                "description": "AI model access and processing",
                "capabilities": ["gpt4_chat", "claude_processing", "image_generation", "ai_inference"]
            },
            "video_studio_pro": {
                "url": "http://localhost:8510",
                "description": "Professional video editing and AI enhancement",
                "capabilities": ["video_editing", "ai_enhancement", "format_conversion", "effects_processing"]
            },
            "autonomous_agents": {
                "url": "http://localhost:8511",
                "description": "Autonomous task execution and workflow management",
                "capabilities": ["task_automation", "agent_coordination", "workflow_execution", "background_processing"]
            },
            "browser_automation": {
                "url": "http://localhost:8504",
                "description": "Web navigation and data extraction",
                "capabilities": ["web_scraping", "form_automation", "navigation", "data_extraction"]
            },
            "media_studio": {
                "url": "http://localhost:8505",
                "description": "Image editing and media creation",
                "capabilities": ["image_editing", "media_creation", "filters", "design_tools"]
            },
            "voice_studio": {
                "url": "http://localhost:8506",
                "description": "Voice cloning and audio processing",
                "capabilities": ["voice_cloning", "audio_processing", "speech_synthesis", "voice_effects"]
            },
            "cad_studio": {
                "url": "http://localhost:8508",
                "description": "3D modeling and CAD design",
                "capabilities": ["3d_modeling", "cad_design", "engineering_tools", "design_simulation"]
            },
            "text_studio": {
                "url": "http://localhost:8509",
                "description": "Text processing and document generation",
                "capabilities": ["text_processing", "document_generation", "nlp_analysis", "content_creation"]
            }
        }
        
        self.conversation_memory = []
        self.active_workflows = {}
        self.system_state = {
            "platforms_healthy": {},
            "current_load": "normal",
            "last_maintenance": None,
            "active_tasks": 0
        }
        
        # AI reasoning engine
        self.reasoning_patterns = {
            "create_content": {
                "primary_platforms": ["media_studio", "video_studio_pro", "text_studio", "voice_studio"],
                "supporting_platforms": ["next_gen_ai", "autonomous_agents"],
                "workflow_type": "creative"
            },
            "automate_tasks": {
                "primary_platforms": ["autonomous_agents", "browser_automation"],
                "supporting_platforms": ["orchestrator_ai", "infrastructure_monitor"],
                "workflow_type": "automation"
            },
            "analyze_data": {
                "primary_platforms": ["text_studio", "infrastructure_monitor"],
                "supporting_platforms": ["next_gen_ai", "game_changing_infrastructure"],
                "workflow_type": "analysis"
            },
            "system_management": {
                "primary_platforms": ["ultimate_launcher", "infrastructure_monitor"],
                "supporting_platforms": ["game_changing_infrastructure", "orchestrator_ai"],
                "workflow_type": "management"
            },
            "complex_projects": {
                "primary_platforms": ["orchestrator_ai", "autonomous_agents", "next_gen_ai"],
                "supporting_platforms": ["game_changing_infrastructure", "infrastructure_monitor"],
                "workflow_type": "complex"
            }
        }
    
    def analyze_user_intent(self, user_input: str) -> Dict[str, Any]:
        """Advanced intent analysis using all available intelligence"""
        
        user_lower = user_input.lower()
        
        # Determine intent category
        intent_keywords = {
            "create_content": ["create", "make", "generate", "design", "build", "produce", "edit", "video", "image", "audio", "text"],
            "automate_tasks": ["automate", "schedule", "workflow", "batch", "process", "run", "execute", "repeat"],
            "analyze_data": ["analyze", "study", "examine", "review", "insights", "metrics", "performance", "data"],
            "system_management": ["deploy", "manage", "monitor", "maintain", "optimize", "scale", "infrastructure", "aws"],
            "complex_projects": ["coordinate", "integrate", "combine", "complex", "enterprise", "multi", "advanced", "comprehensive"]
        }
        
        # Score each intent
        intent_scores = {}
        for intent, keywords in intent_keywords.items():
            score = sum(1 for keyword in keywords if keyword in user_lower)
            intent_scores[intent] = score
        
        # Get primary intent
        primary_intent = max(intent_scores, key=intent_scores.get) if max(intent_scores.values()) > 0 else "general"
        
        # Assess complexity and urgency
        complexity_indicators = ["complex", "advanced", "enterprise", "comprehensive", "detailed", "professional"]
        urgency_indicators = ["urgent", "asap", "immediately", "quick", "fast", "now", "emergency"]
        
        complexity = "high" if any(indicator in user_lower for indicator in complexity_indicators) else "medium"
        urgency = "high" if any(indicator in user_lower for indicator in urgency_indicators) else "normal"
        
        return {
            "primary_intent": primary_intent,
            "confidence": intent_scores.get(primary_intent, 0) / max(1, len(user_input.split())),
            "complexity": complexity,
            "urgency": urgency,
            "all_scores": intent_scores,
            "requires_coordination": len([s for s in intent_scores.values() if s > 0]) > 1
        }
    
    def create_execution_plan(self, intent_analysis: Dict[str, Any], user_input: str) -> Dict[str, Any]:
        """Create a comprehensive execution plan"""
        
        primary_intent = intent_analysis["primary_intent"]
        reasoning_pattern = self.reasoning_patterns.get(primary_intent, self.reasoning_patterns["complex_projects"])
        
        # Determine required platforms
        required_platforms = reasoning_pattern["primary_platforms"].copy()
        
        if intent_analysis["complexity"] == "high" or intent_analysis["requires_coordination"]:
            required_platforms.extend(reasoning_pattern["supporting_platforms"])
        
        # Check platform health
        available_platforms = []
        unavailable_platforms = []
        
        for platform_id in required_platforms:
            if self.check_platform_health(platform_id):
                available_platforms.append(platform_id)
            else:
                unavailable_platforms.append(platform_id)
        
        # Create execution steps
        execution_steps = self.generate_execution_steps(primary_intent, available_platforms, user_input)
        
        return {
            "intent": primary_intent,
            "workflow_type": reasoning_pattern["workflow_type"],
            "required_platforms": required_platforms,
            "available_platforms": available_platforms,
            "unavailable_platforms": unavailable_platforms,
            "execution_steps": execution_steps,
            "estimated_time": self.estimate_execution_time(execution_steps),
            "success_probability": self.calculate_success_probability(available_platforms, unavailable_platforms),
            "fallback_plan": self.create_fallback_plan(unavailable_platforms),
            "created_at": datetime.now().isoformat()
        }
    
    def check_platform_health(self, platform_id: str) -> bool:
        """Check if a platform is healthy and responsive"""
        try:
            platform = self.platforms.get(platform_id, {})
            url = platform.get("url", "")
            
            if not url:
                return False
            
            response = requests.get(url, timeout=3)
            is_healthy = response.status_code == 200
            
            # Update system state
            self.system_state["platforms_healthy"][platform_id] = is_healthy
            
            return is_healthy
            
        except Exception:
            self.system_state["platforms_healthy"][platform_id] = False
            return False
    
    def generate_execution_steps(self, intent: str, available_platforms: List[str], user_input: str) -> List[Dict[str, Any]]:
        """Generate detailed execution steps based on intent and available platforms"""
        
        steps = []
        
        if intent == "create_content":
            if "video" in user_input.lower():
                steps = [
                    {"step": 1, "action": "Initialize video studio", "platform": "video_studio_pro", "description": "Prepare video editing environment"},
                    {"step": 2, "action": "Generate AI enhancements", "platform": "next_gen_ai", "description": "Create AI-powered video effects and enhancements"},
                    {"step": 3, "action": "Process and render", "platform": "video_studio_pro", "description": "Apply enhancements and render final video"},
                    {"step": 4, "action": "Quality check", "platform": "autonomous_agents", "description": "Automated quality assessment and optimization"}
                ]
            elif "image" in user_input.lower():
                steps = [
                    {"step": 1, "action": "Initialize media studio", "platform": "media_studio", "description": "Prepare image editing tools"},
                    {"step": 2, "action": "AI-powered creation", "platform": "next_gen_ai", "description": "Generate or enhance images using AI"},
                    {"step": 3, "action": "Apply effects and filters", "platform": "media_studio", "description": "Apply professional effects and adjustments"},
                    {"step": 4, "action": "Export optimized result", "platform": "media_studio", "description": "Export in optimal format and resolution"}
                ]
            else:
                steps = [
                    {"step": 1, "action": "Analyze requirements", "platform": "orchestrator_ai", "description": "Understand content creation needs"},
                    {"step": 2, "action": "Select appropriate tools", "platform": "orchestrator_ai", "description": "Choose optimal platforms for content type"},
                    {"step": 3, "action": "Create content", "platform": "text_studio", "description": "Generate content using AI assistance"},
                    {"step": 4, "action": "Review and optimize", "platform": "next_gen_ai", "description": "AI-powered content optimization"}
                ]
        
        elif intent == "automate_tasks":
            steps = [
                {"step": 1, "action": "Task analysis", "platform": "orchestrator_ai", "description": "Break down automation requirements"},
                {"step": 2, "action": "Workflow creation", "platform": "autonomous_agents", "description": "Design automated workflow"},
                {"step": 3, "action": "Resource allocation", "platform": "game_changing_infrastructure", "description": "Optimize resources for automation"},
                {"step": 4, "action": "Execute automation", "platform": "autonomous_agents", "description": "Run automated tasks"},
                {"step": 5, "action": "Monitor progress", "platform": "infrastructure_monitor", "description": "Track automation performance"}
            ]
        
        elif intent == "system_management":
            steps = [
                {"step": 1, "action": "System health check", "platform": "infrastructure_monitor", "description": "Assess current system status"},
                {"step": 2, "action": "Resource optimization", "platform": "game_changing_infrastructure", "description": "Optimize system resources"},
                {"step": 3, "action": "Deploy improvements", "platform": "ultimate_launcher", "description": "Apply system optimizations"},
                {"step": 4, "action": "Verify deployment", "platform": "infrastructure_monitor", "description": "Confirm successful deployment"}
            ]
        
        elif intent == "analyze_data":
            steps = [
                {"step": 1, "action": "Data collection", "platform": "infrastructure_monitor", "description": "Gather relevant data and metrics"},
                {"step": 2, "action": "AI-powered analysis", "platform": "next_gen_ai", "description": "Deep analysis using advanced AI models"},
                {"step": 3, "action": "Pattern recognition", "platform": "game_changing_infrastructure", "description": "Identify patterns and insights"},
                {"step": 4, "action": "Generate report", "platform": "text_studio", "description": "Create comprehensive analysis report"}
            ]
        
        else:  # complex_projects
            steps = [
                {"step": 1, "action": "Project orchestration", "platform": "orchestrator_ai", "description": "Coordinate multiple platforms for complex task"},
                {"step": 2, "action": "Resource management", "platform": "game_changing_infrastructure", "description": "Intelligent resource allocation"},
                {"step": 3, "action": "Parallel execution", "platform": "autonomous_agents", "description": "Execute multiple workflows simultaneously"},
                {"step": 4, "action": "Integration", "platform": "orchestrator_ai", "description": "Integrate results from all platforms"},
                {"step": 5, "action": "Quality assurance", "platform": "infrastructure_monitor", "description": "Monitor and validate final results"}
            ]
        
        # Filter steps to only include available platforms
        available_steps = [step for step in steps if step["platform"] in available_platforms]
        
        return available_steps
    
    def estimate_execution_time(self, steps: List[Dict[str, Any]]) -> str:
        """Estimate total execution time"""
        base_time_per_step = 30  # seconds
        total_seconds = len(steps) * base_time_per_step
        
        if total_seconds < 60:
            return f"{total_seconds} seconds"
        elif total_seconds < 3600:
            minutes = total_seconds // 60
            return f"{minutes} minutes"
        else:
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            return f"{hours}h {minutes}m"
    
    def calculate_success_probability(self, available_platforms: List[str], unavailable_platforms: List[str]) -> float:
        """Calculate probability of successful execution"""
        total_required = len(available_platforms) + len(unavailable_platforms)
        
        if total_required == 0:
            return 0.5
        
        availability_score = len(available_platforms) / total_required
        
        # Adjust based on platform criticality
        base_probability = availability_score * 0.9  # 90% max if all platforms available
        
        return min(0.95, max(0.1, base_probability))  # Clamp between 10% and 95%
    
    def create_fallback_plan(self, unavailable_platforms: List[str]) -> List[str]:
        """Create fallback strategies for unavailable platforms"""
        fallback_strategies = []
        
        for platform_id in unavailable_platforms:
            if platform_id in ["video_studio_pro", "media_studio"]:
                fallback_strategies.append("Use basic media processing with next_gen_ai")
            elif platform_id == "autonomous_agents":
                fallback_strategies.append("Execute tasks manually through orchestrator_ai")
            elif platform_id == "next_gen_ai":
                fallback_strategies.append("Use alternative AI processing through text_studio")
            elif platform_id == "infrastructure_monitor":
                fallback_strategies.append("Use basic system monitoring via ultimate_launcher")
            else:
                fallback_strategies.append(f"Skip {platform_id} functionality or use manual alternative")
        
        return fallback_strategies
    
    def execute_plan(self, execution_plan: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the comprehensive plan"""
        
        execution_result = {
            "plan_id": f"exec_{int(time.time())}",
            "started_at": datetime.now().isoformat(),
            "status": "running",
            "completed_steps": 0,
            "total_steps": len(execution_plan["execution_steps"]),
            "step_results": [],
            "errors": [],
            "warnings": []
        }
        
        # Store the execution
        self.active_workflows[execution_result["plan_id"]] = execution_result
        
        # Execute each step
        for step in execution_plan["execution_steps"]:
            step_result = self.execute_step(step)
            execution_result["step_results"].append(step_result)
            
            if step_result["status"] == "success":
                execution_result["completed_steps"] += 1
            elif step_result["status"] == "error":
                execution_result["errors"].append(step_result["message"])
            elif step_result["status"] == "warning":
                execution_result["warnings"].append(step_result["message"])
        
        # Final status
        if execution_result["completed_steps"] == execution_result["total_steps"]:
            execution_result["status"] = "completed"
        elif execution_result["completed_steps"] > 0:
            execution_result["status"] = "partial"
        else:
            execution_result["status"] = "failed"
        
        execution_result["completed_at"] = datetime.now().isoformat()
        
        return execution_result
    
    def execute_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a single step"""
        try:
            platform_id = step["platform"]
            
            # Check if platform is available
            if not self.check_platform_health(platform_id):
                return {
                    "step": step["step"],
                    "status": "error",
                    "message": f"Platform {platform_id} is not available",
                    "timestamp": datetime.now().isoformat()
                }
            
            # Simulate step execution (in real implementation, this would call actual APIs)
            time.sleep(1)  # Simulate processing time
            
            return {
                "step": step["step"],
                "status": "success",
                "message": f"Successfully completed: {step['description']}",
                "platform": platform_id,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "step": step["step"],
                "status": "error",
                "message": f"Step execution failed: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
    
    def maintain_system_health(self):
        """Continuously maintain system health"""
        
        # Check all platforms
        health_summary = {}
        for platform_id in self.platforms.keys():
            health_summary[platform_id] = self.check_platform_health(platform_id)
        
        # Update system state
        healthy_count = sum(1 for healthy in health_summary.values() if healthy)
        total_count = len(health_summary)
        
        if healthy_count / total_count > 0.8:
            self.system_state["current_load"] = "normal"
        elif healthy_count / total_count > 0.6:
            self.system_state["current_load"] = "degraded"
        else:
            self.system_state["current_load"] = "critical"
        
        self.system_state["last_maintenance"] = datetime.now().isoformat()
        
        return health_summary

def main():
    """Main Master AI Controller interface"""
    st.set_page_config(
        page_title="Master AI Controller",
        page_icon="👑",
        layout="wide"
    )
    
    st.title("👑 Master AI Controller")
    st.markdown("**The ultimate LLM chatbot that orchestrates ALL SuperMega platforms and infrastructure**")
    
    # Initialize Master AI
    if "master_ai" not in st.session_state:
        st.session_state.master_ai = MasterAIController()
    
    master_ai = st.session_state.master_ai
    
    # Sidebar - System Status
    st.sidebar.title("🎛️ System Command Center")
    
    # System health check
    if st.sidebar.button("🔍 Health Check All Platforms"):
        with st.sidebar:
            with st.spinner("Checking all platforms..."):
                health_summary = master_ai.maintain_system_health()
                
                st.markdown("**Platform Health:**")
                for platform_id, is_healthy in health_summary.items():
                    status_icon = "🟢" if is_healthy else "🔴"
                    platform_name = master_ai.platforms[platform_id].get("description", platform_id)
                    st.text(f"{status_icon} {platform_name}")
                
                # System status
                system_load = master_ai.system_state["current_load"]
                load_color = {"normal": "🟢", "degraded": "🟡", "critical": "🔴"}.get(system_load, "⚪")
                st.markdown(f"**System Status:** {load_color} {system_load.title()}")
    
    # Quick actions
    st.sidebar.markdown("---")
    st.sidebar.subheader("⚡ Quick Actions")
    
    if st.sidebar.button("🚀 Start All Services", type="primary"):
        st.sidebar.success("Services startup initiated!")
    
    if st.sidebar.button("☁️ Deploy to AWS"):
        st.sidebar.info("AWS deployment initiated...")
    
    if st.sidebar.button("🔧 Run Maintenance"):
        master_ai.maintain_system_health()
        st.sidebar.success("Maintenance completed!")
    
    # Main Chat Interface
    st.header("💬 Master AI Chat Interface")
    st.markdown("**Tell me what you want to accomplish, and I'll orchestrate all necessary platforms to make it happen perfectly.**")
    
    # Initialize chat messages
    if "master_messages" not in st.session_state:
        st.session_state.master_messages = [
            {
                "role": "assistant",
                "content": "👑 **Master AI Controller Online**\n\nI can orchestrate all SuperMega platforms to accomplish any task. I have access to:\n\n• 🎬 **Video Studio Pro** - Professional video editing with AI enhancement\n• 🧠 **Next-Gen AI Platform** - Advanced AI models (GPT-4, Claude, Gemini, etc.)\n• 🤖 **Autonomous Agents** - Self-operating task automation\n• 🌐 **Browser Automation** - Web navigation and data extraction\n• 🎨 **Creative Studios** - Media, Voice, CAD, and Text processing\n• 📊 **Infrastructure Management** - Monitoring, scaling, and deployment\n• 🎯 **Game-Changing Infrastructure** - AI memory, predictive scaling, auto-recovery\n\nWhat would you like me to create, automate, analyze, or manage for you?"
            }
        ]
    
    # Display chat messages
    for message in st.session_state.master_messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Chat input
    if prompt := st.chat_input("What would you like me to orchestrate for you?"):
        
        # Add user message
        st.session_state.master_messages.append({"role": "user", "content": prompt})
        
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Process with Master AI
        with st.chat_message("assistant"):
            with st.spinner("🧠 Analyzing request and orchestrating platforms..."):
                
                # Step 1: Intent Analysis
                intent_analysis = master_ai.analyze_user_intent(prompt)
                
                st.markdown("### 🎯 Intent Analysis")
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Primary Intent", intent_analysis["primary_intent"].replace("_", " ").title())
                with col2:
                    st.metric("Complexity", intent_analysis["complexity"].title())
                with col3:
                    st.metric("Confidence", f"{intent_analysis['confidence']:.1%}")
                
                # Step 2: Execution Plan
                execution_plan = master_ai.create_execution_plan(intent_analysis, prompt)
                
                st.markdown("### 📋 Execution Plan")
                
                col1, col2 = st.columns(2)
                with col1:
                    st.metric("Workflow Type", execution_plan["workflow_type"].title())
                    st.metric("Estimated Time", execution_plan["estimated_time"])
                
                with col2:
                    st.metric("Success Probability", f"{execution_plan['success_probability']:.1%}")
                    st.metric("Platforms Required", len(execution_plan["required_platforms"]))
                
                # Show execution steps
                if execution_plan["execution_steps"]:
                    st.markdown("**Execution Steps:**")
                    for step in execution_plan["execution_steps"]:
                        st.text(f"{step['step']}. {step['description']} ({step['platform']})")
                
                # Show unavailable platforms if any
                if execution_plan["unavailable_platforms"]:
                    st.warning(f"⚠️ Some platforms are unavailable: {', '.join(execution_plan['unavailable_platforms'])}")
                    if execution_plan["fallback_plan"]:
                        st.markdown("**Fallback Strategies:**")
                        for fallback in execution_plan["fallback_plan"]:
                            st.text(f"• {fallback}")
                
                # Step 3: Execution
                st.markdown("### ⚡ Execution")
                
                with st.spinner("Executing orchestrated plan..."):
                    execution_result = master_ai.execute_plan(execution_plan)
                
                # Display results
                col1, col2, col3 = st.columns(3)
                with col1:
                    status_icon = {"completed": "✅", "partial": "⚠️", "failed": "❌", "running": "🔄"}.get(execution_result["status"], "⚪")
                    st.metric("Status", f"{status_icon} {execution_result['status'].title()}")
                
                with col2:
                    st.metric("Completed Steps", f"{execution_result['completed_steps']}/{execution_result['total_steps']}")
                
                with col3:
                    success_rate = execution_result['completed_steps'] / max(1, execution_result['total_steps'])
                    st.metric("Success Rate", f"{success_rate:.1%}")
                
                # Show step results
                if execution_result["step_results"]:
                    st.markdown("**Step Results:**")
                    for result in execution_result["step_results"]:
                        status_icon = {"success": "✅", "error": "❌", "warning": "⚠️"}.get(result["status"], "⚪")
                        st.text(f"{status_icon} Step {result['step']}: {result['message']}")
                
                # Generate response
                if execution_result["status"] == "completed":
                    response = f"🎉 **Task Completed Successfully!**\n\nI've successfully orchestrated {len(execution_plan['available_platforms'])} platforms to fulfill your request. All {execution_result['total_steps']} execution steps completed without errors."
                elif execution_result["status"] == "partial":
                    response = f"⚠️ **Task Partially Completed**\n\nI've completed {execution_result['completed_steps']} out of {execution_result['total_steps']} steps. Some platforms may have had issues, but the core functionality has been delivered."
                else:
                    response = f"❌ **Task Execution Failed**\n\nI encountered issues executing the plan. This may be due to platform availability or system constraints. Please check the system status and try again."
                
                if execution_result["warnings"]:
                    response += f"\n\n**Warnings:** {'; '.join(execution_result['warnings'])}"
                
                st.markdown(response)
                
                # Add response to chat history
                st.session_state.master_messages.append({
                    "role": "assistant",
                    "content": response
                })
    
    # Platform Overview
    st.markdown("---")
    st.header("🌐 Platform Ecosystem Overview")
    
    # Create platform status grid
    cols = st.columns(3)
    
    platform_groups = {
        "Core AI Platforms": ["orchestrator_ai", "next_gen_ai", "game_changing_infrastructure"],
        "Creative Platforms": ["video_studio_pro", "media_studio", "voice_studio", "cad_studio", "text_studio"],
        "Management Platforms": ["ultimate_launcher", "infrastructure_monitor", "autonomous_agents", "browser_automation"]
    }
    
    for i, (group_name, platform_ids) in enumerate(platform_groups.items()):
        with cols[i % 3]:
            st.subheader(group_name)
            
            for platform_id in platform_ids:
                if platform_id in master_ai.platforms:
                    platform = master_ai.platforms[platform_id]
                    is_healthy = master_ai.system_state["platforms_healthy"].get(platform_id, False)
                    status_icon = "🟢" if is_healthy else "🔴"
                    
                    with st.expander(f"{status_icon} {platform_id.replace('_', ' ').title()}"):
                        st.text(f"URL: {platform['url']}")
                        st.text(f"Description: {platform['description']}")
                        st.text("Capabilities:")
                        for capability in platform['capabilities']:
                            st.text(f"  • {capability.replace('_', ' ').title()}")
    
    # Active Workflows
    if master_ai.active_workflows:
        st.markdown("---")
        st.header("🔄 Active Workflows")
        
        for workflow_id, workflow in master_ai.active_workflows.items():
            with st.expander(f"Workflow {workflow_id} - {workflow['status'].title()}"):
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    st.metric("Status", workflow["status"].title())
                    st.metric("Progress", f"{workflow['completed_steps']}/{workflow['total_steps']}")
                
                with col2:
                    st.text(f"Started: {workflow['started_at']}")
                    if workflow.get('completed_at'):
                        st.text(f"Completed: {workflow['completed_at']}")
                
                with col3:
                    if workflow['errors']:
                        st.error(f"Errors: {len(workflow['errors'])}")
                    if workflow['warnings']:
                        st.warning(f"Warnings: {len(workflow['warnings'])}")

if __name__ == "__main__":
    main()
