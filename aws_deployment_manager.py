#!/usr/bin/env python3
"""
☁️ AWS DEPLOYMENT MANAGER
=========================
Comprehensive AWS infrastructure deployment and management
"""

import json
import subprocess
import time
import os
from datetime import datetime
from typing import Dict, List, Any

class AWSDeploymentManager:
    """Manages AWS deployment and infrastructure"""
    
    def __init__(self):
        self.region = "us-east-1"
        self.stack_name = "supermega-ai-platform"
        self.instance_type = "t3.xlarge"
        
        self.services = [
            {"name": "browser-automation", "port": 8504, "path": "simple_browser_automation.py"},
            {"name": "media-studio", "port": 8505, "path": "ai_media_studio.py"},
            {"name": "voice-studio", "port": 8506, "path": "ai_voice_studio.py"},
            {"name": "cad-studio", "port": 8508, "path": "ai_cad_studio.py"},
            {"name": "text-studio", "port": 8509, "path": "ai_text_studio.py"},
            {"name": "video-studio", "port": 8510, "path": "ai_video_studio_pro.py"},
            {"name": "autonomous-agents", "port": 8511, "path": "autonomous_agents_v3.py"},
            {"name": "services-launcher", "port": 8501, "path": "supermega_services_launcher.py"}
        ]
    
    def create_cloudformation_template(self) -> Dict[str, Any]:
        """Create comprehensive CloudFormation template"""
        
        template = {
            "AWSTemplateFormatVersion": "2010-09-09",
            "Description": "SuperMega AI Platform - Complete Infrastructure",
            "Parameters": {
                "InstanceType": {
                    "Type": "String",
                    "Default": self.instance_type,
                    "AllowedValues": ["t3.medium", "t3.large", "t3.xlarge", "t3.2xlarge", "c5.large", "c5.xlarge"],
                    "Description": "EC2 instance type"
                },
                "KeyName": {
                    "Type": "AWS::EC2::KeyPair::KeyName",
                    "Description": "EC2 Key Pair for SSH access"
                }
            },
            "Resources": {
                # VPC and Networking
                "SuperMegaVPC": {
                    "Type": "AWS::EC2::VPC",
                    "Properties": {
                        "CidrBlock": "10.0.0.0/16",
                        "EnableDnsHostnames": True,
                        "EnableDnsSupport": True,
                        "Tags": [{"Key": "Name", "Value": "SuperMega-VPC"}]
                    }
                },
                "PublicSubnet": {
                    "Type": "AWS::EC2::Subnet",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "CidrBlock": "10.0.1.0/24",
                        "AvailabilityZone": {"Fn::Select": [0, {"Fn::GetAZs": ""}]},
                        "MapPublicIpOnLaunch": True,
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Public-Subnet"}]
                    }
                },
                "InternetGateway": {
                    "Type": "AWS::EC2::InternetGateway",
                    "Properties": {
                        "Tags": [{"Key": "Name", "Value": "SuperMega-IGW"}]
                    }
                },
                "AttachGateway": {
                    "Type": "AWS::EC2::VPCGatewayAttachment",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "InternetGatewayId": {"Ref": "InternetGateway"}
                    }
                },
                "PublicRouteTable": {
                    "Type": "AWS::EC2::RouteTable",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Public-RT"}]
                    }
                },
                "PublicRoute": {
                    "Type": "AWS::EC2::Route",
                    "DependsOn": "AttachGateway",
                    "Properties": {
                        "RouteTableId": {"Ref": "PublicRouteTable"},
                        "DestinationCidrBlock": "0.0.0.0/0",
                        "GatewayId": {"Ref": "InternetGateway"}
                    }
                },
                "SubnetRouteTableAssociation": {
                    "Type": "AWS::EC2::SubnetRouteTableAssociation",
                    "Properties": {
                        "SubnetId": {"Ref": "PublicSubnet"},
                        "RouteTableId": {"Ref": "PublicRouteTable"}
                    }
                },
                
                # Security Group
                "SuperMegaSecurityGroup": {
                    "Type": "AWS::EC2::SecurityGroup",
                    "Properties": {
                        "GroupDescription": "Security group for SuperMega AI Platform",
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "SecurityGroupIngress": [
                            {
                                "IpProtocol": "tcp",
                                "FromPort": 22,
                                "ToPort": 22,
                                "CidrIp": "0.0.0.0/0"
                            },
                            {
                                "IpProtocol": "tcp", 
                                "FromPort": 80,
                                "ToPort": 80,
                                "CidrIp": "0.0.0.0/0"
                            },
                            {
                                "IpProtocol": "tcp",
                                "FromPort": 443,
                                "ToPort": 443, 
                                "CidrIp": "0.0.0.0/0"
                            }
                        ] + [
                            {
                                "IpProtocol": "tcp",
                                "FromPort": service["port"],
                                "ToPort": service["port"],
                                "CidrIp": "0.0.0.0/0"
                            } for service in self.services
                        ],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-SG"}]
                    }
                },
                
                # IAM Role
                "SuperMegaRole": {
                    "Type": "AWS::IAM::Role",
                    "Properties": {
                        "AssumeRolePolicyDocument": {
                            "Version": "2012-10-17",
                            "Statement": [{
                                "Effect": "Allow",
                                "Principal": {"Service": "ec2.amazonaws.com"},
                                "Action": "sts:AssumeRole"
                            }]
                        },
                        "ManagedPolicyArns": [
                            "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
                            "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
                        ]
                    }
                },
                "SuperMegaInstanceProfile": {
                    "Type": "AWS::IAM::InstanceProfile",
                    "Properties": {
                        "Roles": [{"Ref": "SuperMegaRole"}]
                    }
                },
                
                # Application Load Balancer
                "SuperMegaLoadBalancer": {
                    "Type": "AWS::ElasticLoadBalancingV2::LoadBalancer",
                    "Properties": {
                        "Name": "SuperMega-ALB",
                        "Scheme": "internet-facing",
                        "Type": "application",
                        "Subnets": [{"Ref": "PublicSubnet"}],
                        "SecurityGroups": [{"Ref": "SuperMegaSecurityGroup"}]
                    }
                },
                "SuperMegaTargetGroup": {
                    "Type": "AWS::ElasticLoadBalancingV2::TargetGroup",
                    "Properties": {
                        "Name": "SuperMega-TG",
                        "Port": 8501,
                        "Protocol": "HTTP",
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "HealthCheckPath": "/",
                        "HealthCheckProtocol": "HTTP",
                        "HealthCheckIntervalSeconds": 30,
                        "HealthCheckTimeoutSeconds": 5,
                        "HealthyThresholdCount": 2,
                        "UnhealthyThresholdCount": 3
                    }
                },
                "SuperMegaListener": {
                    "Type": "AWS::ElasticLoadBalancingV2::Listener",
                    "Properties": {
                        "DefaultActions": [{
                            "Type": "forward",
                            "TargetGroupArn": {"Ref": "SuperMegaTargetGroup"}
                        }],
                        "LoadBalancerArn": {"Ref": "SuperMegaLoadBalancer"},
                        "Port": 80,
                        "Protocol": "HTTP"
                    }
                },
                
                # Launch Template
                "SuperMegaLaunchTemplate": {
                    "Type": "AWS::EC2::LaunchTemplate",
                    "Properties": {
                        "LaunchTemplateName": "SuperMega-LaunchTemplate",
                        "LaunchTemplateData": {
                            "ImageId": "ami-0c02fb55956c7d316",  # Amazon Linux 2
                            "InstanceType": {"Ref": "InstanceType"},
                            "KeyName": {"Ref": "KeyName"},
                            "SecurityGroupIds": [{"Ref": "SuperMegaSecurityGroup"}],
                            "IamInstanceProfile": {
                                "Name": {"Ref": "SuperMegaInstanceProfile"}
                            },
                            "UserData": {
                                "Fn::Base64": {
                                    "Fn::Sub": self.get_user_data_script()
                                }
                            },
                            "TagSpecifications": [{
                                "ResourceType": "instance",
                                "Tags": [
                                    {"Key": "Name", "Value": "SuperMega-AI-Platform"},
                                    {"Key": "Environment", "Value": "Production"}
                                ]
                            }]
                        }
                    }
                },
                
                # Auto Scaling Group
                "SuperMegaAutoScalingGroup": {
                    "Type": "AWS::AutoScaling::AutoScalingGroup",
                    "Properties": {
                        "AutoScalingGroupName": "SuperMega-ASG",
                        "VPCZoneIdentifier": [{"Ref": "PublicSubnet"}],
                        "LaunchTemplate": {
                            "LaunchTemplateId": {"Ref": "SuperMegaLaunchTemplate"},
                            "Version": {"Fn::GetAtt": ["SuperMegaLaunchTemplate", "LatestVersionNumber"]}
                        },
                        "MinSize": "1",
                        "MaxSize": "3",
                        "DesiredCapacity": "1",
                        "TargetGroupARNs": [{"Ref": "SuperMegaTargetGroup"}],
                        "HealthCheckType": "ELB",
                        "HealthCheckGracePeriod": 300,
                        "Tags": [{
                            "Key": "Name",
                            "Value": "SuperMega-ASG-Instance",
                            "PropagateAtLaunch": True
                        }]
                    }
                },
                
                # CloudWatch Alarms
                "HighCPUAlarm": {
                    "Type": "AWS::CloudWatch::Alarm",
                    "Properties": {
                        "AlarmDescription": "Scale up on high CPU",
                        "MetricName": "CPUUtilization",
                        "Namespace": "AWS/EC2",
                        "Statistic": "Average",
                        "Period": 300,
                        "EvaluationPeriods": 2,
                        "Threshold": 80,
                        "ComparisonOperator": "GreaterThanThreshold",
                        "Dimensions": [{
                            "Name": "AutoScalingGroupName",
                            "Value": {"Ref": "SuperMegaAutoScalingGroup"}
                        }],
                        "AlarmActions": [{"Ref": "ScaleUpPolicy"}]
                    }
                },
                "ScaleUpPolicy": {
                    "Type": "AWS::AutoScaling::ScalingPolicy",
                    "Properties": {
                        "AdjustmentType": "ChangeInCapacity",
                        "AutoScalingGroupName": {"Ref": "SuperMegaAutoScalingGroup"},
                        "Cooldown": 300,
                        "ScalingAdjustment": 1
                    }
                }
            },
            "Outputs": {
                "LoadBalancerURL": {
                    "Description": "URL of the load balancer",
                    "Value": {"Fn::Sub": "http://${SuperMegaLoadBalancer.DNSName}"}
                },
                "AutoScalingGroup": {
                    "Description": "Auto Scaling Group Name",
                    "Value": {"Ref": "SuperMegaAutoScalingGroup"}
                }
            }
        }
        
        return template
    
    def get_user_data_script(self) -> str:
        """Get EC2 user data script for setup"""
        
        return """#!/bin/bash
yum update -y
yum install -y python3 python3-pip git docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Start Docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Python dependencies
pip3 install streamlit requests beautifulsoup4 selenium pandas numpy matplotlib pillow opencv-python

# Clone repository (replace with your actual repo)
cd /home/ec2-user
git clone https://github.com/yourusername/supermega-ai-platform.git
cd supermega-ai-platform

# Set permissions
chown -R ec2-user:ec2-user /home/ec2-user/supermega-ai-platform
chmod +x *.py

# Create systemd services for all AI tools
cat > /etc/systemd/system/supermega-services-launcher.service << EOF
[Unit]
Description=SuperMega Services Launcher
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega-ai-platform
ExecStart=/usr/bin/python3 supermega_services_launcher.py
Restart=always
Environment=STREAMLIT_SERVER_PORT=8501
Environment=STREAMLIT_SERVER_ADDRESS=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/supermega-browser-automation.service << EOF
[Unit]
Description=SuperMega Browser Automation
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega-ai-platform
ExecStart=/usr/local/bin/streamlit run simple_browser_automation.py --server.port 8504 --server.address 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/supermega-media-studio.service << EOF
[Unit]
Description=SuperMega Media Studio
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega-ai-platform
ExecStart=/usr/local/bin/streamlit run ai_media_studio.py --server.port 8505 --server.address 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/supermega-voice-studio.service << EOF
[Unit]
Description=SuperMega Voice Studio
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega-ai-platform
ExecStart=/usr/local/bin/streamlit run ai_voice_studio.py --server.port 8506 --server.address 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/supermega-cad-studio.service << EOF
[Unit]
Description=SuperMega CAD Studio
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega-ai-platform
ExecStart=/usr/local/bin/streamlit run ai_cad_studio.py --server.port 8508 --server.address 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/supermega-text-studio.service << EOF
[Unit]
Description=SuperMega Text Studio
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega-ai-platform
ExecStart=/usr/local/bin/streamlit run ai_text_studio.py --server.port 8509 --server.address 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start all services
systemctl daemon-reload
systemctl enable supermega-services-launcher
systemctl enable supermega-browser-automation
systemctl enable supermega-media-studio
systemctl enable supermega-voice-studio
systemctl enable supermega-cad-studio
systemctl enable supermega-text-studio

systemctl start supermega-services-launcher
systemctl start supermega-browser-automation
systemctl start supermega-media-studio
systemctl start supermega-voice-studio
systemctl start supermega-cad-studio
systemctl start supermega-text-studio

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U amazon-cloudwatch-agent.rpm

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF
{
    "agent": {
        "metrics_collection_interval": 60,
        "run_as_user": "cwagent"
    },
    "metrics": {
        "namespace": "SuperMega/AI/Platform",
        "metrics_collected": {
            "cpu": {
                "measurement": ["cpu_usage_idle", "cpu_usage_iowait", "cpu_usage_user", "cpu_usage_system"],
                "metrics_collection_interval": 60
            },
            "disk": {
                "measurement": ["used_percent"],
                "metrics_collection_interval": 60,
                "resources": ["*"]
            },
            "diskio": {
                "measurement": ["io_time"],
                "metrics_collection_interval": 60,
                "resources": ["*"]
            },
            "mem": {
                "measurement": ["mem_used_percent"],
                "metrics_collection_interval": 60
            }
        }
    }
}
EOF

systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

echo "SuperMega AI Platform deployment completed!" > /var/log/supermega-deployment.log
"""

    def deploy_to_aws(self):
        """Deploy the complete infrastructure to AWS"""
        print("🚀 Starting AWS deployment...")
        
        # Create CloudFormation template
        template = self.create_cloudformation_template()
        
        # Save template to file
        template_file = f"{self.stack_name}-template.json"
        with open(template_file, 'w') as f:
            json.dump(template, f, indent=2)
        
        print(f"✅ CloudFormation template created: {template_file}")
        
        # Deploy stack
        try:
            print("📤 Deploying CloudFormation stack...")
            
            cmd = [
                "aws", "cloudformation", "deploy",
                "--template-file", template_file,
                "--stack-name", self.stack_name,
                "--capabilities", "CAPABILITY_IAM",
                "--region", self.region,
                "--parameter-overrides", f"InstanceType={self.instance_type}"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                print("✅ CloudFormation deployment successful!")
                self.get_deployment_info()
            else:
                print(f"❌ CloudFormation deployment failed: {result.stderr}")
                
        except Exception as e:
            print(f"❌ Deployment error: {str(e)}")
    
    def get_deployment_info(self):
        """Get information about the deployed infrastructure"""
        try:
            print("\n📊 Getting deployment information...")
            
            # Get stack outputs
            cmd = [
                "aws", "cloudformation", "describe-stacks",
                "--stack-name", self.stack_name,
                "--region", self.region,
                "--query", "Stacks[0].Outputs",
                "--output", "table"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                print("\n🌐 Deployment Information:")
                print(result.stdout)
            else:
                print(f"❌ Failed to get deployment info: {result.stderr}")
                
        except Exception as e:
            print(f"❌ Error getting deployment info: {str(e)}")
    
    def create_docker_compose(self):
        """Create Docker Compose file for production deployment"""
        
        compose_config = {
            "version": "3.8",
            "services": {},
            "networks": {
                "supermega-network": {
                    "driver": "bridge"
                }
            },
            "volumes": {
                "supermega-data": {}
            }
        }
        
        # Add services
        for service in self.services:
            service_name = service["name"]
            compose_config["services"][service_name] = {
                "build": ".",
                "ports": [f"{service['port']}:{service['port']}"],
                "environment": [
                    f"STREAMLIT_SERVER_PORT={service['port']}",
                    "STREAMLIT_SERVER_ADDRESS=0.0.0.0"
                ],
                "command": f"streamlit run {service['path']} --server.port {service['port']} --server.address 0.0.0.0",
                "networks": ["supermega-network"],
                "volumes": ["supermega-data:/app/data"],
                "restart": "unless-stopped",
                "healthcheck": {
                    "test": [f"curl -f http://localhost:{service['port']} || exit 1"],
                    "interval": "30s",
                    "timeout": "10s",
                    "retries": 3
                }
            }
        
        # Add Nginx reverse proxy
        compose_config["services"]["nginx"] = {
            "image": "nginx:alpine",
            "ports": ["80:80", "443:443"],
            "volumes": [
                "./nginx.conf:/etc/nginx/nginx.conf",
                "./ssl:/etc/nginx/ssl"
            ],
            "networks": ["supermega-network"],
            "depends_on": [service["name"] for service in self.services],
            "restart": "unless-stopped"
        }
        
        # Add Redis for caching
        compose_config["services"]["redis"] = {
            "image": "redis:alpine",
            "ports": ["6379:6379"],
            "networks": ["supermega-network"],
            "restart": "unless-stopped",
            "volumes": ["supermega-data:/data"]
        }
        
        # Save Docker Compose file
        with open("docker-compose.prod.yml", "w") as f:
            import yaml
            yaml.dump(compose_config, f, default_flow_style=False)
        
        print("✅ Production Docker Compose file created: docker-compose.prod.yml")
    
    def create_nginx_config(self):
        """Create Nginx configuration for reverse proxy"""
        
        nginx_config = """
events {
    worker_connections 1024;
}

http {
    upstream supermega_services {
        server services-launcher:8501;
    }
    
    upstream browser_automation {
        server browser-automation:8504;
    }
    
    upstream media_studio {
        server media-studio:8505;
    }
    
    upstream voice_studio {
        server voice-studio:8506;
    }
    
    upstream cad_studio {
        server cad-studio:8508;
    }
    
    upstream text_studio {
        server text-studio:8509;
    }
    
    server {
        listen 80;
        server_name _;
        
        # Main dashboard
        location / {
            proxy_pass http://supermega_services;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Browser automation
        location /browser/ {
            proxy_pass http://browser_automation/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Media studio
        location /media/ {
            proxy_pass http://media_studio/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Voice studio
        location /voice/ {
            proxy_pass http://voice_studio/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # CAD studio
        location /cad/ {
            proxy_pass http://cad_studio/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Text studio
        location /text/ {
            proxy_pass http://text_studio/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
"""
        
        with open("nginx.conf", "w") as f:
            f.write(nginx_config)
        
        print("✅ Nginx configuration created: nginx.conf")
    
    def create_kubernetes_manifests(self):
        """Create Kubernetes deployment manifests"""
        
        # Create k8s directory
        os.makedirs("k8s", exist_ok=True)
        
        # Namespace
        namespace = {
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": "supermega-ai"
            }
        }
        
        with open("k8s/namespace.yaml", "w") as f:
            import yaml
            yaml.dump(namespace, f)
        
        # Create deployments for each service
        for service in self.services:
            deployment = {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {
                    "name": service["name"],
                    "namespace": "supermega-ai"
                },
                "spec": {
                    "replicas": 1,
                    "selector": {
                        "matchLabels": {
                            "app": service["name"]
                        }
                    },
                    "template": {
                        "metadata": {
                            "labels": {
                                "app": service["name"]
                            }
                        },
                        "spec": {
                            "containers": [{
                                "name": service["name"],
                                "image": f"supermega/{service['name']}:latest",
                                "ports": [{
                                    "containerPort": service["port"]
                                }],
                                "env": [
                                    {
                                        "name": "STREAMLIT_SERVER_PORT",
                                        "value": str(service["port"])
                                    },
                                    {
                                        "name": "STREAMLIT_SERVER_ADDRESS", 
                                        "value": "0.0.0.0"
                                    }
                                ],
                                "resources": {
                                    "requests": {
                                        "memory": "256Mi",
                                        "cpu": "100m"
                                    },
                                    "limits": {
                                        "memory": "512Mi",
                                        "cpu": "500m"
                                    }
                                }
                            }]
                        }
                    }
                }
            }
            
            service_manifest = {
                "apiVersion": "v1",
                "kind": "Service",
                "metadata": {
                    "name": service["name"],
                    "namespace": "supermega-ai"
                },
                "spec": {
                    "selector": {
                        "app": service["name"]
                    },
                    "ports": [{
                        "port": service["port"],
                        "targetPort": service["port"]
                    }],
                    "type": "ClusterIP"
                }
            }
            
            with open(f"k8s/{service['name']}-deployment.yaml", "w") as f:
                import yaml
                yaml.dump(deployment, f)
            
            with open(f"k8s/{service['name']}-service.yaml", "w") as f:
                import yaml
                yaml.dump(service_manifest, f)
        
        print("✅ Kubernetes manifests created in k8s/ directory")
    
    def monitor_deployment(self):
        """Monitor deployed services"""
        print("📊 Monitoring deployment...")
        
        try:
            # Get CloudWatch metrics
            cmd = [
                "aws", "logs", "describe-log-groups",
                "--region", self.region,
                "--log-group-name-prefix", "/aws/ec2/supermega"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                print("✅ CloudWatch monitoring active")
            else:
                print("⚠️ CloudWatch monitoring setup needed")
                
        except Exception as e:
            print(f"❌ Monitoring error: {str(e)}")

def main():
    """Main deployment function"""
    manager = AWSDeploymentManager()
    
    print("🚀 SuperMega AI Platform - AWS Deployment Manager")
    print("=" * 50)
    
    # Create all deployment files
    print("1. Creating CloudFormation template...")
    template = manager.create_cloudformation_template()
    
    print("2. Creating Docker Compose configuration...")
    manager.create_docker_compose()
    
    print("3. Creating Nginx configuration...")
    manager.create_nginx_config()
    
    print("4. Creating Kubernetes manifests...")
    manager.create_kubernetes_manifests()
    
    print("\n✅ All deployment files created successfully!")
    
    print("""
🎯 Next Steps:
1. Configure AWS CLI: aws configure
2. Deploy to AWS: python aws_deployment_manager.py --deploy
3. Monitor deployment: python aws_deployment_manager.py --monitor

📚 Alternative deployments:
- Docker: docker-compose -f docker-compose.prod.yml up -d  
- Kubernetes: kubectl apply -f k8s/
""")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        manager = AWSDeploymentManager()
        
        if sys.argv[1] == "--deploy":
            manager.deploy_to_aws()
        elif sys.argv[1] == "--monitor":
            manager.monitor_deployment()
        elif sys.argv[1] == "--info":
            manager.get_deployment_info()
    else:
        main()
