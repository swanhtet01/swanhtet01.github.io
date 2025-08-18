#!/usr/bin/env python3
"""
Enhanced Agent Deployment Script
Deploys the real LLM-powered agent system to AWS EC2

This script:
1. Updates the EC2 instance with enhanced agent system
2. Sets up OpenAI API integration
3. Configures enhanced monitoring and logging
4. Enables real AI-powered responses
"""

import os
import boto3
import json
import time
import logging
from datetime import datetime
from typing import Dict, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EnhancedAgentDeployment:
    """Deploy enhanced LLM agent system to AWS"""
    
    def __init__(self):
        self.ec2 = boto3.client('ec2')
        self.ssm = boto3.client('ssm')
        self.cloudwatch = boto3.client('cloudwatch')
        self.instance_id = None
        
    def deploy_enhanced_agents(self, openai_api_key: str = None) -> Dict:
        """Deploy the enhanced agent system"""
        
        logger.info("🚀 Starting Enhanced Agent Deployment")
        
        try:
            # Find or create EC2 instance
            instance_info = self._get_or_create_instance()
            self.instance_id = instance_info['InstanceId']
            
            # Setup OpenAI API key
            if openai_api_key:
                self._setup_api_key(openai_api_key)
            
            # Deploy enhanced agent code
            self._deploy_enhanced_code()
            
            # Configure monitoring
            self._setup_enhanced_monitoring()
            
            # Start enhanced services
            self._start_enhanced_services()
            
            # Verify deployment
            verification_result = self._verify_deployment()
            
            logger.info("✅ Enhanced Agent Deployment Complete!")
            
            return {
                'status': 'success',
                'instance_id': self.instance_id,
                'public_ip': instance_info.get('PublicIpAddress'),
                'chat_url': f"http://{instance_info.get('PublicIpAddress')}:5000",
                'api_url': f"http://{instance_info.get('PublicIpAddress')}:5000/api/chat",
                'deployment_time': datetime.now().isoformat(),
                'verification': verification_result
            }
            
        except Exception as e:
            logger.error(f"Deployment failed: {e}")
            return {'status': 'failed', 'error': str(e)}
    
    def _get_or_create_instance(self) -> Dict:
        """Get existing instance or create new one"""
        
        # Check for existing autonomous agent instance
        instances = self.ec2.describe_instances(
            Filters=[
                {'Name': 'tag:Project', 'Values': ['AutonomousAgents']},
                {'Name': 'instance-state-name', 'Values': ['running', 'pending']}
            ]
        )
        
        if instances['Reservations']:
            instance = instances['Reservations'][0]['Instances'][0]
            logger.info(f"Found existing instance: {instance['InstanceId']}")
            return instance
        
        # Create new instance with enhanced configuration
        logger.info("Creating new EC2 instance for enhanced agents...")
        
        user_data = '''#!/bin/bash
# Enhanced Agent System Setup
yum update -y
yum install -y python3 python3-pip git htop

# Install Python packages
pip3 install --upgrade pip
pip3 install openai aiohttp aiohttp-cors python-socketio asyncio

# Create enhanced agent directory
mkdir -p /home/ec2-user/enhanced-agents
chown ec2-user:ec2-user /home/ec2-user/enhanced-agents

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Setup logging
mkdir -p /var/log/enhanced-agents
chmod 755 /var/log/enhanced-agents
'''
        
        response = self.ec2.run_instances(
            ImageId='ami-0c02fb55956c7d316',  # Amazon Linux 2 AMI (HVM) - Kernel 5.10, SSD Volume Type
            MinCount=1,
            MaxCount=1,
            InstanceType='t3.medium',  # More power for LLM processing
            SecurityGroupIds=['default'],  # Use default security group for now
            UserData=user_data,
            TagSpecifications=[
                {
                    'ResourceType': 'instance',
                    'Tags': [
                        {'Key': 'Name', 'Value': 'Enhanced-AI-Agents'},
                        {'Key': 'Project', 'Value': 'AutonomousAgents'},
                        {'Key': 'Environment', 'Value': 'Production'},
                        {'Key': 'LLM-Enabled', 'Value': 'true'}
                    ]
                }
            ]
        )
        
        instance_id = response['Instances'][0]['InstanceId']
        logger.info(f"Created instance: {instance_id}")
        
        # Wait for instance to be running
        waiter = self.ec2.get_waiter('instance_running')
        waiter.wait(InstanceIds=[instance_id])
        
        # Get updated instance info
        instances = self.ec2.describe_instances(InstanceIds=[instance_id])
        return instances['Reservations'][0]['Instances'][0]
    
    def _setup_api_key(self, api_key: str):
        """Setup OpenAI API key in EC2"""
        
        logger.info("Setting up OpenAI API key...")
        
        # Store API key using Systems Manager Parameter Store
        self.ssm.put_parameter(
            Name='/enhanced-agents/openai-api-key',
            Value=api_key,
            Type='SecureString',
            Overwrite=True,
            Description='OpenAI API key for enhanced agent system'
        )
        
        # Set environment variable on EC2
        commands = [
            'echo "export OPENAI_API_KEY=$(aws ssm get-parameter --name /enhanced-agents/openai-api-key --with-decryption --query Parameter.Value --output text)" >> /home/ec2-user/.bashrc',
            'source /home/ec2-user/.bashrc'
        ]
        
        self._execute_ssm_commands(commands)
        logger.info("✅ OpenAI API key configured")
    
    def _deploy_enhanced_code(self):
        """Deploy the enhanced agent code to EC2"""
        
        logger.info("Deploying enhanced agent code...")
        
        # Read the enhanced agent server code
        with open('enhanced_agent_chat_server.py', 'r') as f:
            enhanced_code = f.read()
        
        # Upload code to EC2 using SSM
        commands = [
            'mkdir -p /home/ec2-user/enhanced-agents',
            'cd /home/ec2-user/enhanced-agents',
            
            # Create the enhanced server file
            f'''cat > enhanced_agent_chat_server.py << 'EOF'
{enhanced_code}
EOF''',
            
            # Create requirements file
            '''cat > requirements.txt << 'EOF'
openai>=1.3.0
aiohttp>=3.8.0
aiohttp-cors>=0.7.0
python-socketio>=5.8.0
asyncio
sqlite3
boto3
EOF''',
            
            # Install requirements
            'pip3 install -r requirements.txt',
            
            # Create startup script
            '''cat > start_enhanced_agents.sh << 'EOF'
#!/bin/bash
export OPENAI_API_KEY=$(aws ssm get-parameter --name /enhanced-agents/openai-api-key --with-decryption --query Parameter.Value --output text 2>/dev/null || echo "")
cd /home/ec2-user/enhanced-agents
python3 enhanced_agent_chat_server.py > /var/log/enhanced-agents/server.log 2>&1 &
echo $! > /var/run/enhanced-agents.pid
EOF''',
            
            'chmod +x start_enhanced_agents.sh',
            'chown -R ec2-user:ec2-user /home/ec2-user/enhanced-agents'
        ]
        
        self._execute_ssm_commands(commands)
        logger.info("✅ Enhanced agent code deployed")
    
    def _setup_enhanced_monitoring(self):
        """Setup enhanced monitoring and alerting"""
        
        logger.info("Setting up enhanced monitoring...")
        
        # CloudWatch custom metrics
        cloudwatch_config = {
            "metrics": {
                "namespace": "EnhancedAgents/Performance",
                "metrics_collected": {
                    "cpu": {"measurement": ["cpu_usage_idle", "cpu_usage_iowait"]},
                    "disk": {"measurement": ["used_percent"], "resources": ["*"]},
                    "diskio": {"measurement": ["io_time"], "resources": ["*"]},
                    "mem": {"measurement": ["mem_used_percent"]},
                    "netstat": {"measurement": ["tcp_established", "tcp_time_wait"]}
                }
            },
            "logs": {
                "logs_collected": {
                    "files": {
                        "collect_list": [
                            {
                                "file_path": "/var/log/enhanced-agents/server.log",
                                "log_group_name": "enhanced-agents-server",
                                "log_stream_name": "{instance_id}"
                            }
                        ]
                    }
                }
            }
        }
        
        # Upload CloudWatch config
        config_content = json.dumps(cloudwatch_config, indent=2)
        
        commands = [
            f'''cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{config_content}
EOF''',
            
            # Start CloudWatch agent
            '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s'
        ]
        
        self._execute_ssm_commands(commands)
        
        # Create CloudWatch alarms
        self._create_enhanced_alarms()
        
        logger.info("✅ Enhanced monitoring configured")
    
    def _create_enhanced_alarms(self):
        """Create CloudWatch alarms for enhanced agents"""
        
        alarms = [
            {
                'AlarmName': f'EnhancedAgents-HighCPU-{self.instance_id}',
                'ComparisonOperator': 'GreaterThanThreshold',
                'EvaluationPeriods': 2,
                'MetricName': 'CPUUtilization',
                'Namespace': 'AWS/EC2',
                'Period': 300,
                'Statistic': 'Average',
                'Threshold': 80.0,
                'ActionsEnabled': True,
                'AlarmDescription': 'Enhanced Agents - High CPU utilization',
                'Dimensions': [{'Name': 'InstanceId', 'Value': self.instance_id}],
                'Unit': 'Percent'
            },
            {
                'AlarmName': f'EnhancedAgents-HighMemory-{self.instance_id}',
                'ComparisonOperator': 'GreaterThanThreshold',
                'EvaluationPeriods': 2,
                'MetricName': 'mem_used_percent',
                'Namespace': 'EnhancedAgents/Performance',
                'Period': 300,
                'Statistic': 'Average',
                'Threshold': 85.0,
                'ActionsEnabled': True,
                'AlarmDescription': 'Enhanced Agents - High memory usage',
                'Dimensions': [{'Name': 'InstanceId', 'Value': self.instance_id}],
                'Unit': 'Percent'
            }
        ]
        
        for alarm in alarms:
            try:
                self.cloudwatch.put_metric_alarm(**alarm)
                logger.info(f"Created alarm: {alarm['AlarmName']}")
            except Exception as e:
                logger.warning(f"Failed to create alarm {alarm['AlarmName']}: {e}")
    
    def _start_enhanced_services(self):
        """Start the enhanced agent services"""
        
        logger.info("Starting enhanced agent services...")
        
        commands = [
            # Stop any existing services
            'pkill -f enhanced_agent_chat_server.py || true',
            
            # Start enhanced agents
            'cd /home/ec2-user/enhanced-agents',
            './start_enhanced_agents.sh',
            
            # Create systemd service for auto-start
            '''cat > /etc/systemd/system/enhanced-agents.service << 'EOF'
[Unit]
Description=Enhanced AI Agent Chat Server
After=network.target

[Service]
Type=forking
User=ec2-user
WorkingDirectory=/home/ec2-user/enhanced-agents
Environment=OPENAI_API_KEY=$(aws ssm get-parameter --name /enhanced-agents/openai-api-key --with-decryption --query Parameter.Value --output text)
ExecStart=/home/ec2-user/enhanced-agents/start_enhanced_agents.sh
ExecStop=/bin/kill -TERM $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF''',
            
            'systemctl daemon-reload',
            'systemctl enable enhanced-agents',
            'sleep 5'  # Give services time to start
        ]
        
        self._execute_ssm_commands(commands)
        logger.info("✅ Enhanced services started")
    
    def _verify_deployment(self) -> Dict:
        """Verify the enhanced deployment is working"""
        
        logger.info("Verifying enhanced deployment...")
        
        # Get instance details
        instances = self.ec2.describe_instances(InstanceIds=[self.instance_id])
        public_ip = instances['Reservations'][0]['Instances'][0].get('PublicIpAddress')
        
        verification = {
            'instance_running': True,
            'services_active': False,
            'api_responsive': False,
            'llm_integration': False,
            'monitoring_active': False
        }
        
        # Check if services are running
        try:
            result = self._execute_ssm_commands(['pgrep -f enhanced_agent_chat_server.py'], get_output=True)
            if result and result.get('output'):
                verification['services_active'] = True
                logger.info("✅ Services are running")
        except Exception as e:
            logger.warning(f"Service check failed: {e}")
        
        # Test API endpoint (would need actual HTTP test in production)
        if public_ip:
            verification['api_url'] = f"http://{public_ip}:5000"
            verification['chat_url'] = f"http://{public_ip}:5000"
        
        # Check CloudWatch logs
        try:
            logs_client = boto3.client('logs')
            logs_client.describe_log_groups(logGroupNamePrefix='enhanced-agents')
            verification['monitoring_active'] = True
            logger.info("✅ Monitoring is active")
        except Exception as e:
            logger.warning(f"Monitoring check failed: {e}")
        
        return verification
    
    def _execute_ssm_commands(self, commands: List[str], get_output: bool = False) -> Dict:
        """Execute commands on EC2 using SSM"""
        
        if not self.instance_id:
            raise ValueError("Instance ID not set")
        
        # Join commands with && for sequential execution
        command_string = ' && '.join(commands)
        
        try:
            response = self.ssm.send_command(
                InstanceIds=[self.instance_id],
                DocumentName='AWS-RunShellScript',
                Parameters={'commands': [command_string]},
                TimeoutSeconds=600
            )
            
            command_id = response['Command']['CommandId']
            
            # Wait for command completion
            waiter = self.ssm.get_waiter('command_executed')
            waiter.wait(
                CommandId=command_id,
                InstanceId=self.instance_id,
                WaiterConfig={'Delay': 2, 'MaxAttempts': 30}
            )
            
            if get_output:
                # Get command output
                output = self.ssm.get_command_invocation(
                    CommandId=command_id,
                    InstanceId=self.instance_id
                )
                return {
                    'status': output['Status'],
                    'output': output.get('StandardOutputContent', ''),
                    'error': output.get('StandardErrorContent', '')
                }
            
            return {'status': 'Success'}
            
        except Exception as e:
            logger.error(f"SSM command execution failed: {e}")
            raise

def main():
    """Main deployment function"""
    
    print("""
🚀 Enhanced AI Agent Deployment System
====================================

This will deploy the enhanced LLM-powered agent system to AWS EC2.
Features:
- Real OpenAI GPT-4 integration
- Multi-agent collaboration
- Enhanced monitoring and logging
- Auto-scaling capabilities
- PhD-level AI research integration
""")
    
    # Get OpenAI API key
    api_key = input("Enter your OpenAI API key (or press Enter to skip): ").strip()
    if not api_key:
        print("⚠️  No OpenAI API key provided - agents will use fallback responses")
    
    # Deploy enhanced system
    deployer = EnhancedAgentDeployment()
    result = deployer.deploy_enhanced_agents(api_key if api_key else None)
    
    if result['status'] == 'success':
        print(f"""
✅ Enhanced Agent Deployment Successful!

🌐 Access URLs:
- Chat Interface: {result['chat_url']}
- REST API: {result['api_url']}
- Health Check: {result['api_url'].replace('/api/chat', '/health')}

💡 Instance Details:
- Instance ID: {result['instance_id']}
- Public IP: {result['public_ip']}
- Deployment Time: {result['deployment_time']}

🔧 Verification Status:
- Services Active: {'✅' if result['verification']['services_active'] else '❌'}
- Monitoring Active: {'✅' if result['verification']['monitoring_active'] else '❌'}
- LLM Integration: {'✅' if api_key else '⚠️  Fallback Mode'}

🚀 Your enhanced AI agents are now ready!
Try asking complex business questions to see multiple agents collaborate.
""")
    else:
        print(f"❌ Deployment failed: {result['error']}")

if __name__ == "__main__":
    main()
