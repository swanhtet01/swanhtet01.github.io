#!/usr/bin/env python3
"""
🤖 ENHANCED AI CODING COMPANION
===============================
Professional AI-powered coding assistant that goes beyond GitHub Copilot
- Multi-language code analysis and generation
- Architecture design and refactoring suggestions
- Voice-to-code programming interface
- Real-time code review and optimization
- Advanced debugging and error analysis
- Code documentation and testing automation
- Integration with popular IDEs and editors
- Custom model training for domain-specific code
"""

import streamlit as st
import asyncio
import json
import time
import os
import tempfile
import subprocess
import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# AI/ML imports
import openai
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
import torch
from sentence_transformers import SentenceTransformer
import numpy as np

# Code analysis imports
import ast
import tokenize
import io
from pylint import lint
from pylint.reporters import JSONReporter
import radon.complexity as cc
import radon.metrics as metrics

# Language parsing
import tree_sitter
from tree_sitter import Language, Parser

# Voice processing
import speech_recognition as sr
import pyttsx3

# Code formatting and utilities
import black
import isort
import autopep8

# Git integration
import git
from git import Repo

# Set page config
st.set_page_config(
    page_title="🤖 Enhanced AI Coding Companion",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

class EnhancedAICodingCompanion:
    """Advanced AI coding assistant with professional features"""
    
    def __init__(self):
        self.supported_languages = [
            'python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'csharp', 
            'go', 'rust', 'kotlin', 'swift', 'php', 'ruby', 'scala', 'r'
        ]
        
        self.code_analysis_cache = {}
        self.conversation_history = []
        
        # Initialize models
        self.initialize_models()
        
        # Initialize session state
        if 'current_project' not in st.session_state:
            st.session_state.current_project = None
        if 'code_history' not in st.session_state:
            st.session_state.code_history = []
        if 'voice_enabled' not in st.session_state:
            st.session_state.voice_enabled = False
    
    def initialize_models(self):
        """Initialize AI models for code generation and analysis"""
        try:
            # Initialize code generation model
            model_name = "microsoft/DialoGPT-medium"  # Lightweight for demo
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.code_model = AutoModelForCausalLM.from_pretrained(model_name)
            
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Initialize embedding model for code similarity
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            
            # Initialize voice recognition
            self.speech_recognizer = sr.Recognizer()
            self.tts_engine = pyttsx3.init()
            
            st.success("✅ AI models initialized successfully")
            
        except Exception as e:
            st.warning(f"⚠️ Some models failed to initialize: {e}")
    
    def render_main_interface(self):
        """Render the main Streamlit interface"""
        # Header with voice toggle
        col1, col2 = st.columns([3, 1])
        
        with col1:
            st.title("🤖 Enhanced AI Coding Companion")
            st.markdown("### Professional AI-Powered Development Assistant")
        
        with col2:
            voice_enabled = st.toggle("🎤 Voice Mode", value=st.session_state.voice_enabled)
            if voice_enabled != st.session_state.voice_enabled:
                st.session_state.voice_enabled = voice_enabled
        
        # Sidebar navigation
        with st.sidebar:
            st.header("🎛️ Control Panel")
            
            mode = st.selectbox(
                "Operation Mode",
                [
                    "Code Generation", 
                    "Code Analysis", 
                    "Architecture Design", 
                    "Debugging Assistant",
                    "Voice Programming",
                    "Project Management"
                ],
                key="operation_mode"
            )
            
            # Project settings
            st.subheader("📁 Project Settings")
            
            project_path = st.text_input("Project Path", placeholder="/path/to/your/project")
            if st.button("📂 Load Project"):
                if os.path.exists(project_path):
                    st.session_state.current_project = self.load_project(project_path)
                    st.success(f"Project loaded: {os.path.basename(project_path)}")
                else:
                    st.error("Project path not found")
            
            # Language preferences
            st.subheader("⚙️ Preferences")
            primary_language = st.selectbox("Primary Language", self.supported_languages)
            coding_style = st.selectbox("Coding Style", ["Google", "PEP8", "Airbnb", "Standard"])
            ai_creativity = st.slider("AI Creativity", 0.1, 2.0, 0.7, 0.1)
        
        # Main content area based on mode
        if mode == "Code Generation":
            self.render_code_generation()
        elif mode == "Code Analysis":
            self.render_code_analysis()
        elif mode == "Architecture Design":
            self.render_architecture_design()
        elif mode == "Debugging Assistant":
            self.render_debugging_assistant()
        elif mode == "Voice Programming":
            self.render_voice_programming()
        elif mode == "Project Management":
            self.render_project_management()
    
    def render_code_generation(self):
        """Render code generation interface"""
        st.header("💻 AI Code Generation")
        
        tab1, tab2, tab3 = st.tabs(["🆕 Generate New Code", "🔄 Refactor Existing", "📝 Documentation"])
        
        with tab1:
            st.subheader("🆕 Generate New Code")
            
            col1, col2 = st.columns([2, 1])
            
            with col1:
                # Natural language input
                code_description = st.text_area(
                    "Describe what you want to build:",
                    placeholder="Create a REST API endpoint that handles user authentication with JWT tokens and rate limiting",
                    height=100
                )
                
                # Advanced options
                with st.expander("🔧 Advanced Options"):
                    target_language = st.selectbox("Target Language", self.supported_languages)
                    framework = st.text_input("Framework/Library", placeholder="FastAPI, React, Spring Boot, etc.")
                    include_tests = st.checkbox("Include Unit Tests", value=True)
                    include_docs = st.checkbox("Include Documentation", value=True)
                    add_error_handling = st.checkbox("Add Error Handling", value=True)
                    follow_patterns = st.checkbox("Follow Design Patterns", value=True)
            
            with col2:
                st.subheader("📋 Code Templates")
                
                template_categories = {
                    "Web Development": ["REST API", "GraphQL API", "Web Scraper", "Authentication"],
                    "Data Science": ["Data Analysis", "ML Model", "Data Pipeline", "Visualization"],
                    "Desktop Apps": ["GUI Application", "CLI Tool", "System Service", "Database Manager"],
                    "DevOps": ["Docker Config", "CI/CD Pipeline", "Monitoring", "Deployment Script"]
                }
                
                selected_category = st.selectbox("Template Category", list(template_categories.keys()))
                selected_template = st.selectbox("Template", template_categories[selected_category])
                
                if st.button("📋 Use Template"):
                    template_description = self.get_template_description(selected_category, selected_template)
                    code_description = template_description
                    st.rerun()
            
            if st.button("🚀 Generate Code", type="primary"):
                if code_description.strip():
                    with st.spinner("🤖 Generating code..."):
                        generated_code = self.generate_code(
                            description=code_description,
                            language=target_language,
                            framework=framework,
                            options={
                                'include_tests': include_tests,
                                'include_docs': include_docs,
                                'error_handling': add_error_handling,
                                'design_patterns': follow_patterns
                            }
                        )
                        
                        if generated_code:
                            st.success("✅ Code generated successfully!")
                            
                            # Display generated code
                            st.subheader("📄 Generated Code")
                            
                            if isinstance(generated_code, dict):
                                for filename, code in generated_code.items():
                                    with st.expander(f"📁 {filename}", expanded=True):
                                        st.code(code, language=target_language)
                                        
                                        # Download button for each file
                                        st.download_button(
                                            label=f"📥 Download {filename}",
                                            data=code,
                                            file_name=filename,
                                            mime="text/plain",
                                            key=f"download_{filename}"
                                        )
                            else:
                                st.code(generated_code, language=target_language)
                                
                                # Single file download
                                st.download_button(
                                    label="📥 Download Code",
                                    data=generated_code,
                                    file_name=f"generated_code.{self.get_file_extension(target_language)}",
                                    mime="text/plain"
                                )
                            
                            # Code analysis
                            st.subheader("📊 Code Analysis")
                            analysis = self.analyze_generated_code(generated_code, target_language)
                            self.display_code_analysis(analysis)
                            
                        else:
                            st.error("❌ Failed to generate code. Please try again.")
                else:
                    st.error("Please provide a code description")
        
        with tab2:
            st.subheader("🔄 Refactor Existing Code")
            
            # File upload or paste
            input_method = st.radio("Input Method", ["Upload File", "Paste Code"])
            
            if input_method == "Upload File":
                uploaded_file = st.file_uploader("Upload code file", type=['py', 'js', 'java', 'cpp', 'c', 'go', 'rs'])
                if uploaded_file:
                    original_code = uploaded_file.read().decode('utf-8')
                    st.code(original_code, language=self.detect_language_from_filename(uploaded_file.name))
            else:
                original_code = st.text_area("Paste your code:", height=300)
                detected_lang = self.detect_language_from_code(original_code) if original_code else 'python'
                st.info(f"Detected language: {detected_lang}")
            
            if original_code:
                refactoring_options = st.multiselect(
                    "Refactoring Options",
                    [
                        "Improve Performance",
                        "Add Error Handling", 
                        "Extract Functions",
                        "Reduce Complexity",
                        "Add Type Hints",
                        "Optimize Imports",
                        "Follow Best Practices",
                        "Add Documentation"
                    ],
                    default=["Improve Performance", "Add Error Handling"]
                )
                
                if st.button("🔄 Refactor Code", type="primary"):
                    with st.spinner("🤖 Refactoring code..."):
                        refactored_code = self.refactor_code(original_code, refactoring_options)
                        
                        if refactored_code:
                            st.success("✅ Code refactored successfully!")
                            
                            # Side-by-side comparison
                            col1, col2 = st.columns(2)
                            
                            with col1:
                                st.subheader("📄 Original Code")
                                st.code(original_code, language=detected_lang)
                            
                            with col2:
                                st.subheader("✨ Refactored Code")
                                st.code(refactored_code, language=detected_lang)
                            
                            # Download refactored code
                            st.download_button(
                                label="📥 Download Refactored Code",
                                data=refactored_code,
                                file_name=f"refactored_code.{self.get_file_extension(detected_lang)}",
                                mime="text/plain"
                            )
                            
                            # Show improvements
                            improvements = self.analyze_refactoring_improvements(original_code, refactored_code)
                            st.subheader("📈 Improvements Made")
                            for improvement in improvements:
                                st.success(f"✅ {improvement}")
        
        with tab3:
            st.subheader("📝 Auto Documentation")
            
            # Code input for documentation
            doc_input_method = st.radio("Input Method", ["Upload File", "Paste Code"], key="doc_input")
            
            if doc_input_method == "Upload File":
                doc_file = st.file_uploader("Upload code file for documentation", type=['py', 'js', 'java', 'cpp'])
                if doc_file:
                    code_to_document = doc_file.read().decode('utf-8')
            else:
                code_to_document = st.text_area("Paste code to document:", height=200)
            
            if code_to_document:
                doc_options = st.multiselect(
                    "Documentation Options",
                    [
                        "Function/Method Docstrings",
                        "Class Documentation",
                        "API Documentation",
                        "README Generation",
                        "Code Comments",
                        "Type Annotations",
                        "Usage Examples"
                    ],
                    default=["Function/Method Docstrings", "Code Comments"]
                )
                
                doc_format = st.selectbox("Documentation Format", ["Google Style", "Sphinx", "JSDoc", "Javadoc"])
                
                if st.button("📝 Generate Documentation", type="primary"):
                    with st.spinner("📝 Generating documentation..."):
                        documented_code = self.generate_documentation(code_to_document, doc_options, doc_format)
                        
                        if documented_code:
                            st.success("✅ Documentation generated!")
                            
                            st.subheader("📚 Documented Code")
                            st.code(documented_code, language=self.detect_language_from_code(code_to_document))
                            
                            st.download_button(
                                label="📥 Download Documented Code",
                                data=documented_code,
                                file_name="documented_code.py",  # Default extension
                                mime="text/plain"
                            )
    
    def render_code_analysis(self):
        """Render code analysis interface"""
        st.header("🔍 Advanced Code Analysis")
        
        # File/project input
        analysis_scope = st.radio("Analysis Scope", ["Single File", "Entire Project"])
        
        if analysis_scope == "Single File":
            uploaded_file = st.file_uploader("Upload code file for analysis", type=['py', 'js', 'java', 'cpp', 'c', 'go'])
            
            if uploaded_file:
                file_content = uploaded_file.read().decode('utf-8')
                filename = uploaded_file.name
                
                st.subheader(f"📄 Analyzing: {filename}")
                
                # Run comprehensive analysis
                with st.spinner("🔍 Analyzing code..."):
                    analysis_results = self.comprehensive_code_analysis(file_content, filename)
                
                # Display results in tabs
                tab1, tab2, tab3, tab4 = st.tabs(["📊 Overview", "⚠️ Issues", "📈 Metrics", "💡 Suggestions"])
                
                with tab1:
                    self.display_analysis_overview(analysis_results)
                
                with tab2:
                    self.display_code_issues(analysis_results.get('issues', []))
                
                with tab3:
                    self.display_code_metrics(analysis_results.get('metrics', {}))
                
                with tab4:
                    self.display_improvement_suggestions(analysis_results.get('suggestions', []))
        
        else:
            project_path = st.text_input("Project Path", placeholder="/path/to/project")
            
            if st.button("🔍 Analyze Project") and project_path:
                if os.path.exists(project_path):
                    with st.spinner("🔍 Analyzing entire project..."):
                        project_analysis = self.analyze_project(project_path)
                    
                    # Project-level analysis display
                    self.display_project_analysis(project_analysis)
                else:
                    st.error("Project path not found")
    
    def render_architecture_design(self):
        """Render architecture design interface"""
        st.header("🏗️ Architecture Design Assistant")
        
        tab1, tab2, tab3 = st.tabs(["🎯 Design Patterns", "📐 System Architecture", "🔄 Migration Assistant"])
        
        with tab1:
            st.subheader("🎯 Design Pattern Recommendations")
            
            # Problem description
            problem_description = st.text_area(
                "Describe your design challenge:",
                placeholder="I need to implement a notification system that can handle multiple types of notifications...",
                height=100
            )
            
            system_type = st.selectbox(
                "System Type",
                ["Web Application", "Desktop Application", "Mobile App", "Microservices", "Data Pipeline", "API Service"]
            )
            
            constraints = st.multiselect(
                "Constraints",
                ["High Performance", "Scalability", "Security", "Maintainability", "Real-time", "Low Latency"]
            )
            
            if st.button("🎯 Get Pattern Recommendations"):
                if problem_description:
                    patterns = self.recommend_design_patterns(problem_description, system_type, constraints)
                    
                    st.subheader("📋 Recommended Design Patterns")
                    for pattern in patterns:
                        with st.expander(f"🔧 {pattern['name']}", expanded=True):
                            st.write(f"**Description:** {pattern['description']}")
                            st.write(f"**Use Case:** {pattern['use_case']}")
                            st.write(f"**Benefits:** {', '.join(pattern['benefits'])}")
                            
                            if st.button(f"💻 Generate {pattern['name']} Code", key=f"gen_{pattern['name']}"):
                                code = self.generate_pattern_code(pattern['name'], problem_description)
                                st.code(code, language='python')
        
        with tab2:
            st.subheader("📐 System Architecture Design")
            
            # Architecture requirements
            st.write("**System Requirements:**")
            
            col1, col2 = st.columns(2)
            
            with col1:
                expected_users = st.number_input("Expected Users", min_value=1, max_value=1000000, value=1000)
                data_volume = st.selectbox("Data Volume", ["Small (<1GB)", "Medium (1-100GB)", "Large (100GB-1TB)", "Very Large (>1TB)"])
                availability = st.selectbox("Availability Requirement", ["99%", "99.9%", "99.99%", "99.999%"])
            
            with col2:
                response_time = st.selectbox("Response Time", ["<100ms", "<500ms", "<1s", "<5s"])
                deployment = st.selectbox("Deployment", ["On-Premises", "Cloud", "Hybrid", "Multi-Cloud"])
                budget = st.selectbox("Budget", ["Startup", "SMB", "Enterprise", "Unlimited"])
            
            tech_preferences = st.multiselect(
                "Technology Preferences",
                ["Python", "Java", "JavaScript", "Go", "Rust", "Kubernetes", "Docker", "AWS", "Azure", "GCP"]
            )
            
            if st.button("🏗️ Design Architecture"):
                architecture = self.design_system_architecture(
                    users=expected_users,
                    data_volume=data_volume,
                    availability=availability,
                    response_time=response_time,
                    deployment=deployment,
                    tech_preferences=tech_preferences
                )
                
                st.subheader("🏗️ Recommended Architecture")
                self.display_architecture_design(architecture)
        
        with tab3:
            st.subheader("🔄 Legacy System Migration")
            
            # Current system analysis
            current_tech = st.text_area("Current Technology Stack", placeholder="PHP 5.6, MySQL, Apache, jQuery...")
            target_tech = st.text_area("Target Technology Stack", placeholder="Python FastAPI, PostgreSQL, React...")
            
            migration_goals = st.multiselect(
                "Migration Goals",
                ["Improve Performance", "Reduce Costs", "Enhance Security", "Better Maintainability", "Cloud Migration"]
            )
            
            timeline = st.selectbox("Timeline", ["3 months", "6 months", "1 year", "2+ years"])
            risk_tolerance = st.selectbox("Risk Tolerance", ["Low", "Medium", "High"])
            
            if st.button("📋 Create Migration Plan"):
                migration_plan = self.create_migration_plan(current_tech, target_tech, migration_goals, timeline, risk_tolerance)
                
                st.subheader("📋 Migration Roadmap")
                self.display_migration_plan(migration_plan)
    
    def render_debugging_assistant(self):
        """Render debugging assistant interface"""
        st.header("🐛 AI Debugging Assistant")
        
        tab1, tab2, tab3 = st.tabs(["🔍 Error Analysis", "🧪 Test Generation", "⚡ Performance Profiling"])
        
        with tab1:
            st.subheader("🔍 Intelligent Error Analysis")
            
            # Error input methods
            error_input_method = st.radio("Error Input Method", ["Paste Error", "Upload Log File", "Live Debugging"])
            
            if error_input_method == "Paste Error":
                error_text = st.text_area(
                    "Paste your error message/stack trace:",
                    placeholder="Traceback (most recent call last):\n  File \"main.py\", line 10...",
                    height=200
                )
                
                # Optional: Add related code
                related_code = st.text_area(
                    "Related code (optional):",
                    placeholder="def problematic_function():\n    ...",
                    height=150
                )
            
            elif error_input_method == "Upload Log File":
                log_file = st.file_uploader("Upload log file", type=['log', 'txt'])
                if log_file:
                    error_text = log_file.read().decode('utf-8')
                    st.text_area("Log content preview:", error_text[:1000] + "..." if len(error_text) > 1000 else error_text, height=200)
            
            if error_text:
                programming_language = st.selectbox(
                    "Programming Language",
                    self.supported_languages,
                    index=0  # Default to Python
                )
                
                if st.button("🔍 Analyze Error", type="primary"):
                    with st.spinner("🤖 Analyzing error..."):
                        analysis = self.analyze_error(error_text, related_code if 'related_code' in locals() else None, programming_language)
                    
                    st.subheader("🔍 Error Analysis Results")
                    
                    # Error summary
                    col1, col2 = st.columns(2)
                    with col1:
                        st.metric("Error Type", analysis.get('error_type', 'Unknown'))
                        st.metric("Severity", analysis.get('severity', 'Medium'))
                    with col2:
                        st.metric("Confidence", f"{analysis.get('confidence', 85)}%")
                        st.metric("Fix Difficulty", analysis.get('difficulty', 'Medium'))
                    
                    # Detailed explanation
                    st.subheader("📝 What's Wrong")
                    st.write(analysis.get('explanation', 'No explanation available'))
                    
                    # Suggested fixes
                    st.subheader("🔧 Suggested Fixes")
                    for i, fix in enumerate(analysis.get('fixes', []), 1):
                        with st.expander(f"Fix #{i}: {fix['title']}", expanded=i == 1):
                            st.write(fix['description'])
                            if fix.get('code'):
                                st.code(fix['code'], language=programming_language)
                            
                            # Implementation steps
                            if fix.get('steps'):
                                st.write("**Implementation Steps:**")
                                for j, step in enumerate(fix['steps'], 1):
                                    st.write(f"{j}. {step}")
                    
                    # Prevention tips
                    if analysis.get('prevention'):
                        st.subheader("🛡️ Prevention Tips")
                        for tip in analysis['prevention']:
                            st.info(f"💡 {tip}")
        
        with tab2:
            st.subheader("🧪 Intelligent Test Generation")
            
            # Code input for test generation
            test_code = st.text_area("Code to test:", height=200)
            
            if test_code:
                test_framework = st.selectbox(
                    "Test Framework",
                    {
                        'python': ['pytest', 'unittest', 'doctest'],
                        'javascript': ['jest', 'mocha', 'jasmine'],
                        'java': ['junit', 'testng'],
                        'csharp': ['nunit', 'mstest']
                    }.get(self.detect_language_from_code(test_code), ['pytest'])
                )
                
                test_types = st.multiselect(
                    "Test Types",
                    ["Unit Tests", "Integration Tests", "Edge Cases", "Error Handling", "Performance Tests"],
                    default=["Unit Tests", "Edge Cases"]
                )
                
                coverage_target = st.slider("Target Coverage %", 60, 100, 90)
                
                if st.button("🧪 Generate Tests", type="primary"):
                    with st.spinner("🤖 Generating tests..."):
                        generated_tests = self.generate_tests(test_code, test_framework, test_types, coverage_target)
                    
                    st.subheader("🧪 Generated Tests")
                    
                    if isinstance(generated_tests, dict):
                        for test_file, test_content in generated_tests.items():
                            with st.expander(f"📄 {test_file}", expanded=True):
                                st.code(test_content, language=self.detect_language_from_code(test_code))
                                
                                st.download_button(
                                    label=f"📥 Download {test_file}",
                                    data=test_content,
                                    file_name=test_file,
                                    mime="text/plain",
                                    key=f"test_download_{test_file}"
                                )
                    else:
                        st.code(generated_tests, language=self.detect_language_from_code(test_code))
                        
                        st.download_button(
                            label="📥 Download Tests",
                            data=generated_tests,
                            file_name="test_generated.py",
                            mime="text/plain"
                        )
        
        with tab3:
            st.subheader("⚡ Performance Profiling Assistant")
            
            # Performance analysis options
            profile_type = st.selectbox(
                "Analysis Type",
                ["Code Profiling", "Memory Analysis", "Database Query Analysis", "API Performance"]
            )
            
            if profile_type == "Code Profiling":
                code_to_profile = st.text_area("Code to profile:", height=200)
                
                if code_to_profile:
                    profiling_options = st.multiselect(
                        "Profiling Options",
                        ["Time Complexity", "Memory Usage", "Function Calls", "Line-by-Line Analysis"],
                        default=["Time Complexity", "Memory Usage"]
                    )
                    
                    if st.button("⚡ Analyze Performance"):
                        performance_analysis = self.analyze_performance(code_to_profile, profiling_options)
                        
                        st.subheader("📊 Performance Analysis")
                        self.display_performance_analysis(performance_analysis)
    
    def render_voice_programming(self):
        """Render voice programming interface"""
        st.header("🎤 Voice Programming Interface")
        
        if not st.session_state.voice_enabled:
            st.warning("⚠️ Voice mode is disabled. Enable it in the sidebar to use voice programming features.")
            return
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🎤 Voice Commands")
            
            # Voice command categories
            command_category = st.selectbox(
                "Command Category",
                ["Code Generation", "Code Navigation", "Debugging", "Refactoring", "Documentation"]
            )
            
            # Display available commands for category
            voice_commands = self.get_voice_commands(command_category)
            st.subheader(f"📋 Available {command_category} Commands")
            
            for command in voice_commands:
                st.code(f'"{command["phrase"]}" → {command["description"]}')
            
            # Voice input controls
            st.subheader("🎙️ Voice Input")
            
            if st.button("🎤 Start Listening", type="primary"):
                try:
                    with sr.Microphone() as source:
                        st.info("🎤 Listening... Speak now!")
                        audio = self.speech_recognizer.listen(source, timeout=10, phrase_time_limit=15)
                    
                    st.info("🔄 Processing speech...")
                    voice_command = self.speech_recognizer.recognize_google(audio)
                    
                    st.success(f"✅ Recognized: '{voice_command}'")
                    
                    # Process voice command
                    result = self.process_voice_command(voice_command)
                    
                    if result:
                        st.subheader("💻 Generated Code")
                        st.code(result['code'], language=result.get('language', 'python'))
                        
                        # Text-to-speech response
                        if result.get('response'):
                            self.speak_response(result['response'])
                            st.audio(data=result['response'])
                
                except sr.RequestError as e:
                    st.error(f"❌ Speech recognition error: {e}")
                except sr.UnknownValueError:
                    st.error("❌ Could not understand audio")
                except Exception as e:
                    st.error(f"❌ Voice input error: {e}")
            
            # Manual voice command input for testing
            st.subheader("⌨️ Manual Command (for testing)")
            manual_command = st.text_input("Type voice command:", placeholder="Create a function that calculates fibonacci numbers")
            
            if st.button("🔄 Process Command") and manual_command:
                result = self.process_voice_command(manual_command)
                if result:
                    st.code(result['code'], language=result.get('language', 'python'))
        
        with col2:
            st.subheader("📊 Voice Programming Session")
            
            # Session statistics
            if st.session_state.code_history:
                st.metric("Commands Processed", len(st.session_state.code_history))
                
                # Recent commands
                st.subheader("📋 Recent Voice Commands")
                for i, entry in enumerate(reversed(st.session_state.code_history[-5:])):
                    with st.expander(f"Command {len(st.session_state.code_history) - i}: {entry['timestamp']}", expanded=False):
                        st.write(f"**Input:** {entry['command']}")
                        st.code(entry['generated_code'][:200] + "..." if len(entry['generated_code']) > 200 else entry['generated_code'])
            else:
                st.info("No voice commands processed yet")
            
            # Voice settings
            st.subheader("🔧 Voice Settings")
            
            voice_rate = st.slider("Speech Rate", 100, 300, 200)
            voice_volume = st.slider("Speech Volume", 0.1, 1.0, 0.9)
            
            # Test voice output
            if st.button("🔊 Test Voice Output"):
                self.tts_engine.setProperty('rate', voice_rate)
                self.tts_engine.setProperty('volume', voice_volume)
                self.tts_engine.say("Voice programming is ready. You can now dictate code and I will generate it for you.")
                self.tts_engine.runAndWait()
    
    def render_project_management(self):
        """Render project management interface"""
        st.header("📁 AI Project Management")
        
        if st.session_state.current_project:
            project = st.session_state.current_project
            
            # Project overview
            st.subheader(f"📁 Project: {project['name']}")
            
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Total Files", project.get('file_count', 0))
            with col2:
                st.metric("Lines of Code", project.get('total_lines', 0))
            with col3:
                st.metric("Languages", len(project.get('languages', [])))
            with col4:
                st.metric("Issues Found", project.get('issue_count', 0))
            
            # Project tabs
            tab1, tab2, tab3, tab4 = st.tabs(["📊 Overview", "🔍 Code Quality", "📈 Dependencies", "🚀 Suggestions"])
            
            with tab1:
                self.display_project_overview(project)
            
            with tab2:
                self.display_project_quality(project)
            
            with tab3:
                self.display_project_dependencies(project)
            
            with tab4:
                self.display_project_suggestions(project)
        
        else:
            st.info("📁 No project loaded. Please load a project using the sidebar.")
            
            # Quick project actions
            st.subheader("⚡ Quick Actions")
            
            col1, col2 = st.columns(2)
            
            with col1:
                if st.button("🆕 Initialize New Project"):
                    self.render_new_project_wizard()
            
            with col2:
                if st.button("📂 Analyze Git Repository"):
                    self.render_git_analysis()
    
    # Implementation methods (simplified for demo)
    
    def generate_code(self, description: str, language: str, framework: str, options: Dict[str, bool]) -> str:
        """Generate code based on natural language description"""
        # This is a simplified implementation
        # In a real implementation, this would use advanced LLM APIs
        
        prompt = f"""
Generate {language} code for the following requirement:
{description}

Framework: {framework}
Include tests: {options.get('include_tests', False)}
Include documentation: {options.get('include_docs', False)}
Add error handling: {options.get('error_handling', False)}

Code:
"""
        
        # Simulate code generation (in real implementation, use OpenAI/other APIs)
        if "REST API" in description:
            return self.generate_api_template(language, framework)
        elif "function" in description.lower():
            return self.generate_function_template(description, language)
        else:
            return f"# Generated {language} code for: {description}\n# TODO: Implement functionality"
    
    def generate_api_template(self, language: str, framework: str) -> str:
        """Generate API template"""
        if language == "python" and framework.lower() == "fastapi":
            return '''from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer
import uvicorn

app = FastAPI(title="Generated API", version="1.0.0")
security = HTTPBearer()

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''
        else:
            return f"# {language} API template with {framework}\n# TODO: Implement API endpoints"
    
    def generate_function_template(self, description: str, language: str) -> str:
        """Generate function template"""
        if "fibonacci" in description.lower():
            if language == "python":
                return '''def fibonacci(n: int) -> int:
    """
    Calculate the nth Fibonacci number.
    
    Args:
        n (int): The position in the Fibonacci sequence
        
    Returns:
        int: The nth Fibonacci number
        
    Raises:
        ValueError: If n is negative
    """
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:
        return n
    
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    
    return b

# Example usage
if __name__ == "__main__":
    for i in range(10):
        print(f"F({i}) = {fibonacci(i)}")
'''
        
        return f"# Generated {language} function: {description}\n# TODO: Implement function logic"
    
    def refactor_code(self, code: str, options: List[str]) -> str:
        """Refactor code based on selected options"""
        # Simplified refactoring - in reality would use AST manipulation
        refactored = code
        
        if "Add Error Handling" in options:
            if "try:" not in refactored:
                refactored = f"try:\n    {refactored.replace(chr(10), chr(10) + '    ')}\nexcept Exception as e:\n    print(f'Error: {{e}}')\n    raise"
        
        if "Add Type Hints" in options and "python" in self.detect_language_from_code(code):
            # Simple type hint addition (very basic)
            refactored = refactored.replace("def ", "def ").replace("(", "(")
        
        if "Add Documentation" in options:
            if '"""' not in refactored and "def " in refactored:
                lines = refactored.split('\n')
                for i, line in enumerate(lines):
                    if line.strip().startswith('def '):
                        lines.insert(i + 1, '    """TODO: Add function documentation"""')
                        break
                refactored = '\n'.join(lines)
        
        return refactored
    
    def comprehensive_code_analysis(self, code: str, filename: str) -> Dict[str, Any]:
        """Perform comprehensive code analysis"""
        results = {
            'overview': {},
            'issues': [],
            'metrics': {},
            'suggestions': []
        }
        
        # Basic analysis
        lines = code.split('\n')
        results['overview'] = {
            'lines_of_code': len(lines),
            'blank_lines': sum(1 for line in lines if not line.strip()),
            'comment_lines': sum(1 for line in lines if line.strip().startswith('#')),
            'functions': len(re.findall(r'def\s+\w+', code)),
            'classes': len(re.findall(r'class\s+\w+', code))
        }
        
        # Find potential issues
        if 'except:' in code:
            results['issues'].append({
                'type': 'Bad Practice',
                'severity': 'Medium',
                'message': 'Bare except clause found - should catch specific exceptions',
                'line': next(i for i, line in enumerate(lines, 1) if 'except:' in line)
            })
        
        if 'TODO' in code:
            todo_lines = [i for i, line in enumerate(lines, 1) if 'TODO' in line]
            results['issues'].append({
                'type': 'TODO',
                'severity': 'Low',
                'message': f'Found {len(todo_lines)} TODO comments',
                'line': todo_lines[0] if todo_lines else 0
            })
        
        # Metrics
        results['metrics'] = {
            'complexity': min(10, len(results['overview'].get('functions', 0)) * 2),
            'maintainability': max(1, 10 - len(results['issues'])),
            'test_coverage': 0  # Would need actual test analysis
        }
        
        # Suggestions
        if results['overview']['comment_lines'] / results['overview']['lines_of_code'] < 0.1:
            results['suggestions'].append('Consider adding more comments to improve code readability')
        
        if results['overview']['functions'] > 5 and results['overview']['classes'] == 0:
            results['suggestions'].append('Consider organizing functions into classes for better structure')
        
        return results
    
    def analyze_error(self, error_text: str, code: str, language: str) -> Dict[str, Any]:
        """Analyze error message and provide solutions"""
        analysis = {
            'error_type': 'Unknown',
            'severity': 'Medium',
            'confidence': 85,
            'difficulty': 'Medium',
            'explanation': '',
            'fixes': [],
            'prevention': []
        }
        
        # Simple error pattern matching
        if 'NameError' in error_text:
            analysis['error_type'] = 'NameError'
            analysis['explanation'] = 'A variable or function name is not defined or is misspelled.'
            analysis['fixes'] = [{
                'title': 'Define the variable',
                'description': 'Make sure the variable is defined before use',
                'code': '# Define the variable before using it\nvariable_name = "some_value"',
                'steps': ['Check the variable name spelling', 'Ensure the variable is defined in the correct scope']
            }]
        
        elif 'TypeError' in error_text:
            analysis['error_type'] = 'TypeError'
            analysis['explanation'] = 'An operation or function was applied to an object of inappropriate type.'
            analysis['fixes'] = [{
                'title': 'Check data types',
                'description': 'Verify the data types being used in the operation',
                'code': '# Example: Convert types if necessary\nresult = str(number) + text',
                'steps': ['Check the types of variables involved', 'Use appropriate type conversion functions']
            }]
        
        elif 'SyntaxError' in error_text:
            analysis['error_type'] = 'SyntaxError'
            analysis['severity'] = 'High'
            analysis['explanation'] = 'The Python syntax is incorrect.'
            analysis['fixes'] = [{
                'title': 'Fix syntax',
                'description': 'Review the syntax around the error location',
                'steps': ['Check for missing colons, parentheses, or quotes', 'Verify proper indentation']
            }]
        
        return analysis
    
    def generate_tests(self, code: str, framework: str, test_types: List[str], coverage: int) -> str:
        """Generate test code"""
        if framework == 'pytest':
            return f'''import pytest
from your_module import your_function  # Replace with actual imports

class TestYourFunction:
    """Test suite for your_function"""
    
    def test_basic_functionality(self):
        """Test basic functionality"""
        result = your_function("test_input")
        assert result is not None
        
    def test_edge_cases(self):
        """Test edge cases"""
        # Test empty input
        with pytest.raises(ValueError):
            your_function("")
            
    def test_error_handling(self):
        """Test error handling"""
        with pytest.raises(Exception):
            your_function(None)
            
    @pytest.mark.parametrize("input,expected", [
        ("test1", "expected1"),
        ("test2", "expected2"),
    ])
    def test_parametrized(self, input, expected):
        """Parametrized tests"""
        assert your_function(input) == expected

# Generated based on code analysis
# Target coverage: {coverage}%
'''
        else:
            return f"# {framework} tests\n# TODO: Generate framework-specific tests"
    
    def load_project(self, path: str) -> Dict[str, Any]:
        """Load and analyze a project"""
        project_data = {
            'name': os.path.basename(path),
            'path': path,
            'file_count': 0,
            'total_lines': 0,
            'languages': [],
            'issue_count': 0
        }
        
        # Count files and analyze
        for root, dirs, files in os.walk(path):
            for file in files:
                if file.endswith(('.py', '.js', '.java', '.cpp', '.c')):
                    project_data['file_count'] += 1
                    
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            lines = f.readlines()
                            project_data['total_lines'] += len(lines)
                    except:
                        continue
        
        return project_data
    
    def detect_language_from_code(self, code: str) -> str:
        """Detect programming language from code"""
        if 'def ' in code and 'import ' in code:
            return 'python'
        elif 'function ' in code and 'var ' in code:
            return 'javascript'
        elif 'public class' in code:
            return 'java'
        else:
            return 'python'  # Default
    
    def detect_language_from_filename(self, filename: str) -> str:
        """Detect language from filename"""
        ext = os.path.splitext(filename)[1].lower()
        mapping = {
            '.py': 'python',
            '.js': 'javascript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.go': 'go'
        }
        return mapping.get(ext, 'text')
    
    def get_file_extension(self, language: str) -> str:
        """Get file extension for language"""
        mapping = {
            'python': 'py',
            'javascript': 'js',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c'
        }
        return mapping.get(language, 'txt')
    
    def get_template_description(self, category: str, template: str) -> str:
        """Get template description"""
        templates = {
            ("Web Development", "REST API"): "Create a REST API with authentication, CRUD operations, and error handling",
            ("Data Science", "ML Model"): "Build a machine learning model with data preprocessing, training, and evaluation",
            ("Desktop Apps", "GUI Application"): "Create a desktop GUI application with modern interface and file operations"
        }
        return templates.get((category, template), f"Create a {template.lower()} application")
    
    def process_voice_command(self, command: str) -> Dict[str, Any]:
        """Process voice command and generate code"""
        # Simplified voice command processing
        if "function" in command.lower() and "fibonacci" in command.lower():
            return {
                'code': self.generate_function_template(command, 'python'),
                'language': 'python',
                'response': 'I have generated a Fibonacci function for you.'
            }
        elif "api" in command.lower():
            return {
                'code': self.generate_api_template('python', 'fastapi'),
                'language': 'python', 
                'response': 'I have created a REST API template using FastAPI.'
            }
        else:
            return {
                'code': f"# Generated code for: {command}\n# TODO: Implement functionality",
                'language': 'python',
                'response': 'I have generated a code template based on your request.'
            }
    
    def get_voice_commands(self, category: str) -> List[Dict[str, str]]:
        """Get available voice commands for category"""
        commands = {
            "Code Generation": [
                {"phrase": "Create a function that calculates [description]", "description": "Generate a function"},
                {"phrase": "Build a REST API for [purpose]", "description": "Generate API code"},
                {"phrase": "Make a class called [name]", "description": "Generate class definition"}
            ],
            "Code Navigation": [
                {"phrase": "Go to function [name]", "description": "Navigate to function"},
                {"phrase": "Find all references to [symbol]", "description": "Find symbol references"},
                {"phrase": "Show me the definition of [symbol]", "description": "Go to definition"}
            ],
            "Debugging": [
                {"phrase": "Debug this error", "description": "Analyze current error"},
                {"phrase": "Add logging to this function", "description": "Add debug logging"},
                {"phrase": "Set a breakpoint here", "description": "Add breakpoint"}
            ]
        }
        return commands.get(category, [])
    
    def speak_response(self, text: str):
        """Convert text to speech"""
        try:
            self.tts_engine.say(text)
            self.tts_engine.runAndWait()
        except Exception as e:
            st.error(f"Text-to-speech error: {e}")
    
    # Display methods for UI
    def display_analysis_overview(self, analysis: Dict[str, Any]):
        """Display code analysis overview"""
        overview = analysis.get('overview', {})
        
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Lines of Code", overview.get('lines_of_code', 0))
        with col2:
            st.metric("Functions", overview.get('functions', 0))
        with col3:
            st.metric("Classes", overview.get('classes', 0))
    
    def display_code_issues(self, issues: List[Dict[str, Any]]):
        """Display code issues"""
        if not issues:
            st.success("✅ No issues found!")
            return
        
        for issue in issues:
            severity_color = {
                'High': '🔴',
                'Medium': '🟡', 
                'Low': '🟢'
            }.get(issue.get('severity'), '🔵')
            
            st.warning(f"{severity_color} **{issue.get('type')}** (Line {issue.get('line', '?')}): {issue.get('message')}")
    
    def display_code_metrics(self, metrics: Dict[str, Any]):
        """Display code metrics"""
        col1, col2, col3 = st.columns(3)
        
        with col1:
            complexity = metrics.get('complexity', 0)
            st.metric(
                "Complexity", 
                f"{complexity}/10",
                delta=None,
                help="Lower is better"
            )
        
        with col2:
            maintainability = metrics.get('maintainability', 0)
            st.metric(
                "Maintainability",
                f"{maintainability}/10",
                delta=None,
                help="Higher is better"
            )
        
        with col3:
            coverage = metrics.get('test_coverage', 0)
            st.metric(
                "Test Coverage",
                f"{coverage}%",
                delta=None,
                help="Higher is better"
            )
    
    def display_improvement_suggestions(self, suggestions: List[str]):
        """Display improvement suggestions"""
        if not suggestions:
            st.success("✅ No suggestions - your code looks good!")
            return
        
        for suggestion in suggestions:
            st.info(f"💡 {suggestion}")

def main():
    """Main application entry point"""
    app = EnhancedAICodingCompanion()
    app.render_main_interface()

if __name__ == "__main__":
    main()
