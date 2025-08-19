#!/usr/bin/env python3
"""
🚀 SUPERMEGA CENTRAL DASHBOARD
==============================
Central hub for accessing all SuperMega AI products
Professional product showcase with direct access to all tools
"""

import streamlit as st
import requests
import time
from datetime import datetime

st.set_page_config(
    page_title="SuperMega AI Products",
    page_icon="🚀",
    layout="wide"
)

# Custom CSS for professional styling
st.markdown("""
<style>
    .main-header {
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        padding: 2rem;
        border-radius: 10px;
        color: white;
        text-align: center;
        margin-bottom: 2rem;
    }
    
    .product-card {
        background: white;
        padding: 1.5rem;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        margin-bottom: 1rem;
        border-left: 4px solid #667eea;
    }
    
    .status-online {
        color: #28a745;
        font-weight: bold;
    }
    
    .status-offline {
        color: #dc3545;
        font-weight: bold;
    }
    
    .launch-button {
        background-color: #667eea;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 5px;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
    }
    
    .feature-list {
        list-style-type: none;
        padding-left: 0;
    }
    
    .feature-list li {
        padding: 0.25rem 0;
    }
    
    .feature-list li:before {
        content: "✨ ";
        color: #667eea;
    }
</style>
""", unsafe_allow_html=True)

def check_service_status(port):
    """Check if a service is running on the given port"""
    try:
        response = requests.get(f"http://localhost:{port}", timeout=2)
        return True
    except:
        return False

# Main header
st.markdown("""
<div class="main-header">
    <h1>🚀 SuperMega AI Products</h1>
    <h3>Professional AI Tools Suite - Next Generation</h3>
    <p>Advanced AI-powered tools with professional open-source integration</p>
</div>
""", unsafe_allow_html=True)

# Product portfolio
products = {
    "orchestrator": {
        "name": "🎯 SuperMega AI Orchestrator",
        "port": 8509,
        "description": "Central management hub for all AI products and innovations",
        "features": ["Product Portfolio Management", "Market Analysis", "Tool Optimization", "Innovation Roadmap"],
        "status": "primary"
    },
    "universal_editor": {
        "name": "🎬 Universal Content Creator",
        "port": 8503,
        "description": "AI-powered video editing for any content type with natural language control",
        "features": ["Natural Language Editing", "Content Type Detection", "Voice Control", "Professional Effects"],
        "status": "product"
    },
    "voice_studio": {
        "name": "🎤 Advanced Voice Studio Pro",
        "port": 8504,
        "description": "Professional voice cloning with guided collection and quality feedback",
        "features": ["Guided Voice Collection", "Quality Analysis", "Celebrity Templates", "Professional Synthesis"],
        "status": "product"
    },
    "coding_companion": {
        "name": "💻 Enhanced Coding Companion",
        "port": 8505,
        "description": "Advanced AI coding assistant with unique capabilities beyond GitHub Copilot",
        "features": ["Architecture Analysis", "Cross-Language Translation", "Voice Programming", "AI Pair Sessions"],
        "status": "product"
    },
    "business_intelligence": {
        "name": "📊 Business Intelligence Suite",
        "port": 8506,
        "description": "AI-powered business analytics with predictive insights and automation",
        "features": ["Executive Dashboard", "Predictive Analytics", "Business Tool Integration", "AI Insights"],
        "status": "product"
    },
    "research_hub": {
        "name": "🔬 Research Intelligence Hub",
        "port": 8507,
        "description": "Advanced research platform for academics and professionals",
        "features": ["Literature Analysis", "Knowledge Graphs", "Collaboration Tools", "Research Insights"],
        "status": "product"
    },
    "design_suite": {
        "name": "🎨 Creative Design Suite",
        "port": 8508,
        "description": "Professional design tools with Blender, FreeCAD, and AI enhancements",
        "features": ["3D Modeling Integration", "CAD Engineering", "AI Design Assistant", "Collaborative Workspace"],
        "status": "product"
    }
}

# Display products in grid
col1, col2 = st.columns(2)

for i, (key, product) in enumerate(products.items()):
    with col1 if i % 2 == 0 else col2:
        
        # Check service status
        is_online = check_service_status(product["port"])
        status_class = "status-online" if is_online else "status-offline"
        status_text = "🟢 ONLINE" if is_online else "🔴 OFFLINE"
        
        st.markdown(f"""
        <div class="product-card">
            <h3>{product['name']}</h3>
            <p><strong>Status:</strong> <span class="{status_class}">{status_text}</span></p>
            <p><strong>Port:</strong> {product['port']}</p>
            <p>{product['description']}</p>
            
            <h4>Key Features:</h4>
            <ul class="feature-list">
                {''.join([f'<li>{feature}</li>' for feature in product['features']])}
            </ul>
        </div>
        """, unsafe_allow_html=True)
        
        if is_online:
            if st.button(f"🚀 Launch {product['name']}", key=f"launch_{key}"):
                st.write(f"Opening {product['name']} at http://localhost:{product['port']}")
                st.markdown(f'<a href="http://localhost:{product["port"]}" target="_blank" class="launch-button">Open in New Tab</a>', unsafe_allow_html=True)
        else:
            st.error(f"❌ {product['name']} is not running")
            if st.button(f"ℹ️ How to start {product['name']}", key=f"help_{key}"):
                st.info(f"To start: `streamlit run {key}.py --server.port {product['port']}`")

# System overview
st.markdown("---")
st.header("📊 System Overview")

col1, col2, col3, col4 = st.columns(4)

online_count = sum(1 for product in products.values() if check_service_status(product["port"]))
total_count = len(products)

with col1:
    st.metric("Total Products", total_count)
with col2:
    st.metric("Online Products", online_count)
with col3:
    st.metric("System Health", f"{(online_count/total_count)*100:.0f}%")
with col4:
    st.metric("Last Updated", datetime.now().strftime("%H:%M:%S"))

# Product categories
st.header("🏢 Product Categories")

categories = {
    "🎯 Management & Orchestration": ["orchestrator"],
    "🎨 Creative & Content": ["universal_editor", "voice_studio", "design_suite"], 
    "💻 Development & Analysis": ["coding_companion", "research_hub"],
    "📊 Business & Intelligence": ["business_intelligence"]
}

for category, product_keys in categories.items():
    with st.expander(category):
        for key in product_keys:
            if key in products:
                product = products[key]
                is_online = check_service_status(product["port"])
                status_icon = "🟢" if is_online else "🔴"
                
                col1, col2, col3 = st.columns([3, 1, 1])
                with col1:
                    st.write(f"{product['name']}")
                with col2:
                    st.write(f"{status_icon} Port {product['port']}")
                with col3:
                    if is_online:
                        st.markdown(f'<a href="http://localhost:{product["port"]}" target="_blank">Launch</a>', unsafe_allow_html=True)

# Quick links
st.markdown("---")
st.header("🔗 Quick Access")

quick_links = []
for key, product in products.items():
    if check_service_status(product["port"]):
        quick_links.append(f'<a href="http://localhost:{product["port"]}" target="_blank" class="launch-button" style="margin: 0.25rem;">{product["name"]}</a>')

if quick_links:
    st.markdown('<div style="text-align: center; padding: 1rem;">' + ' '.join(quick_links) + '</div>', unsafe_allow_html=True)
else:
    st.warning("⚠️ No products are currently running. Please start the individual applications.")

# Refresh button
if st.button("🔄 Refresh Status"):
    st.rerun()

# Footer
st.markdown("---")
st.markdown("""
<div style="text-align: center; color: gray; padding: 1rem;">
    <p>🚀 <strong>SuperMega AI Products</strong> - Professional AI Tools Suite</p>
    <p>Built with advanced open-source integration and enterprise-grade capabilities</p>
    <p><em>Revolutionizing productivity with AI-enhanced workflows</em></p>
</div>
""", unsafe_allow_html=True)
