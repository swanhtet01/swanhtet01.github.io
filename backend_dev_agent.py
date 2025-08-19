#!/usr/bin/env python3
import streamlit as st

class BackendDeveloperAgent:
    def __init__(self):
        self.agent_name = "Backend Developer Agent"
        self.role = "API & Database Development"
        
    def create_flask_endpoint(self, endpoint_name, method="GET"):
        """Generate Flask API endpoint"""
        
        if method == "GET":
            template = f"""from flask import Flask, jsonify
from datetime import datetime

@app.route('/{endpoint_name}', methods=['GET'])
def get_{endpoint_name}():
    try:
        data = {{
            'message': 'Success',
            'data': [],
            'timestamp': datetime.utcnow().isoformat()
        }}
        
        return jsonify(data), 200
        
    except Exception as e:
        return jsonify({{'error': str(e)}}), 500"""

        elif method == "POST":
            template = f"""from flask import Flask, request, jsonify
from datetime import datetime

@app.route('/{endpoint_name}', methods=['POST'])
def create_{endpoint_name}():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({{'error': 'No data provided'}}), 400
            
        result = {{
            'message': '{endpoint_name.capitalize()} created successfully',
            'id': 'generated_id',
            'timestamp': datetime.utcnow().isoformat()
        }}
        
        return jsonify(result), 201
        
    except Exception as e:
        return jsonify({{'error': str(e)}}), 500"""
        
        return template

    def run(self):
        st.set_page_config(page_title="Backend Developer Agent", page_icon="⚙️", layout="wide")
        st.title("⚙️ Backend Developer Agent - API & Database Development")
        st.success("Backend developer creating APIs and managing databases")
        
        st.subheader("Flask API Endpoint Generator")
        
        col1, col2 = st.columns(2)
        with col1:
            endpoint_name = st.text_input("Endpoint Name", "users")
        with col2:
            method = st.selectbox("HTTP Method", ["GET", "POST", "PUT", "DELETE"])
        
        if st.button("Generate API Endpoint"):
            endpoint_code = self.create_flask_endpoint(endpoint_name, method)
            st.code(endpoint_code, language='python')
            
            st.download_button(
                f"Download {endpoint_name}_{method.lower()}.py",
                endpoint_code,
                f"{endpoint_name}_{method.lower()}.py",
                mime="text/plain"
            )

if __name__ == "__main__":
    agent = BackendDeveloperAgent()
    agent.run()
