#!/usr/bin/env python3
import streamlit as st

class FrontendDeveloperAgent:
    def __init__(self):
        self.agent_name = "Frontend Developer Agent"
        self.role = "UI/UX & Component Development"
        
    def create_react_component(self, component_name):
        """Generate React component"""
        
        jsx_code = f"""import React, {{ useState }} from 'react';
import './{component_name}.css';

const {component_name} = ({{ props }}) => {{
    const [state, setState] = useState({{}});
    
    return (
        <div className="{component_name.lower()}">
            <h2>{component_name}</h2>
            <p>This is the {component_name} component.</p>
        </div>
    );
}};

export default {component_name};"""
        
        css_code = f""".{component_name.lower()} {{
    padding: 20px;
    margin: 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
}}

.{component_name.lower()} h2 {{
    color: #333;
    margin-bottom: 10px;
}}"""

        return {'jsx': jsx_code, 'css': css_code}
    
    def run(self):
        st.set_page_config(page_title="Frontend Developer Agent", page_icon="🎨", layout="wide")
        st.title("🎨 Frontend Developer Agent - UI/UX Development")
        st.success("Frontend developer creating user interfaces and experiences")
        
        st.subheader("React Component Generator")
        
        component_name = st.text_input("Component Name", "MyComponent")
        
        if st.button("Generate React Component"):
            component = self.create_react_component(component_name)
            
            col1, col2 = st.columns(2)
            with col1:
                st.subheader(f"{component_name}.jsx")
                st.code(component['jsx'], language='javascript')
                
                st.download_button(
                    f"Download {component_name}.jsx",
                    component['jsx'],
                    f"{component_name}.jsx",
                    mime="text/javascript"
                )
            
            with col2:
                st.subheader(f"{component_name}.css")
                st.code(component['css'], language='css')
                
                st.download_button(
                    f"Download {component_name}.css",
                    component['css'],
                    f"{component_name}.css",
                    mime="text/css"
                )

if __name__ == "__main__":
    agent = FrontendDeveloperAgent()
    agent.run()
