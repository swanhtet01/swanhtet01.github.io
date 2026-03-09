Super Mega Inc - Delegation and Agent Task List

OVERVIEW
- Purpose: Provide specific, actionable instructions for all agents and team members to restore the platform, make the agents autonomous, and centralize work under the "Super Mega Inc" folder.
- Ownership: All artifacts and deliverables MUST be stored under the Super Mega Inc folder in this workspace.
- Security: Do NOT paste private keys or long-lived secrets into any public chat. Use AWS Secrets Manager, GitHub Secrets, or SSM Parameter Store. Rotate keys that are currently in Drive.

AGENTS (logical names)
- aws-agent: Responsible for AWS infra actions (EC2, SSM, CloudWatch, IAM).
- deploy-agent: Responsible for code deployments, CI/CD pipelines, GitHub interactions.
- monitor-agent: Responsible for monitoring, health checks, alerts, logging.
- ops-agent: Responsible for on-host actions via SSH/SSM (service restarts, logs, process managers).
- git-agent: Responsible for repo commits, branches, PRs, and organizing files into Super Mega Inc folder.

PRIORITY OBJECTIVES (this sprint)
1) Triage and restore minimal health endpoints so status becomes green.
2) Ensure agents run under a supervised process and autorestart on failure.
3) Move all orchestration, scripts, and configs into Super Mega Inc folder and commit.
4) Implement CI (GitHub Actions) to deploy static site + health endpoints automatically.
5) Implement monitoring and alerts (CloudWatch + SNS) and heartbeat writing to aws_status_report.json.

GENERAL RULES
- Always record exact timestamps and outputs of commands in logs under Super Mega Inc/logs/.
- Use SSM Run Command instead of raw PEM-based SSH when possible.
- When restarting services, capture logs: journalctl -u <service> -n 200 --no-pager
- If creating IAM credentials for agents, make them time-limited and scoped. Document role ARNs in Super Mega Inc/credentials_policy.md (NOT the creds themselves).

TASKS (in order) - assign to agents accordingly

Task A: Gather current environment data (aws-agent + git-agent)
- Goal: Produce an updated aws_status_report.json and store under Super Mega Inc/status/aws_status_report.json (copy).
- Steps:
  1) aws-agent: Run AWS inventory and status (use AWS CLI profile with required permissions):
     - aws ec2 describe-instances --filters "Name=tag:Project,Values=supermega*" --output json > "Super Mega Inc/logs/ec2_describe_instances.json"
     - aws ec2 describe-instance-status --instance-ids <ids> --output json >> "Super Mega Inc/logs/ec2_instance_status.json"
  2) aws-agent: Check SSM-managed instances:
     - aws ssm describe-instance-information --output json > "Super Mega Inc/logs/ssm_instances.json"
  3) aws-agent: Check public endpoints (from a bastion or external machine):
     - curl -m 10 -sSf http://<public-ip-or-domain>/health || echo "FAIL" > "Super Mega Inc/logs/health_check.txt"
  4) git-agent: Copy the workspace aws_status_report.json into Super Mega Inc/status/ with timestamped filename and commit.

Task B: Establish secure remote access (aws-agent + ops-agent)
- Goal: Use SSM Session Manager or an authorized short-lived SSH key for on-host work.
- Steps:
  1) aws-agent: Ensure the EC2 instance(s) have the SSM agent installed and IAM instance profile with AmazonSSMManagedInstanceCore.
     - aws ssm describe-instance-information --filters Key=PingStatus,Values=Online
  2) ops-agent: If SSM not available and you must use SSH, request a new, short-lived keypair and authorize it temporarily via authorized_keys on the instance; record key lifecycle in Super Mega Inc/security/.

Task C: On-host triage (ops-agent)
- Goal: Identify processes responsible for web and API services and restart them.
- Steps (execute via SSM RunCommand or SSH):
  1) ps aux | egrep "(node|gunicorn|uwsgi|docker|pm2|supervisord)" > "Super Mega Inc/logs/process_list.txt"
  2) Check Docker: docker ps --format '{{.Names}} {{.Status}}' > "Super Mega Inc/logs/docker_ps.txt"; docker logs --tail 200 <container> > Super Mega Inc/logs/docker_<container>.log
  3) Check systemd services: sudo systemctl list-units --type=service --state=running > Super Mega Inc/logs/systemd_running.txt
  4) Check application logs (paths will vary). Examples:
     - journalctl -u myservice.service -n 200 --no-pager > Super Mega Inc/logs/myservice_journal.log
     - tail -n 500 /var/log/nginx/error.log > Super Mega Inc/logs/nginx_error.log
  5) Restart target services in controlled manner. Example order:
     - sudo systemctl restart <db or cache if applicable>
     - sudo systemctl restart backend.service
     - sudo systemctl restart nginx
  6) After restarts, check health endpoints and report to Super Mega Inc/status/health_checks.md with curl results and timestamps.

Task D: Bring minimal health endpoints up (deploy-agent + ops-agent)
- Goal: If backends are failing, deploy minimal static health endpoints so monitoring shows services as healthy.
- Steps:
  1) deploy-agent: Create a minimal http server on port 8080 (Node/Python). Example Python one-liner (run inside screen/tmux or as systemd service):
     - python3 -m http.server 8080 --directory /var/www/health
     - or use a tiny Flask app that returns 200 on /health.
  2) ops-agent: Configure NGINX proxy rules to route /health to the minimal server.
  3) monitor-agent: Confirm health endpoints return 200 and update aws_status_report.json accordingly.

Task E: CI/CD & Repo organization (git-agent + deploy-agent)
- Goal: Move all deployment scripts and orchestration into Super Mega Inc/ and create GitHub Actions to automate deploys.
- Steps:
  1) git-agent: Create folder Super Mega Inc/deploy/ and move/copy deployment scripts from Drive into it (ensure sensitive files are NOT committed; replace secrets with placeholders). Commit with message: "chore: centralize deployment scripts under Super Mega Inc"
  2) deploy-agent: Add a GitHub Actions workflow file path: .github/workflows/deploy.yml that:
     - runs on push to main
     - checks out code
     - sets up AWS CLI using GitHub Secrets: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (prefer role-based OIDC)
     - runs deployment script: Super Mega Inc/deploy/aws_deploy.sh
     - posts status to Super Mega Inc/status/aws_status_report.json via a job artifact or commit (use a deploy bot account)
  3) git-agent: Create Super Mega Inc/README-deploy.md with exact environment variables needed and where to store secrets (GitHub Secrets or Secrets Manager).

Task F: Monitoring and Heartbeat (monitor-agent + aws-agent)
- Goal: Implement CloudWatch metrics + heartbeat that writes to aws_status_report.json and S3 as fallback.
- Steps:
  1) monitor-agent: Create a lightweight cron job or systemd timer on a manager instance that:
     - curl internal health endpoints for main_site, platform, creative, data, productivity
     - write status JSON to /opt/supermega/aws_status_report.json
     - upload to S3: aws s3 cp /opt/supermega/aws_status_report.json s3://supermega-status-bucket/aws_status_report.json
  2) aws-agent: Create a CloudWatch Alarm for critical endpoints that triggers an SNS topic and calls a lambda to attempt automated remediation (e.g., restart service via SSM).
  3) monitor-agent: Configure SNS subscriptions for email/Slack.

Task G: Make agents autonomous and resilient (deploy-agent + aws-agent + monitor-agent)
- Goal: Agents should be supervised, auto-updating, and restart automatically on failures.
- Steps:
  1) Containerize agents (if not already) and run under Docker Compose / systemd or move to ECS/Fargate for managed infra.
  2) Add retry/backoff logic in agent code (exponential backoff, jitter).
  3) Ensure each agent reports a heartbeat to the monitoring system every 60-300s.
  4) Add process supervision: use systemd unit examples or PM2 for Node agents. Example unit file location: /etc/systemd/system/supermega-agent.service

Task H: Security & Secrets (aws-agent + ops-agent + git-agent)
- Goal: Remove sensitive files from repo/Drive and centralize secrets.
- Steps:
  1) git-agent: Do an inventory of files in Drive and repo with likely secrets (PEM, .env) and list them under Super Mega Inc/security/secret_inventory.txt.
  2) aws-agent: Rotate any exposed keys; create IAM policy doc in Super Mega Inc/security/iam_policies.md.
  3) deploy-agent: Move secrets into AWS Secrets Manager or SSM Parameter Store and update deployment scripts to reference them.

Task I: Runbook & Escalation (ops-agent + monitor-agent)
- Goal: Document exact steps to recover from common failures and how to escalate to humans.
- Steps:
  1) Create Super Mega Inc/runbooks/ with pages:
     - reboot-instance.md
     - restart-backend.md
     - restore-from-backup.md
  2) Each runbook must include commands, expected outputs, and rollback steps.

COMMIT & ORGANIZE
- git-agent: After each significant step, commit logs and small artifacts (not secrets) under Super Mega Inc/ with clear commit messages and PRs for code changes.
- Example git flow:
  - git checkout -b chore/centralize-deploy
  - git add "Super Mega Inc/" && git commit -m "chore: centralize deploy and ops artifacts"
  - git push origin chore/centralize-deploy and open PR for review.

ESCALATION & NOTIFICATION
- If any agent cannot perform an action (permission denied, instance unreachable), they must post a detailed error log to Super Mega Inc/logs/ and tag ops lead in the team channel.

PLACEHOLDERS / SENSITIVE VALUES
- Replace all placeholders like <instance-id>, <public-ip>, <bucket-name>, <service-name>, <aws-region> with real values during execution. Do NOT commit secrets.

NEXT 48 HOUR SPRINT (minimum deliverables)
1) aws-agent: Updated inventory and working SSM access confirmed.
2) ops-agent: Backends either restarted or minimal /health endpoints served and reachable.
3) monitor-agent: Heartbeat job deployed and aws_status_report.json updated in S3.
4) git-agent: Super Mega Inc folder created with logs, scripts (placeholders), and runbooks. PR opened.
5) deploy-agent: GitHub Actions workflow skeleton created in repo (as a PR) — DO NOT merge until secrets are added.

If any agent needs further clarification on commands or exact values, they must log a blocking request in Super Mega Inc/blocks/ with timestamps and exact error outputs.

END
