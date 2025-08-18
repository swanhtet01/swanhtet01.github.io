@echo off
setlocal

REM Set AWS region
set AWS_REGION=us-east-1

REM Get AWS account ID
for /f "tokens=* USEBACKQ" %%a in (`aws sts get-caller-identity --query Account --output text`) do set AWS_ACCOUNT_ID=%%a

REM Create ECR repository if it doesn't exist
aws ecr create-repository --repository-name supermega-demo || echo Repository exists

REM Login to ECR
aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com

REM Build and push Docker image
docker-compose -f docker-compose.aws.yml build
docker-compose -f docker-compose.aws.yml push

REM Update ECS task definition
aws ecs register-task-definition --cli-input-json file://aws/task-definition.json

REM Update ECS service
aws ecs update-service ^
    --cluster supermega-demo ^
    --service demo-service ^
    --task-definition supermega-demo ^
    --force-new-deployment

echo Deployment completed! The demo will be available at the ALB DNS in a few minutes.

endlocal
