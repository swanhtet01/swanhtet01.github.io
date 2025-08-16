"""
Test Launcher - Verifies all components before launch
"""
import asyncio
import logging
from pathlib import Path
import yaml
from src.agents.qa_agent import QAAgent
from src.agents.team_coordinator import TeamCoordinator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('launch_tests.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

class TestLauncher:
    def __init__(self):
        self.qa_agent = QAAgent()
        self.team_coordinator = TeamCoordinator()
        
    async def run_pre_launch_tests(self):
        """Run all pre-launch tests"""
        logger.info("Starting pre-launch tests...")
        
        # Run system tests
        system_test = await self.qa_agent.full_system_test()
        if system_test["overall_status"] != "healthy":
            logger.error("System tests failed!")
            logger.error(self.qa_agent.generate_report(system_test))
            return False
            
        # Check team collaboration
        team_health = await self.team_coordinator.run_health_check()
        if team_health["status"] != "healthy":
            logger.error("Team collaboration needs attention!")
            logger.error(team_health)
            return False
            
        logger.info("All pre-launch tests passed!")
        return True

async def main():
    launcher = TestLauncher()
    
    # Run pre-launch tests
    tests_passed = await launcher.run_pre_launch_tests()
    
    if tests_passed:
        logger.info("All systems verified. Safe to launch!")
        # Launch the main workspace here
        from launch_workspace import WorkspaceLauncher
        workspace = WorkspaceLauncher()
        await workspace.launch_workspace()
    else:
        logger.error("Pre-launch tests failed. Please check logs.")

if __name__ == "__main__":
    asyncio.run(main())
