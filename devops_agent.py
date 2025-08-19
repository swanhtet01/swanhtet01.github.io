#!/usr/bin/env python3
import streamlit as st

class DevOpsEngineerAgent:
    def __init__(self):
        self.agent_name = "DevOps Engineer Agent"
        self.role = "Infrastructure & Deployment Automation"
        
    def create_dockerfile(self, app_type, port=8000):
        """Generate Dockerfile"""
        
        if app_type == "python-flask":
            dockerfile = f"""FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE {port}

CMD ["python", "app.py"]"""

        elif app_type == "node-express":
            dockerfile = f"""FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE {port}

CMD ["npm", "start"]"""
        
        return dockerfile

    def run(self):
        st.set_page_config(page_title="DevOps Engineer Agent", page_icon="🔧", layout="wide")
        st.title("🔧 DevOps Engineer Agent - Infrastructure & Deployment")
        st.success("DevOps engineer managing infrastructure and deployment pipelines")
        
        st.subheader("Docker Configuration Generator")
        
        app_type = st.selectbox("Application Type", ["python-flask", "node-express"])
        port = st.number_input("Port", value=8000, min_value=1000, max_value=65535)
        
        if st.button("Generate Dockerfile"):
            dockerfile = self.create_dockerfile(app_type, port)
            st.code(dockerfile, language='dockerfile')
            
            st.download_button(
                "Download Dockerfile",
                dockerfile,
                "Dockerfile",
                mime="text/plain"
            )

if __name__ == "__main__":
    agent = DevOpsEngineerAgent()
    agent.run()
