#!/usr/bin/env python3
"""
🔬 RESEARCH INTELLIGENCE HUB
============================
Advanced AI-powered research platform for academics, analysts, and professionals
- Automated literature analysis and synthesis
- Interactive knowledge graphs and visualization
- Collaborative research workspaces
- Citation management and academic writing assistance
- Multi-modal research data integration
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import networkx as nx
from plotly.subplots import make_subplots
import numpy as np
from datetime import datetime, timedelta
import json
import asyncio
import random
import re
from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Set
import nltk
from collections import defaultdict, Counter

# Configure Streamlit
st.set_page_config(
    page_title="Research Intelligence Hub",
    page_icon="🔬",
    layout="wide"
)

@dataclass
class ResearchPaper:
    title: str
    authors: List[str]
    abstract: str
    keywords: List[str]
    publication_year: int
    journal: str
    citations: int
    doi: str

@dataclass
class ResearchProject:
    name: str
    description: str
    papers: List[ResearchPaper]
    collaborators: List[str]
    status: str
    created_date: datetime

class ResearchIntelligenceHub:
    def __init__(self):
        # Research domains and topics
        self.research_domains = {
            "artificial_intelligence": [
                "machine learning", "deep learning", "natural language processing", 
                "computer vision", "robotics", "neural networks", "reinforcement learning"
            ],
            "medicine": [
                "clinical trials", "drug discovery", "genetics", "immunology", 
                "oncology", "neuroscience", "public health", "epidemiology"
            ],
            "physics": [
                "quantum mechanics", "particle physics", "astrophysics", "condensed matter",
                "thermodynamics", "optics", "relativity", "cosmology"
            ],
            "biology": [
                "molecular biology", "genetics", "evolution", "ecology", "biochemistry",
                "cell biology", "developmental biology", "bioinformatics"
            ],
            "chemistry": [
                "organic chemistry", "inorganic chemistry", "physical chemistry", 
                "analytical chemistry", "biochemistry", "materials science"
            ],
            "social_sciences": [
                "psychology", "sociology", "economics", "political science", 
                "anthropology", "linguistics", "education", "criminology"
            ]
        }
        
        # Academic databases
        self.databases = {
            "PubMed": {"focus": "biomedical", "papers": "30M+", "access": "free"},
            "ArXiv": {"focus": "physics, mathematics, CS", "papers": "2M+", "access": "free"},
            "IEEE Xplore": {"focus": "engineering, technology", "papers": "5M+", "access": "subscription"},
            "ScienceDirect": {"focus": "multidisciplinary", "papers": "16M+", "access": "subscription"},
            "Google Scholar": {"focus": "multidisciplinary", "papers": "400M+", "access": "free"},
            "JSTOR": {"focus": "humanities, social sciences", "papers": "12M+", "access": "subscription"},
            "SpringerLink": {"focus": "STM, humanities", "papers": "10M+", "access": "subscription"},
            "Nature": {"focus": "high-impact science", "papers": "500K+", "access": "subscription"}
        }
        
        # Generate sample research data
        self.generate_sample_research_data()
        
        # Initialize knowledge graph
        self.knowledge_graph = self.create_knowledge_graph()
    
    def generate_sample_research_data(self):
        """Generate realistic sample research data"""
        # Sample papers
        sample_papers = [
            ResearchPaper(
                title="Transformer-Based Models for Automated Scientific Literature Review",
                authors=["Dr. Sarah Chen", "Prof. Michael Rodriguez", "Dr. Aisha Patel"],
                abstract="This paper presents a novel approach to automated literature review using transformer-based language models. We demonstrate significant improvements in accuracy and coverage compared to traditional methods.",
                keywords=["natural language processing", "literature review", "transformers", "automation"],
                publication_year=2024,
                journal="Nature Machine Intelligence",
                citations=45,
                doi="10.1038/s42256-024-00789-x"
            ),
            ResearchPaper(
                title="CRISPR-Cas9 Applications in Neurological Disorders: A Comprehensive Analysis",
                authors=["Dr. James Wilson", "Dr. Lisa Thompson", "Prof. Robert Kim"],
                abstract="We analyze the current applications and future potential of CRISPR-Cas9 gene editing in treating neurological disorders, reviewing 200+ clinical trials and experimental studies.",
                keywords=["CRISPR", "gene editing", "neurology", "therapeutics"],
                publication_year=2023,
                journal="Nature Biotechnology",
                citations=128,
                doi="10.1038/s41587-023-01234-x"
            ),
            ResearchPaper(
                title="Quantum Error Correction in Near-Term Quantum Devices",
                authors=["Prof. Anna Kowalski", "Dr. David Lee", "Dr. Maria Santos"],
                abstract="This work investigates practical quantum error correction schemes for near-term quantum computers, proposing new algorithms that reduce overhead while maintaining fidelity.",
                keywords=["quantum computing", "error correction", "quantum algorithms", "quantum physics"],
                publication_year=2024,
                journal="Physical Review Letters",
                citations=67,
                doi="10.1103/PhysRevLett.132.123456"
            )
        ]
        
        self.sample_papers = sample_papers
        
        # Research projects
        self.research_projects = [
            ResearchProject(
                name="AI-Driven Drug Discovery Platform",
                description="Developing machine learning models for accelerated pharmaceutical research",
                papers=sample_papers[:2],
                collaborators=["University of Toronto", "Pfizer Research", "MIT AI Lab"],
                status="active",
                created_date=datetime.now() - timedelta(days=90)
            ),
            ResearchProject(
                name="Quantum Computing Applications in Cryptography",
                description="Exploring post-quantum cryptography and security implications",
                papers=[sample_papers[2]],
                collaborators=["IBM Research", "Oxford University", "NIST"],
                status="planning",
                created_date=datetime.now() - timedelta(days=30)
            )
        ]
        
        # Research metrics
        self.research_metrics = {
            "papers_analyzed": random.randint(5000, 15000),
            "citations_tracked": random.randint(50000, 200000),
            "collaborators": random.randint(50, 200),
            "active_projects": len(self.research_projects),
            "knowledge_nodes": random.randint(1000, 5000),
            "research_domains": len(self.research_domains)
        }
    
    def create_knowledge_graph(self) -> nx.Graph:
        """Create a sample knowledge graph"""
        G = nx.Graph()
        
        # Add nodes for research topics
        for domain, topics in self.research_domains.items():
            G.add_node(domain, node_type="domain", size=20)
            
            for topic in topics:
                G.add_node(topic, node_type="topic", size=10)
                G.add_edge(domain, topic, weight=1.0)
        
        # Add connections between related topics
        ai_topics = self.research_domains["artificial_intelligence"]
        for i, topic1 in enumerate(ai_topics):
            for topic2 in ai_topics[i+1:]:
                if random.random() < 0.3:  # 30% chance of connection
                    G.add_edge(topic1, topic2, weight=random.uniform(0.1, 1.0))
        
        # Add paper nodes
        for paper in self.sample_papers:
            G.add_node(paper.title, node_type="paper", size=8)
            for keyword in paper.keywords:
                if keyword in G.nodes():
                    G.add_edge(paper.title, keyword, weight=0.8)
        
        return G
    
    def analyze_literature_trends(self) -> Dict[str, Any]:
        """Analyze trends in research literature"""
        # Simulate trend analysis
        trends = {}
        
        for domain, topics in self.research_domains.items():
            domain_trends = {}
            
            for topic in topics:
                # Simulate publication growth
                years = list(range(2020, 2025))
                publications = [random.randint(100, 1000) * (1 + random.uniform(-0.3, 0.5)) for _ in years]
                
                # Calculate trend direction
                trend_direction = "increasing" if publications[-1] > publications[0] else "decreasing"
                growth_rate = ((publications[-1] - publications[0]) / publications[0]) * 100
                
                domain_trends[topic] = {
                    "publications_by_year": dict(zip(years, publications)),
                    "trend_direction": trend_direction,
                    "growth_rate": growth_rate,
                    "total_publications": sum(publications),
                    "average_citations": random.randint(5, 50)
                }
            
            trends[domain] = domain_trends
        
        return trends
    
    def generate_research_insights(self) -> List[Dict[str, Any]]:
        """Generate AI-powered research insights"""
        insights = []
        
        # Analyze trends
        trends = self.analyze_literature_trends()
        
        # Find emerging topics
        for domain, domain_trends in trends.items():
            for topic, data in domain_trends.items():
                if data["growth_rate"] > 50:  # High growth topics
                    insights.append({
                        "type": "emerging_trend",
                        "domain": domain,
                        "topic": topic,
                        "insight": f"{topic.title()} shows {data['growth_rate']:.1f}% growth in publications",
                        "recommendation": f"Consider focusing research efforts on {topic} due to rapid growth",
                        "confidence": min(95, 60 + data["growth_rate"])
                    })
        
        # Identify collaboration opportunities
        insights.append({
            "type": "collaboration_opportunity",
            "domain": "interdisciplinary",
            "topic": "AI + Medicine",
            "insight": "Strong publication overlap between AI and medical research suggests collaboration potential",
            "recommendation": "Explore joint projects combining machine learning with clinical research",
            "confidence": 78
        })
        
        # Research gap analysis
        insights.append({
            "type": "research_gap",
            "domain": "artificial_intelligence",
            "topic": "AI ethics in healthcare",
            "insight": "Limited research on ethical implications of AI in medical decision-making",
            "recommendation": "Investigate regulatory frameworks and ethical guidelines for medical AI",
            "confidence": 85
        })
        
        return insights
    
    def create_literature_dashboard(self):
        """Literature analysis and trends dashboard"""
        st.header("📚 Literature Analysis & Trends")
        
        # Key metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Papers Analyzed", f"{self.research_metrics['papers_analyzed']:,}")
        with col2:
            st.metric("Citations Tracked", f"{self.research_metrics['citations_tracked']:,}")
        with col3:
            st.metric("Active Collaborators", self.research_metrics['collaborators'])
        with col4:
            st.metric("Research Domains", self.research_metrics['research_domains'])
        
        # Domain selection
        selected_domain = st.selectbox(
            "Select Research Domain:",
            list(self.research_domains.keys()),
            format_func=lambda x: x.replace('_', ' ').title()
        )
        
        # Analyze selected domain
        trends = self.analyze_literature_trends()
        domain_data = trends[selected_domain]
        
        # Publication trends chart
        st.subheader(f"📈 Publication Trends in {selected_domain.replace('_', ' ').title()}")
        
        # Create multi-line chart for top topics
        top_topics = sorted(domain_data.items(), key=lambda x: x[1]["total_publications"], reverse=True)[:5]
        
        fig = go.Figure()
        
        for topic, data in top_topics:
            years = list(data["publications_by_year"].keys())
            publications = list(data["publications_by_year"].values())
            
            fig.add_trace(go.Scatter(
                x=years,
                y=publications,
                mode='lines+markers',
                name=topic.replace('_', ' ').title(),
                line=dict(width=2)
            ))
        
        fig.update_layout(
            title=f"Publication Trends - Top 5 Topics in {selected_domain.replace('_', ' ').title()}",
            xaxis_title="Year",
            yaxis_title="Number of Publications",
            hovermode='x unified',
            height=500
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        # Topic analysis
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🔥 Trending Topics")
            
            # Sort by growth rate
            trending_topics = sorted(
                domain_data.items(),
                key=lambda x: x[1]["growth_rate"],
                reverse=True
            )[:10]
            
            for topic, data in trending_topics:
                growth_icon = "📈" if data["growth_rate"] > 0 else "📉"
                st.write(f"{growth_icon} **{topic.replace('_', ' ').title()}**")
                st.write(f"   Growth: {data['growth_rate']:+.1f}% | Publications: {data['total_publications']:,}")
        
        with col2:
            st.subheader("📊 Citation Analysis")
            
            # Citation distribution
            topics = [topic.replace('_', ' ').title() for topic, _ in top_topics]
            citations = [data["average_citations"] for _, data in top_topics]
            
            fig = go.Figure(data=[
                go.Bar(x=topics, y=citations, marker_color='lightblue')
            ])
            
            fig.update_layout(
                title="Average Citations per Topic",
                xaxis_title="Research Topics",
                yaxis_title="Average Citations",
                height=400
            )
            
            st.plotly_chart(fig, use_container_width=True)
        
        # Database integration status
        st.subheader("🗄️ Database Integration Status")
        
        for db_name, db_info in self.databases.items():
            col1, col2, col3, col4 = st.columns(4)
            
            with col1:
                st.write(f"**{db_name}**")
            with col2:
                st.write(f"Focus: {db_info['focus']}")
            with col3:
                st.write(f"Papers: {db_info['papers']}")
            with col4:
                access_icon = "🟢" if db_info['access'] == 'free' else "🟡"
                st.write(f"{access_icon} {db_info['access']}")
    
    def create_knowledge_graph_dashboard(self):
        """Interactive knowledge graph visualization"""
        st.header("🕸️ Knowledge Graph Explorer")
        
        # Graph controls
        col1, col2, col3 = st.columns(3)
        
        with col1:
            layout_type = st.selectbox("Graph Layout", ["spring", "circular", "random", "shell"])
        with col2:
            node_size_factor = st.slider("Node Size", 1, 5, 3)
        with col3:
            show_labels = st.checkbox("Show Labels", True)
        
        # Create network visualization
        pos = getattr(nx, f"{layout_type}_layout")(self.knowledge_graph)
        
        # Extract node and edge information
        node_trace = go.Scatter(
            x=[pos[node][0] for node in self.knowledge_graph.nodes()],
            y=[pos[node][1] for node in self.knowledge_graph.nodes()],
            mode='markers+text' if show_labels else 'markers',
            text=[node.replace('_', ' ').title() for node in self.knowledge_graph.nodes()],
            textposition="middle center",
            hoverinfo='text',
            hovertext=[f"Node: {node}<br>Type: {self.knowledge_graph.nodes[node].get('node_type', 'unknown')}" 
                      for node in self.knowledge_graph.nodes()],
            marker=dict(
                size=[self.knowledge_graph.nodes[node].get('size', 10) * node_size_factor 
                     for node in self.knowledge_graph.nodes()],
                color=[hash(self.knowledge_graph.nodes[node].get('node_type', 'default')) % 10 
                      for node in self.knowledge_graph.nodes()],
                colorscale='Viridis',
                showscale=True,
                colorbar=dict(title="Node Type")
            )
        )
        
        # Create edges
        edge_traces = []
        for edge in self.knowledge_graph.edges():
            x0, y0 = pos[edge[0]]
            x1, y1 = pos[edge[1]]
            
            edge_trace = go.Scatter(
                x=[x0, x1, None],
                y=[y0, y1, None],
                mode='lines',
                line=dict(width=0.5, color='rgba(125,125,125,0.3)'),
                hoverinfo='none'
            )
            edge_traces.append(edge_trace)
        
        # Create figure
        fig = go.Figure(data=[node_trace] + edge_traces)
        fig.update_layout(
            title="Research Knowledge Graph",
            showlegend=False,
            hovermode='closest',
            margin=dict(b=20,l=5,r=5,t=40),
            annotations=[ dict(
                text="Interactive knowledge graph showing research topics, domains, and connections",
                showarrow=False,
                xref="paper", yref="paper",
                x=0.005, y=-0.002,
                xanchor='left', yanchor='bottom',
                font=dict(color="gray", size=12)
            )],
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            height=600
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        # Graph statistics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total Nodes", self.knowledge_graph.number_of_nodes())
        with col2:
            st.metric("Total Connections", self.knowledge_graph.number_of_edges())
        with col3:
            avg_degree = sum(dict(self.knowledge_graph.degree()).values()) / self.knowledge_graph.number_of_nodes()
            st.metric("Avg Connections", f"{avg_degree:.1f}")
        with col4:
            components = nx.number_connected_components(self.knowledge_graph)
            st.metric("Connected Components", components)
        
        # Node analysis
        st.subheader("🔍 Node Analysis")
        
        # Most connected nodes
        degree_centrality = nx.degree_centrality(self.knowledge_graph)
        top_nodes = sorted(degree_centrality.items(), key=lambda x: x[1], reverse=True)[:10]
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.write("**Most Connected Nodes:**")
            for node, centrality in top_nodes:
                st.write(f"• {node.replace('_', ' ').title()}: {centrality:.3f}")
        
        with col2:
            # Centrality distribution
            centrality_values = list(degree_centrality.values())
            fig = go.Figure(data=[
                go.Histogram(x=centrality_values, nbinsx=20, marker_color='lightblue')
            ])
            fig.update_layout(
                title="Node Centrality Distribution",
                xaxis_title="Degree Centrality",
                yaxis_title="Count",
                height=300
            )
            st.plotly_chart(fig, use_container_width=True)
    
    def create_collaboration_dashboard(self):
        """Research collaboration and project management"""
        st.header("🤝 Research Collaboration Hub")
        
        # Project overview
        col1, col2, col3 = st.columns(3)
        
        with col1:
            active_projects = len([p for p in self.research_projects if p.status == "active"])
            st.metric("Active Projects", active_projects)
        with col2:
            total_papers = sum(len(p.papers) for p in self.research_projects)
            st.metric("Collaborative Papers", total_papers)
        with col3:
            unique_collaborators = len(set().union(*[p.collaborators for p in self.research_projects]))
            st.metric("Research Partners", unique_collaborators)
        
        # Project management
        st.subheader("📋 Active Research Projects")
        
        for project in self.research_projects:
            with st.expander(f"📁 {project.name} ({project.status.upper()})"):
                col1, col2 = st.columns([2, 1])
                
                with col1:
                    st.write(f"**Description:** {project.description}")
                    st.write(f"**Created:** {project.created_date.strftime('%Y-%m-%d')}")
                    st.write(f"**Papers:** {len(project.papers)}")
                    
                    if project.papers:
                        st.write("**Associated Papers:**")
                        for paper in project.papers:
                            st.write(f"• {paper.title} ({paper.publication_year})")
                
                with col2:
                    st.write("**Collaborators:**")
                    for collaborator in project.collaborators:
                        st.write(f"• {collaborator}")
                    
                    # Project actions
                    if st.button(f"View Details", key=f"details_{project.name}"):
                        st.info("Project details would open in detailed view")
                    
                    status_color = {"active": "🟢", "planning": "🟡", "completed": "🔵", "on-hold": "🔴"}
                    st.write(f"**Status:** {status_color.get(project.status, '⚪')} {project.status.title()}")
        
        # Collaboration network
        st.subheader("🌐 Collaboration Network")
        
        # Create collaboration network graph
        collab_graph = nx.Graph()
        
        # Add nodes for organizations
        all_collaborators = set().union(*[p.collaborators for p in self.research_projects])
        for collaborator in all_collaborators:
            collab_graph.add_node(collaborator)
        
        # Add edges based on shared projects
        collaborators_list = list(all_collaborators)
        for i, collab1 in enumerate(collaborators_list):
            for collab2 in collaborators_list[i+1:]:
                # Check if they share any projects
                shared_projects = sum(1 for p in self.research_projects 
                                    if collab1 in p.collaborators and collab2 in p.collaborators)
                if shared_projects > 0:
                    collab_graph.add_edge(collab1, collab2, weight=shared_projects)
        
        # Visualize collaboration network
        if len(collab_graph.nodes()) > 0:
            pos = nx.spring_layout(collab_graph)
            
            node_trace = go.Scatter(
                x=[pos[node][0] for node in collab_graph.nodes()],
                y=[pos[node][1] for node in collab_graph.nodes()],
                mode='markers+text',
                text=list(collab_graph.nodes()),
                textposition="middle center",
                marker=dict(
                    size=20,
                    color='lightblue',
                    line=dict(width=2, color='darkblue')
                )
            )
            
            edge_traces = []
            for edge in collab_graph.edges():
                x0, y0 = pos[edge[0]]
                x1, y1 = pos[edge[1]]
                
                edge_trace = go.Scatter(
                    x=[x0, x1, None],
                    y=[y0, y1, None],
                    mode='lines',
                    line=dict(width=2, color='rgba(100,100,100,0.5)')
                )
                edge_traces.append(edge_trace)
            
            fig = go.Figure(data=[node_trace] + edge_traces)
            fig.update_layout(
                title="Research Collaboration Network",
                showlegend=False,
                xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                height=400
            )
            
            st.plotly_chart(fig, use_container_width=True)
        
        # Collaboration opportunities
        st.subheader("💡 Collaboration Opportunities")
        
        opportunities = [
            {
                "title": "AI Ethics Consortium",
                "description": "Join multi-institutional research on AI ethics in healthcare",
                "partners": ["Stanford", "MIT", "Harvard Medical School"],
                "timeline": "6 months",
                "funding": "NIH Grant Available"
            },
            {
                "title": "Quantum Computing Alliance",
                "description": "Collaborative quantum algorithm development project",
                "partners": ["IBM Research", "Google Quantum", "Oxford"],
                "timeline": "12 months",
                "funding": "Industry Sponsored"
            }
        ]
        
        for opp in opportunities:
            with st.expander(f"🚀 {opp['title']}"):
                st.write(f"**Description:** {opp['description']}")
                st.write(f"**Potential Partners:** {', '.join(opp['partners'])}")
                st.write(f"**Timeline:** {opp['timeline']}")
                st.write(f"**Funding:** {opp['funding']}")
                
                if st.button(f"Express Interest", key=f"interest_{opp['title']}"):
                    st.success("✅ Interest registered! We'll connect you with the project coordinators.")
    
    def create_insights_dashboard(self):
        """AI-powered research insights and recommendations"""
        st.header("🧠 Research Insights & Recommendations")
        
        # Generate insights
        insights = self.generate_research_insights()
        
        # Insight categories
        insight_types = list(set(insight["type"] for insight in insights))
        selected_type = st.selectbox("Filter by Insight Type:", ["All"] + insight_types)
        
        filtered_insights = insights if selected_type == "All" else [i for i in insights if i["type"] == selected_type]
        
        # Display insights
        for insight in filtered_insights:
            confidence_color = "🟢" if insight["confidence"] >= 80 else "🟡" if insight["confidence"] >= 60 else "🔴"
            
            with st.expander(f"{confidence_color} {insight['insight']} (Confidence: {insight['confidence']}%)"):
                st.write(f"**Domain:** {insight['domain'].replace('_', ' ').title()}")
                st.write(f"**Topic:** {insight['topic']}")
                st.write(f"**Recommendation:** {insight['recommendation']}")
                st.write(f"**Insight Type:** {insight['type'].replace('_', ' ').title()}")
                
                col1, col2 = st.columns(2)
                with col1:
                    if st.button(f"Save Insight", key=f"save_{insight['type']}_{insight['topic']}"):
                        st.success("✅ Insight saved to your research notes!")
                
                with col2:
                    if st.button(f"Create Project", key=f"project_{insight['type']}_{insight['topic']}"):
                        st.success("✅ New research project template created!")
        
        # Research recommendations
        st.subheader("📈 Personalized Research Recommendations")
        
        recommendations = [
            {
                "type": "paper_recommendations",
                "title": "Recommended Papers Based on Your Interests",
                "items": [
                    "Advances in Transformer Architecture for Scientific Literature",
                    "Federated Learning Applications in Medical Research", 
                    "Quantum Machine Learning: Recent Developments"
                ]
            },
            {
                "type": "conference_recommendations", 
                "title": "Upcoming Conferences You Should Attend",
                "items": [
                    "NeurIPS 2025 - Neural Information Processing Systems",
                    "ICML 2025 - International Conference on Machine Learning",
                    "Nature Conference on Digital Medicine"
                ]
            },
            {
                "type": "funding_opportunities",
                "title": "Relevant Funding Opportunities",
                "items": [
                    "NSF CAREER Award - Early Career Development",
                    "NIH R01 - Research Project Grant",
                    "Google Research Scholar Program"
                ]
            }
        ]
        
        for rec in recommendations:
            with st.expander(f"💡 {rec['title']}"):
                for item in rec["items"]:
                    st.write(f"• {item}")
                
                if st.button(f"Get More Details", key=f"details_{rec['type']}"):
                    st.info("Detailed recommendations would be displayed here")

def main():
    """Main Research Intelligence Hub application"""
    
    # Initialize the hub
    if 'research_hub' not in st.session_state:
        with st.spinner("🔬 Initializing Research Intelligence Hub..."):
            st.session_state.research_hub = ResearchIntelligenceHub()
    
    research_hub = st.session_state.research_hub
    
    # Sidebar navigation
    st.sidebar.title("🔬 Research Intelligence Hub")
    st.sidebar.markdown("**AI-Powered Research Platform**")
    
    page = st.sidebar.selectbox(
        "Navigate to:",
        ["📚 Literature Analysis", "🕸️ Knowledge Graph", "🤝 Collaboration Hub", "🧠 AI Insights"]
    )
    
    # Main content area
    if page == "📚 Literature Analysis":
        research_hub.create_literature_dashboard()
    elif page == "🕸️ Knowledge Graph":
        research_hub.create_knowledge_graph_dashboard()
    elif page == "🤝 Collaboration Hub":
        research_hub.create_collaboration_dashboard()
    elif page == "🧠 AI Insights":
        research_hub.create_insights_dashboard()
    
    # Sidebar status
    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📊 Hub Statistics")
    st.sidebar.metric("Papers Indexed", f"{research_hub.research_metrics['papers_analyzed']:,}")
    st.sidebar.metric("Knowledge Nodes", f"{research_hub.research_metrics['knowledge_nodes']:,}")
    st.sidebar.metric("Active Projects", research_hub.research_metrics['active_projects'])
    
    st.sidebar.success("✅ All Systems Operational")
    st.sidebar.info("🔄 Real-time Analysis Active")

if __name__ == "__main__":
    main()
