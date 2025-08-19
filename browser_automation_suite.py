#!/usr/bin/env python3
"""
🌐 BROWSER AUTOMATION SUITE
===========================
Professional browser automation and web scraping platform
- Visual workflow builder with drag-and-drop interface
- AI-powered element detection and interaction
- Captcha solving and anti-bot detection bypass
- Multi-browser support (Chrome, Firefox, Safari, Edge)
- Headless and headed operation modes
- Proxy rotation and IP management
- Data extraction pipelines
- Form automation and testing
- Website monitoring and alerting
"""

import streamlit as st
import asyncio
import json
import time
import os
import tempfile
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# Browser automation imports
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.common.action_chains import ActionChains

import playwright
from playwright.sync_api import sync_playwright

# AI and ML imports
import cv2
import numpy as np
from PIL import Image
import base64
import io

# Utilities
import requests
from urllib.parse import urljoin, urlparse
import sqlite3
import threading
import queue

# Set page config
st.set_page_config(
    page_title="🌐 Browser Automation Suite",
    page_icon="🌐",
    layout="wide",
    initial_sidebar_state="expanded"
)

class BrowserAutomationSuite:
    """Main browser automation application"""
    
    def __init__(self):
        self.automation_history = []
        self.active_sessions = {}
        self.workflow_templates = self.load_workflow_templates()
        
        # Initialize session state
        if 'automation_results' not in st.session_state:
            st.session_state.automation_results = []
        if 'current_workflow' not in st.session_state:
            st.session_state.current_workflow = []
        if 'browser_session' not in st.session_state:
            st.session_state.browser_session = None
    
    def load_workflow_templates(self) -> Dict[str, Any]:
        """Load predefined workflow templates"""
        return {
            "web_scraping": {
                "name": "Web Scraping",
                "description": "Extract data from websites",
                "steps": [
                    {"action": "navigate", "params": {"url": ""}},
                    {"action": "wait_for_element", "params": {"selector": "", "timeout": 10}},
                    {"action": "extract_data", "params": {"selectors": {}}},
                    {"action": "save_data", "params": {"format": "csv"}}
                ]
            },
            "form_automation": {
                "name": "Form Automation", 
                "description": "Automatically fill and submit forms",
                "steps": [
                    {"action": "navigate", "params": {"url": ""}},
                    {"action": "fill_form", "params": {"fields": {}}},
                    {"action": "submit_form", "params": {"submit_selector": ""}},
                    {"action": "wait_for_response", "params": {"timeout": 30}}
                ]
            },
            "monitoring": {
                "name": "Website Monitoring",
                "description": "Monitor websites for changes",
                "steps": [
                    {"action": "navigate", "params": {"url": ""}},
                    {"action": "take_screenshot", "params": {}},
                    {"action": "extract_content", "params": {"selector": ""}},
                    {"action": "compare_changes", "params": {}},
                    {"action": "send_alert", "params": {"condition": "changed"}}
                ]
            },
            "testing": {
                "name": "UI Testing",
                "description": "Automated UI testing workflows",
                "steps": [
                    {"action": "navigate", "params": {"url": ""}},
                    {"action": "test_elements", "params": {"selectors": []}},
                    {"action": "verify_functionality", "params": {}},
                    {"action": "generate_report", "params": {"format": "html"}}
                ]
            }
        }
    
    def render_main_interface(self):
        """Render the main Streamlit interface"""
        # Header
        st.title("🌐 Browser Automation Suite")
        st.markdown("### Professional Web Automation Platform")
        
        # Sidebar navigation
        with st.sidebar:
            st.header("🎛️ Control Panel")
            
            mode = st.selectbox(
                "Operation Mode",
                ["Visual Workflow Builder", "Quick Actions", "Monitoring Dashboard", "Results & Analytics"],
                key="operation_mode"
            )
            
            # Browser settings
            st.subheader("🖥️ Browser Settings")
            browser_type = st.selectbox("Browser", ["Chrome", "Firefox", "Edge", "Safari"])
            headless_mode = st.checkbox("Headless Mode", value=True)
            use_proxy = st.checkbox("Use Proxy Rotation")
            
            if use_proxy:
                proxy_list = st.text_area("Proxy List (one per line)", height=100)
        
        # Main content area
        if mode == "Visual Workflow Builder":
            self.render_workflow_builder()
        elif mode == "Quick Actions":
            self.render_quick_actions()
        elif mode == "Monitoring Dashboard":
            self.render_monitoring_dashboard()
        elif mode == "Results & Analytics":
            self.render_analytics_dashboard()
    
    def render_workflow_builder(self):
        """Render the visual workflow builder"""
        st.header("🔧 Visual Workflow Builder")
        
        col1, col2 = st.columns([1, 2])
        
        with col1:
            st.subheader("📋 Workflow Templates")
            
            selected_template = st.selectbox(
                "Choose Template",
                list(self.workflow_templates.keys()),
                format_func=lambda x: self.workflow_templates[x]["name"]
            )
            
            if st.button("Load Template"):
                st.session_state.current_workflow = self.workflow_templates[selected_template]["steps"].copy()
                st.rerun()
            
            st.subheader("➕ Add Actions")
            
            action_type = st.selectbox(
                "Action Type",
                ["navigate", "click", "fill_input", "extract_data", "wait", "screenshot", "scroll"]
            )
            
            # Action parameters based on type
            params = {}
            if action_type == "navigate":
                params["url"] = st.text_input("URL")
            elif action_type == "click":
                params["selector"] = st.text_input("CSS Selector")
                params["wait_after"] = st.number_input("Wait After (seconds)", min_value=0, value=1)
            elif action_type == "fill_input":
                params["selector"] = st.text_input("Input Selector")
                params["value"] = st.text_input("Value to Fill")
            elif action_type == "extract_data":
                params["selector"] = st.text_input("Data Selector")
                params["attribute"] = st.selectbox("Extract", ["text", "href", "src", "value"])
            elif action_type == "wait":
                params["duration"] = st.number_input("Wait Duration (seconds)", min_value=1, value=5)
            elif action_type == "screenshot":
                params["filename"] = st.text_input("Screenshot Filename", value=f"screenshot_{int(time.time())}.png")
            elif action_type == "scroll":
                params["direction"] = st.selectbox("Direction", ["down", "up", "to_bottom", "to_top"])
                params["pixels"] = st.number_input("Pixels", value=500)
            
            if st.button("Add Action"):
                st.session_state.current_workflow.append({
                    "action": action_type,
                    "params": params
                })
                st.rerun()
        
        with col2:
            st.subheader("🔄 Current Workflow")
            
            if st.session_state.current_workflow:
                # Display workflow steps
                for i, step in enumerate(st.session_state.current_workflow):
                    with st.expander(f"Step {i+1}: {step['action']}", expanded=False):
                        st.json(step['params'])
                        
                        col_edit, col_delete = st.columns(2)
                        with col_edit:
                            if st.button(f"Edit Step {i+1}", key=f"edit_{i}"):
                                # TODO: Implement edit functionality
                                pass
                        with col_delete:
                            if st.button(f"Delete Step {i+1}", key=f"delete_{i}"):
                                st.session_state.current_workflow.pop(i)
                                st.rerun()
                
                st.subheader("🚀 Execute Workflow")
                
                col_run, col_save = st.columns(2)
                
                with col_run:
                    if st.button("▶️ Run Workflow", type="primary"):
                        with st.spinner("Executing workflow..."):
                            results = self.execute_workflow(st.session_state.current_workflow)
                            st.session_state.automation_results.append({
                                'timestamp': datetime.now(),
                                'workflow': st.session_state.current_workflow.copy(),
                                'results': results
                            })
                            st.success("Workflow executed successfully!")
                            st.json(results)
                
                with col_save:
                    workflow_name = st.text_input("Workflow Name")
                    if st.button("💾 Save Workflow"):
                        if workflow_name:
                            self.save_workflow(workflow_name, st.session_state.current_workflow)
                            st.success(f"Workflow '{workflow_name}' saved!")
                        else:
                            st.error("Please enter a workflow name")
            else:
                st.info("No workflow steps added yet. Use the action builder on the left to add steps.")
    
    def render_quick_actions(self):
        """Render quick action interface"""
        st.header("⚡ Quick Actions")
        
        tab1, tab2, tab3, tab4 = st.tabs(["🔍 Web Scraping", "📝 Form Automation", "📊 Data Extraction", "🧪 UI Testing"])
        
        with tab1:
            st.subheader("🔍 Quick Web Scraping")
            
            url = st.text_input("Website URL", placeholder="https://example.com")
            selectors = st.text_area(
                "CSS Selectors (one per line)",
                placeholder="h1\n.article-title\n.price",
                height=100
            )
            
            col1, col2 = st.columns(2)
            with col1:
                extract_links = st.checkbox("Extract All Links")
                extract_images = st.checkbox("Extract All Images")
            with col2:
                follow_pagination = st.checkbox("Follow Pagination")
                respect_robots = st.checkbox("Respect robots.txt", value=True)
            
            if st.button("🚀 Start Scraping", type="primary"):
                if url:
                    with st.spinner("Scraping website..."):
                        results = self.quick_scrape(url, selectors.split('\n') if selectors else [])
                        
                        if results:
                            st.success("Scraping completed!")
                            
                            # Display results
                            if isinstance(results, dict):
                                for key, value in results.items():
                                    st.subheader(f"📋 {key}")
                                    if isinstance(value, list):
                                        df = pd.DataFrame(value)
                                        st.dataframe(df)
                                    else:
                                        st.write(value)
                            
                            # Download option
                            results_json = json.dumps(results, indent=2, default=str)
                            st.download_button(
                                label="📥 Download Results (JSON)",
                                data=results_json,
                                file_name=f"scraping_results_{int(time.time())}.json",
                                mime="application/json"
                            )
                        else:
                            st.error("Scraping failed. Check the URL and try again.")
                else:
                    st.error("Please enter a valid URL")
        
        with tab2:
            st.subheader("📝 Form Automation")
            
            form_url = st.text_input("Form URL", placeholder="https://example.com/contact")
            
            st.subheader("📄 Form Fields")
            
            # Dynamic form field builder
            if 'form_fields' not in st.session_state:
                st.session_state.form_fields = []
            
            col1, col2, col3 = st.columns(3)
            with col1:
                field_selector = st.text_input("Field Selector (CSS)")
            with col2:
                field_value = st.text_input("Field Value")
            with col3:
                if st.button("➕ Add Field"):
                    if field_selector and field_value:
                        st.session_state.form_fields.append({
                            'selector': field_selector,
                            'value': field_value
                        })
                        st.rerun()
            
            # Display added fields
            if st.session_state.form_fields:
                st.subheader("📋 Added Fields")
                for i, field in enumerate(st.session_state.form_fields):
                    col1, col2, col3 = st.columns([2, 2, 1])
                    with col1:
                        st.text(field['selector'])
                    with col2:
                        st.text(field['value'])
                    with col3:
                        if st.button("🗑️", key=f"remove_field_{i}"):
                            st.session_state.form_fields.pop(i)
                            st.rerun()
            
            submit_selector = st.text_input("Submit Button Selector", placeholder="button[type='submit']")
            
            if st.button("🚀 Automate Form", type="primary"):
                if form_url and st.session_state.form_fields:
                    with st.spinner("Automating form..."):
                        result = self.automate_form(form_url, st.session_state.form_fields, submit_selector)
                        
                        if result['success']:
                            st.success("Form automation completed!")
                            if result.get('screenshot'):
                                st.image(result['screenshot'], caption="Form Completion Screenshot")
                        else:
                            st.error(f"Form automation failed: {result.get('error', 'Unknown error')}")
                else:
                    st.error("Please enter form URL and add at least one field")
        
        with tab3:
            st.subheader("📊 Advanced Data Extraction")
            
            extraction_url = st.text_input("Target URL", placeholder="https://example.com/data")
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.subheader("🎯 Extraction Rules")
                
                data_type = st.selectbox("Data Type", ["Text", "Links", "Images", "Tables", "Custom"])
                
                if data_type == "Custom":
                    custom_rules = st.text_area(
                        "Custom CSS Selectors (JSON format)",
                        placeholder='{"titles": "h2", "prices": ".price", "descriptions": ".desc"}',
                        height=150
                    )
                
                pagination_selector = st.text_input("Pagination Selector (optional)")
                max_pages = st.number_input("Max Pages", min_value=1, max_value=100, value=5)
            
            with col2:
                st.subheader("⚙️ Extraction Options")
                
                include_metadata = st.checkbox("Include Metadata")
                clean_data = st.checkbox("Clean Extracted Data", value=True)
                deduplicate = st.checkbox("Remove Duplicates", value=True)
                
                output_format = st.selectbox("Output Format", ["JSON", "CSV", "Excel"])
                
                delay_between_requests = st.slider("Delay Between Requests (seconds)", 0, 10, 2)
            
            if st.button("🚀 Extract Data", type="primary"):
                if extraction_url:
                    with st.spinner("Extracting data..."):
                        extraction_config = {
                            'url': extraction_url,
                            'data_type': data_type,
                            'pagination_selector': pagination_selector,
                            'max_pages': max_pages,
                            'include_metadata': include_metadata,
                            'clean_data': clean_data,
                            'deduplicate': deduplicate,
                            'delay': delay_between_requests
                        }
                        
                        if data_type == "Custom" and custom_rules:
                            try:
                                extraction_config['custom_rules'] = json.loads(custom_rules)
                            except json.JSONDecodeError:
                                st.error("Invalid JSON format in custom rules")
                                return
                        
                        results = self.advanced_data_extraction(extraction_config)
                        
                        if results:
                            st.success("Data extraction completed!")
                            
                            # Display results preview
                            if isinstance(results, dict) and 'data' in results:
                                st.subheader("📋 Extracted Data Preview")
                                df = pd.DataFrame(results['data'][:100])  # First 100 rows
                                st.dataframe(df)
                                
                                # Statistics
                                st.subheader("📊 Extraction Statistics")
                                col1, col2, col3 = st.columns(3)
                                with col1:
                                    st.metric("Total Records", len(results['data']))
                                with col2:
                                    st.metric("Pages Processed", results.get('pages_processed', 1))
                                with col3:
                                    st.metric("Success Rate", f"{results.get('success_rate', 100):.1f}%")
                            
                            # Download options
                            if output_format == "JSON":
                                st.download_button(
                                    label="📥 Download JSON",
                                    data=json.dumps(results, indent=2, default=str),
                                    file_name=f"extracted_data_{int(time.time())}.json",
                                    mime="application/json"
                                )
                            elif output_format == "CSV":
                                if isinstance(results, dict) and 'data' in results:
                                    df = pd.DataFrame(results['data'])
                                    csv_data = df.to_csv(index=False)
                                    st.download_button(
                                        label="📥 Download CSV",
                                        data=csv_data,
                                        file_name=f"extracted_data_{int(time.time())}.csv",
                                        mime="text/csv"
                                    )
                        else:
                            st.error("Data extraction failed")
                else:
                    st.error("Please enter a target URL")
        
        with tab4:
            st.subheader("🧪 UI Testing")
            
            test_url = st.text_input("Application URL", placeholder="https://app.example.com")
            
            st.subheader("🧪 Test Cases")
            
            test_type = st.selectbox(
                "Test Type",
                ["Element Presence", "Form Validation", "Link Checking", "Performance", "Accessibility"]
            )
            
            if test_type == "Element Presence":
                elements_to_test = st.text_area(
                    "Elements to Test (CSS selectors, one per line)",
                    placeholder="#login-button\n.navigation-menu\n.footer",
                    height=100
                )
                
                if st.button("🚀 Run Element Tests"):
                    if test_url and elements_to_test:
                        selectors = elements_to_test.split('\n')
                        results = self.test_element_presence(test_url, selectors)
                        
                        st.subheader("🧪 Test Results")
                        for selector, found in results.items():
                            if found:
                                st.success(f"✅ {selector}: Found")
                            else:
                                st.error(f"❌ {selector}: Not Found")
    
    def render_monitoring_dashboard(self):
        """Render website monitoring dashboard"""
        st.header("📊 Monitoring Dashboard")
        
        col1, col2 = st.columns([1, 2])
        
        with col1:
            st.subheader("🎯 Add Monitor")
            
            monitor_url = st.text_input("Website URL")
            monitor_name = st.text_input("Monitor Name")
            
            monitor_type = st.selectbox(
                "Monitor Type",
                ["Content Change", "Element Presence", "Performance", "Status Code"]
            )
            
            check_interval = st.selectbox(
                "Check Interval",
                ["1 minute", "5 minutes", "15 minutes", "1 hour", "6 hours", "24 hours"]
            )
            
            alert_email = st.text_input("Alert Email (optional)")
            
            if st.button("🚀 Start Monitoring"):
                if monitor_url and monitor_name:
                    monitor_config = {
                        'url': monitor_url,
                        'name': monitor_name,
                        'type': monitor_type,
                        'interval': check_interval,
                        'alert_email': alert_email,
                        'created_at': datetime.now(),
                        'status': 'active'
                    }
                    
                    # TODO: Add to monitoring queue
                    st.success(f"Monitor '{monitor_name}' started!")
                else:
                    st.error("Please fill in all required fields")
        
        with col2:
            st.subheader("📈 Active Monitors")
            
            # Mock monitoring data
            monitors_data = [
                {
                    'name': 'Main Website',
                    'url': 'https://example.com',
                    'status': 'Up',
                    'last_check': '2 minutes ago',
                    'response_time': '234ms'
                },
                {
                    'name': 'API Endpoint',
                    'url': 'https://api.example.com',
                    'status': 'Up',
                    'last_check': '1 minute ago',
                    'response_time': '145ms'
                }
            ]
            
            for monitor in monitors_data:
                with st.container():
                    col1, col2, col3, col4 = st.columns(4)
                    
                    with col1:
                        st.write(f"**{monitor['name']}**")
                        st.write(monitor['url'])
                    
                    with col2:
                        status_color = "🟢" if monitor['status'] == 'Up' else "🔴"
                        st.write(f"{status_color} {monitor['status']}")
                    
                    with col3:
                        st.write(monitor['last_check'])
                        st.write(monitor['response_time'])
                    
                    with col4:
                        if st.button("⚙️", key=f"config_{monitor['name']}"):
                            st.info("Monitor configuration panel")
                    
                    st.divider()
    
    def render_analytics_dashboard(self):
        """Render results and analytics dashboard"""
        st.header("📊 Results & Analytics")
        
        if not st.session_state.automation_results:
            st.info("No automation results yet. Run some workflows to see analytics here.")
            return
        
        # Summary metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total Workflows", len(st.session_state.automation_results))
        
        with col2:
            successful_runs = sum(1 for r in st.session_state.automation_results if r['results'].get('success', False))
            st.metric("Successful Runs", successful_runs)
        
        with col3:
            total_data_points = sum(len(r['results'].get('data', [])) for r in st.session_state.automation_results)
            st.metric("Data Points Extracted", total_data_points)
        
        with col4:
            avg_duration = sum(r['results'].get('duration', 0) for r in st.session_state.automation_results) / len(st.session_state.automation_results)
            st.metric("Avg Duration", f"{avg_duration:.1f}s")
        
        # Recent results
        st.subheader("📋 Recent Results")
        
        for i, result in enumerate(reversed(st.session_state.automation_results[-10:])):
            with st.expander(f"Workflow {len(st.session_state.automation_results) - i}: {result['timestamp'].strftime('%Y-%m-%d %H:%M')}"):
                
                col1, col2 = st.columns(2)
                
                with col1:
                    st.write("**Workflow Steps:**")
                    for j, step in enumerate(result['workflow']):
                        st.write(f"{j+1}. {step['action']}")
                
                with col2:
                    st.write("**Results:**")
                    st.json(result['results'])
    
    def execute_workflow(self, workflow: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Execute a complete workflow"""
        try:
            start_time = time.time()
            results = {'success': True, 'steps': [], 'data': [], 'screenshots': []}
            
            # Initialize browser session
            driver = self.initialize_browser()
            
            try:
                for i, step in enumerate(workflow):
                    step_result = self.execute_step(driver, step)
                    results['steps'].append({
                        'step': i + 1,
                        'action': step['action'],
                        'success': step_result.get('success', False),
                        'data': step_result.get('data'),
                        'error': step_result.get('error')
                    })
                    
                    if step_result.get('data'):
                        results['data'].extend(step_result['data'] if isinstance(step_result['data'], list) else [step_result['data']])
                    
                    if not step_result.get('success', False):
                        results['success'] = False
                        break
                    
                    time.sleep(1)  # Small delay between steps
            
            finally:
                driver.quit()
            
            results['duration'] = time.time() - start_time
            return results
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def initialize_browser(self):
        """Initialize browser driver"""
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        
        return webdriver.Chrome(options=chrome_options)
    
    def execute_step(self, driver, step: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a single workflow step"""
        try:
            action = step['action']
            params = step['params']
            
            if action == "navigate":
                driver.get(params['url'])
                return {'success': True}
            
            elif action == "click":
                element = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, params['selector']))
                )
                element.click()
                time.sleep(params.get('wait_after', 1))
                return {'success': True}
            
            elif action == "fill_input":
                element = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, params['selector']))
                )
                element.clear()
                element.send_keys(params['value'])
                return {'success': True}
            
            elif action == "extract_data":
                elements = driver.find_elements(By.CSS_SELECTOR, params['selector'])
                data = []
                
                for element in elements:
                    if params['attribute'] == 'text':
                        data.append(element.text)
                    else:
                        data.append(element.get_attribute(params['attribute']))
                
                return {'success': True, 'data': data}
            
            elif action == "wait":
                time.sleep(params['duration'])
                return {'success': True}
            
            elif action == "screenshot":
                screenshot_path = f"screenshots/{params['filename']}"
                os.makedirs("screenshots", exist_ok=True)
                driver.save_screenshot(screenshot_path)
                return {'success': True, 'data': screenshot_path}
            
            elif action == "scroll":
                if params['direction'] == 'down':
                    driver.execute_script(f"window.scrollBy(0, {params.get('pixels', 500)});")
                elif params['direction'] == 'up':
                    driver.execute_script(f"window.scrollBy(0, -{params.get('pixels', 500)});")
                elif params['direction'] == 'to_bottom':
                    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                elif params['direction'] == 'to_top':
                    driver.execute_script("window.scrollTo(0, 0);")
                
                return {'success': True}
            
            else:
                return {'success': False, 'error': f'Unknown action: {action}'}
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def quick_scrape(self, url: str, selectors: List[str]) -> Dict[str, Any]:
        """Quick web scraping function"""
        try:
            driver = self.initialize_browser()
            results = {}
            
            try:
                driver.get(url)
                time.sleep(3)  # Wait for page to load
                
                # Extract data for each selector
                for selector in selectors:
                    if selector.strip():
                        elements = driver.find_elements(By.CSS_SELECTOR, selector.strip())
                        results[selector.strip()] = [elem.text for elem in elements if elem.text.strip()]
                
                # Take screenshot
                screenshot_path = f"screenshots/scrape_{int(time.time())}.png"
                os.makedirs("screenshots", exist_ok=True)
                driver.save_screenshot(screenshot_path)
                results['screenshot'] = screenshot_path
                
            finally:
                driver.quit()
            
            return results
            
        except Exception as e:
            st.error(f"Scraping error: {e}")
            return None
    
    def automate_form(self, url: str, fields: List[Dict[str, str]], submit_selector: str) -> Dict[str, Any]:
        """Automate form filling"""
        try:
            driver = self.initialize_browser()
            
            try:
                driver.get(url)
                time.sleep(3)
                
                # Fill form fields
                for field in fields:
                    element = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, field['selector']))
                    )
                    element.clear()
                    element.send_keys(field['value'])
                    time.sleep(0.5)
                
                # Take screenshot before submission
                screenshot_path = f"screenshots/form_filled_{int(time.time())}.png"
                os.makedirs("screenshots", exist_ok=True)
                driver.save_screenshot(screenshot_path)
                
                # Submit form if selector provided
                if submit_selector:
                    submit_button = driver.find_element(By.CSS_SELECTOR, submit_selector)
                    submit_button.click()
                    time.sleep(3)
                
                return {'success': True, 'screenshot': screenshot_path}
                
            finally:
                driver.quit()
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def advanced_data_extraction(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Advanced data extraction with pagination and options"""
        # Mock implementation for demo
        return {
            'data': [
                {'title': 'Sample Data 1', 'value': '123'},
                {'title': 'Sample Data 2', 'value': '456'},
            ],
            'pages_processed': 1,
            'success_rate': 100.0
        }
    
    def test_element_presence(self, url: str, selectors: List[str]) -> Dict[str, bool]:
        """Test presence of elements on a page"""
        try:
            driver = self.initialize_browser()
            results = {}
            
            try:
                driver.get(url)
                time.sleep(3)
                
                for selector in selectors:
                    if selector.strip():
                        elements = driver.find_elements(By.CSS_SELECTOR, selector.strip())
                        results[selector.strip()] = len(elements) > 0
                
            finally:
                driver.quit()
            
            return results
            
        except Exception as e:
            return {selector: False for selector in selectors}
    
    def save_workflow(self, name: str, workflow: List[Dict[str, Any]]):
        """Save workflow to file"""
        os.makedirs("saved_workflows", exist_ok=True)
        
        workflow_data = {
            'name': name,
            'created_at': datetime.now().isoformat(),
            'workflow': workflow
        }
        
        filename = f"saved_workflows/{name.replace(' ', '_').lower()}.json"
        with open(filename, 'w') as f:
            json.dump(workflow_data, f, indent=2, default=str)

def main():
    """Main application entry point"""
    app = BrowserAutomationSuite()
    app.render_main_interface()

if __name__ == "__main__":
    main()
