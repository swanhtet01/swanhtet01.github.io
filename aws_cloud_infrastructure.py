#!/usr/bin/env python3
"""
☁️ AWS CLOUD INFRASTRUCTURE DEPLOYMENT
=====================================
Complete AWS deployment for SuperMega AI Products
- Auto-scaling EC2 infrastructure
- Load balancing and high availability
- Central nervous system LLM coordination
- RAG knowledge network
- Container orchestration
- Database and caching layers
- 24/7 monitoring and alerting
"""

import boto3
import json
import yaml
from datetime import datetime
import os

class SuperMegaCloudInfrastructure:
    def __init__(self, aws_region='us-east-1'):
        self.region = aws_region
        self.ec2 = boto3.client('ec2', region_name=aws_region)
        self.ecs = boto3.client('ecs', region_name=aws_region)
        self.elb = boto3.client('elbv2', region_name=aws_region)
        self.rds = boto3.client('rds', region_name=aws_region)
        self.s3 = boto3.client('s3', region_name=aws_region)
        self.cloudformation = boto3.client('cloudformation', region_name=aws_region)
        
        # Current instance details
        self.current_instance_id = 'i-020ec2022c95828c8'
        self.current_public_ip = '98.86.222.205'
        self.key_name = 'company-hq-final'
        
    def create_cloudformation_template(self):
        """Create comprehensive CloudFormation template for SuperMega infrastructure"""
        template = {
            "AWSTemplateFormatVersion": "2010-09-09",
            "Description": "SuperMega AI Products - Complete Cloud Infrastructure",
            "Parameters": {
                "KeyName": {
                    "Type": "AWS::EC2::KeyPair::KeyName",
                    "Default": "company-hq-final",
                    "Description": "EC2 Key Pair for SSH access"
                },
                "InstanceType": {
                    "Type": "String",
                    "Default": "t3.large",
                    "Description": "EC2 instance type for AI workloads"
                },
                "MinInstances": {
                    "Type": "Number",
                    "Default": 2,
                    "Description": "Minimum number of instances in Auto Scaling Group"
                },
                "MaxInstances": {
                    "Type": "Number", 
                    "Default": 10,
                    "Description": "Maximum number of instances in Auto Scaling Group"
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
                "PublicSubnet1": {
                    "Type": "AWS::EC2::Subnet",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "CidrBlock": "10.0.1.0/24",
                        "AvailabilityZone": {"Fn::Select": [0, {"Fn::GetAZs": ""}]},
                        "MapPublicIpOnLaunch": True,
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Public-1"}]
                    }
                },
                "PublicSubnet2": {
                    "Type": "AWS::EC2::Subnet",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "CidrBlock": "10.0.2.0/24",
                        "AvailabilityZone": {"Fn::Select": [1, {"Fn::GetAZs": ""}]},
                        "MapPublicIpOnLaunch": True,
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Public-2"}]
                    }
                },
                "PrivateSubnet1": {
                    "Type": "AWS::EC2::Subnet",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "CidrBlock": "10.0.3.0/24",
                        "AvailabilityZone": {"Fn::Select": [0, {"Fn::GetAZs": ""}]},
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Private-1"}]
                    }
                },
                "PrivateSubnet2": {
                    "Type": "AWS::EC2::Subnet",
                    "Properties": {
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "CidrBlock": "10.0.4.0/24",
                        "AvailabilityZone": {"Fn::Select": [1, {"Fn::GetAZs": ""}]},
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Private-2"}]
                    }
                },
                
                # Internet Gateway
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
                
                # Route Tables
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
                
                # Security Groups
                "ALBSecurityGroup": {
                    "Type": "AWS::EC2::SecurityGroup",
                    "Properties": {
                        "GroupDescription": "Security group for Application Load Balancer",
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "SecurityGroupIngress": [
                            {"IpProtocol": "tcp", "FromPort": 80, "ToPort": 80, "CidrIp": "0.0.0.0/0"},
                            {"IpProtocol": "tcp", "FromPort": 443, "ToPort": 443, "CidrIp": "0.0.0.0/0"}
                        ],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-ALB-SG"}]
                    }
                },
                "EC2SecurityGroup": {
                    "Type": "AWS::EC2::SecurityGroup",
                    "Properties": {
                        "GroupDescription": "Security group for EC2 instances",
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "SecurityGroupIngress": [
                            {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22, "CidrIp": "0.0.0.0/0"},
                            {"IpProtocol": "tcp", "FromPort": 8000, "ToPort": 8600, "SourceSecurityGroupId": {"Ref": "ALBSecurityGroup"}},
                            {"IpProtocol": "tcp", "FromPort": 80, "ToPort": 80, "SourceSecurityGroupId": {"Ref": "ALBSecurityGroup"}}
                        ],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-EC2-SG"}]
                    }
                },
                
                # RDS Database for RAG Knowledge Network
                "RAGDatabase": {
                    "Type": "AWS::RDS::DBInstance",
                    "Properties": {
                        "DBInstanceIdentifier": "supermega-rag-db",
                        "DBInstanceClass": "db.t3.micro",
                        "Engine": "postgres",
                        "EngineVersion": "14.9",
                        "MasterUsername": "supermega_admin",
                        "MasterUserPassword": "SuperMega2025!",
                        "AllocatedStorage": "20",
                        "VPCSecurityGroups": [{"Ref": "RDSSecurityGroup"}],
                        "DBSubnetGroupName": {"Ref": "DBSubnetGroup"},
                        "Tags": [{"Key": "Name", "Value": "SuperMega-RAG-Database"}]
                    }
                },
                "RDSSecurityGroup": {
                    "Type": "AWS::EC2::SecurityGroup",
                    "Properties": {
                        "GroupDescription": "Security group for RDS database",
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "SecurityGroupIngress": [
                            {"IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432, "SourceSecurityGroupId": {"Ref": "EC2SecurityGroup"}}
                        ],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-RDS-SG"}]
                    }
                },
                "DBSubnetGroup": {
                    "Type": "AWS::RDS::DBSubnetGroup",
                    "Properties": {
                        "DBSubnetGroupDescription": "Subnet group for RDS database",
                        "SubnetIds": [{"Ref": "PrivateSubnet1"}, {"Ref": "PrivateSubnet2"}],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-DB-SubnetGroup"}]
                    }
                },
                
                # ElastiCache for Redis (Central Nervous System Cache)
                "CentralNervousSystemCache": {
                    "Type": "AWS::ElastiCache::CacheCluster",
                    "Properties": {
                        "CacheNodeType": "cache.t3.micro",
                        "Engine": "redis",
                        "NumCacheNodes": 1,
                        "VpcSecurityGroupIds": [{"Ref": "CacheSecurityGroup"}],
                        "CacheSubnetGroupName": {"Ref": "CacheSubnetGroup"},
                        "Tags": [{"Key": "Name", "Value": "SuperMega-CNS-Cache"}]
                    }
                },
                "CacheSecurityGroup": {
                    "Type": "AWS::EC2::SecurityGroup",
                    "Properties": {
                        "GroupDescription": "Security group for ElastiCache",
                        "VpcId": {"Ref": "SuperMegaVPC"},
                        "SecurityGroupIngress": [
                            {"IpProtocol": "tcp", "FromPort": 6379, "ToPort": 6379, "SourceSecurityGroupId": {"Ref": "EC2SecurityGroup"}}
                        ],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-Cache-SG"}]
                    }
                },
                "CacheSubnetGroup": {
                    "Type": "AWS::ElastiCache::SubnetGroup",
                    "Properties": {
                        "Description": "Subnet group for ElastiCache",
                        "SubnetIds": [{"Ref": "PrivateSubnet1"}, {"Ref": "PrivateSubnet2"}]
                    }
                },
                
                # Application Load Balancer
                "ApplicationLoadBalancer": {
                    "Type": "AWS::ElasticLoadBalancingV2::LoadBalancer",
                    "Properties": {
                        "Name": "SuperMega-ALB",
                        "Type": "application",
                        "Scheme": "internet-facing",
                        "SecurityGroups": [{"Ref": "ALBSecurityGroup"}],
                        "Subnets": [{"Ref": "PublicSubnet1"}, {"Ref": "PublicSubnet2"}],
                        "Tags": [{"Key": "Name", "Value": "SuperMega-ALB"}]
                    }
                },
                
                # Launch Template for Auto Scaling
                "SuperMegaLaunchTemplate": {
                    "Type": "AWS::EC2::LaunchTemplate",
                    "Properties": {
                        "LaunchTemplateName": "SuperMega-LaunchTemplate",
                        "LaunchTemplateData": {
                            "ImageId": "ami-0e86e20dae9224db8",  # Amazon Linux 2023
                            "InstanceType": {"Ref": "InstanceType"},
                            "KeyName": {"Ref": "KeyName"},
                            "SecurityGroupIds": [{"Ref": "EC2SecurityGroup"}],
                            "IamInstanceProfile": {"Arn": {"Fn::GetAtt": ["EC2InstanceProfile", "Arn"]}},
                            "UserData": {"Fn::Base64": {"Fn::Sub": self.get_user_data_script()}},
                            "TagSpecifications": [
                                {
                                    "ResourceType": "instance",
                                    "Tags": [
                                        {"Key": "Name", "Value": "SuperMega-AI-Instance"},
                                        {"Key": "Environment", "Value": "Production"}
                                    ]
                                }
                            ]
                        }
                    }
                },
                
                # Auto Scaling Group
                "AutoScalingGroup": {
                    "Type": "AWS::AutoScaling::AutoScalingGroup",
                    "Properties": {
                        "AutoScalingGroupName": "SuperMega-ASG",
                        "LaunchTemplate": {
                            "LaunchTemplateId": {"Ref": "SuperMegaLaunchTemplate"},
                            "Version": {"Fn::GetAtt": ["SuperMegaLaunchTemplate", "LatestVersionNumber"]}
                        },
                        "MinSize": {"Ref": "MinInstances"},
                        "MaxSize": {"Ref": "MaxInstances"},
                        "DesiredCapacity": {"Ref": "MinInstances"},
                        "VPCZoneIdentifier": [{"Ref": "PublicSubnet1"}, {"Ref": "PublicSubnet2"}],
                        "HealthCheckType": "ELB",
                        "HealthCheckGracePeriod": 300,
                        "Tags": [
                            {"Key": "Name", "Value": "SuperMega-ASG-Instance", "PropagateAtLaunch": True},
                            {"Key": "Environment", "Value": "Production", "PropagateAtLaunch": True}
                        ]
                    }
                },
                
                # IAM Role for EC2 instances
                "EC2Role": {
                    "Type": "AWS::IAM::Role",
                    "Properties": {
                        "AssumeRolePolicyDocument": {
                            "Version": "2012-10-17",
                            "Statement": [
                                {
                                    "Effect": "Allow",
                                    "Principal": {"Service": "ec2.amazonaws.com"},
                                    "Action": "sts:AssumeRole"
                                }
                            ]
                        },
                        "ManagedPolicyArns": [
                            "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
                            "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
                        ],
                        "Policies": [
                            {
                                "PolicyName": "SuperMegaEC2Policy",
                                "PolicyDocument": {
                                    "Version": "2012-10-17",
                                    "Statement": [
                                        {
                                            "Effect": "Allow",
                                            "Action": [
                                                "s3:GetObject",
                                                "s3:PutObject",
                                                "rds:DescribeDBInstances",
                                                "elasticache:DescribeCacheClusters"
                                            ],
                                            "Resource": "*"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                },
                "EC2InstanceProfile": {
                    "Type": "AWS::IAM::InstanceProfile",
                    "Properties": {
                        "Roles": [{"Ref": "EC2Role"}]
                    }
                },
                
                # S3 Bucket for AI Models and Data
                "AIModelsBucket": {
                    "Type": "AWS::S3::Bucket",
                    "Properties": {
                        "BucketName": {"Fn::Sub": "supermega-ai-models-${AWS::AccountId}"},
                        "VersioningConfiguration": {"Status": "Enabled"},
                        "Tags": [{"Key": "Name", "Value": "SuperMega-AI-Models"}]
                    }
                }
            },
            "Outputs": {
                "LoadBalancerDNS": {
                    "Description": "DNS name of the load balancer",
                    "Value": {"Fn::GetAtt": ["ApplicationLoadBalancer", "DNSName"]},
                    "Export": {"Name": "SuperMega-ALB-DNS"}
                },
                "DatabaseEndpoint": {
                    "Description": "RDS database endpoint",
                    "Value": {"Fn::GetAtt": ["RAGDatabase", "Endpoint.Address"]},
                    "Export": {"Name": "SuperMega-DB-Endpoint"}
                },
                "CacheEndpoint": {
                    "Description": "ElastiCache Redis endpoint",
                    "Value": {"Fn::GetAtt": ["CentralNervousSystemCache", "RedisEndpoint.Address"]},
                    "Export": {"Name": "SuperMega-Cache-Endpoint"}
                }
            }
        }
        
        return template
    
    def get_user_data_script(self):
        """Generate user data script for EC2 instances"""
        return """#!/bin/bash
yum update -y
yum install -y docker python3 python3-pip git nginx

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.21.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Start services
systemctl start docker
systemctl enable docker
systemctl start nginx
systemctl enable nginx

# Add ec2-user to docker group
usermod -a -G docker ec2-user

# Install Python dependencies
pip3 install streamlit fastapi uvicorn redis psycopg2-binary boto3

# Clone SuperMega repository
cd /home/ec2-user
git clone https://github.com/swanhtet01/swanhtet01.github.io.git supermega
chown -R ec2-user:ec2-user supermega

# Create systemd services for SuperMega products
cat > /etc/systemd/system/supermega-orchestrator.service << EOF
[Unit]
Description=SuperMega AI Orchestrator
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega
ExecStart=/usr/bin/python3 -m streamlit run supermega_orchestrator.py --server.port 8509 --server.address 0.0.0.0
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/supermega-central-nervous-system.service << EOF
[Unit]
Description=SuperMega Central Nervous System
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/supermega
ExecStart=/usr/bin/python3 central_nervous_system.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
systemctl daemon-reload
systemctl enable supermega-orchestrator
systemctl enable supermega-central-nervous-system
systemctl start supermega-orchestrator
systemctl start supermega-central-nervous-system

# Configure nginx reverse proxy
cat > /etc/nginx/conf.d/supermega.conf << EOF
server {
    listen 80;
    server_name supermega.dev *.supermega.dev;

    location / {
        proxy_pass http://localhost:8510;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /orchestrator {
        proxy_pass http://localhost:8509;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /products/ {
        proxy_pass http://localhost:8503/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

systemctl restart nginx

# Install AI/ML dependencies
pip3 install torch torchvision transformers huggingface-hub
pip3 install opencv-python moviepy librosa speechrecognition
pip3 install selenium playwright beautifulsoup4
pip3 install langchain chromadb sentence-transformers

# Download base models
mkdir -p /home/ec2-user/models
cd /home/ec2-user/models
python3 -c "from transformers import AutoTokenizer, AutoModel; AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2'); AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')"

chown -R ec2-user:ec2-user /home/ec2-user/models

# Signal that the instance is ready
/opt/aws/bin/cfn-signal -e $? --stack ${AWS::StackName} --resource AutoScalingGroup --region ${AWS::Region}
"""
    
    def deploy_infrastructure(self):
        """Deploy the complete infrastructure using CloudFormation"""
        template = self.create_cloudformation_template()
        
        # Save template to file
        with open('supermega-infrastructure.yaml', 'w') as f:
            yaml.dump(template, f, default_flow_style=False)
        
        print("🚀 Deploying SuperMega AI Infrastructure...")
        
        try:
            response = self.cloudformation.create_stack(
                StackName='SuperMega-AI-Infrastructure',
                TemplateBody=json.dumps(template),
                Parameters=[
                    {'ParameterKey': 'KeyName', 'ParameterValue': self.key_name},
                    {'ParameterKey': 'InstanceType', 'ParameterValue': 't3.large'},
                    {'ParameterKey': 'MinInstances', 'ParameterValue': '2'},
                    {'ParameterKey': 'MaxInstances', 'ParameterValue': '10'}
                ],
                Capabilities=['CAPABILITY_IAM'],
                Tags=[
                    {'Key': 'Project', 'Value': 'SuperMega-AI'},
                    {'Key': 'Environment', 'Value': 'Production'}
                ]
            )
            
            print(f"✅ CloudFormation stack creation initiated: {response['StackId']}")
            return response
            
        except Exception as e:
            print(f"❌ Error deploying infrastructure: {e}")
            return None
    
    def create_route53_records(self, alb_dns_name):
        """Create Route53 DNS records for supermega.dev"""
        route53 = boto3.client('route53')
        
        try:
            # Find the hosted zone for supermega.dev
            zones = route53.list_hosted_zones()
            zone_id = None
            
            for zone in zones['HostedZones']:
                if zone['Name'] == 'supermega.dev.':
                    zone_id = zone['Id']
                    break
            
            if not zone_id:
                print("❌ supermega.dev hosted zone not found")
                return False
            
            # Create A record for supermega.dev
            route53.change_resource_record_sets(
                HostedZoneId=zone_id,
                ChangeBatch={
                    'Changes': [
                        {
                            'Action': 'UPSERT',
                            'ResourceRecordSet': {
                                'Name': 'supermega.dev',
                                'Type': 'A',
                                'AliasTarget': {
                                    'DNSName': alb_dns_name,
                                    'EvaluateTargetHealth': False,
                                    'HostedZoneId': 'Z35SXDOTRQ7X7K'  # ALB hosted zone for us-east-1
                                }
                            }
                        }
                    ]
                }
            )
            
            print("✅ DNS records created for supermega.dev")
            return True
            
        except Exception as e:
            print(f"❌ Error creating DNS records: {e}")
            return False

def main():
    """Deploy SuperMega AI Infrastructure"""
    print("☁️ SuperMega AI Cloud Infrastructure Deployment")
    print("=" * 50)
    
    infrastructure = SuperMegaCloudInfrastructure()
    
    # Deploy infrastructure
    result = infrastructure.deploy_infrastructure()
    
    if result:
        print("🎉 Infrastructure deployment initiated successfully!")
        print("⏳ This will take approximately 15-20 minutes to complete.")
        print("\n📋 Next Steps:")
        print("1. Monitor CloudFormation stack creation in AWS Console")
        print("2. Once complete, update DNS records")
        print("3. Test all SuperMega AI products")
        print("4. Configure SSL certificates")
        print("\n🔗 Access Points:")
        print("- Main Site: https://supermega.dev")
        print("- Orchestrator: https://supermega.dev/orchestrator")
        print("- Products: https://supermega.dev/products/")
    else:
        print("❌ Infrastructure deployment failed!")

if __name__ == "__main__":
    main()
