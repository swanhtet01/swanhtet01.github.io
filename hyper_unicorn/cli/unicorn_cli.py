#!/usr/bin/env python3
"""
HYPER UNICORN CLI
=================
Command-line interface for managing the AI agent infrastructure.

Usage:
    unicorn agents list              - List all registered agents
    unicorn agents create <template> - Create agent from template
    unicorn agents status <id>       - Get agent status
    unicorn tasks submit <goal>      - Submit a new task
    unicorn tasks list               - List recent tasks
    unicorn tasks status <id>        - Get task status
    unicorn monitor dashboard        - Open monitoring dashboard
    unicorn config show              - Show current configuration
    unicorn config set <key> <value> - Update configuration
    unicorn deploy                   - Deploy infrastructure
    unicorn test                     - Run system tests

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import argparse
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.syntax import Syntax
    from rich.markdown import Markdown
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

# Initialize console
console = Console() if RICH_AVAILABLE else None


def print_output(text: str, style: str = None):
    """Print output with optional styling."""
    if RICH_AVAILABLE and console:
        console.print(text, style=style)
    else:
        print(text)


def print_table(title: str, columns: List[str], rows: List[List[str]]):
    """Print a formatted table."""
    if RICH_AVAILABLE and console:
        table = Table(title=title)
        for col in columns:
            table.add_column(col)
        for row in rows:
            table.add_row(*row)
        console.print(table)
    else:
        print(f"\n{title}")
        print("-" * 60)
        print("\t".join(columns))
        for row in rows:
            print("\t".join(row))


def print_panel(title: str, content: str):
    """Print a panel with content."""
    if RICH_AVAILABLE and console:
        console.print(Panel(content, title=title))
    else:
        print(f"\n=== {title} ===")
        print(content)


class UnicornCLI:
    """Main CLI class for HYPER UNICORN."""
    
    def __init__(self):
        self.config_dir = Path.home() / ".hyper_unicorn"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.config_file = self.config_dir / "cli_config.json"
        self.load_config()
    
    def load_config(self):
        """Load CLI configuration."""
        if self.config_file.exists():
            with open(self.config_file) as f:
                self.config = json.load(f)
        else:
            self.config = {
                "api_url": "http://localhost:8080",
                "dashboard_url": "http://localhost:8501",
                "monitor_url": "http://localhost:8081",
                "default_model": "gemini-flash"
            }
            self.save_config()
    
    def save_config(self):
        """Save CLI configuration."""
        with open(self.config_file, "w") as f:
            json.dump(self.config, f, indent=2)
    
    # =========================================================================
    # Agent Commands
    # =========================================================================
    
    def agents_list(self):
        """List all registered agents."""
        try:
            from config.agent_config import ConfigManager
            config = ConfigManager()
            templates = config.list_templates()
            
            print_table(
                "Available Agent Templates",
                ["Name", "Role", "Description"],
                [[t["name"], t["role"], t["description"][:50] + "..."] for t in templates]
            )
            
            # Also show running agents if available
            try:
                from monitoring.agent_monitor import AgentMonitor
                monitor = AgentMonitor()
                agents = monitor.get_all_agents()
                
                if agents:
                    print_table(
                        "Running Agents",
                        ["ID", "Type", "Status", "Tasks Completed"],
                        [[a.agent_id, a.agent_type, a.status, str(a.tasks_completed)] for a in agents]
                    )
            except Exception:
                pass
                
        except Exception as e:
            print_output(f"Error listing agents: {e}", style="red")
    
    def agents_create(self, template: str, agent_id: Optional[str] = None):
        """Create a new agent from template."""
        try:
            from config.agent_config import ConfigManager
            config = ConfigManager()
            
            if not agent_id:
                agent_id = f"{template}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            agent_config = config.create_agent_from_template(template, agent_id)
            
            print_panel(
                f"Agent Created: {agent_id}",
                f"Template: {template}\n"
                f"Role: {agent_config['role']}\n"
                f"Capabilities: {', '.join(agent_config['capabilities'])}\n"
                f"Tools: {len(agent_config['tools'])} configured"
            )
            
            # Save agent config
            agent_file = self.config_dir / "agents" / f"{agent_id}.json"
            agent_file.parent.mkdir(parents=True, exist_ok=True)
            with open(agent_file, "w") as f:
                json.dump(agent_config, f, indent=2)
            
            print_output(f"Config saved to: {agent_file}", style="green")
            
        except Exception as e:
            print_output(f"Error creating agent: {e}", style="red")
    
    def agents_status(self, agent_id: str):
        """Get status of a specific agent."""
        try:
            from monitoring.agent_monitor import AgentMonitor
            monitor = AgentMonitor()
            
            agent = monitor.get_agent_status(agent_id)
            if agent:
                print_panel(
                    f"Agent Status: {agent_id}",
                    f"Type: {agent.agent_type}\n"
                    f"Status: {agent.status}\n"
                    f"Current Task: {agent.current_task or 'None'}\n"
                    f"Tasks Completed: {agent.tasks_completed}\n"
                    f"Tasks Failed: {agent.tasks_failed}\n"
                    f"Error Rate: {agent.error_rate:.1%}\n"
                    f"Last Heartbeat: {agent.last_heartbeat}"
                )
            else:
                print_output(f"Agent not found: {agent_id}", style="yellow")
                
        except Exception as e:
            print_output(f"Error getting agent status: {e}", style="red")
    
    # =========================================================================
    # Task Commands
    # =========================================================================
    
    def tasks_submit(self, goal: str, agent_type: Optional[str] = None):
        """Submit a new task."""
        try:
            task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            task = {
                "task_id": task_id,
                "goal": goal,
                "agent_type": agent_type,
                "status": "pending",
                "created_at": datetime.utcnow().isoformat()
            }
            
            # Save task
            task_file = self.config_dir / "tasks" / f"{task_id}.json"
            task_file.parent.mkdir(parents=True, exist_ok=True)
            with open(task_file, "w") as f:
                json.dump(task, f, indent=2)
            
            print_panel(
                f"Task Submitted: {task_id}",
                f"Goal: {goal}\n"
                f"Agent Type: {agent_type or 'auto'}\n"
                f"Status: pending"
            )
            
            print_output("\nTo execute this task, run:", style="cyan")
            print_output(f"  unicorn tasks run {task_id}")
            
        except Exception as e:
            print_output(f"Error submitting task: {e}", style="red")
    
    def tasks_list(self, limit: int = 10):
        """List recent tasks."""
        try:
            tasks_dir = self.config_dir / "tasks"
            if not tasks_dir.exists():
                print_output("No tasks found.", style="yellow")
                return
            
            tasks = []
            for task_file in sorted(tasks_dir.glob("*.json"), reverse=True)[:limit]:
                with open(task_file) as f:
                    task = json.load(f)
                    tasks.append([
                        task["task_id"],
                        task["status"],
                        task["goal"][:40] + "...",
                        task.get("created_at", "N/A")[:19]
                    ])
            
            if tasks:
                print_table(
                    "Recent Tasks",
                    ["ID", "Status", "Goal", "Created"],
                    tasks
                )
            else:
                print_output("No tasks found.", style="yellow")
                
        except Exception as e:
            print_output(f"Error listing tasks: {e}", style="red")
    
    def tasks_status(self, task_id: str):
        """Get status of a specific task."""
        try:
            task_file = self.config_dir / "tasks" / f"{task_id}.json"
            if task_file.exists():
                with open(task_file) as f:
                    task = json.load(f)
                
                print_panel(
                    f"Task Status: {task_id}",
                    f"Goal: {task['goal']}\n"
                    f"Status: {task['status']}\n"
                    f"Agent: {task.get('agent_id', 'Not assigned')}\n"
                    f"Created: {task.get('created_at', 'N/A')}\n"
                    f"Completed: {task.get('completed_at', 'N/A')}"
                )
                
                if task.get("result"):
                    print_output("\nResult:", style="cyan")
                    print_output(task["result"])
            else:
                print_output(f"Task not found: {task_id}", style="yellow")
                
        except Exception as e:
            print_output(f"Error getting task status: {e}", style="red")
    
    async def tasks_run(self, task_id: str):
        """Execute a task."""
        try:
            task_file = self.config_dir / "tasks" / f"{task_id}.json"
            if not task_file.exists():
                print_output(f"Task not found: {task_id}", style="red")
                return
            
            with open(task_file) as f:
                task = json.load(f)
            
            print_output(f"Executing task: {task['goal']}", style="cyan")
            
            # Import and run the appropriate agent
            from agents.research_agent import ResearchAgent
            
            agent = ResearchAgent()
            
            # Update task status
            task["status"] = "running"
            task["started_at"] = datetime.utcnow().isoformat()
            with open(task_file, "w") as f:
                json.dump(task, f, indent=2)
            
            # Execute
            result = await agent.execute(task["goal"])
            
            # Update task with result
            task["status"] = "completed"
            task["completed_at"] = datetime.utcnow().isoformat()
            task["result"] = result
            with open(task_file, "w") as f:
                json.dump(task, f, indent=2)
            
            await agent.close()
            
            print_output("\nTask completed!", style="green")
            print_output(f"Result saved to: {task_file}")
            
        except Exception as e:
            print_output(f"Error executing task: {e}", style="red")
    
    # =========================================================================
    # Monitor Commands
    # =========================================================================
    
    def monitor_dashboard(self):
        """Open the monitoring dashboard."""
        import webbrowser
        url = self.config["dashboard_url"]
        print_output(f"Opening dashboard: {url}", style="cyan")
        webbrowser.open(url)
    
    def monitor_status(self):
        """Show current system status."""
        try:
            from monitoring.agent_monitor import AgentMonitor
            monitor = AgentMonitor()
            
            metrics = monitor.collect_system_metrics()
            
            print_panel(
                "System Status",
                f"Total Agents: {metrics.total_agents}\n"
                f"Active Agents: {metrics.active_agents}\n"
                f"Tasks in Queue: {metrics.tasks_in_queue}\n"
                f"Tasks Today: {metrics.tasks_completed_today} completed, {metrics.tasks_failed_today} failed\n"
                f"Avg Response Time: {metrics.avg_response_time_ms:.0f}ms\n"
                f"Tokens Used: {metrics.total_tokens_used:,}\n"
                f"Cost Today: ${metrics.total_cost_usd:.4f}\n"
                f"\nSystem Resources:\n"
                f"CPU: {metrics.cpu_usage_percent:.1f}%\n"
                f"Memory: {metrics.memory_usage_percent:.1f}%\n"
                f"Disk: {metrics.disk_usage_percent:.1f}%"
            )
            
        except Exception as e:
            print_output(f"Error getting status: {e}", style="red")
    
    # =========================================================================
    # Config Commands
    # =========================================================================
    
    def config_show(self):
        """Show current configuration."""
        print_panel("CLI Configuration", json.dumps(self.config, indent=2))
        
        # Also show system config
        try:
            from config.agent_config import ConfigManager
            config = ConfigManager()
            print_panel("System Configuration", json.dumps(config.export_config()["system"], indent=2))
        except Exception:
            pass
    
    def config_set(self, key: str, value: str):
        """Set a configuration value."""
        self.config[key] = value
        self.save_config()
        print_output(f"Set {key} = {value}", style="green")
    
    # =========================================================================
    # Deploy Commands
    # =========================================================================
    
    def deploy(self, target: str = "local"):
        """Deploy the infrastructure."""
        print_output(f"Deploying to: {target}", style="cyan")
        
        project_dir = Path(__file__).parent.parent
        
        if target == "local":
            # Check Docker
            try:
                subprocess.run(["docker", "--version"], check=True, capture_output=True)
            except Exception:
                print_output("Docker not found. Please install Docker first.", style="red")
                return
            
            # Run docker-compose
            compose_file = project_dir / "docker-compose.yml"
            if compose_file.exists():
                print_output("Starting services with Docker Compose...", style="cyan")
                subprocess.run(
                    ["docker-compose", "-f", str(compose_file), "up", "-d"],
                    cwd=project_dir
                )
                print_output("Services started!", style="green")
                print_output(f"\nDashboard: {self.config['dashboard_url']}")
                print_output(f"API: {self.config['api_url']}")
                print_output(f"Monitor: {self.config['monitor_url']}")
            else:
                print_output("docker-compose.yml not found", style="red")
        
        elif target == "bangkok":
            print_output("Deploying to Bangkok Node (100.113.30.52)...", style="cyan")
            print_output("Run the following on the Bangkok Node:", style="yellow")
            print_output("""
git clone https://github.com/swanhtet01/swanhtet01.github.io.git
cd swanhtet01.github.io/hyper_unicorn
cp .env.template .env
# Edit .env with your API keys
chmod +x scripts/deploy.sh
./scripts/deploy.sh
""")
    
    # =========================================================================
    # Test Commands
    # =========================================================================
    
    def test(self):
        """Run system tests."""
        print_output("Running system tests...", style="cyan")
        
        project_dir = Path(__file__).parent.parent
        test_file = project_dir / "tests" / "test_system.py"
        
        if test_file.exists():
            subprocess.run([sys.executable, str(test_file)], cwd=project_dir)
        else:
            print_output("Test file not found", style="red")
    
    # =========================================================================
    # Interactive Mode
    # =========================================================================
    
    def interactive(self):
        """Start interactive mode."""
        print_panel(
            "🦄 HYPER UNICORN Interactive Mode",
            "Type 'help' for available commands, 'exit' to quit."
        )
        
        while True:
            try:
                cmd = input("\n🦄 > ").strip()
                
                if not cmd:
                    continue
                elif cmd == "exit" or cmd == "quit":
                    print_output("Goodbye!", style="cyan")
                    break
                elif cmd == "help":
                    self.show_help()
                elif cmd.startswith("agents"):
                    parts = cmd.split()
                    if len(parts) >= 2:
                        if parts[1] == "list":
                            self.agents_list()
                        elif parts[1] == "create" and len(parts) >= 3:
                            self.agents_create(parts[2])
                        elif parts[1] == "status" and len(parts) >= 3:
                            self.agents_status(parts[2])
                elif cmd.startswith("tasks"):
                    parts = cmd.split(maxsplit=2)
                    if len(parts) >= 2:
                        if parts[1] == "list":
                            self.tasks_list()
                        elif parts[1] == "submit" and len(parts) >= 3:
                            self.tasks_submit(parts[2])
                        elif parts[1] == "status" and len(parts) >= 3:
                            self.tasks_status(parts[2])
                elif cmd == "status":
                    self.monitor_status()
                elif cmd == "config":
                    self.config_show()
                elif cmd == "test":
                    self.test()
                else:
                    print_output(f"Unknown command: {cmd}", style="yellow")
                    
            except KeyboardInterrupt:
                print_output("\nGoodbye!", style="cyan")
                break
            except Exception as e:
                print_output(f"Error: {e}", style="red")
    
    def show_help(self):
        """Show help message."""
        help_text = """
Available Commands:
  agents list              - List all agent templates
  agents create <template> - Create agent from template
  agents status <id>       - Get agent status
  
  tasks submit <goal>      - Submit a new task
  tasks list               - List recent tasks
  tasks status <id>        - Get task status
  
  status                   - Show system status
  config                   - Show configuration
  test                     - Run system tests
  
  help                     - Show this help
  exit                     - Exit interactive mode
"""
        print_output(help_text)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="🦄 HYPER UNICORN CLI - AI Agent Infrastructure Manager"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Agents commands
    agents_parser = subparsers.add_parser("agents", help="Manage agents")
    agents_sub = agents_parser.add_subparsers(dest="action")
    agents_sub.add_parser("list", help="List agents")
    create_parser = agents_sub.add_parser("create", help="Create agent")
    create_parser.add_argument("template", help="Template name")
    create_parser.add_argument("--id", help="Agent ID")
    status_parser = agents_sub.add_parser("status", help="Agent status")
    status_parser.add_argument("agent_id", help="Agent ID")
    
    # Tasks commands
    tasks_parser = subparsers.add_parser("tasks", help="Manage tasks")
    tasks_sub = tasks_parser.add_subparsers(dest="action")
    tasks_sub.add_parser("list", help="List tasks")
    submit_parser = tasks_sub.add_parser("submit", help="Submit task")
    submit_parser.add_argument("goal", help="Task goal")
    submit_parser.add_argument("--agent", help="Agent type")
    task_status_parser = tasks_sub.add_parser("status", help="Task status")
    task_status_parser.add_argument("task_id", help="Task ID")
    run_parser = tasks_sub.add_parser("run", help="Run task")
    run_parser.add_argument("task_id", help="Task ID")
    
    # Monitor commands
    monitor_parser = subparsers.add_parser("monitor", help="Monitoring")
    monitor_sub = monitor_parser.add_subparsers(dest="action")
    monitor_sub.add_parser("dashboard", help="Open dashboard")
    monitor_sub.add_parser("status", help="System status")
    
    # Config commands
    config_parser = subparsers.add_parser("config", help="Configuration")
    config_sub = config_parser.add_subparsers(dest="action")
    config_sub.add_parser("show", help="Show config")
    set_parser = config_sub.add_parser("set", help="Set config")
    set_parser.add_argument("key", help="Config key")
    set_parser.add_argument("value", help="Config value")
    
    # Deploy command
    deploy_parser = subparsers.add_parser("deploy", help="Deploy infrastructure")
    deploy_parser.add_argument("--target", default="local", help="Deploy target")
    
    # Test command
    subparsers.add_parser("test", help="Run tests")
    
    # Interactive command
    subparsers.add_parser("interactive", help="Interactive mode")
    subparsers.add_parser("i", help="Interactive mode (shortcut)")
    
    args = parser.parse_args()
    cli = UnicornCLI()
    
    if args.command == "agents":
        if args.action == "list":
            cli.agents_list()
        elif args.action == "create":
            cli.agents_create(args.template, args.id)
        elif args.action == "status":
            cli.agents_status(args.agent_id)
    
    elif args.command == "tasks":
        if args.action == "list":
            cli.tasks_list()
        elif args.action == "submit":
            cli.tasks_submit(args.goal, args.agent)
        elif args.action == "status":
            cli.tasks_status(args.task_id)
        elif args.action == "run":
            asyncio.run(cli.tasks_run(args.task_id))
    
    elif args.command == "monitor":
        if args.action == "dashboard":
            cli.monitor_dashboard()
        elif args.action == "status":
            cli.monitor_status()
    
    elif args.command == "config":
        if args.action == "show" or args.action is None:
            cli.config_show()
        elif args.action == "set":
            cli.config_set(args.key, args.value)
    
    elif args.command == "deploy":
        cli.deploy(args.target)
    
    elif args.command == "test":
        cli.test()
    
    elif args.command in ["interactive", "i"]:
        cli.interactive()
    
    else:
        # Default to interactive mode
        cli.interactive()


if __name__ == "__main__":
    main()
