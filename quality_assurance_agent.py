#!/usr/bin/env python3
"""
REAL QUALITY ASSURANCE AGENT - Actual testing and validation
"""

import streamlit as st
import requests
import selenium
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import unittest
import subprocess
import sqlite3
from pathlib import Path
import time
from datetime import datetime
import json
import logging
import sys
import os
from io import StringIO

class RealQualityAssuranceAgent:
    def __init__(self):
        self.agent_name = "Quality Assurance Agent"
        self.db_path = "quality_assurance.db"
        self.test_results_dir = Path("test_results")
        self.test_results_dir.mkdir(exist_ok=True)
        self.init_database()
        
    def init_database(self):
        """Initialize real database for storing test results"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY,
                test_name TEXT,
                test_type TEXT,
                status TEXT,
                duration REAL,
                error_message TEXT,
                timestamp TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS website_tests (
                id INTEGER PRIMARY KEY,
                url TEXT,
                status_code INTEGER,
                response_time REAL,
                page_size INTEGER,
                test_timestamp TIMESTAMP,
                passed BOOLEAN
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS code_quality (
                id INTEGER PRIMARY KEY,
                file_path TEXT,
                lines_of_code INTEGER,
                complexity_score REAL,
                issues_found INTEGER,
                test_coverage REAL,
                timestamp TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def test_website_functionality(self, url):
        """Actually test website functionality with Selenium"""
        try:
            start_time = time.time()
            
            # Configure Chrome options for headless testing
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            
            # Initialize WebDriver (requires chromedriver installed)
            try:
                driver = webdriver.Chrome(options=chrome_options)
            except Exception:
                # Fallback to requests if selenium not available
                response = requests.get(url, timeout=10)
                duration = time.time() - start_time
                
                test_result = {
                    'url': url,
                    'status_code': response.status_code,
                    'response_time': duration,
                    'page_size': len(response.content),
                    'test_type': 'http_test',
                    'passed': response.status_code == 200
                }
                
                self.record_website_test(test_result)
                return test_result
            
            # Perform actual website tests
            driver.get(url)
            
            # Test page load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            duration = time.time() - start_time
            page_source_size = len(driver.page_source)
            current_url = driver.current_url
            
            # Check for common elements
            elements_found = {
                'title': driver.title != "",
                'body': len(driver.find_elements(By.TAG_NAME, "body")) > 0,
                'forms': len(driver.find_elements(By.TAG_NAME, "form")),
                'links': len(driver.find_elements(By.TAG_NAME, "a")),
                'images': len(driver.find_elements(By.TAG_NAME, "img"))
            }
            
            driver.quit()
            
            test_result = {
                'url': url,
                'status_code': 200,
                'response_time': duration,
                'page_size': page_source_size,
                'elements_found': elements_found,
                'test_type': 'selenium_test',
                'passed': all([elements_found['title'], elements_found['body']])
            }
            
            self.record_website_test(test_result)
            return test_result
            
        except Exception as e:
            error_result = {
                'url': url,
                'error': str(e),
                'test_type': 'failed_test',
                'passed': False
            }
            
            # Record the failed test
            self.record_test_result("Website Test", "selenium", "failed", 0, str(e))
            return error_result
    
    def record_website_test(self, test_result):
        """Record real website test results"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO website_tests (url, status_code, response_time, page_size, test_timestamp, passed)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            test_result.get('url'),
            test_result.get('status_code', 0),
            test_result.get('response_time', 0),
            test_result.get('page_size', 0),
            datetime.now(),
            test_result.get('passed', False)
        ))
        
        conn.commit()
        conn.close()
    
    def analyze_code_quality(self, file_path):
        """Actually analyze code quality of real files"""
        try:
            if not Path(file_path).exists():
                return {"error": f"File {file_path} not found"}
                
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Real code analysis
            analysis = {
                'file_path': file_path,
                'lines_of_code': len(content.split('\n')),
                'characters': len(content),
                'functions': content.count('def '),
                'classes': content.count('class '),
                'imports': content.count('import '),
                'comments': content.count('#'),
                'docstrings': content.count('"""') + content.count("'''"),
                'complexity_indicators': {
                    'if_statements': content.count(' if '),
                    'loops': content.count('for ') + content.count('while '),
                    'try_blocks': content.count('try:'),
                    'nested_functions': content.count('    def ')
                }
            }
            
            # Calculate complexity score
            complexity = (
                analysis['complexity_indicators']['if_statements'] * 1 +
                analysis['complexity_indicators']['loops'] * 2 +
                analysis['complexity_indicators']['try_blocks'] * 1 +
                analysis['complexity_indicators']['nested_functions'] * 3
            ) / max(analysis['functions'], 1)
            
            # Record code quality metrics
            self.record_code_quality(
                file_path,
                analysis['lines_of_code'],
                complexity,
                0,  # Issues found (would need linting tool)
                0.0  # Test coverage (would need coverage tool)
            )
            
            return analysis
            
        except Exception as e:
            return {"error": str(e)}
    
    def run_unit_tests(self, test_file_pattern="test_*.py"):
        """Actually run unit tests if they exist"""
        try:
            # Find test files
            test_files = list(Path.cwd().glob(test_file_pattern))
            
            if not test_files:
                return {"message": "No test files found", "test_files_searched": test_file_pattern}
            
            results = []
            
            for test_file in test_files:
                start_time = time.time()
                
                try:
                    # Run the test file
                    result = subprocess.run([
                        sys.executable, "-m", "pytest", str(test_file), "-v"
                    ], capture_output=True, text=True, timeout=30)
                    
                    duration = time.time() - start_time
                    
                    test_result = {
                        'file': str(test_file),
                        'exit_code': result.returncode,
                        'duration': duration,
                        'stdout': result.stdout,
                        'stderr': result.stderr,
                        'passed': result.returncode == 0
                    }
                    
                    # Record test result
                    status = "passed" if result.returncode == 0 else "failed"
                    self.record_test_result(
                        f"Unit Test: {test_file.name}",
                        "unit_test",
                        status,
                        duration,
                        result.stderr if result.stderr else ""
                    )
                    
                    results.append(test_result)
                    
                except subprocess.TimeoutExpired:
                    results.append({
                        'file': str(test_file),
                        'error': 'Test timed out after 30 seconds',
                        'passed': False
                    })
                    
                    self.record_test_result(
                        f"Unit Test: {test_file.name}",
                        "unit_test",
                        "timeout",
                        30,
                        "Test timed out"
                    )
                
            return {'test_results': results, 'total_tests': len(results)}
            
        except Exception as e:
            return {"error": str(e)}
    
    def test_api_endpoints(self, endpoints):
        """Actually test real API endpoints"""
        results = []
        
        for endpoint in endpoints:
            try:
                start_time = time.time()
                
                # Make real API request
                response = requests.get(endpoint, timeout=10)
                duration = time.time() - start_time
                
                result = {
                    'endpoint': endpoint,
                    'status_code': response.status_code,
                    'response_time': duration,
                    'response_size': len(response.content),
                    'content_type': response.headers.get('content-type', ''),
                    'passed': 200 <= response.status_code < 300
                }
                
                # Try to parse JSON if applicable
                if 'application/json' in result['content_type']:
                    try:
                        result['json_valid'] = True
                        result['json_keys'] = list(response.json().keys()) if response.json() else []
                    except:
                        result['json_valid'] = False
                
                results.append(result)
                
                # Record test result
                status = "passed" if result['passed'] else "failed"
                self.record_test_result(
                    f"API Test: {endpoint}",
                    "api_test",
                    status,
                    duration,
                    "" if result['passed'] else f"Status code: {response.status_code}"
                )
                
            except Exception as e:
                error_result = {
                    'endpoint': endpoint,
                    'error': str(e),
                    'passed': False
                }
                results.append(error_result)
                
                self.record_test_result(
                    f"API Test: {endpoint}",
                    "api_test",
                    "error",
                    0,
                    str(e)
                )
                
        return results
    
    def record_test_result(self, test_name, test_type, status, duration, error_message):
        """Record real test results in database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO test_results (test_name, test_type, status, duration, error_message, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (test_name, test_type, status, duration, error_message, datetime.now()))
        
        conn.commit()
        conn.close()
    
    def record_code_quality(self, file_path, lines_of_code, complexity_score, issues_found, test_coverage):
        """Record real code quality metrics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO code_quality (file_path, lines_of_code, complexity_score, issues_found, test_coverage, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (file_path, lines_of_code, complexity_score, issues_found, test_coverage, datetime.now()))
        
        conn.commit()
        conn.close()
    
    def get_test_history(self):
        """Get real test execution history"""
        conn = sqlite3.connect(self.db_path)
        
        # Get test results
        test_results = conn.execute('''
            SELECT * FROM test_results ORDER BY timestamp DESC LIMIT 50
        ''').fetchall()
        
        # Get website tests
        website_tests = conn.execute('''
            SELECT * FROM website_tests ORDER BY test_timestamp DESC LIMIT 20
        ''').fetchall()
        
        # Get code quality metrics
        code_quality = conn.execute('''
            SELECT * FROM code_quality ORDER BY timestamp DESC LIMIT 20
        ''').fetchall()
        
        conn.close()
        
        return {
            'test_results': test_results,
            'website_tests': website_tests,
            'code_quality': code_quality
        }
    
    def run(self):
        st.set_page_config(page_title="Quality Assurance Agent - REAL", page_icon="🔍", layout="wide")
        st.title("🔍 Quality Assurance Agent - REAL TESTING ACTIVE")
        st.success("✅ Agent performing actual quality assurance and testing!")
        
        tab1, tab2, tab3, tab4 = st.tabs(["Website Testing", "Code Analysis", "API Testing", "Results"])
        
        with tab1:
            st.subheader("🌐 Website Functionality Testing")
            url = st.text_input("Website URL to Test", "https://httpbin.org/get")
            
            if st.button("🔍 Test Website"):
                with st.spinner("Running real website tests..."):
                    result = self.test_website_functionality(url)
                    
                    if 'error' in result:
                        st.error(f"Test failed: {result['error']}")
                    else:
                        st.success("Website test completed!")
                        st.json(result)
        
        with tab2:
            st.subheader("📝 Code Quality Analysis")
            
            # List Python files in current directory
            python_files = list(Path.cwd().glob("*.py"))
            if python_files:
                selected_file = st.selectbox("Select Python file to analyze", python_files)
                
                if st.button("🔍 Analyze Code Quality"):
                    with st.spinner("Analyzing code quality..."):
                        analysis = self.analyze_code_quality(selected_file)
                        
                        if 'error' in analysis:
                            st.error(f"Analysis failed: {analysis['error']}")
                        else:
                            st.success("Code analysis completed!")
                            
                            col1, col2, col3 = st.columns(3)
                            with col1:
                                st.metric("Lines of Code", analysis['lines_of_code'])
                            with col2:
                                st.metric("Functions", analysis['functions'])
                            with col3:
                                st.metric("Classes", analysis['classes'])
                            
                            st.json(analysis)
            else:
                st.info("No Python files found in current directory")
                
            # Unit tests
            st.subheader("🧪 Unit Tests")
            if st.button("🚀 Run Unit Tests"):
                with st.spinner("Running unit tests..."):
                    test_results = self.run_unit_tests()
                    st.json(test_results)
        
        with tab3:
            st.subheader("🔌 API Endpoint Testing")
            
            # Pre-configured test APIs
            test_apis = [
                "https://httpbin.org/get",
                "https://jsonplaceholder.typicode.com/posts/1",
                "https://api.github.com",
                "https://httpbin.org/status/200"
            ]
            
            selected_apis = st.multiselect("Select APIs to test", test_apis, default=test_apis[:2])
            custom_api = st.text_input("Or enter custom API URL")
            
            if custom_api:
                selected_apis.append(custom_api)
            
            if st.button("🔍 Test API Endpoints") and selected_apis:
                with st.spinner("Testing API endpoints..."):
                    results = self.test_api_endpoints(selected_apis)
                    
                    for result in results:
                        if result.get('passed', False):
                            st.success(f"✅ {result['endpoint']}: {result.get('status_code', 'OK')}")
                        else:
                            st.error(f"❌ {result['endpoint']}: {result.get('error', 'Failed')}")
                    
                    st.json(results)
        
        with tab4:
            st.subheader("📊 Test Results History")
            
            history = self.get_test_history()
            
            # Test results summary
            if history['test_results']:
                st.write("### Recent Test Results")
                test_data = []
                for row in history['test_results']:
                    test_data.append({
                        'Test Name': row[1],
                        'Type': row[2],
                        'Status': row[3],
                        'Duration': f"{row[4]:.2f}s" if row[4] else "N/A",
                        'Timestamp': row[6]
                    })
                
                st.dataframe(test_data, use_container_width=True)
            
            # Website tests
            if history['website_tests']:
                st.write("### Website Test Results")
                website_data = []
                for row in history['website_tests']:
                    website_data.append({
                        'URL': row[1],
                        'Status Code': row[2],
                        'Response Time': f"{row[3]:.2f}s" if row[3] else "N/A",
                        'Page Size': f"{row[4]} bytes" if row[4] else "N/A",
                        'Passed': "✅" if row[6] else "❌",
                        'Timestamp': row[5]
                    })
                
                st.dataframe(website_data, use_container_width=True)
            
            # Statistics
            conn = sqlite3.connect(self.db_path)
            
            total_tests = conn.execute("SELECT COUNT(*) FROM test_results").fetchone()[0]
            passed_tests = conn.execute("SELECT COUNT(*) FROM test_results WHERE status = 'passed'").fetchone()[0]
            failed_tests = conn.execute("SELECT COUNT(*) FROM test_results WHERE status = 'failed'").fetchone()[0]
            
            conn.close()
            
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Total Tests", total_tests)
            with col2:
                st.metric("Passed Tests", passed_tests)
            with col3:
                st.metric("Failed Tests", failed_tests)
            with col4:
                pass_rate = (passed_tests / max(total_tests, 1)) * 100
                st.metric("Pass Rate", f"{pass_rate:.1f}%")

if __name__ == "__main__":
    agent = RealQualityAssuranceAgent()
    agent.run()
