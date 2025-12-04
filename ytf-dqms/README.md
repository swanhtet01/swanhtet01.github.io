# YTF Digital Quality Management System (DQMS)

**AI-Native ERP Platform for Yangon Tyre Factory - Plant B Pilot**

---

## 🎯 Project Overview

The YTF DQMS is a comprehensive, real-time quality management system designed specifically for Yangon Tyre Factory's Plant B operations. Built on actual operational data and informed by extensive stakeholder interviews, this system transforms quality management from reactive paper-based processes to proactive, data-driven decision-making.

### Key Objectives

1. **Reduce B+R Rate** from current 2.0-3.7% to consistently below 2.5%
2. **Reduce Cost of Quality** by 20% within 12 months
3. **Improve Defect Detection Time** from hours to minutes
4. **Enable Data-Driven Decisions** with real-time insights
5. **Empower All Levels** from plant manager to production operator

---

## 🏭 Plant B Context

### Production Lines
- **PD-1 (Mixing)**: 270L Mixer, 100L Mixer
- **PD-2 (Extrusion & Calendering)**: Extruder, Calender
- **PD-3 (Building)**: Building Machine
- **PD-4 (Curing)**: Curing Press

### Product Mix
- **Radial Tires**: 185/70 R14, 195 R14 C, 195 R15 C, 205/70 R15 C
- **Motorcycle Tires**: Various sizes
- **Bias/Nylon Tires**: Various sizes

### Quality System
- **Grading**: A (first quality), B (minor defect), R (reject)
- **Target**: B+R rate < 3.0%
- **Current Performance**: 2.0% - 3.7% (varies by line and shift)

### Top Defect Types (from actual data)
1. Inner Separation
2. Sidewall Crack
3. Bead Deformation
4. Inner Undercure
5. Tire Weight Wrong

---

## 🏗️ System Architecture

### Technology Stack

**Frontend**
- HTML5, CSS3, Tailwind CSS
- JavaScript (ES6+)
- Chart.js for visualizations
- Progressive Web App (PWA) for mobile

**Backend**
- Node.js + TypeScript
- Drizzle ORM
- PostgreSQL database
- AWS infrastructure (ECS, RDS, S3)

**Data Pipeline**
- Google Drive integration (rclone)
- Excel file parsing (XLSX.js)
- ETL processes for Plant B data
- Real-time sync (15-minute intervals)

**AI/ML**
- Claude AI (Anthropic) for root cause analysis
- Statistical anomaly detection
- Defect prediction models
- Natural language processing (Burmese support)

### Database Schema

**12 Core Tables**:
1. `production_lines` - PD-1 to PD-4 configuration
2. `tire_models` - Product specifications
3. `defect_types` - Defect classification (bilingual)
4. `operators` - Personnel and performance
5. `production_batches` - Batch tracking
6. `quality_inspections` - Inspection records
7. `defect_records` - Detailed defect instances
8. `down_time_events` - Machine down time
9. `daily_quality_metrics` - Aggregated metrics
10. `root_cause_analysis` - RCA workflow
11. `alerts` - Real-time notifications
12. `data_sync_log` - Google Drive sync tracking

---

## 📊 Features

### 1. Real-Time Quality Monitoring

**Live Dashboards**
- Current B+R rate (updated every 5 minutes)
- Production count by line and shift
- Active alerts and issues
- Production line status

**Automatic Alerts**
- B+R rate exceeds threshold (3.0%)
- Defect spike detected (5+ same defect in 2 hours)
- Production line quality degradation
- Operator performance anomaly
- Machine down time exceeds normal

### 2. Advanced Analytics

**Statistical Process Control (SPC)**
- X-bar and R charts for tire weight
- P-charts for defect rates
- Control limits (UCL, LCL)
- Process capability indices (Cp, Cpk)

**Cost of Quality (COQ)**
- Internal failure costs (rework, scrap, downtime)
- External failure costs (warranty, returns)
- Appraisal costs (inspection, testing)
- Prevention costs (training, improvement)
- Total COQ and COQ per tire

**Defect Analysis**
- By type, category, production line, shift
- Pareto analysis (80/20 rule)
- Trend detection (improving/stable/declining)
- Correlation analysis (defects vs. parameters)

**Operator Performance**
- Individual quality scores
- Benchmarking (vs. average, vs. target)
- Training needs identification
- Performance trends

### 3. Role-Based Dashboards

**Plant Manager (Mr. Wu)**
- Executive summary view
- B+R rate vs. target
- Production vs. quality balance
- Cost of quality
- Top 3 quality issues
- Production line comparison

**QC Manager**
- Operational overview
- Inspector workload distribution
- Defect analysis (detailed)
- Root cause analysis tracking
- CAPA management
- Daily/weekly/monthly reports

**Production Supervisor**
- Line performance (my line only)
- Operator management
- Real-time alerts for my line
- Quick actions (report issue, request maintenance)

**QC Inspector (Mobile)**
- Inspection workflow (scan, inspect, photo, submit)
- Bilingual UI (English + Burmese)
- Offline capability
- Inspection history
- Defect identification guide

**Production Operator (Mobile)**
- Quality scoreboard (my score today)
- Real-time feedback (when I produce B/R tire)
- Quality tips based on my defects
- Bilingual UI (English + Burmese)

### 4. Mobile Inspection App

**Progressive Web App (PWA)**
- Install on tablets/phones
- Works offline
- Sync when connection available
- Fast, native-like experience

**Features**
- Barcode/QR scanner for tire serial numbers
- Camera integration for defect photos
- Photo annotation (draw on image)
- Voice input (Burmese language)
- Simple, visual interface
- Large buttons for production floor

### 5. Root Cause Analysis (RCA)

**Guided Workflow**
- 5 Whys template
- Fishbone diagram (Ishikawa)
- Pareto analysis
- Correlation matrix
- Timeline reconstruction

**AI-Powered Insights (Claude)**
- Analyze defect patterns
- Suggest likely root causes
- Recommend corrective actions
- Learn from past RCA cases
- Generate RCA reports

**CAPA Management**
- Create corrective actions
- Assign preventive actions
- Track action completion
- Verify effectiveness
- Close the loop

### 6. Google Drive Data Integration

**Automated Sync**
- Every 15 minutes for real-time data
- Daily full sync for historical data
- Alert on sync failures

**Supported Files**
- B Condition 2025.xlsx → defects table
- Weekly Tyre Production - 2025.xlsx → production_batches
- Daily Production Meeting Form.xlsx → daily_quality_metrics
- Down Time Record.xlsx → down_time_events
- PD-3 Size Changing Form.xlsx → down_time_events

**Data Quality Checks**
- Validate B+R rate calculations
- Check for data anomalies
- Flag suspicious patterns
- Monitor data freshness

### 7. Reporting & Export

**Automated Reports**
- Daily quality summary (PDF)
- Weekly quality report (PDF + Excel)
- Monthly quality review (PowerPoint)
- Cost of quality report
- Executive dashboard (email)

**Custom Reports**
- Report builder interface
- Select metrics, date range, filters
- Export to PDF, Excel, CSV
- Schedule recurring reports
- Email distribution lists

---

## 🚀 Deployment

### AWS Infrastructure

**Compute**
- ECS Fargate for containerized application
- Auto-scaling based on load

**Database**
- RDS PostgreSQL (Multi-AZ)
- Automated backups
- Point-in-time recovery

**Storage**
- S3 for defect photos and attachments
- CloudFront CDN for fast delivery

**Monitoring**
- CloudWatch for metrics and logs
- SNS for alert notifications
- AWS Secrets Manager for credentials

### Security

- HTTPS everywhere (TLS 1.3)
- Data encryption at rest (AES-256)
- Data encryption in transit
- Role-based access control (RBAC)
- SQL injection prevention
- XSS prevention
- CSRF protection
- Rate limiting
- Audit logging

---

## 📈 Success Metrics

### Quantitative Targets

| Metric | Baseline | Target (6 months) | Target (12 months) |
|--------|----------|-------------------|-------------------|
| B+R Rate | 2.0-3.7% | < 2.5% | < 2.0% |
| Cost of Quality | $0.35/tire | $0.28/tire | $0.25/tire |
| Defect Detection Time | 2-4 hours | < 30 minutes | < 15 minutes |
| Root Cause Resolution | 7-14 days | 3-5 days | 1-3 days |
| Inspector Productivity | 100 inspections/day | 130 inspections/day | 150 inspections/day |
| Report Generation Time | 2-4 hours | < 5 minutes | < 2 minutes |

### Qualitative Goals

- **User Satisfaction**: 80%+ satisfaction score
- **System Adoption**: 90%+ daily active users
- **Data Quality**: 95%+ data accuracy
- **Management Confidence**: Improved decision-making speed
- **Cultural Shift**: Data-driven quality culture

---

## 📅 Implementation Timeline

### Phase 1: Foundation (Weeks 1-2)
- ✅ Database schema design
- ✅ TypeScript types definition
- ✅ Google Drive data pipeline
- ✅ Analytics engine core

### Phase 2: Core Features (Weeks 3-6)
- ✅ Plant Manager dashboard
- 🚧 QC Manager dashboard
- 🚧 Production Supervisor dashboard
- 🚧 Real-time monitoring
- 🚧 Alert system

### Phase 3: Mobile & Intelligence (Weeks 7-9)
- ⏳ Mobile inspection app (PWA)
- ⏳ QC Inspector interface
- ⏳ Production Operator interface
- ⏳ AI-powered root cause analysis
- ⏳ Anomaly detection

### Phase 4: Polish & Testing (Weeks 10-11)
- ⏳ User acceptance testing
- ⏳ Performance optimization
- ⏳ Training materials (English + Burmese)
- ⏳ Documentation

### Phase 5: Pilot Deployment (Weeks 12-15)
- ⏳ Start with PD-4 Curing line
- ⏳ Run parallel with paper system
- ⏳ On-site support
- ⏳ Gather feedback
- ⏳ Expand to all lines

**Total Timeline**: 12-15 weeks from start to full Plant B deployment

---

## 👥 Stakeholders

### Primary Users

**Mr. Wu (Plant Manager)**
- Needs: Executive overview, quick decision-making, cost visibility
- Pain Points: Delayed quality information, manual report compilation
- Success Criteria: Can see B+R rate and top issues in < 30 seconds

**QC Manager**
- Needs: Detailed defect analysis, inspector management, root cause tracking
- Pain Points: Data entry burden, lost information, manual analysis
- Success Criteria: Can identify quality trends and root causes quickly

**Production Supervisors (4 lines)**
- Needs: Line-specific quality data, operator management, real-time alerts
- Pain Points: No visibility into operator performance, reactive problem-solving
- Success Criteria: Can proactively prevent quality issues

**QC Inspectors (8-10 people)**
- Needs: Simple inspection workflow, mobile access, bilingual support
- Pain Points: Paper forms, data entry, unclear standards
- Success Criteria: Can complete inspections 30% faster

**Production Operators (40+ people)**
- Needs: Quality feedback, performance visibility, simple interface
- Pain Points: No feedback on quality, don't know what causes defects
- Success Criteria: Understand their quality performance and how to improve

---

## 🌍 Bilingual Support

### Languages
- **English**: Primary language for management and documentation
- **Burmese (Myanmar)**: For production floor personnel

### Bilingual Features
- All defect type names (English + Burmese)
- Mobile inspection interface (switchable)
- Operator dashboard (Burmese default)
- Voice input (Burmese speech recognition)
- Training materials (both languages)

### Common Burmese Terms
- Quality: အရည်အသွေး (A-yay-a-thway)
- Defect: ချို့ယွင်းချက် (Cho-yin-chit)
- Inspection: စစ်ဆေးခြင်း (Sit-hsay-chin)
- Production: ထုတ်လုပ်မှု (Htote-lote-hmu)
- Tire: တာယာ (Ta-ya)

---

## 🔧 Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- AWS account
- Google Drive API credentials
- Anthropic API key (for Claude AI)

### Setup

```bash
# Clone repository
git clone https://github.com/swanhtet01/swanhtet01.github.io.git
cd swanhtet01.github.io/ytf-dqms

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npm run db:push

# Seed initial data (production lines, defect types, tire models)
npm run db:seed

# Start development server
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ytf_dqms

# Google Drive
GDRIVE_REMOTE=manus_google_drive
GDRIVE_CONFIG_PATH=/home/ubuntu/.gdrive-rclone.ini

# AWS
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET=ytf-dqms-photos

# Anthropic AI
ANTHROPIC_API_KEY=your_anthropic_key

# Authentication
JWT_SECRET=your_jwt_secret
OAUTH_SERVER_URL=your_oauth_url

# Alerts
SMS_API_KEY=your_sms_api_key
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_FROM=alerts@ytf-dqms.com
```

---

## 📚 Documentation

### For Developers
- [Database Schema](./lib/schema.ts)
- [TypeScript Types](./types/index.ts)
- [Analytics Engine](./lib/analytics.ts)
- [Google Drive Sync](./lib/gdrive-sync.ts)
- [API Documentation](./docs/api.md)

### For Users
- [Plant Manager Guide](./docs/plant-manager-guide.md)
- [QC Manager Guide](./docs/qc-manager-guide.md)
- [Inspector Mobile App Guide](./docs/inspector-app-guide.md)
- [Operator Dashboard Guide](./docs/operator-guide.md)

### For Administrators
- [Deployment Guide](./docs/deployment.md)
- [Backup & Recovery](./docs/backup-recovery.md)
- [Troubleshooting](./docs/troubleshooting.md)

---

## 🤝 Support

### Internal Support
- **Technical Issues**: IT Department
- **Training**: QC Manager + System Administrator
- **Feature Requests**: Submit via in-app feedback

### External Support
- **System Development**: swanhtet01@gmail.com
- **AWS Infrastructure**: AWS Support
- **Emergency Hotline**: [To be configured]

---

## 📝 License

Proprietary - Yangon Tyre Factory Internal Use Only

---

## 🎓 Acknowledgments

**Based on actual Plant B operational data and informed by interviews with:**
- Mr. Wu (Plant Manager)
- QC Manager
- Production Supervisors
- QC Inspectors
- Production Operators

**Built with insights from:**
- B Condition 2025.xlsx
- Weekly Tyre Production - 2025.xlsx
- Daily Production Meeting Form.xlsx
- Down Time Record.xlsx
- Plant B Interview Package

---

**Version**: 1.0.0-beta  
**Last Updated**: December 2024  
**Status**: Development → Pilot Deployment Preparation
