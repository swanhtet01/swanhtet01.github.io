#!/usr/bin/env python3
"""
🤖 LLM CHAT INTERFACE
Direct chat with AI agents and LLM models
"""

import streamlit as st
import requests
import json
import subprocess
import os
from datetime import datetime
from typing import Dict, List, Any

class LLMChatInterface:
    def __init__(self):
        self.models = {
            'llama3.2': {'size': '3B', 'speed': 'fast', 'quality': 'good'},
            'llama3.1': {'size': '8B', 'speed': 'medium', 'quality': 'excellent'},
            'codellama': {'size': '7B', 'speed': 'medium', 'quality': 'code-focused'},
            'mistral': {'size': '7B', 'speed': 'fast', 'quality': 'excellent'}
        }
        
        self.agents = {
            'VideoAI': 'Expert in video processing, editing, and computer vision',
            'DataAI': 'Expert in data analysis, ML models, and insights',
            'WebAI': 'Expert in web scraping, automation, and monitoring',
            'DevAI': 'Expert in software development and architecture',
            'BusinessAI': 'Expert in business strategy and optimization'
        }
        
        self.chat_history = []
        self.current_agent = None
        
    def check_ollama_status(self) -> bool:
        """Check if Ollama is running"""
        try:
            response = requests.get('http://localhost:11434/api/tags', timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def install_ollama(self):
        """Install Ollama if not present"""
        st.info("🔄 Installing Ollama...")
        
        try:
            # Download and install Ollama
            if os.name == 'nt':  # Windows
                subprocess.run(['powershell', '-Command', 
                    'Invoke-WebRequest -Uri https://ollama.ai/install.ps1 -UseBasicParsing | Invoke-Expression'],
                    check=True)
            else:  # Linux/Mac
                subprocess.run(['curl', '-fsSL', 'https://ollama.ai/install.sh', '|', 'sh'], check=True)
            
            st.success("✅ Ollama installed successfully!")
            return True
        except:
            st.error("❌ Failed to install Ollama automatically")
            st.info("Please install manually from https://ollama.ai")
            return False
    
    def pull_model(self, model_name: str) -> bool:
        """Pull model from Ollama"""
        try:
            with st.spinner(f"Downloading {model_name}..."):
                subprocess.run(['ollama', 'pull', model_name], check=True, capture_output=True)
            return True
        except:
            return False
    
    def chat_with_llm(self, message: str, model: str = 'llama3.2') -> str:
        """Send message to LLM and get response"""
        try:
            response = requests.post('http://localhost:11434/api/generate', 
                json={
                    'model': model,
                    'prompt': message,
                    'stream': False
                },
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json().get('response', 'No response')
            else:
                return f"Error: {response.status_code}"
                
        except Exception as e:
            return f"Error: {str(e)}"
    
    def chat_with_agent(self, message: str, agent: str) -> str:
        """Chat with specific AI agent"""
        agent_context = f"""You are {agent}, an expert AI agent.
{self.agents.get(agent, '')}

User message: {message}

Respond as the {agent} agent with practical, actionable advice."""
        
        return self.chat_with_llm(agent_context, 'llama3.2')
    
    def execute_agent_command(self, command: str, agent: str) -> Dict[str, Any]:
        """Execute command through agent"""
        if agent == 'VideoAI' and 'process' in command.lower():
            return {"status": "processing", "message": "Video processing started"}
        elif agent == 'DataAI' and 'analyze' in command.lower():
            return {"status": "analyzing", "message": "Data analysis initiated"}
        elif agent == 'WebAI' and 'scrape' in command.lower():
            return {"status": "scraping", "message": "Web scraping started"}
        else:
            return {"status": "unknown", "message": "Command not recognized"}

def create_chat_interface():
    """Create Streamlit chat interface"""
    st.set_page_config(page_title="🤖 LLM Chat Interface", layout="wide")
    
    st.title("🤖 LLM Chat Interface")
    st.write("Chat with AI models and specialized agents")
    
    chat = LLMChatInterface()
    
    # Sidebar - Model selection
    with st.sidebar:
        st.header("🔧 Configuration")
        
        # Check Ollama status
        ollama_running = chat.check_ollama_status()
        
        if ollama_running:
            st.success("✅ Ollama is running")
        else:
            st.error("❌ Ollama not running")
            if st.button("🚀 Start Ollama"):
                try:
                    subprocess.Popen(['ollama', 'serve'])
                    st.success("Ollama started!")
                    st.experimental_rerun()
                except:
                    if st.button("📥 Install Ollama"):
                        chat.install_ollama()
        
        # Model selection
        st.subheader("🧠 Choose Model")
        selected_model = st.selectbox(
            "Select LLM:",
            list(chat.models.keys()),
            format_func=lambda x: f"{x} ({chat.models[x]['size']}, {chat.models[x]['speed']})"
        )
        
        # Model info
        model_info = chat.models[selected_model]
        st.info(f"**Size:** {model_info['size']}\n**Speed:** {model_info['speed']}\n**Quality:** {model_info['quality']}")
        
        # Pull model if needed
        if ollama_running:
            if st.button(f"📥 Pull {selected_model}"):
                if chat.pull_model(selected_model):
                    st.success(f"✅ {selected_model} ready")
                else:
                    st.error("❌ Failed to pull model")
        
        st.divider()
        
        # Agent selection
        st.subheader("🤖 Choose Agent")
        selected_agent = st.selectbox("Select AI Agent:", ['Direct LLM'] + list(chat.agents.keys()))
        
        if selected_agent != 'Direct LLM':
            st.info(chat.agents[selected_agent])
        
        st.divider()
        
        # Quick actions
        st.subheader("⚡ Quick Actions")
        if st.button("🎬 Process Video"):
            st.session_state.messages.append({
                "role": "assistant", 
                "content": "VideoAI agent activated. Please upload a video or describe what you want to do."
            })
        
        if st.button("📊 Analyze Data"):
            st.session_state.messages.append({
                "role": "assistant",
                "content": "DataAI agent activated. Please upload data or describe your analysis needs."
            })
        
        if st.button("🌐 Scrape Website"):
            st.session_state.messages.append({
                "role": "assistant", 
                "content": "WebAI agent activated. What website or data do you want to collect?"
            })
    
    # Main chat area
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": "Hello! I'm your AI assistant. Choose a model and agent, then start chatting!"}
        ]
    
    # Display chat history
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Chat input
    if prompt := st.chat_input("Type your message here..."):
        # Add user message
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Generate response
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                if ollama_running:
                    if selected_agent == 'Direct LLM':
                        response = chat.chat_with_llm(prompt, selected_model)
                    else:
                        response = chat.chat_with_agent(prompt, selected_agent)
                else:
                    response = "❌ Ollama is not running. Please start Ollama first."
            
            st.markdown(response)
        
        # Add assistant response
        st.session_state.messages.append({"role": "assistant", "content": response})
    
    # File upload area
    st.divider()
    st.subheader("📁 File Processing")
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        uploaded_video = st.file_uploader("🎬 Upload Video", type=['mp4', 'avi', 'mov'])
        if uploaded_video:
            st.success("Video uploaded! Ask VideoAI to process it.")
    
    with col2:
        uploaded_data = st.file_uploader("📊 Upload Data", type=['csv', 'xlsx', 'json'])
        if uploaded_data:
            st.success("Data uploaded! Ask DataAI to analyze it.")
    
    with col3:
        uploaded_doc = st.file_uploader("📄 Upload Document", type=['pdf', 'txt', 'docx'])
        if uploaded_doc:
            st.success("Document uploaded! Ask any agent to process it.")
    
    # Command execution area
    st.divider()
    st.subheader("⚡ Agent Commands")
    
    command_input = st.text_input("Direct Agent Command:", placeholder="e.g., 'process video with blur effect'")
    
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🚀 Execute Command") and command_input:
            if selected_agent != 'Direct LLM':
                result = chat.execute_agent_command(command_input, selected_agent)
                st.json(result)
            else:
                st.warning("Select an AI agent first")
    
    with col2:
        if st.button("🔄 Clear Chat"):
            st.session_state.messages = [
                {"role": "assistant", "content": "Chat cleared! How can I help you?"}
            ]
            st.experimental_rerun()

if __name__ == "__main__":
    create_chat_interface()
