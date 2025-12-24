"""
HYPER UNICORN System Tests
==========================
Comprehensive test suite to verify all components work correctly.

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import unittest
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.agent_config import ConfigManager, DEFAULT_MODELS, DEFAULT_TOOLS, DEFAULT_AGENT_TEMPLATES
from monitoring.agent_monitor import AgentMonitor, AgentStatus, TaskMetrics


class TestConfigManager(unittest.TestCase):
    """Test the configuration system."""
    
    def setUp(self):
        self.config = ConfigManager()
    
    def test_default_models_loaded(self):
        """Test that default models are available."""
        self.assertIn("gemini-flash", self.config.models)
        self.assertIn("claude-sonnet", self.config.models)
        self.assertIn("gpt-4-turbo", self.config.models)
    
    def test_default_tools_loaded(self):
        """Test that default tools are available."""
        self.assertIn("tavily", self.config.tools)
        self.assertIn("browser", self.config.tools)
        self.assertIn("github", self.config.tools)
    
    def test_default_templates_loaded(self):
        """Test that default agent templates are available."""
        self.assertIn("research_analyst", self.config.templates)
        self.assertIn("software_developer", self.config.templates)
        self.assertIn("content_writer", self.config.templates)
    
    def test_create_agent_from_template(self):
        """Test creating an agent from a template."""
        agent_config = self.config.create_agent_from_template(
            "research_analyst",
            "test_agent_001"
        )
        
        self.assertEqual(agent_config["agent_id"], "test_agent_001")
        self.assertEqual(agent_config["role"], "researcher")
        self.assertIn("web_search", agent_config["capabilities"])
    
    def test_list_templates(self):
        """Test listing available templates."""
        templates = self.config.list_templates()
        
        self.assertGreater(len(templates), 0)
        self.assertTrue(any(t["name"] == "research_analyst" for t in templates))
    
    def test_export_config(self):
        """Test exporting all configurations."""
        export = self.config.export_config()
        
        self.assertIn("system", export)
        self.assertIn("models", export)
        self.assertIn("tools", export)
        self.assertIn("templates", export)


class TestAgentMonitor(unittest.TestCase):
    """Test the monitoring system."""
    
    def setUp(self):
        self.monitor = AgentMonitor()
    
    def test_register_agent(self):
        """Test registering a new agent."""
        agent = self.monitor.register_agent("test_agent", "researcher")
        
        self.assertEqual(agent.agent_id, "test_agent")
        self.assertEqual(agent.agent_type, "researcher")
        self.assertEqual(agent.status, "idle")
    
    def test_update_agent_status(self):
        """Test updating agent status."""
        self.monitor.register_agent("test_agent", "researcher")
        self.monitor.update_agent_status("test_agent", "running", "task_001")
        
        agent = self.monitor.get_agent_status("test_agent")
        self.assertEqual(agent.status, "running")
        self.assertEqual(agent.current_task, "task_001")
    
    def test_start_task(self):
        """Test starting a task."""
        self.monitor.register_agent("test_agent", "researcher")
        task = self.monitor.start_task("task_001", "test_agent", "research")
        
        self.assertEqual(task.task_id, "task_001")
        self.assertEqual(task.status, "running")
        self.assertIsNotNone(task.started_at)
    
    def test_complete_task(self):
        """Test completing a task."""
        self.monitor.register_agent("test_agent", "researcher")
        self.monitor.start_task("task_001", "test_agent", "research")
        self.monitor.complete_task("task_001", tokens_used=1000)
        
        task = self.monitor.get_task_metrics("task_001")
        self.assertEqual(task.status, "completed")
        self.assertEqual(task.tokens_used, 1000)
        self.assertGreater(task.duration_seconds, 0)
    
    def test_fail_task(self):
        """Test failing a task."""
        self.monitor.register_agent("test_agent", "researcher")
        self.monitor.start_task("task_001", "test_agent", "research")
        self.monitor.fail_task("task_001", "Test error message")
        
        task = self.monitor.get_task_metrics("task_001")
        self.assertEqual(task.status, "failed")
        self.assertEqual(task.error_message, "Test error message")
    
    def test_collect_system_metrics(self):
        """Test collecting system metrics."""
        metrics = self.monitor.collect_system_metrics()
        
        self.assertIsNotNone(metrics.timestamp)
        self.assertGreaterEqual(metrics.cpu_usage_percent, 0)
        self.assertGreaterEqual(metrics.memory_usage_percent, 0)
    
    def test_get_dashboard_data(self):
        """Test getting dashboard data."""
        self.monitor.register_agent("test_agent", "researcher")
        self.monitor.start_task("task_001", "test_agent", "research")
        
        data = self.monitor.get_dashboard_data()
        
        self.assertIn("system", data)
        self.assertIn("agents", data)
        self.assertIn("recent_tasks", data)
        self.assertIn("alerts", data)


class TestAgentIntegration(unittest.TestCase):
    """Integration tests for agents."""
    
    def test_research_agent_import(self):
        """Test that Research Agent can be imported."""
        try:
            from agents.research_agent import ResearchAgent, ResearchTask
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Research Agent: {e}")
    
    def test_code_agent_import(self):
        """Test that Code Agent can be imported."""
        try:
            from agents.code_agent import CodeAgent, CodeTask
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Code Agent: {e}")
    
    def test_content_agent_import(self):
        """Test that Content Agent can be imported."""
        try:
            from agents.content_agent import ContentAgent, ContentTask
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Content Agent: {e}")


class TestToolEcosystem(unittest.TestCase):
    """Test the tool ecosystem."""
    
    def test_tool_ecosystem_import(self):
        """Test that Tool Ecosystem can be imported."""
        try:
            from tools.tool_ecosystem import ToolEcosystem
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Tool Ecosystem: {e}")
    
    def test_mega_tools_import(self):
        """Test that Mega Tools files exist and are valid Python."""
        import ast
        tools_dir = Path(__file__).parent.parent / "tools"
        
        tool_files = [
            "universal_research_tool.py",
            "code_forge.py",
            "content_factory.py",
            "data_intelligence_hub.py"
        ]
        
        for tool_file in tool_files:
            tool_path = tools_dir / tool_file
            self.assertTrue(tool_path.exists(), f"Tool file missing: {tool_file}")
            
            # Verify valid Python syntax
            with open(tool_path) as f:
                try:
                    ast.parse(f.read())
                except SyntaxError as e:
                    self.fail(f"Syntax error in {tool_file}: {e}")


class TestMemorySystem(unittest.TestCase):
    """Test the memory system."""
    
    def test_memory_cortex_import(self):
        """Test that Memory Cortex can be imported."""
        try:
            from memory.memory_cortex import MemoryCortex
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Memory Cortex: {e}")


class TestIntelligenceFabric(unittest.TestCase):
    """Test the intelligence fabric."""
    
    def test_intelligence_fabric_import(self):
        """Test that Intelligence Fabric can be imported."""
        try:
            from core.intelligence_fabric import IntelligenceFabric
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Intelligence Fabric: {e}")
    
    def test_master_control_agent_import(self):
        """Test that Master Control Agent can be imported."""
        try:
            from core.master_control_agent import MasterControlAgent
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Failed to import Master Control Agent: {e}")


# =============================================================================
# Async Tests
# =============================================================================

class AsyncTestCase(unittest.TestCase):
    """Base class for async tests."""
    
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
    
    def tearDown(self):
        self.loop.close()
    
    def run_async(self, coro):
        return self.loop.run_until_complete(coro)


class TestAsyncAgentOperations(AsyncTestCase):
    """Async tests for agent operations."""
    
    def test_research_agent_initialization(self):
        """Test Research Agent initialization."""
        async def test():
            from agents.research_agent import ResearchAgent
            agent = ResearchAgent()
            self.assertIsNotNone(agent)
            await agent.close()
        
        self.run_async(test())
    
    def test_code_agent_initialization(self):
        """Test Code Agent initialization."""
        async def test():
            from agents.code_agent import CodeAgent
            agent = CodeAgent()
            self.assertIsNotNone(agent)
            await agent.close()
        
        self.run_async(test())
    
    def test_content_agent_initialization(self):
        """Test Content Agent initialization."""
        async def test():
            from agents.content_agent import ContentAgent
            agent = ContentAgent()
            self.assertIsNotNone(agent)
            await agent.close()
        
        self.run_async(test())


# =============================================================================
# Run Tests
# =============================================================================

def run_tests():
    """Run all tests and return results."""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestConfigManager))
    suite.addTests(loader.loadTestsFromTestCase(TestAgentMonitor))
    suite.addTests(loader.loadTestsFromTestCase(TestAgentIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestToolEcosystem))
    suite.addTests(loader.loadTestsFromTestCase(TestMemorySystem))
    suite.addTests(loader.loadTestsFromTestCase(TestIntelligenceFabric))
    suite.addTests(loader.loadTestsFromTestCase(TestAsyncAgentOperations))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    
    if result.wasSuccessful():
        print("\n✅ ALL TESTS PASSED!")
    else:
        print("\n❌ SOME TESTS FAILED")
        
        if result.failures:
            print("\nFailures:")
            for test, traceback in result.failures:
                print(f"  - {test}: {traceback.split(chr(10))[0]}")
        
        if result.errors:
            print("\nErrors:")
            for test, traceback in result.errors:
                print(f"  - {test}: {traceback.split(chr(10))[0]}")
    
    return result


if __name__ == "__main__":
    run_tests()
