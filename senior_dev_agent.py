#!/usr/bin/env python3
import streamlit as st
import os
from pathlib import Path

class SeniorDeveloperAgent:
    def __init__(self):
        self.agent_name = "Senior Developer Agent"
        self.role = "System Architecture & Code Review"
        
    def analyze_codebase(self, directory_path):
        """Analyze codebase structure and quality"""
        if not os.path.exists(directory_path):
            return {"error": "Directory not found"}
            
        analysis = {
            'files_analyzed': 0,
            'total_lines': 0,
            'languages': {},
            'recommendations': []
        }
        
        for root, dirs, files in os.walk(directory_path):
            for file in files:
                file_path = os.path.join(root, file)
                file_ext = Path(file).suffix.lower()
                
                if file_ext in ['.py', '.js', '.jsx', '.ts', '.tsx', '.html', '.css']:
                    analysis['files_analyzed'] += 1
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            lines = len(f.readlines())
                            analysis['total_lines'] += lines
                            
                        if file_ext not in analysis['languages']:
                            analysis['languages'][file_ext] = {'count': 0, 'lines': 0}
                        
                        analysis['languages'][file_ext]['count'] += 1
                        analysis['languages'][file_ext]['lines'] += lines
                        
                    except Exception:
                        continue
        
        if analysis['total_lines'] > 10000:
            analysis['recommendations'].append("Consider modularization for large codebase")
        
        if '.py' in analysis['languages'] and analysis['languages']['.py']['count'] > 20:
            analysis['recommendations'].append("Implement comprehensive testing strategy")
            
        return analysis
    
    def run(self):
        st.set_page_config(page_title="Senior Developer Agent", page_icon="👨‍💻", layout="wide")
        st.title("👨‍💻 Senior Developer Agent - Architecture & Code Review")
        st.success("Senior developer providing architectural guidance and code reviews")
        
        st.subheader("Codebase Analysis")
        
        directory = st.text_input("Enter directory path to analyze:", ".")
        
        if st.button("Analyze Codebase"):
            with st.spinner("Analyzing codebase..."):
                analysis = self.analyze_codebase(directory)
                
                if "error" in analysis:
                    st.error(f"Error: {analysis['error']}")
                else:
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.metric("Files Analyzed", analysis['files_analyzed'])
                    with col2:
                        st.metric("Total Lines", analysis['total_lines'])
                    with col3:
                        st.metric("Languages", len(analysis['languages']))
                    
                    if analysis['languages']:
                        st.subheader("Language Distribution")
                        for lang, data in analysis['languages'].items():
                            st.write(f"**{lang}**: {data['count']} files, {data['lines']} lines")
                    
                    if analysis['recommendations']:
                        st.subheader("Recommendations")
                        for rec in analysis['recommendations']:
                            st.info(f"💡 {rec}")

if __name__ == "__main__":
    agent = SeniorDeveloperAgent()
    agent.run()
