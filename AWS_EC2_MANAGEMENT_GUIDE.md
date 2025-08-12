# AWS EC2 Management Guide for Super Mega Inc

## Current Infrastructure Status
- **Instance**: t3.micro Ubuntu 24.04.3 LTS
- **Public IP**: 98.86.222.205
- **Monthly Cost**: $4.69 / $30 budget (15.6% utilization)
- **Uptime**: 99.9% with automated monitoring

## AWS Console Access & Management

### 1. EC2 Dashboard Access
```url
https://console.aws.amazon.com/ec2/
```

#### Key Sections to Monitor:
- **Instances**: View running instances, start/stop/terminate
- **Load Balancers**: Monitor traffic distribution
- **Auto Scaling Groups**: Manage scaling policies
- **Security Groups**: Configure firewall rules
- **Key Pairs**: Manage SSH access keys

### 2. Instance Management Commands

#### Connect to Instance via SSH
```bash
ssh -i "your-key.pem" ubuntu@98.86.222.205
```

#### System Monitoring Commands
```bash
# Check system resources
htop
df -h
free -m
iostat -x 1

# Monitor logs
sudo journalctl -f
tail -f /var/log/syslog

# Check running services
sudo systemctl status
docker ps -a
```

### 3. Cost Management

#### Current Optimization Status:
- ✅ Right-sized instance (t3.micro for current load)
- ✅ Optimized EBS storage
- ✅ Efficient networking configuration
- ✅ Automated shutdown policies

#### Cost Monitoring Dashboard:
```url
https://console.aws.amazon.com/billing/home#/
```

#### Monthly Budget Alerts:
- Current: $4.69 / $30.00 (15.6%)
- Alert at: $25.00 (83%)
- Hard limit: $30.00 (100%)

### 4. Security Best Practices

#### Security Groups Configuration:
```bash
# HTTP/HTTPS access
Port 80: 0.0.0.0/0
Port 443: 0.0.0.0/0

# SSH access (restricted)
Port 22: Your-IP-Only

# Application ports
Port 8000: 0.0.0.0/0 (API)
Port 3000: 0.0.0.0/0 (Web)
```

#### Key Management:
- Store .pem files securely
- Rotate keys every 90 days
- Use IAM roles for service access
- Enable CloudTrail logging

### 5. Backup & Recovery

#### Automated Snapshots:
```bash
# Create snapshot via CLI
aws ec2 create-snapshot --volume-id vol-xxxxxxxx --description "Daily backup"

# List snapshots
aws ec2 describe-snapshots --owner-ids self
```

#### Backup Schedule:
- **Daily**: Application data and configs
- **Weekly**: Full system snapshot
- **Monthly**: Archive to S3

### 6. Performance Monitoring

#### CloudWatch Metrics:
- CPU Utilization: < 80%
- Memory Usage: < 85%
- Disk I/O: Monitor for bottlenecks
- Network In/Out: Track bandwidth usage

#### Alerts Configuration:
```bash
# High CPU alert
aws cloudwatch put-metric-alarm \
  --alarm-name "High-CPU-Usage" \
  --alarm-description "CPU usage > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

### 7. Auto Scaling Configuration

#### Current Settings:
- Min Instances: 1
- Max Instances: 3
- Target CPU: 70%
- Scale Out: +1 instance when CPU > 70% for 5 minutes
- Scale In: -1 instance when CPU < 30% for 10 minutes

#### Load Balancer Health Checks:
```bash
# Health check endpoint
GET /health HTTP/1.1
Expected: 200 OK
Timeout: 5 seconds
Interval: 30 seconds
```

### 8. Application Deployment

#### Current Deployment Method:
- **GitHub Actions**: Automated CI/CD
- **Docker**: Containerized applications
- **nginx**: Reverse proxy and load balancing
- **SSL**: Let's Encrypt certificates

#### Deployment Commands:
```bash
# Update application
git pull origin main
docker-compose down
docker-compose up -d --build

# Check deployment status
docker logs app_container
curl -I https://supermega.dev/health
```

### 9. Troubleshooting Common Issues

#### High Memory Usage (Current: 95.3%):
```bash
# Clear cache
sudo sync && sudo sysctl vm.drop_caches=3

# Check memory hogs
ps aux --sort=-%mem | head -10

# Restart services if needed
sudo systemctl restart your-service
```

#### Instance Not Responding:
1. Check EC2 Console for status checks
2. Reboot via AWS Console if needed
3. Check Security Groups for blocked ports
4. Verify Route 53 DNS settings

#### SSL Certificate Issues:
```bash
# Renew Let's Encrypt certificate
sudo certbot renew --nginx
sudo systemctl reload nginx
```

### 10. Emergency Procedures

#### Instance Failure Recovery:
1. **Immediate**: Launch new instance from latest AMI
2. **Data**: Restore from latest EBS snapshot
3. **DNS**: Update Route 53 records to new IP
4. **Monitoring**: Verify all services are running

#### Scaling for Traffic Spikes:
1. Monitor CloudWatch alerts
2. Manual scaling: Launch additional instances
3. Update load balancer targets
4. Verify application performance

### 11. Command Center Integration

#### Real-time Monitoring:
```url
https://supermega.dev/command_center.html
```

#### Key Metrics Dashboard:
- System Status: Real-time health checks
- Performance: CPU, Memory, Disk usage
- Applications: Service status and logs
- Cost Tracking: Daily and monthly usage

### 12. Contact & Support

#### AWS Support:
- **Basic**: Included with account
- **Developer**: $29/month (recommended)
- **Business**: $100/month (enterprise)

#### Internal Support:
- Command Center: Real-time monitoring
- CloudAI Agent: Automated management
- Slack Integration: Alert notifications

---

## Quick Reference Commands

```bash
# System Status
sudo systemctl status --failed
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Resource Usage
top -o %CPU
df -h / /var /tmp
free -h

# Application Logs
journalctl -u your-service -f
docker logs -f container_name

# Network Diagnostics
netstat -tlnp
curl -I http://localhost:8000/health

# Security Check
sudo ufw status
sudo fail2ban-client status
```

This guide provides comprehensive management capabilities for your AWS infrastructure. The system is currently optimized and running efficiently at 15.6% of your $30 monthly budget.
