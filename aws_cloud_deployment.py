#!/usr/bin/env python3
"""
24/7 Cloud Deployment Manager for Super-Intelligent Autonomous Development Team
Handles AWS deployment, scaling, and monitoring
"""

import boto3
import json
import subprocess
import yaml
import time
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def start_deployment_agent():
    """Start the deployment agent"""
    agent = CloudDeploymentManager()
    if agent.check_aws_prerequisites():
        logger.info("Deployment Agent started successfully")
        return agent
    else:
        logger.error("Failed to start deployment agent")
        return None

class CloudDeploymentManager:
    """Manages 24/7 cloud deployment on AWS"""
    
    def __init__(self):
        self.aws_region = "us-east-1"
        self.instance_type = "t2.micro"  # Free tier eligible
        self.cluster_name = "autonomous-dev-team"
        self.service_name = "super-intelligent-agents"
        
        # Cost-effective configuration
        self.config = {
            'max_instances': 1,  # Stay within free tier
            'container_memory': 512,  # MB
            'container_cpu': 256,  # CPU units (1024 = 1 vCPU)
            'auto_scaling': False,  # Prevent unexpected costs
            'spot_instances': True  # Use spot instances for cost savings
        }
        
        # Initialize AWS clients
        self.ec2 = boto3.client('ec2', region_name=self.aws_region)
        self.cloudwatch = boto3.client('cloudwatch', region_name=self.aws_region)
        
        # Use S3 for storage (free tier includes 5GB)
        self.s3 = boto3.client('s3', region_name=self.aws_region)
        self.bucket_name = f"{self.service_name}-storage"
        
        self.project_root = Path.cwd()
        self.ecs = boto3.client('ecs', region_name=self.aws_region)
        
        # Set up logging to monitor costs
        self.setup_cost_monitoring()
        
    def setup_cost_monitoring(self):
        """Set up CloudWatch alarms for cost monitoring"""
        try:
            # Create a cost alarm
            self.cloudwatch.put_metric_alarm(
                AlarmName=f"{self.service_name}-cost-alarm",
                AlarmDescription="Monitor AWS costs",
                ActionsEnabled=True,
                MetricName="EstimatedCharges",
                Namespace="AWS/Billing",
                Statistic="Maximum",
                Dimensions=[
                    {
                        'Name': 'Currency',
                        'Value': 'USD'
                    }
                ],
                Period=86400,  # 24 hours
                EvaluationPeriods=1,
                Threshold=float(os.getenv('BUDGET_LIMIT', 50)),
                ComparisonOperator='GreaterThanThreshold',
                TreatMissingData='missing'
            )
            logger.info("Cost monitoring configured successfully")
        except Exception as e:
            logger.warning(f"Failed to set up cost monitoring: {e}")
            # Don't fail initialization if cost monitoring setup fails
        
    def check_aws_prerequisites(self) -> bool:
        """Check if AWS prerequisites are met"""
        try:
            # Check AWS credentials
            sts = boto3.client('sts')
            sts.get_caller_identity()
            logger.info("✅ AWS credentials verified")
            
            # Check if ECS cluster exists
            clusters = self.ecs.describe_clusters(clusters=[self.cluster_name])
            if not clusters['clusters'] or clusters['clusters'][0]['status'] != 'ACTIVE':
                logger.info("🔧 Creating ECS cluster...")
                self.create_ecs_cluster()
            else:
                logger.info("✅ ECS cluster exists and is active")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ AWS prerequisites check failed: {e}")
            return False
    
    def create_ecs_cluster(self):
        """Create ECS cluster for autonomous agents"""
        try:
            # Create cluster
            self.ecs.create_cluster(
                clusterName=self.cluster_name,
                capacityProviders=['FARGATE', 'FARGATE_SPOT'],
                defaultCapacityProviderStrategy=[
                    {
                        'capacityProvider': 'FARGATE',
                        'weight': 1,
                        'base': 2
                    },
                    {
                        'capacityProvider': 'FARGATE_SPOT',
                        'weight': 4
                    }
                ],
                settings=[
                    {
                        'name': 'containerInsights',
                        'value': 'enabled'
                    }
                ],
                tags=[
                    {'key': 'Project', 'value': 'AutonomousDevTeam'},
                    {'key': 'Environment', 'value': 'Production'},
                    {'key': 'AutoShutdown', 'value': 'false'}
                ]
            )
            
            logger.info("✅ ECS cluster created successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to create ECS cluster: {e}")
            raise
    
    def build_and_push_docker_image(self) -> str:
        """Build and push Docker image to ECR"""
        try:
            # Create ECR repository if it doesn't exist
            repository_name = "autonomous-dev-team"
            try:
                self.ecr.create_repository(
                    repositoryName=repository_name,
                    imageScanningConfiguration={'scanOnPush': True},
                    encryptionConfiguration={'encryptionType': 'AES256'}
                )
                logger.info("✅ ECR repository created")
            except self.ecr.exceptions.RepositoryAlreadyExistsException:
                logger.info("✅ ECR repository already exists")
            
            # Get ECR login token
            token_response = self.ecr.get_authorization_token()
            token = token_response['authorizationData'][0]['authorizationToken']
            endpoint = token_response['authorizationData'][0]['proxyEndpoint']
            
            # Docker login to ECR
            login_command = f"aws ecr get-login-password --region {self.aws_region} | docker login --username AWS --password-stdin {endpoint}"
            subprocess.run(login_command, shell=True, check=True)
            logger.info("✅ Logged in to ECR")
            
            # Build Docker image
            image_tag = f"autonomous-dev-team:{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            build_command = f"docker build -f Dockerfile.autonomous -t {image_tag} ."
            subprocess.run(build_command, shell=True, check=True, cwd=self.project_root)
            logger.info(f"✅ Docker image built: {image_tag}")
            
            # Tag and push to ECR
            account_id = boto3.client('sts').get_caller_identity()['Account']
            ecr_uri = f"{account_id}.dkr.ecr.{self.aws_region}.amazonaws.com/{repository_name}:latest"
            
            tag_command = f"docker tag {image_tag} {ecr_uri}"
            push_command = f"docker push {ecr_uri}"
            
            subprocess.run(tag_command, shell=True, check=True)
            subprocess.run(push_command, shell=True, check=True)
            
            logger.info(f"✅ Docker image pushed to ECR: {ecr_uri}")
            return ecr_uri
            
        except Exception as e:
            logger.error(f"❌ Failed to build and push Docker image: {e}")
            raise
    
    def create_task_definition(self, image_uri: str) -> str:
        """Create ECS task definition"""
        try:
            task_definition = {
                "family": "autonomous-dev-team",
                "networkMode": "awsvpc",
                "requiresCompatibilities": ["FARGATE"],
                "cpu": "2048",
                "memory": "4096",
                "executionRoleArn": self.get_or_create_execution_role(),
                "taskRoleArn": self.get_or_create_task_role(),
                "containerDefinitions": [
                    {
                        "name": "autonomous-agents",
                        "image": image_uri,
                        "essential": True,
                        "portMappings": [
                            {"containerPort": 8000, "protocol": "tcp"},
                            {"containerPort": 8001, "protocol": "tcp"},
                            {"containerPort": 8002, "protocol": "tcp"}
                        ],
                        "environment": [
                            {"name": "ENV", "value": "production"},
                            {"name": "AWS_REGION", "value": self.aws_region},
                            {"name": "SCALING_TARGET", "value": "100"},
                            {"name": "CONTINUOUS_LEARNING", "value": "true"}
                        ],
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": f"/ecs/{self.service_name}",
                                "awslogs-region": self.aws_region,
                                "awslogs-stream-prefix": "ecs"
                            }
                        },
                        "healthCheck": {
                            "command": [
                                "CMD-SHELL",
                                "python /app/health_check.py || exit 1"
                            ],
                            "interval": 30,
                            "timeout": 10,
                            "retries": 3,
                            "startPeriod": 60
                        },
                        "mountPoints": [],
                        "volumesFrom": []
                    }
                ],
                "volumes": []
            }
            
            # Create CloudWatch log group
            try:
                self.logs.create_log_group(
                    logGroupName=f"/ecs/{self.service_name}",
                    retentionInDays=30
                )
            except self.logs.exceptions.ResourceAlreadyExistsException:
                pass
            
            # Register task definition
            response = self.ecs.register_task_definition(**task_definition)
            task_def_arn = response['taskDefinition']['taskDefinitionArn']
            
            logger.info(f"✅ Task definition created: {task_def_arn}")
            return task_def_arn
            
        except Exception as e:
            logger.error(f"❌ Failed to create task definition: {e}")
            raise
    
    def get_or_create_execution_role(self) -> str:
        """Get or create ECS execution role"""
        role_name = "autonomous-dev-team-execution-role"
        
        try:
            iam = boto3.client('iam')
            
            # Try to get existing role
            try:
                role = iam.get_role(RoleName=role_name)
                return role['Role']['Arn']
            except iam.exceptions.NoSuchEntityException:
                pass
            
            # Create role if it doesn't exist
            trust_policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                        "Action": "sts:AssumeRole"
                    }
                ]
            }
            
            iam.create_role(
                RoleName=role_name,
                AssumeRolePolicyDocument=json.dumps(trust_policy)
            )
            
            # Attach managed policy
            iam.attach_role_policy(
                RoleName=role_name,
                PolicyArn="arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
            )
            
            role = iam.get_role(RoleName=role_name)
            return role['Role']['Arn']
            
        except Exception as e:
            logger.error(f"❌ Failed to create execution role: {e}")
            raise
    
    def get_or_create_task_role(self) -> str:
        """Get or create ECS task role with necessary permissions"""
        role_name = "autonomous-dev-team-task-role"
        
        try:
            iam = boto3.client('iam')
            
            try:
                role = iam.get_role(RoleName=role_name)
                return role['Role']['Arn']
            except iam.exceptions.NoSuchEntityException:
                pass
            
            # Create role
            trust_policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                        "Action": "sts:AssumeRole"
                    }
                ]
            }
            
            iam.create_role(
                RoleName=role_name,
                AssumeRolePolicyDocument=json.dumps(trust_policy)
            )
            
            # Create custom policy for autonomous agents
            policy_document = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "logs:CreateLogGroup",
                            "logs:CreateLogStream",
                            "logs:PutLogEvents",
                            "cloudwatch:PutMetricData",
                            "cloudwatch:GetMetricStatistics",
                            "cloudwatch:ListMetrics"
                        ],
                        "Resource": "*"
                    }
                ]
            }
            
            policy_name = "autonomous-dev-team-policy"
            iam.create_policy(
                PolicyName=policy_name,
                PolicyDocument=json.dumps(policy_document)
            )
            
            # Attach policy to role
            account_id = boto3.client('sts').get_caller_identity()['Account']
            policy_arn = f"arn:aws:iam::{account_id}:policy/{policy_name}"
            iam.attach_role_policy(RoleName=role_name, PolicyArn=policy_arn)
            
            role = iam.get_role(RoleName=role_name)
            return role['Role']['Arn']
            
        except Exception as e:
            logger.error(f"❌ Failed to create task role: {e}")
            raise
    
    def get_or_create_vpc_resources(self) -> Dict[str, Any]:
        """Get or create VPC resources for deployment"""
        try:
            # Try to get default VPC
            vpcs = self.ec2.describe_vpcs(Filters=[{'Name': 'isDefault', 'Values': ['true']}])
            
            if not vpcs['Vpcs']:
                logger.error("❌ No default VPC found. Please create a VPC first.")
                raise Exception("No default VPC available")
            
            vpc_id = vpcs['Vpcs'][0]['VpcId']
            
            # Get subnets
            subnets = self.ec2.describe_subnets(
                Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}]
            )
            
            if len(subnets['Subnets']) < 2:
                logger.error("❌ Need at least 2 subnets for high availability")
                raise Exception("Insufficient subnets")
            
            subnet_ids = [subnet['SubnetId'] for subnet in subnets['Subnets'][:2]]
            
            # Create security group
            security_group_id = self.get_or_create_security_group(vpc_id)
            
            return {
                'vpc_id': vpc_id,
                'subnet_ids': subnet_ids,
                'security_group_id': security_group_id
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get VPC resources: {e}")
            raise
    
    def get_or_create_security_group(self, vpc_id: str) -> str:
        """Get or create security group"""
        group_name = "autonomous-dev-team-sg"
        
        try:
            # Try to find existing security group
            sgs = self.ec2.describe_security_groups(
                Filters=[
                    {'Name': 'group-name', 'Values': [group_name]},
                    {'Name': 'vpc-id', 'Values': [vpc_id]}
                ]
            )
            
            if sgs['SecurityGroups']:
                return sgs['SecurityGroups'][0]['GroupId']
            
            # Create security group
            response = self.ec2.create_security_group(
                GroupName=group_name,
                Description="Security group for autonomous development team",
                VpcId=vpc_id
            )
            
            sg_id = response['GroupId']
            
            # Add rules
            self.ec2.authorize_security_group_ingress(
                GroupId=sg_id,
                IpPermissions=[
                    {
                        'IpProtocol': 'tcp',
                        'FromPort': 8000,
                        'ToPort': 8002,
                        'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
                    },
                    {
                        'IpProtocol': 'tcp',
                        'FromPort': 80,
                        'ToPort': 80,
                        'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
                    },
                    {
                        'IpProtocol': 'tcp',
                        'FromPort': 443,
                        'ToPort': 443,
                        'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
                    }
                ]
            )
            
            logger.info(f"✅ Security group created: {sg_id}")
            return sg_id
            
        except Exception as e:
            logger.error(f"❌ Failed to create security group: {e}")
            raise
    
    def create_ecs_service(self, task_def_arn: str, vpc_resources: Dict[str, Any]) -> str:
        """Create ECS service for 24/7 operation"""
        try:
            service_config = {
                "serviceName": self.service_name,
                "cluster": self.cluster_name,
                "taskDefinition": task_def_arn,
                "desiredCount": 3,
                "launchType": "FARGATE",
                "platformVersion": "LATEST",
                "networkConfiguration": {
                    "awsvpcConfiguration": {
                        "subnets": vpc_resources['subnet_ids'],
                        "securityGroups": [vpc_resources['security_group_id']],
                        "assignPublicIp": "ENABLED"
                    }
                },
                "deploymentConfiguration": {
                    "maximumPercent": 200,
                    "minimumHealthyPercent": 100,
                    "deploymentCircuitBreaker": {
                        "enable": True,
                        "rollback": True
                    }
                },
                "enableExecuteCommand": True,
                "enableLogging": True,
                "tags": [
                    {'key': 'Project', 'value': 'AutonomousDevTeam'},
                    {'key': 'Environment', 'value': 'Production'}
                ]
            }
            
            response = self.ecs.create_service(**service_config)
            service_arn = response['service']['serviceArn']
            
            logger.info(f"✅ ECS service created: {service_arn}")
            
            # Wait for service to stabilize
            logger.info("⏳ Waiting for service to stabilize...")
            waiter = self.ecs.get_waiter('services_stable')
            waiter.wait(
                cluster=self.cluster_name,
                services=[self.service_name],
                WaiterConfig={'maxAttempts': 20, 'delay': 30}
            )
            
            logger.info("✅ Service is stable and running")
            return service_arn
            
        except Exception as e:
            logger.error(f"❌ Failed to create ECS service: {e}")
            raise
    
    def setup_auto_scaling(self) -> None:
        """Setup auto-scaling for the service"""
        try:
            autoscaling = boto3.client('application-autoscaling', region_name=self.aws_region)
            
            # Register scalable target
            resource_id = f"service/{self.cluster_name}/{self.service_name}"
            
            autoscaling.register_scalable_target(
                ServiceNamespace='ecs',
                ResourceId=resource_id,
                ScalableDimension='ecs:service:DesiredCount',
                MinCapacity=2,
                MaxCapacity=10
            )
            
            # Create scaling policies
            scale_up_policy = autoscaling.put_scaling_policy(
                PolicyName='autonomous-dev-team-scale-up',
                ServiceNamespace='ecs',
                ResourceId=resource_id,
                ScalableDimension='ecs:service:DesiredCount',
                PolicyType='TargetTrackingScaling',
                TargetTrackingScalingPolicyConfiguration={
                    'TargetValue': 70.0,
                    'PredefinedMetricSpecification': {
                        'PredefinedMetricType': 'ECSServiceAverageCPUUtilization'
                    },
                    'ScaleOutCooldown': 300,
                    'ScaleInCooldown': 300
                }
            )
            
            logger.info("✅ Auto-scaling configured")
            
        except Exception as e:
            logger.error(f"❌ Failed to setup auto-scaling: {e}")
            raise
    
    def setup_monitoring_and_alerts(self) -> None:
        """Setup CloudWatch monitoring and alerts"""
        try:
            # Create CloudWatch dashboard
            dashboard_body = {
                "widgets": [
                    {
                        "type": "metric",
                        "properties": {
                            "metrics": [
                                ["AWS/ECS", "CPUUtilization", "ServiceName", self.service_name, "ClusterName", self.cluster_name],
                                [".", "MemoryUtilization", ".", ".", ".", "."],
                            ],
                            "period": 300,
                            "stat": "Average",
                            "region": self.aws_region,
                            "title": "ECS Service Metrics"
                        }
                    }
                ]
            }
            
            self.cloudwatch.put_dashboard(
                DashboardName="autonomous-dev-team",
                DashboardBody=json.dumps(dashboard_body)
            )
            
            # Create alarms
            self.cloudwatch.put_metric_alarm(
                AlarmName='autonomous-dev-team-high-cpu',
                ComparisonOperator='GreaterThanThreshold',
                EvaluationPeriods=2,
                MetricName='CPUUtilization',
                Namespace='AWS/ECS',
                Period=300,
                Statistic='Average',
                Threshold=80.0,
                ActionsEnabled=True,
                AlarmDescription='High CPU usage detected',
                Dimensions=[
                    {'Name': 'ServiceName', 'Value': self.service_name},
                    {'Name': 'ClusterName', 'Value': self.cluster_name}
                ]
            )
            
            logger.info("✅ Monitoring and alerts configured")
            
        except Exception as e:
            logger.error(f"❌ Failed to setup monitoring: {e}")
            raise
    
    def get_service_endpoints(self) -> List[Dict[str, str]]:
        """Get public endpoints for the deployed service"""
        try:
            # Get service details
            services = self.ecs.describe_services(
                cluster=self.cluster_name,
                services=[self.service_name]
            )
            
            if not services['services']:
                return []
            
            service = services['services'][0]
            
            # Get tasks
            tasks = self.ecs.list_tasks(
                cluster=self.cluster_name,
                serviceName=self.service_name,
                desiredStatus='RUNNING'
            )
            
            endpoints = []
            if tasks['taskArns']:
                task_details = self.ecs.describe_tasks(
                    cluster=self.cluster_name,
                    tasks=tasks['taskArns']
                )
                
                for task in task_details['tasks']:
                    for attachment in task.get('attachments', []):
                        if attachment['type'] == 'ElasticNetworkInterface':
                            for detail in attachment['details']:
                                if detail['name'] == 'networkInterfaceId':
                                    eni_id = detail['value']
                                    
                                    # Get public IP
                                    enis = self.ec2.describe_network_interfaces(
                                        NetworkInterfaceIds=[eni_id]
                                    )
                                    
                                    if enis['NetworkInterfaces']:
                                        eni = enis['NetworkInterfaces'][0]
                                        if 'Association' in eni:
                                            public_ip = eni['Association']['PublicIp']
                                            endpoints.append({
                                                'ip': public_ip,
                                                'main_dashboard': f"http://{public_ip}:8000",
                                                'gui_dashboard': f"http://{public_ip}:8001",
                                                'api_endpoint': f"http://{public_ip}:8002"
                                            })
            
            return endpoints
            
        except Exception as e:
            logger.error(f"❌ Failed to get service endpoints: {e}")
            return []
    
    def deploy_to_aws(self) -> Dict[str, Any]:
        """Main deployment function"""
        try:
            logger.info("🚀 Starting AWS deployment for 24/7 autonomous operation...")
            
            # Check prerequisites
            if not self.check_aws_prerequisites():
                raise Exception("AWS prerequisites not met")
            
            # Build and push Docker image
            logger.info("🔨 Building and pushing Docker image...")
            image_uri = self.build_and_push_docker_image()
            
            # Create task definition
            logger.info("📋 Creating task definition...")
            task_def_arn = self.create_task_definition(image_uri)
            
            # Get VPC resources
            logger.info("🌐 Setting up VPC resources...")
            vpc_resources = self.get_or_create_vpc_resources()
            
            # Create ECS service
            logger.info("⚙️ Creating ECS service...")
            service_arn = self.create_ecs_service(task_def_arn, vpc_resources)
            
            # Setup auto-scaling
            logger.info("📈 Configuring auto-scaling...")
            self.setup_auto_scaling()
            
            # Setup monitoring
            logger.info("📊 Setting up monitoring...")
            self.setup_monitoring_and_alerts()
            
            # Get endpoints
            logger.info("🔗 Getting service endpoints...")
            time.sleep(60)  # Wait for tasks to get public IPs
            endpoints = self.get_service_endpoints()
            
            deployment_info = {
                'status': 'success',
                'cluster_name': self.cluster_name,
                'service_name': self.service_name,
                'service_arn': service_arn,
                'task_definition': task_def_arn,
                'image_uri': image_uri,
                'endpoints': endpoints,
                'deployment_time': datetime.now().isoformat(),
                'region': self.aws_region
            }
            
            # Save deployment info
            with open('aws_deployment_info.json', 'w') as f:
                json.dump(deployment_info, f, indent=2)
            
            logger.info("🎉 AWS deployment completed successfully!")
            logger.info("✅ 24/7 autonomous operation is now running in the cloud")
            
            if endpoints:
                logger.info("🌐 Service endpoints:")
                for endpoint in endpoints:
                    logger.info(f"   Main Dashboard: {endpoint['main_dashboard']}")
                    logger.info(f"   GUI Dashboard: {endpoint['gui_dashboard']}")
                    logger.info(f"   API Endpoint: {endpoint['api_endpoint']}")
            
            return deployment_info
            
        except Exception as e:
            logger.error(f"❌ AWS deployment failed: {e}")
            raise
    
    def check_deployment_status(self) -> Dict[str, Any]:
        """Check current deployment status"""
        try:
            # Get service status
            services = self.ecs.describe_services(
                cluster=self.cluster_name,
                services=[self.service_name]
            )
            
            if not services['services']:
                return {'status': 'not_deployed'}
            
            service = services['services'][0]
            
            # Get tasks
            tasks = self.ecs.list_tasks(
                cluster=self.cluster_name,
                serviceName=self.service_name
            )
            
            running_tasks = len([t for t in tasks['taskArns']])
            
            status_info = {
                'status': 'running' if service['status'] == 'ACTIVE' else service['status'],
                'desired_count': service['desiredCount'],
                'running_count': service['runningCount'],
                'pending_count': service['pendingCount'],
                'running_tasks': running_tasks,
                'service_arn': service['serviceArn'],
                'last_updated': service['updatedAt'].isoformat() if 'updatedAt' in service else None
            }
            
            return status_info
            
        except Exception as e:
            logger.error(f"❌ Failed to check deployment status: {e}")
            return {'status': 'error', 'error': str(e)}
    
    def stop_deployment(self) -> bool:
        """Stop the AWS deployment"""
        try:
            logger.info("🛑 Stopping AWS deployment...")
            
            # Update service to 0 desired count
            self.ecs.update_service(
                cluster=self.cluster_name,
                service=self.service_name,
                desiredCount=0
            )
            
            # Wait for tasks to stop
            waiter = self.ecs.get_waiter('services_stable')
            waiter.wait(
                cluster=self.cluster_name,
                services=[self.service_name],
                WaiterConfig={'maxAttempts': 10, 'delay': 30}
            )
            
            logger.info("✅ Deployment stopped")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to stop deployment: {e}")
            return False

def main():
    """Main function for deployment"""
    import argparse
    
    parser = argparse.ArgumentParser(description="24/7 Cloud Deployment Manager")
    parser.add_argument('action', choices=['deploy', 'status', 'stop', 'endpoints'], 
                       help="Action to perform")
    
    args = parser.parse_args()
    
    manager = CloudDeploymentManager()
    
    if args.action == 'deploy':
        result = manager.deploy_to_aws()
        print(json.dumps(result, indent=2))
    elif args.action == 'status':
        status = manager.check_deployment_status()
        print(json.dumps(status, indent=2))
    elif args.action == 'stop':
        success = manager.stop_deployment()
        print(f"Deployment stopped: {success}")
    elif args.action == 'endpoints':
        endpoints = manager.get_service_endpoints()
        print(json.dumps(endpoints, indent=2))

if __name__ == "__main__":
    main()
