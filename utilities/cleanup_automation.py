#!/usr/bin/env python3
"""
🧹 Repository Cleanup Automation Script
======================================
Automated cleanup script to consolidate and organize the Super Mega Inc codebase
"""

import os
import shutil
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

class RepositoryCleanup:
    """Automated repository cleanup and organization system"""
    
    def __init__(self):
        self.root_path = Path(".")
        self.archive_path = Path("archive")
        self.cleanup_report = {
            "started_at": datetime.now().isoformat(),
            "original_file_count": 0,
            "files_processed": 0,
            "files_archived": 0,
            "files_moved": 0,
            "duplicates_removed": 0,
            "directories_created": 0,
            "reduction_percentage": 0.0,
            "actions": []
        }
        
    def run_comprehensive_cleanup(self):
        """Run the complete cleanup process"""
        print("🚀 Starting comprehensive repository cleanup...")
        
        # Count original files
        self.cleanup_report["original_file_count"] = len(list(self.root_path.glob("**/*.py")))
        print(f"📊 Original file count: {self.cleanup_report['original_file_count']} Python files")
        
        # Phase 1: Archive duplicates and experimental files
        self._archive_duplicate_files()
        
        # Phase 2: Consolidate autonomous agents
        self._consolidate_autonomous_agents()
        
        # Phase 3: Organize API services
        self._organize_api_services()
        
        # Phase 4: Consolidate business intelligence
        self._consolidate_business_intelligence()
        
        # Phase 5: Clean up deployment files
        self._organize_deployment_files()
        
        # Phase 6: Final organization
        self._final_organization()
        
        # Generate report
        self._generate_cleanup_report()
        
        print("✅ Repository cleanup completed!")
        
    def _archive_duplicate_files(self):
        """Archive duplicate and experimental files"""
        print("📦 Phase 1: Archiving duplicate and experimental files...")
        
        # Files to archive (duplicates and experimental)
        files_to_archive = [
            'autonomous_github_dev_team (1).py',
            'autonomous_ai_dev_company_24_7 (1).py',
            'autonomous_cli (1).py',
            'autonomous_cli_orchestrator (1).py',
            'autonomous_monitor (1).py',
            'api_redis_cache (1).py',
            'cli_agent_manager (1).py',
            'autonomous_demo.py',
            'demo_run_agents_v2.py',
            'demo_run_agents.py',
            'check_agents.py',
            'check_db.py',
            'check_dev_team_status.py',
            'check_status.py',
            'demo.py',
            'demo (1).py',
            # Add more experimental/duplicate files
            'test_launcher (1).py',
            'autonomous_status_monitor (1).py',
            'simple_project/',
            'demo_coordination (1).py',
        ]
        
        # Create archive structure
        archive_experimental = self.archive_path / "experimental"
        archive_duplicates = self.archive_path / "duplicates"
        archive_tests = self.archive_path / "old_tests"
        
        for dir_path in [archive_experimental, archive_duplicates, archive_tests]:
            dir_path.mkdir(parents=True, exist_ok=True)
            self.cleanup_report["directories_created"] += 1
        
        archived_count = 0
        for file_name in files_to_archive:
            file_path = Path(file_name)
            if file_path.exists():
                try:
                    if '(1)' in file_name or 'demo' in file_name.lower():
                        target_dir = archive_duplicates if '(1)' in file_name else archive_experimental
                    else:
                        target_dir = archive_tests
                        
                    if file_path.is_dir():
                        shutil.move(str(file_path), str(target_dir / file_name))
                    else:
                        shutil.move(str(file_path), str(target_dir / file_name))
                    
                    archived_count += 1
                    self.cleanup_report["actions"].append(f"Archived: {file_name}")
                    print(f"📦 Archived: {file_name}")
                except Exception as e:
                    print(f"❌ Failed to archive {file_name}: {e}")
        
        self.cleanup_report["files_archived"] = archived_count
        print(f"✅ Archived {archived_count} files")
        
    def _consolidate_autonomous_agents(self):
        """Consolidate autonomous agent implementations"""
        print("🤖 Phase 2: Consolidating autonomous agents...")
        
        # Autonomous agent files to consolidate
        agent_files = [
            'autonomous_agents_v3.py',
            'autonomous_dev_team.py', 
            'autonomous_github_dev_team.py',
            'autonomous_cli_orchestrator.py',
            'autonomous_dev_team_manager.py',
            'autonomous_deployment_coordinator.py',
            'autonomous_monitor.py',
        ]
        
        # Create consolidated structure
        autonomous_dir = Path("autonomous-systems")
        core_dir = autonomous_dir / "core"
        dev_team_dir = autonomous_dir / "dev-team"
        business_dir = autonomous_dir / "business"
        deployment_dir = autonomous_dir / "deployment"
        monitoring_dir = autonomous_dir / "monitoring"
        
        for dir_path in [core_dir, dev_team_dir, business_dir, deployment_dir, monitoring_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
            self.cleanup_report["directories_created"] += 1
        
        # Move and rename files based on functionality
        consolidation_map = {
            'autonomous_agents_v3.py': core_dir / 'agents_manager.py',
            'autonomous_dev_team.py': dev_team_dir / 'team_coordinator.py',
            'autonomous_github_dev_team.py': dev_team_dir / 'github_integration.py',
            'autonomous_cli_orchestrator.py': core_dir / 'cli_orchestrator.py',
            'autonomous_deployment_coordinator.py': deployment_dir / 'coordinator.py',
            'autonomous_monitor.py': monitoring_dir / 'system_monitor.py',
        }
        
        moved_count = 0
        for source, target in consolidation_map.items():
            source_path = Path(source)
            if source_path.exists() and source_path.stat().st_size > 0:  # Only move non-empty files
                try:
                    shutil.move(str(source_path), str(target))
                    moved_count += 1
                    self.cleanup_report["actions"].append(f"Moved: {source} -> {target}")
                    print(f"🔄 Moved: {source} -> {target}")
                except Exception as e:
                    print(f"❌ Failed to move {source}: {e}")
        
        self.cleanup_report["files_moved"] += moved_count
        print(f"✅ Consolidated {moved_count} autonomous agent files")
    
    def _organize_api_services(self):
        """Organize API service files"""
        print("🔌 Phase 3: Organizing API services...")
        
        # Create API services structure
        api_dir = Path("api-services")
        auth_dir = api_dir / "auth"
        cache_dir = api_dir / "cache"
        database_dir = api_dir / "database"
        integrations_dir = api_dir / "integrations"
        
        for dir_path in [auth_dir, cache_dir, database_dir, integrations_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
            self.cleanup_report["directories_created"] += 1
        
        # API files to organize
        api_files_map = {
            'api_redis_cache.py': cache_dir / 'redis_cache.py',
            'api_test.py': api_dir / 'testing.py',
            # Add more API files as they're identified
        }
        
        moved_count = 0
        for source, target in api_files_map.items():
            source_path = Path(source)
            if source_path.exists():
                try:
                    shutil.move(str(source_path), str(target))
                    moved_count += 1
                    self.cleanup_report["actions"].append(f"API Organized: {source} -> {target}")
                    print(f"🔌 Organized: {source} -> {target}")
                except Exception as e:
                    print(f"❌ Failed to organize {source}: {e}")
        
        self.cleanup_report["files_moved"] += moved_count
        print(f"✅ Organized {moved_count} API service files")
    
    def _consolidate_business_intelligence(self):
        """Consolidate business intelligence modules"""
        print("📊 Phase 4: Consolidating business intelligence...")
        
        # Create BI structure
        bi_dir = Path("analytics-intelligence")
        tracking_dir = bi_dir / "tracking"
        dashboards_dir = bi_dir / "dashboards"
        insights_dir = bi_dir / "insights"
        reporting_dir = bi_dir / "reporting"
        
        for dir_path in [tracking_dir, dashboards_dir, insights_dir, reporting_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
            self.cleanup_report["directories_created"] += 1
        
        # BI files to consolidate
        bi_files_map = {
            'business_performance_tracker.py': tracking_dir / 'performance_tracker.py',
            'business_intelligence_suite.py': bi_dir / 'core_suite.py',
            'business_intel_agent.py': insights_dir / 'intel_agent.py',
            'business_analytics_engine.py': bi_dir / 'analytics_engine.py',
            'analytics_dashboard.py': dashboards_dir / 'main_dashboard.py',
        }
        
        moved_count = 0
        for source, target in bi_files_map.items():
            source_path = Path(source)
            if source_path.exists():
                try:
                    shutil.move(str(source_path), str(target))
                    moved_count += 1
                    self.cleanup_report["actions"].append(f"BI Consolidated: {source} -> {target}")
                    print(f"📊 Consolidated: {source} -> {target}")
                except Exception as e:
                    print(f"❌ Failed to consolidate {source}: {e}")
        
        self.cleanup_report["files_moved"] += moved_count
        print(f"✅ Consolidated {moved_count} business intelligence files")
    
    def _organize_deployment_files(self):
        """Organize deployment and DevOps files"""
        print("🚀 Phase 5: Organizing deployment files...")
        
        # Create deployment structure
        deploy_dir = Path("deployment-infrastructure")
        docker_dir = deploy_dir / "docker"
        k8s_dir = deploy_dir / "kubernetes"
        aws_dir = deploy_dir / "aws"
        scripts_dir = deploy_dir / "scripts"
        
        for dir_path in [docker_dir, k8s_dir, aws_dir, scripts_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
            self.cleanup_report["directories_created"] += 1
        
        # Deployment files to organize (script files)
        deployment_scripts = [
            'deploy.sh',
            'deploy-to-aws.sh', 
            'deploy-aws.sh',
            'deploy-universal.sh',
            'deploy-complete.sh',
            'deploy-platform.sh',
        ]
        
        moved_count = 0
        for script in deployment_scripts:
            script_path = Path(script)
            if script_path.exists():
                try:
                    shutil.move(str(script_path), str(scripts_dir / script))
                    moved_count += 1
                    self.cleanup_report["actions"].append(f"Deploy Script Moved: {script}")
                    print(f"🚀 Moved: {script} -> deployment-infrastructure/scripts/")
                except Exception as e:
                    print(f"❌ Failed to move {script}: {e}")
        
        self.cleanup_report["files_moved"] += moved_count
        print(f"✅ Organized {moved_count} deployment files")
    
    def _final_organization(self):
        """Final organization and cleanup"""
        print("🎯 Phase 6: Final organization...")
        
        # Create remaining directories
        utilities_dir = Path("utilities")
        scripts_dir = utilities_dir / "scripts"
        tools_dir = utilities_dir / "tools"
        helpers_dir = utilities_dir / "helpers"
        
        for dir_path in [scripts_dir, tools_dir, helpers_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
            self.cleanup_report["directories_created"] += 1
        
        # Move utility files
        utility_files = [
            'cleanup_repository.py',
            'cleanup_and_deploy.py',
            'health_monitor.py',
        ]
        
        moved_count = 0
        for util_file in utility_files:
            util_path = Path(util_file)
            if util_path.exists():
                try:
                    shutil.move(str(util_path), str(tools_dir / util_file))
                    moved_count += 1
                    self.cleanup_report["actions"].append(f"Utility Moved: {util_file}")
                    print(f"🔧 Moved: {util_file} -> utilities/tools/")
                except Exception as e:
                    print(f"❌ Failed to move {util_file}: {e}")
        
        self.cleanup_report["files_moved"] += moved_count
        print(f"✅ Organized {moved_count} utility files")
    
    def _generate_cleanup_report(self):
        """Generate comprehensive cleanup report"""
        # Count final file numbers
        final_file_count = len(list(self.root_path.glob("**/*.py")))
        
        self.cleanup_report["final_file_count"] = final_file_count
        self.cleanup_report["files_processed"] = self.cleanup_report["original_file_count"] - final_file_count
        self.cleanup_report["reduction_percentage"] = (
            (self.cleanup_report["files_processed"] / self.cleanup_report["original_file_count"]) * 100
            if self.cleanup_report["original_file_count"] > 0 else 0
        )
        self.cleanup_report["completed_at"] = datetime.now().isoformat()
        
        # Save report
        report_path = Path("CLEANUP_REPORT.json")
        with open(report_path, 'w') as f:
            json.dump(self.cleanup_report, f, indent=2)
        
        # Print summary
        print("\n🎉 CLEANUP COMPLETED!")
        print("=" * 50)
        print(f"📊 Original files: {self.cleanup_report['original_file_count']}")
        print(f"📊 Final files: {final_file_count}")
        print(f"📉 Reduction: {self.cleanup_report['reduction_percentage']:.1f}%")
        print(f"📦 Files archived: {self.cleanup_report['files_archived']}")
        print(f"🔄 Files moved: {self.cleanup_report['files_moved']}")
        print(f"📁 Directories created: {self.cleanup_report['directories_created']}")
        print(f"📋 Report saved: {report_path}")
        print("=" * 50)

if __name__ == "__main__":
    cleanup_system = RepositoryCleanup()
    cleanup_system.run_comprehensive_cleanup()
