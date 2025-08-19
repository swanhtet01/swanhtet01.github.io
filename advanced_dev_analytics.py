#!/usr/bin/env python3
"""
🔧 ADVANCED DEVELOPMENT ANALYTICS SYSTEM
Real-time codebase metrics, performance analysis, and development insights

🎯 PURPOSE: Provide deep development intelligence for R&D operations
⚠️  NO FAKE WORK - ONLY REAL CODE ANALYSIS AND INSIGHTS
"""

import os
import sqlite3
import json
import ast
import time
import subprocess
import requests
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import hashlib

class AdvancedDevAnalytics:
    def __init__(self):
        self.db_path = "dev_analytics.db"
        self.workspace_path = "."
        self.agent_endpoints = {
            'dev_team': 'http://localhost:8515',
            'qa': 'http://localhost:8514',
            'bi': 'http://localhost:8513',
            'automation': 'http://localhost:8512'
        }
        self.init_database()
        
    def init_database(self):
        """Initialize advanced analytics database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Code quality metrics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS code_quality (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    complexity_score REAL,
                    maintainability_index REAL,
                    lines_of_code INTEGER,
                    comment_ratio REAL,
                    function_count INTEGER,
                    class_count INTEGER,
                    duplicate_blocks INTEGER,
                    security_issues INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Performance metrics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS performance_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_type TEXT NOT NULL,
                    file_path TEXT,
                    value REAL,
                    unit TEXT,
                    benchmark_comparison REAL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Development trends
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dev_trends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date DATE,
                    commits_count INTEGER,
                    lines_added INTEGER,
                    lines_removed INTEGER,
                    files_modified INTEGER,
                    bugs_fixed INTEGER,
                    features_added INTEGER,
                    code_quality_avg REAL
                )
            ''')
            
            # Tech debt tracking
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tech_debt (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    debt_type TEXT,
                    severity TEXT,
                    description TEXT,
                    estimated_hours REAL,
                    impact_score REAL,
                    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    resolved_date DATETIME
                )
            ''')
            
            conn.commit()
            conn.close()
            print("✅ Advanced analytics database initialized")
        except Exception as e:
            print(f"❌ Database init error: {e}")

    def analyze_code_complexity(self, file_path):
        """Analyze code complexity using AST"""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            tree = ast.parse(content)
            
            complexity_analyzer = ComplexityAnalyzer()
            complexity_analyzer.visit(tree)
            
            return {
                'cyclomatic_complexity': complexity_analyzer.complexity,
                'nesting_depth': complexity_analyzer.max_nesting,
                'function_count': complexity_analyzer.function_count,
                'class_count': complexity_analyzer.class_count,
                'lines_of_code': len([line for line in content.split('\n') if line.strip()]),
                'comment_ratio': self.calculate_comment_ratio(content)
            }
        except Exception as e:
            print(f"⚠️  Complexity analysis failed for {file_path}: {e}")
            return {}

    def calculate_comment_ratio(self, content):
        """Calculate ratio of comments to code"""
        lines = content.split('\n')
        comment_lines = sum(1 for line in lines if line.strip().startswith('#'))
        code_lines = sum(1 for line in lines if line.strip() and not line.strip().startswith('#'))
        return comment_lines / max(code_lines, 1)

    def detect_code_duplicates(self):
        """Detect duplicate code blocks"""
        duplicates = []
        file_hashes = defaultdict(list)
        
        for root, dirs, files in os.walk(self.workspace_path):
            for file in files:
                if file.endswith('.py'):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        # Hash code blocks
                        lines = content.split('\n')
                        for i in range(len(lines) - 10):  # 10+ line blocks
                            block = '\n'.join(lines[i:i+10])
                            block_hash = hashlib.md5(block.encode()).hexdigest()
                            file_hashes[block_hash].append((file_path, i+1))
                    except Exception as e:
                        continue
        
        # Find duplicates
        for hash_val, locations in file_hashes.items():
            if len(locations) > 1:
                duplicates.append({
                    'hash': hash_val,
                    'locations': locations,
                    'duplicate_count': len(locations)
                })
        
        return duplicates

    def analyze_security_vulnerabilities(self, file_path):
        """Basic security vulnerability detection"""
        vulnerabilities = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Common vulnerability patterns
            patterns = {
                'sql_injection': ['execute(', 'cursor.execute(', '%s'],
                'command_injection': ['os.system(', 'subprocess.call(', 'eval('],
                'hardcoded_secrets': ['password =', 'secret =', 'api_key ='],
                'unsafe_imports': ['pickle.loads', 'yaml.load', 'marshal.loads']
            }
            
            for vuln_type, checks in patterns.items():
                for check in checks:
                    if check in content:
                        vulnerabilities.append({
                            'type': vuln_type,
                            'pattern': check,
                            'line': self.find_line_number(content, check)
                        })
        
        except Exception as e:
            print(f"⚠️  Security analysis failed: {e}")
        
        return vulnerabilities

    def find_line_number(self, content, pattern):
        """Find line number of pattern in content"""
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if pattern in line:
                return i + 1
        return 0

    def calculate_maintainability_index(self, complexity_data):
        """Calculate maintainability index"""
        if not complexity_data:
            return 0
        
        loc = complexity_data.get('lines_of_code', 1)
        complexity = complexity_data.get('cyclomatic_complexity', 1)
        comment_ratio = complexity_data.get('comment_ratio', 0)
        
        # Simplified maintainability index calculation
        mi = max(0, 171 - 5.2 * (complexity / loc * 100) - 0.23 * complexity - 16.2 * (1 - comment_ratio * 100))
        return min(100, mi)

    def generate_development_insights(self):
        """Generate actionable development insights"""
        insights = {
            'code_quality': self.get_code_quality_insights(),
            'performance': self.get_performance_insights(),
            'technical_debt': self.get_tech_debt_insights(),
            'development_trends': self.get_development_trends(),
            'recommendations': self.generate_recommendations()
        }
        
        return insights

    def get_code_quality_insights(self):
        """Get code quality insights from database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    AVG(complexity_score) as avg_complexity,
                    AVG(maintainability_index) as avg_maintainability,
                    AVG(comment_ratio) as avg_comments,
                    COUNT(*) as total_files
                FROM code_quality 
                WHERE DATE(timestamp) = DATE('now')
            ''')
            
            result = cursor.fetchone()
            conn.close()
            
            return {
                'average_complexity': result[0] or 0,
                'average_maintainability': result[1] or 0,
                'average_comment_ratio': result[2] or 0,
                'files_analyzed': result[3] or 0
            }
        except Exception as e:
            return {'error': f"Quality insights error: {e}"}

    def get_performance_insights(self):
        """Get performance insights"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT metric_type, AVG(value), COUNT(*)
                FROM performance_metrics 
                WHERE DATE(timestamp) = DATE('now')
                GROUP BY metric_type
            ''')
            
            results = cursor.fetchall()
            conn.close()
            
            return {metric: {'average': avg, 'count': count} 
                    for metric, avg, count in results}
        except Exception as e:
            return {'error': f"Performance insights error: {e}"}

    def get_tech_debt_insights(self):
        """Get technical debt insights"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    debt_type,
                    COUNT(*) as count,
                    AVG(estimated_hours) as avg_hours,
                    AVG(impact_score) as avg_impact
                FROM tech_debt 
                WHERE resolved_date IS NULL
                GROUP BY debt_type
            ''')
            
            results = cursor.fetchall()
            conn.close()
            
            return {debt_type: {
                'count': count,
                'average_hours': avg_hours or 0,
                'average_impact': avg_impact or 0
            } for debt_type, count, avg_hours, avg_impact in results}
        except Exception as e:
            return {'error': f"Tech debt insights error: {e}"}

    def generate_recommendations(self):
        """Generate actionable recommendations"""
        recommendations = []
        
        try:
            # Get latest quality data
            quality = self.get_code_quality_insights()
            
            if quality.get('average_complexity', 0) > 10:
                recommendations.append({
                    'priority': 'HIGH',
                    'type': 'Code Quality',
                    'issue': 'High cyclomatic complexity detected',
                    'action': 'Refactor complex functions into smaller, focused methods',
                    'impact': 'Improved maintainability and testability'
                })
            
            if quality.get('average_comment_ratio', 0) < 0.1:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'type': 'Documentation',
                    'issue': 'Low comment ratio',
                    'action': 'Add comprehensive docstrings and inline comments',
                    'impact': 'Better code understanding and maintenance'
                })
            
            if quality.get('average_maintainability', 0) < 70:
                recommendations.append({
                    'priority': 'HIGH',
                    'type': 'Maintainability',
                    'issue': 'Low maintainability index',
                    'action': 'Focus on code cleanup, reduce complexity, improve structure',
                    'impact': 'Reduced development time and bug frequency'
                })
            
        except Exception as e:
            recommendations.append({
                'priority': 'LOW',
                'type': 'System',
                'issue': f'Analytics error: {e}',
                'action': 'Check analytics system configuration',
                'impact': 'Restore development insights'
            })
        
        return recommendations

    def execute_full_analysis(self):
        """Execute comprehensive codebase analysis"""
        print("🔧 EXECUTING ADVANCED DEVELOPMENT ANALYTICS")
        print("=" * 60)
        
        start_time = time.time()
        analysis_results = {
            'timestamp': datetime.now().isoformat(),
            'files_analyzed': 0,
            'issues_found': 0,
            'recommendations': [],
            'quality_metrics': {},
            'performance_data': {},
            'security_findings': []
        }
        
        # Analyze Python files
        for root, dirs, files in os.walk(self.workspace_path):
            for file in files:
                if file.endswith('.py'):
                    file_path = os.path.join(root, file)
                    
                    try:
                        # Code complexity analysis
                        complexity = self.analyze_code_complexity(file_path)
                        if complexity:
                            maintainability = self.calculate_maintainability_index(complexity)
                            
                            # Store in database
                            self.store_quality_metrics(file_path, complexity, maintainability)
                            analysis_results['files_analyzed'] += 1
                        
                        # Security analysis
                        security_issues = self.analyze_security_vulnerabilities(file_path)
                        analysis_results['security_findings'].extend(security_issues)
                        analysis_results['issues_found'] += len(security_issues)
                        
                    except Exception as e:
                        print(f"⚠️  Analysis failed for {file_path}: {e}")
        
        # Detect duplicates
        duplicates = self.detect_code_duplicates()
        analysis_results['duplicate_blocks'] = len(duplicates)
        
        # Generate insights and recommendations
        insights = self.generate_development_insights()
        analysis_results['recommendations'] = insights.get('recommendations', [])
        analysis_results['quality_metrics'] = insights.get('code_quality', {})
        
        # Performance summary
        execution_time = time.time() - start_time
        analysis_results['execution_time'] = round(execution_time, 2)
        
        print(f"✅ Analysis Complete: {analysis_results['files_analyzed']} files analyzed")
        print(f"🔍 Issues Found: {analysis_results['issues_found']}")
        print(f"📊 Recommendations: {len(analysis_results['recommendations'])}")
        print(f"⏱️  Execution Time: {execution_time:.2f}s")
        
        # Save results
        self.save_analysis_results(analysis_results)
        
        return analysis_results

    def store_quality_metrics(self, file_path, complexity, maintainability):
        """Store quality metrics in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO code_quality (
                    file_path, complexity_score, maintainability_index,
                    lines_of_code, comment_ratio, function_count, class_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                file_path,
                complexity.get('cyclomatic_complexity', 0),
                maintainability,
                complexity.get('lines_of_code', 0),
                complexity.get('comment_ratio', 0),
                complexity.get('function_count', 0),
                complexity.get('class_count', 0)
            ))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"⚠️  Failed to store metrics for {file_path}: {e}")

    def save_analysis_results(self, results):
        """Save analysis results to file"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"dev_analytics_{timestamp}.json"
            
            with open(filename, 'w') as f:
                json.dump(results, f, indent=2, default=str)
            
            print(f"📄 Results saved to: {filename}")
        except Exception as e:
            print(f"⚠️  Failed to save results: {e}")


class ComplexityAnalyzer(ast.NodeVisitor):
    """AST visitor for calculating cyclomatic complexity"""
    
    def __init__(self):
        self.complexity = 1  # Base complexity
        self.nesting_level = 0
        self.max_nesting = 0
        self.function_count = 0
        self.class_count = 0
    
    def visit_FunctionDef(self, node):
        self.function_count += 1
        self.nesting_level += 1
        self.max_nesting = max(self.max_nesting, self.nesting_level)
        self.generic_visit(node)
        self.nesting_level -= 1
    
    def visit_ClassDef(self, node):
        self.class_count += 1
        self.generic_visit(node)
    
    def visit_If(self, node):
        self.complexity += 1
        self.generic_visit(node)
    
    def visit_While(self, node):
        self.complexity += 1
        self.generic_visit(node)
    
    def visit_For(self, node):
        self.complexity += 1
        self.generic_visit(node)
    
    def visit_Try(self, node):
        self.complexity += 1
        self.generic_visit(node)


def main():
    """Main execution function"""
    print("🚀 STARTING ADVANCED DEVELOPMENT ANALYTICS")
    print("🎯 FOCUS: Real codebase analysis and development insights")
    print("⚠️  NO FAKE WORK - ONLY GENUINE DEVELOPMENT INTELLIGENCE")
    print("=" * 70)
    
    analytics = AdvancedDevAnalytics()
    
    try:
        # Execute comprehensive analysis
        results = analytics.execute_full_analysis()
        
        # Display key findings
        print("\n📊 KEY FINDINGS:")
        print("-" * 40)
        
        if results['recommendations']:
            print("🎯 TOP RECOMMENDATIONS:")
            for i, rec in enumerate(results['recommendations'][:3], 1):
                print(f"{i}. [{rec['priority']}] {rec['issue']}")
                print(f"   Action: {rec['action']}")
        
        if results['security_findings']:
            print(f"\n🔒 SECURITY ISSUES: {len(results['security_findings'])} found")
            for finding in results['security_findings'][:3]:
                print(f"   - {finding['type']}: {finding['pattern']}")
        
        print(f"\n✅ ANALYSIS COMPLETE - Real development intelligence generated")
        print(f"📈 Files analyzed: {results['files_analyzed']}")
        print(f"🔍 Total issues: {results['issues_found']}")
        
    except Exception as e:
        print(f"❌ Analytics execution failed: {e}")


if __name__ == "__main__":
    main()
