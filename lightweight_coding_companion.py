#!/usr/bin/env python3
"""
🤖 LIGHTWEIGHT AI CODING COMPANION
=================================
Professional coding assistant without heavy ML dependencies
"""

import streamlit as st
import time
import os
import json
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
import subprocess
import sys

# Simple code analysis without ML
class CodeAnalyzer:
    def __init__(self):
        self.patterns = {
            'functions': r'def\s+(\w+)\s*\(',
            'classes': r'class\s+(\w+)\s*[:\(]',
            'imports': r'(?:from\s+\w+\s+)?import\s+([\w\s,]+)',
            'comments': r'#.*$',
            'docstrings': r'"""[\s\S]*?"""',
            'variables': r'(\w+)\s*=\s*',
        }
    
    def analyze_code(self, code: str) -> Dict[str, Any]:
        """Analyze code without ML dependencies"""
        analysis = {
            'lines_of_code': len(code.splitlines()),
            'functions': [],
            'classes': [],
            'imports': [],
            'complexity_score': 0,
            'issues': []
        }
        
        lines = code.splitlines()
        
        for line_num, line in enumerate(lines, 1):
            # Find functions
            if match := re.search(self.patterns['functions'], line):
                analysis['functions'].append({
                    'name': match.group(1),
                    'line': line_num,
                    'code': line.strip()
                })
            
            # Find classes
            if match := re.search(self.patterns['classes'], line):
                analysis['classes'].append({
                    'name': match.group(1),
                    'line': line_num,
                    'code': line.strip()
                })
            
            # Find imports
            if match := re.search(self.patterns['imports'], line):
                analysis['imports'].append({
                    'imports': match.group(1).strip(),
                    'line': line_num
                })
            
            # Basic complexity checks
            if any(keyword in line for keyword in ['for', 'while', 'if', 'elif', 'try', 'except']):
                analysis['complexity_score'] += 1
            
            # Basic issue detection
            if line.strip().startswith('TODO') or line.strip().startswith('FIXME'):
                analysis['issues'].append({
                    'type': 'todo',
                    'line': line_num,
                    'message': line.strip()
                })
            
            if len(line) > 100:
                analysis['issues'].append({
                    'type': 'long_line',
                    'line': line_num,
                    'message': f'Line too long ({len(line)} chars)'
                })
        
        return analysis

# Set page config
st.set_page_config(
    page_title="🤖 AI Coding Companion",
    page_icon="🤖",
    layout="wide"
)

class LightweightCodingCompanion:
    """Lightweight coding companion without heavy dependencies"""
    
    def __init__(self):
        self.analyzer = CodeAnalyzer()
        if 'coding_history' not in st.session_state:
            st.session_state.coding_history = []
        if 'current_project' not in st.session_state:
            st.session_state.current_project = None
    
    def render_interface(self):
        st.title("🤖 AI Coding Companion")
        st.markdown("### Professional Development Assistant")
        
        # Status indicators
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Python Environment", f"✅ {sys.version.split()[0]}")
        with col2:
            st.metric("Available Tools", "6/6")
        with col3:
            st.metric("Active Session", "Running")
        
        st.divider()
        
        # Main tabs
        tab1, tab2, tab3, tab4 = st.tabs(["📝 Code Analysis", "🔧 Code Generation", "🐛 Debugging", "📁 Project Manager"])
        
        with tab1:
            self.render_code_analysis()
        
        with tab2:
            self.render_code_generation()
        
        with tab3:
            self.render_debugging()
        
        with tab4:
            self.render_project_manager()
    
    def render_code_analysis(self):
        st.subheader("📝 Code Analysis & Review")
        
        # File upload or paste code
        analysis_method = st.radio("Input Method", ["Paste Code", "Upload File", "Analyze Project"])
        
        code_to_analyze = ""
        
        if analysis_method == "Paste Code":
            code_to_analyze = st.text_area("Code to Analyze", height=300, placeholder="Paste your Python code here...")
        
        elif analysis_method == "Upload File":
            uploaded_file = st.file_uploader("Choose a Python file", type=['py'])
            if uploaded_file:
                code_to_analyze = str(uploaded_file.read(), "utf-8")
                st.code(code_to_analyze[:500] + "..." if len(code_to_analyze) > 500 else code_to_analyze)
        
        elif analysis_method == "Analyze Project":
            project_path = st.text_input("Project Directory Path", placeholder="C:/path/to/your/project")
            if project_path and os.path.exists(project_path):
                python_files = []
                for root, dirs, files in os.walk(project_path):
                    for file in files:
                        if file.endswith('.py'):
                            python_files.append(os.path.join(root, file))
                
                if python_files:
                    selected_file = st.selectbox("Select File to Analyze", python_files)
                    if selected_file:
                        try:
                            with open(selected_file, 'r', encoding='utf-8') as f:
                                code_to_analyze = f.read()
                            st.success(f"Loaded {selected_file}")
                        except Exception as e:
                            st.error(f"Error reading file: {str(e)}")
        
        if code_to_analyze and st.button("🔍 Analyze Code", type="primary"):
            with st.spinner("Analyzing code..."):
                analysis = self.analyzer.analyze_code(code_to_analyze)
                
                # Display analysis results
                col1, col2 = st.columns(2)
                
                with col1:
                    st.subheader("📊 Code Metrics")
                    st.metric("Lines of Code", analysis['lines_of_code'])
                    st.metric("Functions Found", len(analysis['functions']))
                    st.metric("Classes Found", len(analysis['classes']))
                    st.metric("Complexity Score", analysis['complexity_score'])
                
                with col2:
                    st.subheader("📋 Structure Overview")
                    
                    if analysis['functions']:
                        st.write("**Functions:**")
                        for func in analysis['functions'][:10]:  # Show first 10
                            st.write(f"- `{func['name']}()` (line {func['line']})")
                    
                    if analysis['classes']:
                        st.write("**Classes:**")
                        for cls in analysis['classes']:
                            st.write(f"- `{cls['name']}` (line {cls['line']})")
                    
                    if analysis['imports']:
                        st.write("**Imports:**")
                        for imp in analysis['imports'][:5]:  # Show first 5
                            st.write(f"- {imp['imports']}")
                
                # Issues and recommendations
                if analysis['issues']:
                    st.subheader("⚠️ Issues Found")
                    for issue in analysis['issues']:
                        if issue['type'] == 'long_line':
                            st.warning(f"Line {issue['line']}: {issue['message']}")
                        else:
                            st.info(f"Line {issue['line']}: {issue['message']}")
                
                # Code quality suggestions
                st.subheader("💡 Improvement Suggestions")
                suggestions = self.generate_suggestions(analysis)
                for suggestion in suggestions:
                    st.write(f"• {suggestion}")
                
                # Save analysis
                st.session_state.coding_history.append({
                    'timestamp': datetime.now(),
                    'type': 'analysis',
                    'analysis': analysis,
                    'code_preview': code_to_analyze[:200] + "..." if len(code_to_analyze) > 200 else code_to_analyze
                })
    
    def render_code_generation(self):
        st.subheader("🔧 Smart Code Generation")
        
        generation_type = st.selectbox("Generation Type", [
            "Function Template", "Class Template", "API Endpoint", 
            "Data Processing", "File Operations", "Testing Code"
        ])
        
        if generation_type == "Function Template":
            st.write("**Function Generator**")
            func_name = st.text_input("Function Name")
            func_params = st.text_input("Parameters (comma-separated)", placeholder="param1, param2")
            func_purpose = st.text_area("Function Purpose", placeholder="What should this function do?")
            
            if st.button("Generate Function"):
                code = self.generate_function_template(func_name, func_params, func_purpose)
                st.code(code, language='python')
        
        elif generation_type == "Class Template":
            st.write("**Class Generator**")
            class_name = st.text_input("Class Name")
            class_purpose = st.text_area("Class Purpose", placeholder="What is this class for?")
            methods = st.text_input("Methods (comma-separated)", placeholder="method1, method2")
            
            if st.button("Generate Class"):
                code = self.generate_class_template(class_name, class_purpose, methods)
                st.code(code, language='python')
        
        elif generation_type == "API Endpoint":
            st.write("**FastAPI Endpoint Generator**")
            endpoint_path = st.text_input("Endpoint Path", placeholder="/api/v1/users")
            method = st.selectbox("HTTP Method", ["GET", "POST", "PUT", "DELETE"])
            endpoint_purpose = st.text_area("Endpoint Purpose")
            
            if st.button("Generate Endpoint"):
                code = self.generate_api_endpoint(endpoint_path, method, endpoint_purpose)
                st.code(code, language='python')
        
        elif generation_type == "Data Processing":
            st.write("**Data Processing Code**")
            data_source = st.selectbox("Data Source", ["CSV File", "JSON File", "Database", "API"])
            processing_type = st.selectbox("Processing Type", ["Filter", "Transform", "Aggregate", "Validate"])
            
            if st.button("Generate Data Processing Code"):
                code = self.generate_data_processing(data_source, processing_type)
                st.code(code, language='python')
        
        elif generation_type == "File Operations":
            st.write("**File Operations Code**")
            operation = st.selectbox("Operation", ["Read File", "Write File", "File Management", "Directory Operations"])
            
            if st.button("Generate File Operations"):
                code = self.generate_file_operations(operation)
                st.code(code, language='python')
        
        elif generation_type == "Testing Code":
            st.write("**Unit Test Generator**")
            test_function = st.text_input("Function to Test")
            test_scenarios = st.text_area("Test Scenarios", placeholder="List the scenarios you want to test")
            
            if st.button("Generate Tests"):
                code = self.generate_test_code(test_function, test_scenarios)
                st.code(code, language='python')
    
    def render_debugging(self):
        st.subheader("🐛 Debug Assistant")
        
        debug_method = st.radio("Debug Method", ["Error Analysis", "Code Review", "Performance Check"])
        
        if debug_method == "Error Analysis":
            st.write("**Error Analyzer**")
            error_message = st.text_area("Error Message/Traceback", height=200)
            problem_code = st.text_area("Problematic Code", height=200)
            
            if st.button("Analyze Error"):
                if error_message:
                    suggestions = self.analyze_error(error_message, problem_code)
                    
                    st.subheader("🔍 Error Analysis")
                    for suggestion in suggestions:
                        st.write(f"• {suggestion}")
                    
                    st.subheader("💡 Suggested Fixes")
                    fixes = self.suggest_fixes(error_message, problem_code)
                    for fix in fixes:
                        st.code(fix, language='python')
        
        elif debug_method == "Code Review":
            st.write("**Code Review Assistant**")
            review_code = st.text_area("Code to Review", height=300)
            
            if st.button("Review Code"):
                if review_code:
                    review_points = self.review_code(review_code)
                    
                    for point in review_points:
                        if point['type'] == 'error':
                            st.error(f"❌ {point['message']}")
                        elif point['type'] == 'warning':
                            st.warning(f"⚠️ {point['message']}")
                        else:
                            st.info(f"💡 {point['message']}")
        
        elif debug_method == "Performance Check":
            st.write("**Performance Analyzer**")
            perf_code = st.text_area("Code to Analyze for Performance", height=200)
            
            if st.button("Check Performance"):
                if perf_code:
                    perf_suggestions = self.analyze_performance(perf_code)
                    
                    st.subheader("🚀 Performance Suggestions")
                    for suggestion in perf_suggestions:
                        st.write(f"• {suggestion}")
    
    def render_project_manager(self):
        st.subheader("📁 Project Management")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🆕 New Project")
            project_name = st.text_input("Project Name")
            project_type = st.selectbox("Project Type", [
                "Web Application", "API Server", "Data Science", 
                "CLI Tool", "Desktop App", "Automation Script"
            ])
            
            if st.button("Create Project Structure"):
                if project_name:
                    structure = self.create_project_structure(project_name, project_type)
                    st.success(f"Created project structure for {project_name}")
                    st.code(structure)
        
        with col2:
            st.subheader("📊 Project Analysis")
            project_path = st.text_input("Project Directory")
            
            if st.button("Analyze Project") and project_path:
                if os.path.exists(project_path):
                    analysis = self.analyze_project(project_path)
                    
                    st.metric("Python Files", analysis['python_files'])
                    st.metric("Total Lines", analysis['total_lines'])
                    st.metric("Functions", analysis['total_functions'])
                    st.metric("Classes", analysis['total_classes'])
                    
                    if analysis['requirements']:
                        st.write("**Dependencies Found:**")
                        for req in analysis['requirements'][:10]:
                            st.write(f"- {req}")
        
        # Session history
        st.subheader("📝 Session History")
        if st.session_state.coding_history:
            for i, item in enumerate(reversed(st.session_state.coding_history[-5:])):
                with st.expander(f"{item['type'].title()} - {item['timestamp'].strftime('%H:%M:%S')}"):
                    if item['type'] == 'analysis':
                        st.write(f"**Code analyzed:** {len(item['code_preview'])} characters")
                        st.write(f"**Functions found:** {len(item['analysis']['functions'])}")
                        st.write(f"**Classes found:** {len(item['analysis']['classes'])}")
        else:
            st.info("No activity yet. Start by analyzing some code!")
    
    def generate_suggestions(self, analysis: Dict[str, Any]) -> List[str]:
        """Generate improvement suggestions based on analysis"""
        suggestions = []
        
        if analysis['complexity_score'] > 20:
            suggestions.append("Consider breaking down complex functions into smaller, more manageable pieces")
        
        if len(analysis['functions']) == 0 and analysis['lines_of_code'] > 50:
            suggestions.append("Consider organizing code into functions for better reusability")
        
        if len(analysis['classes']) == 0 and analysis['lines_of_code'] > 100:
            suggestions.append("Consider using classes to organize related functionality")
        
        if not analysis['imports']:
            suggestions.append("Consider using standard library modules to enhance functionality")
        
        suggestions.append("Add docstrings to functions and classes for better documentation")
        suggestions.append("Consider adding type hints for better code clarity")
        suggestions.append("Use consistent naming conventions throughout the code")
        
        return suggestions
    
    def generate_function_template(self, name: str, params: str, purpose: str) -> str:
        """Generate a function template"""
        param_list = [p.strip() for p in params.split(',') if p.strip()] if params else []
        param_str = ', '.join(param_list)
        
        template = f'''def {name or 'my_function'}({param_str}):
    """
    {purpose or 'Function purpose description here'}
    
    Args:'''
        
        for param in param_list:
            template += f'\n        {param}: Description of {param}'
        
        template += '''
    
    Returns:
        Description of return value
    """
    # TODO: Implement function logic
    pass'''
        
        return template
    
    def generate_class_template(self, name: str, purpose: str, methods: str) -> str:
        """Generate a class template"""
        method_list = [m.strip() for m in methods.split(',') if m.strip()] if methods else []
        
        template = f'''class {name or 'MyClass'}:
    """
    {purpose or 'Class purpose description here'}
    """
    
    def __init__(self):
        """Initialize the class"""
        # TODO: Add initialization code
        pass'''
        
        for method in method_list:
            template += f'''
    
    def {method}(self):
        """
        {method.replace('_', ' ').title()} method
        """
        # TODO: Implement {method} logic
        pass'''
        
        return template
    
    def generate_api_endpoint(self, path: str, method: str, purpose: str) -> str:
        """Generate FastAPI endpoint"""
        method_lower = method.lower()
        
        template = f'''from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class RequestModel(BaseModel):
    # TODO: Add request fields
    pass

class ResponseModel(BaseModel):
    # TODO: Add response fields
    pass

@app.{method_lower}("{path or '/api/endpoint'}")
async def endpoint_function('''
        
        if method in ['POST', 'PUT']:
            template += 'data: RequestModel'
        
        template += f'''):
    """
    {purpose or 'Endpoint purpose description here'}
    """
    try:
        # TODO: Implement endpoint logic
        return {{"message": "Success"}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))'''
        
        return template
    
    def generate_data_processing(self, source: str, processing: str) -> str:
        """Generate data processing code"""
        templates = {
            'CSV File': '''import pandas as pd

def process_csv_data(file_path: str):
    """Process CSV data"""
    try:
        # Read CSV file
        df = pd.read_csv(file_path)
        
        # TODO: Add data processing logic
        processed_df = df  # Replace with actual processing
        
        return processed_df
    except Exception as e:
        print(f"Error processing CSV: {e}")
        return None''',
        
            'JSON File': '''import json

def process_json_data(file_path: str):
    """Process JSON data"""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        # TODO: Add data processing logic
        processed_data = data  # Replace with actual processing
        
        return processed_data
    except Exception as e:
        print(f"Error processing JSON: {e}")
        return None''',
        
            'Database': '''import sqlite3

def process_database_data(db_path: str):
    """Process database data"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # TODO: Add SQL query and processing logic
        cursor.execute("SELECT * FROM your_table")
        data = cursor.fetchall()
        
        conn.close()
        return data
    except Exception as e:
        print(f"Error processing database: {e}")
        return None'''
        }
        
        return templates.get(source, "# TODO: Add data processing code")
    
    def generate_file_operations(self, operation: str) -> str:
        """Generate file operations code"""
        templates = {
            'Read File': '''def read_file(file_path: str) -> str:
    """Read file content"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return content
    except Exception as e:
        print(f"Error reading file: {e}")
        return None''',
        
            'Write File': '''def write_file(file_path: str, content: str) -> bool:
    """Write content to file"""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"Error writing file: {e}")
        return False''',
        
            'File Management': '''import os
import shutil

def manage_files(source_dir: str, destination_dir: str):
    """File management operations"""
    try:
        # Create directories if they don't exist
        os.makedirs(destination_dir, exist_ok=True)
        
        # Copy files
        for filename in os.listdir(source_dir):
            src_path = os.path.join(source_dir, filename)
            dst_path = os.path.join(destination_dir, filename)
            
            if os.path.isfile(src_path):
                shutil.copy2(src_path, dst_path)
                print(f"Copied: {filename}")
                
    except Exception as e:
        print(f"Error managing files: {e}")'''
        }
        
        return templates.get(operation, "# TODO: Add file operations code")
    
    def generate_test_code(self, function_name: str, scenarios: str) -> str:
        """Generate unit test code"""
        template = f'''import unittest

class Test{function_name.title() if function_name else 'Function'}(unittest.TestCase):
    """Test cases for {function_name or 'function'}"""
    
    def setUp(self):
        """Set up test fixtures"""
        # TODO: Add setup code
        pass
    
    def test_{function_name or 'function'}_basic(self):
        """Test basic functionality"""
        # TODO: Add basic test
        pass
    
    def test_{function_name or 'function'}_edge_cases(self):
        """Test edge cases"""
        # TODO: Add edge case tests
        pass
    
    def test_{function_name or 'function'}_error_handling(self):
        """Test error handling"""
        # TODO: Add error handling tests
        pass

if __name__ == '__main__':
    unittest.main()'''
        
        return template
    
    def analyze_error(self, error_msg: str, code: str) -> List[str]:
        """Analyze error message and provide suggestions"""
        suggestions = []
        
        error_lower = error_msg.lower()
        
        if 'nameserror' in error_lower:
            suggestions.append("NameError: Variable or function is not defined. Check for typos in variable names.")
            suggestions.append("Make sure all variables are initialized before use.")
            suggestions.append("Check if imports are missing.")
        
        elif 'syntaxerror' in error_lower:
            suggestions.append("SyntaxError: Check for missing colons, parentheses, or brackets.")
            suggestions.append("Verify proper indentation (Python is indentation-sensitive).")
            suggestions.append("Look for unclosed quotes or strings.")
        
        elif 'indentationerror' in error_lower:
            suggestions.append("IndentationError: Fix inconsistent indentation.")
            suggestions.append("Use either tabs OR spaces consistently (not both).")
            suggestions.append("Check that code blocks are properly indented.")
        
        elif 'typeerror' in error_lower:
            suggestions.append("TypeError: Check data types being used in operations.")
            suggestions.append("Ensure functions are called with correct number of arguments.")
            suggestions.append("Verify that objects have the methods/attributes being accessed.")
        
        elif 'keyerror' in error_lower:
            suggestions.append("KeyError: Dictionary key doesn't exist.")
            suggestions.append("Use .get() method or check if key exists with 'in' operator.")
            suggestions.append("Print dictionary keys to debug.")
        
        elif 'indexerror' in error_lower:
            suggestions.append("IndexError: List index is out of range.")
            suggestions.append("Check list length before accessing elements.")
            suggestions.append("Use try/except or check bounds.")
        
        else:
            suggestions.append("General debugging tips:")
            suggestions.append("Add print statements to track variable values.")
            suggestions.append("Use a debugger to step through code.")
            suggestions.append("Check documentation for function usage.")
        
        return suggestions
    
    def suggest_fixes(self, error_msg: str, code: str) -> List[str]:
        """Suggest code fixes"""
        fixes = []
        
        if 'nameserror' in error_msg.lower():
            fixes.append('''# Fix for NameError - Check variable initialization
# Before:
# print(my_variable)  # NameError if not defined

# After:
my_variable = "some value"
print(my_variable)''')
        
        elif 'keyerror' in error_msg.lower():
            fixes.append('''# Fix for KeyError - Safe dictionary access
# Before:
# value = my_dict[key]  # KeyError if key doesn't exist

# After:
value = my_dict.get(key, "default_value")
# Or:
if key in my_dict:
    value = my_dict[key]''')
        
        elif 'indexerror' in error_msg.lower():
            fixes.append('''# Fix for IndexError - Safe list access
# Before:
# item = my_list[5]  # IndexError if list too short

# After:
if len(my_list) > 5:
    item = my_list[5]
# Or:
try:
    item = my_list[5]
except IndexError:
    item = None''')
        
        return fixes
    
    def review_code(self, code: str) -> List[Dict[str, str]]:
        """Review code and provide feedback"""
        review_points = []
        
        lines = code.splitlines()
        
        for i, line in enumerate(lines, 1):
            # Check for long lines
            if len(line) > 100:
                review_points.append({
                    'type': 'warning',
                    'message': f'Line {i}: Line is too long ({len(line)} characters)'
                })
            
            # Check for bare except clauses
            if 'except:' in line and 'except Exception:' not in line:
                review_points.append({
                    'type': 'warning',
                    'message': f'Line {i}: Use specific exception types instead of bare except'
                })
            
            # Check for TODO comments
            if 'TODO' in line.upper():
                review_points.append({
                    'type': 'info',
                    'message': f'Line {i}: TODO found - {line.strip()}'
                })
            
            # Check for potential issues
            if line.strip().startswith('import *'):
                review_points.append({
                    'type': 'warning',
                    'message': f'Line {i}: Avoid wildcard imports'
                })
        
        # General suggestions
        if not any('def ' in line for line in lines):
            review_points.append({
                'type': 'info',
                'message': 'Consider organizing code into functions for better structure'
            })
        
        return review_points
    
    def analyze_performance(self, code: str) -> List[str]:
        """Analyze code for performance issues"""
        suggestions = []
        
        lines = code.splitlines()
        code_text = '\n'.join(lines)
        
        # Check for potential performance issues
        if 'for' in code_text and 'append' in code_text:
            suggestions.append("Consider using list comprehensions instead of loops with append()")
        
        if code_text.count('for') > 3:
            suggestions.append("Multiple nested loops detected - consider optimizing algorithm complexity")
        
        if 'time.sleep' in code_text:
            suggestions.append("Consider using async/await for better concurrency instead of time.sleep")
        
        if '.keys()' in code_text and 'in' in code_text:
            suggestions.append("Use 'key in dict' instead of 'key in dict.keys()' for better performance")
        
        suggestions.append("Use built-in functions and libraries when possible (they're usually optimized)")
        suggestions.append("Consider using generators for large datasets to save memory")
        suggestions.append("Profile your code with cProfile to identify actual bottlenecks")
        
        return suggestions
    
    def create_project_structure(self, name: str, project_type: str) -> str:
        """Create project structure"""
        structures = {
            'Web Application': f'''
{name}/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── models/
│   ├── routes/
│   └── templates/
├── static/
├── tests/
├── requirements.txt
└── README.md''',
            
            'API Server': f'''
{name}/
├── api/
│   ├── __init__.py
│   ├── main.py
│   ├── endpoints/
│   └── models/
├── tests/
├── requirements.txt
└── README.md''',
            
            'Data Science': f'''
{name}/
├── data/
│   ├── raw/
│   └── processed/
├── notebooks/
├── src/
│   ├── __init__.py
│   ├── data_processing.py
│   └── models.py
├── requirements.txt
└── README.md'''
        }
        
        return structures.get(project_type, f"{name}/\n├── src/\n├── tests/\n└── README.md")
    
    def analyze_project(self, project_path: str) -> Dict[str, Any]:
        """Analyze project directory"""
        analysis = {
            'python_files': 0,
            'total_lines': 0,
            'total_functions': 0,
            'total_classes': 0,
            'requirements': []
        }
        
        # Walk through project directory
        for root, dirs, files in os.walk(project_path):
            for file in files:
                if file.endswith('.py'):
                    analysis['python_files'] += 1
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            analysis['total_lines'] += len(content.splitlines())
                            
                            # Count functions and classes
                            analysis['total_functions'] += len(re.findall(r'def\s+\w+', content))
                            analysis['total_classes'] += len(re.findall(r'class\s+\w+', content))
                    except:
                        pass
                
                elif file == 'requirements.txt':
                    req_path = os.path.join(root, file)
                    try:
                        with open(req_path, 'r') as f:
                            analysis['requirements'] = [line.strip() for line in f if line.strip()]
                    except:
                        pass
        
        return analysis

def main():
    app = LightweightCodingCompanion()
    app.render_interface()

if __name__ == "__main__":
    main()
