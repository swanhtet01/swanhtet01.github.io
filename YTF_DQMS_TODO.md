# YTF DIGITAL QUALITY MANAGEMENT SYSTEM - DEVELOPMENT TODO

**Project:** AI-Native ERP Platform for Yangon Tyre Factory  
**Module:** DQMS (Digital Quality Management System) - First Module  
**Target:** Plant B Pilot Deployment  
**Platform:** swanhtet01.github.io + AWS Infrastructure

---

## PHASE 1: CORE DATA MODELS & DATABASE SCHEMA ✓

### Database Schema (Drizzle ORM + PostgreSQL)
- [ ] Create `defects` table with Plant B defect types
  - Inner Separation, Inner Barecord, Sidewall Crack, Bead Deformation, etc.
  - Defect severity (A/B/R grade)
  - Timestamp, production line, operator, shift
  - Tire serial number, tire size/model
  - Root cause (if identified)
  - Cost impact
  - Status (open, investigating, resolved)

- [ ] Create `production_lines` table
  - PD-1 (Mixing: 270L Mixer, 100L Mixer)
  - PD-2 (Extrusion & Calendering)
  - PD-3 (Building)
  - PD-4 (Curing)
  - Line capacity, target output, current status

- [ ] Create `tire_models` table
  - 185/70 R14, 195 R14 C, 195 R15 C, 205/70 R15 C (radial)
  - Motorcycle tire sizes
  - Bias/nylon tire sizes
  - Target weight, tolerance ranges
  - Standard process parameters

- [ ] Create `quality_inspections` table
  - Inspection timestamp
  - Inspector ID
  - Production line
  - Tire serial number
  - Inspection type (in-process, final, random)
  - Result (A/B/R grade)
  - Defects found (array of defect IDs)
  - Photos (S3 URLs)
  - Notes

- [ ] Create `production_batches` table
  - Batch ID
  - Tire model
  - Production line
  - Start time, end time
  - Quantity produced
  - A/B/R grade counts
  - Operator assignments
  - Material batch numbers
  - Machine settings

- [ ] Create `operators` table
  - Operator ID, name
  - Production line assignment
  - Shift (day/night)
  - Skill level
  - Quality performance metrics
  - Training records

- [ ] Create `quality_metrics_daily` table
  - Date, production line
  - Total production
  - A/B/R grade counts and percentages
  - Top defect types
  - Cost of quality
  - Operator performance summary

- [ ] Create `down_time_events` table
  - Event timestamp
  - Production line
  - Down time type (machine failure, compound change, rest time, size change)
  - Duration
  - Impact on production
  - Resolution notes

- [ ] Create `root_cause_analysis` table
  - Defect ID or defect pattern
  - Investigation start/end time
  - Root cause identified
  - Corrective actions
  - Preventive actions
  - Responsible person
  - Status (open, in-progress, closed)
  - Effectiveness verification

---

## PHASE 2: GOOGLE DRIVE DATA PIPELINE ✓

### ETL Process for Plant B Data
- [ ] Build Google Drive connector using rclone + Node.js
  - Connect to "Yangon Tyre" starred folder
  - Authenticate with service account

- [ ] Extract data from Plant B Excel files:
  - [ ] `B Condition 2025.xlsx` → defects table
  - [ ] `Weekly Tyre Production - 2025.xlsx` → production_batches table
  - [ ] `Daily Production Meeting Form.xlsx` → quality_metrics_daily table
  - [ ] `Down Time Record.xlsx` → down_time_events table
  - [ ] `PD-3 Size Changing Form.xlsx` → down_time_events table
  - [ ] `Monthly Tyre Production For 2024.xlsx` → historical analysis

- [ ] Transform data:
  - Parse Burmese text fields
  - Normalize defect type names
  - Calculate B+R rates
  - Map tire sizes to standard format
  - Handle missing/malformed data
  - Convert dates to ISO format

- [ ] Load data into PostgreSQL:
  - Upsert logic (don't duplicate)
  - Data validation rules
  - Error logging
  - Success/failure tracking

- [ ] Schedule automated sync:
  - Every 15 minutes for real-time data
  - Daily full sync for historical data
  - Alert on sync failures

- [ ] Build data quality checks:
  - Validate B+R rate calculations
  - Check for data anomalies
  - Flag suspicious patterns
  - Monitor data freshness

---

## PHASE 3: REAL-TIME MONITORING & ALERTS ✓

### Live Quality Dashboard
- [ ] Build WebSocket server for real-time updates
- [ ] Implement server-sent events (SSE) for dashboard updates
- [ ] Create real-time B+R rate calculator
- [ ] Build alert engine:
  - [ ] B+R rate exceeds threshold (3.0%)
  - [ ] Defect spike detected (5+ same defect in 2 hours)
  - [ ] Production line quality degradation
  - [ ] Operator performance anomaly
  - [ ] Machine down time exceeds normal

- [ ] Alert delivery:
  - [ ] In-app notifications
  - [ ] SMS alerts (for critical issues)
  - [ ] Email alerts (for management)
  - [ ] Mobile push notifications

- [ ] Alert configuration:
  - [ ] User-defined thresholds
  - [ ] Alert escalation rules
  - [ ] Snooze/acknowledge functionality
  - [ ] Alert history and analytics

---

## PHASE 4: ADVANCED ANALYTICS ENGINE ✓

### Statistical Analysis
- [ ] Calculate SPC (Statistical Process Control) charts:
  - [ ] X-bar and R charts for tire weight
  - [ ] P-charts for defect rates
  - [ ] C-charts for defect counts
  - [ ] Control limits (UCL, LCL)
  - [ ] Process capability indices (Cp, Cpk)

- [ ] Trend analysis:
  - [ ] Daily/weekly/monthly B+R rate trends
  - [ ] Defect type trends (increasing/decreasing)
  - [ ] Production line performance trends
  - [ ] Operator performance trends
  - [ ] Shift comparison (day vs. night)

- [ ] Correlation analysis:
  - [ ] Defects vs. machine settings
  - [ ] Defects vs. material batches
  - [ ] Defects vs. operator experience
  - [ ] Defects vs. production speed
  - [ ] Down time vs. quality issues

- [ ] Cost of Quality calculation:
  - [ ] Internal failure costs (rework, scrap)
  - [ ] External failure costs (warranty, returns)
  - [ ] Appraisal costs (inspection, testing)
  - [ ] Prevention costs (training, process improvement)
  - [ ] Total COQ as % of sales

### Predictive Analytics (AI/ML)
- [ ] Build defect prediction model:
  - [ ] Train on historical Plant B data
  - [ ] Features: machine settings, material properties, operator, time of day
  - [ ] Predict probability of defects before they occur
  - [ ] Confidence scores

- [ ] Build quality degradation detector:
  - [ ] Detect early signs of quality decline
  - [ ] Alert before B+R rate exceeds threshold
  - [ ] Suggest preventive actions

- [ ] Build root cause suggestion engine:
  - [ ] Use Claude AI to analyze defect patterns
  - [ ] Suggest likely root causes based on historical data
  - [ ] Provide corrective action recommendations
  - [ ] Learn from resolved cases

---

## PHASE 5: ROLE-BASED DASHBOARDS ✓

### Plant Manager Dashboard (Mr. Wu)
- [ ] Executive summary view:
  - [ ] Today's B+R rate (vs. target 3.0%)
  - [ ] Production vs. quality balance
  - [ ] Cost of quality (daily/weekly/monthly)
  - [ ] Top 3 quality issues
  - [ ] Production line comparison

- [ ] Real-time alerts:
  - [ ] Critical quality issues
  - [ ] Production line down
  - [ ] B+R rate spike

- [ ] Trend charts:
  - [ ] B+R rate over time (line chart)
  - [ ] Defect types distribution (pie chart)
  - [ ] Production line performance (bar chart)
  - [ ] Cost of quality trend (line chart)

- [ ] Quick actions:
  - [ ] View detailed defect report
  - [ ] Initiate root cause analysis
  - [ ] Review operator performance
  - [ ] Export reports for headquarters

### QC Manager Dashboard
- [ ] Operational overview:
  - [ ] Today's inspection summary
  - [ ] Inspector workload distribution
  - [ ] Pending root cause analyses
  - [ ] Open CAPA (Corrective and Preventive Actions)

- [ ] Defect analysis:
  - [ ] Defect type breakdown (detailed)
  - [ ] Defect trends by production line
  - [ ] Defect trends by tire model
  - [ ] Defect trends by shift
  - [ ] Pareto chart (80/20 analysis)

- [ ] Inspector performance:
  - [ ] Inspections completed per inspector
  - [ ] Defect detection rate
  - [ ] Inspection consistency (inter-rater reliability)
  - [ ] Training needs identification

- [ ] Root cause tools:
  - [ ] Fishbone diagram generator
  - [ ] 5 Whys analysis template
  - [ ] Correlation matrix
  - [ ] AI-suggested root causes

- [ ] Reporting:
  - [ ] Daily quality report (auto-generated)
  - [ ] Weekly quality summary
  - [ ] Monthly quality review
  - [ ] Custom report builder

### Production Supervisor Dashboard
- [ ] Line performance:
  - [ ] My line's B+R rate (real-time)
  - [ ] Production vs. quality balance
  - [ ] Operator performance on my line
  - [ ] Machine status and down time

- [ ] Alerts:
  - [ ] Quality issues on my line
  - [ ] Operator needs attention
  - [ ] Machine maintenance required

- [ ] Operator management:
  - [ ] Individual operator quality scores
  - [ ] Operator comparison (not public)
  - [ ] Training recommendations
  - [ ] Shift handover notes

- [ ] Quick actions:
  - [ ] Report quality issue
  - [ ] Request maintenance
  - [ ] Adjust machine settings
  - [ ] Reassign operators

### QC Inspector Mobile Interface
- [ ] Inspection workflow:
  - [ ] Scan tire serial number (barcode/QR)
  - [ ] Select defect type (visual buttons)
  - [ ] Take photo of defect
  - [ ] Mark defect location on tire diagram
  - [ ] Assign grade (A/B/R)
  - [ ] Submit inspection (offline-capable)

- [ ] Bilingual support:
  - [ ] English + Burmese UI
  - [ ] Burmese defect type names
  - [ ] Voice input (Burmese)

- [ ] Inspection history:
  - [ ] My inspections today
  - [ ] Defects I found
  - [ ] My inspection rate
  - [ ] Feedback from QC Manager

- [ ] Help & guidance:
  - [ ] Defect identification guide (photos)
  - [ ] Inspection standards
  - [ ] Who to contact for questions

### Production Operator Interface
- [ ] Quality scoreboard:
  - [ ] My quality score today
  - [ ] Tires I made: A/B/R breakdown
  - [ ] My ranking (optional, if motivating)
  - [ ] Quality tips based on my defects

- [ ] Real-time feedback:
  - [ ] Alert when I produce B/R grade tire
  - [ ] Show what went wrong
  - [ ] Suggest what to check/adjust

- [ ] Bilingual support:
  - [ ] English + Burmese UI
  - [ ] Simple, visual interface
  - [ ] Large buttons for production floor

---

## PHASE 6: MOBILE-FIRST INSPECTION APP ✓

### Progressive Web App (PWA)
- [ ] Build PWA with offline capability
- [ ] Install on inspector tablets/phones
- [ ] Sync data when connection available
- [ ] Local storage for offline inspections

### Camera Integration
- [ ] Take photos of defects
- [ ] Annotate photos (draw on image)
- [ ] Multiple photos per defect
- [ ] Compress images for upload
- [ ] Upload to S3

### Barcode/QR Scanner
- [ ] Scan tire serial numbers
- [ ] Auto-populate tire information
- [ ] Validate serial number format
- [ ] Link to production batch

### Voice Input (Burmese)
- [ ] Voice-to-text for notes
- [ ] Burmese language support
- [ ] Hands-free operation option

---

## PHASE 7: ROOT CAUSE ANALYSIS & INTELLIGENCE ✓

### Guided RCA Workflow
- [ ] 5 Whys template with AI assistance
- [ ] Fishbone diagram (Ishikawa) generator
- [ ] Pareto analysis (80/20 rule)
- [ ] Correlation matrix
- [ ] Timeline reconstruction

### AI-Powered Insights (Claude Integration)
- [ ] Analyze defect patterns
- [ ] Suggest likely root causes
- [ ] Recommend corrective actions
- [ ] Learn from past RCA cases
- [ ] Generate RCA reports

### CAPA Management
- [ ] Create corrective actions
- [ ] Assign preventive actions
- [ ] Track action completion
- [ ] Verify effectiveness
- [ ] Close the loop

---

## PHASE 8: REPORTING & EXPORT ✓

### Automated Reports
- [ ] Daily quality summary (PDF)
- [ ] Weekly quality report (PDF + Excel)
- [ ] Monthly quality review (PowerPoint)
- [ ] Cost of quality report
- [ ] Executive dashboard (email)

### Custom Reports
- [ ] Report builder interface
- [ ] Select metrics, date range, filters
- [ ] Export to PDF, Excel, CSV
- [ ] Schedule recurring reports
- [ ] Email distribution lists

### Data Export
- [ ] Export raw data to Excel
- [ ] Export for external analysis
- [ ] API for data access
- [ ] Integration with headquarters systems

---

## PHASE 9: INTEGRATION & DEPLOYMENT ✓

### AWS Infrastructure
- [ ] Deploy to AWS ECS/Fargate
- [ ] Set up RDS PostgreSQL database
- [ ] Configure S3 for file storage
- [ ] Set up CloudFront CDN
- [ ] Configure Route 53 DNS
- [ ] Set up CloudWatch monitoring
- [ ] Configure AWS Secrets Manager

### Authentication & Authorization
- [ ] Implement user authentication (OAuth)
- [ ] Role-based access control (RBAC)
- [ ] Plant Manager, QC Manager, Supervisor, Inspector, Operator roles
- [ ] Permission management
- [ ] Audit logging

### Security
- [ ] HTTPS everywhere
- [ ] Data encryption at rest
- [ ] Data encryption in transit
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Rate limiting
- [ ] Security headers

### Performance
- [ ] Database query optimization
- [ ] Caching (Redis)
- [ ] Image optimization
- [ ] Lazy loading
- [ ] Code splitting
- [ ] Minification
- [ ] Gzip compression

---

## PHASE 10: TESTING & VALIDATION ✓

### Unit Tests
- [ ] Test data models
- [ ] Test business logic
- [ ] Test calculations (B+R rate, COQ)
- [ ] Test data transformations
- [ ] Test API endpoints

### Integration Tests
- [ ] Test Google Drive sync
- [ ] Test database operations
- [ ] Test real-time updates
- [ ] Test alert delivery
- [ ] Test report generation

### User Acceptance Testing
- [ ] Test with Mr. Wu (Plant Manager)
- [ ] Test with QC Manager
- [ ] Test with Production Supervisor
- [ ] Test with QC Inspector
- [ ] Test with Production Operator
- [ ] Gather feedback
- [ ] Iterate based on feedback

### Performance Testing
- [ ] Load testing (1000+ concurrent users)
- [ ] Stress testing
- [ ] Database performance
- [ ] API response times
- [ ] Real-time update latency

---

## PHASE 11: PILOT DEPLOYMENT AT PLANT B ✓

### Pre-Deployment
- [ ] Finalize system based on UAT feedback
- [ ] Prepare training materials (English + Burmese)
- [ ] Set up production environment
- [ ] Migrate historical data
- [ ] Configure alerts and thresholds

### Training
- [ ] Train Mr. Wu (Plant Manager)
- [ ] Train QC Manager
- [ ] Train Production Supervisors
- [ ] Train QC Inspectors (hands-on)
- [ ] Train Production Operators
- [ ] Provide quick reference guides
- [ ] Set up help desk

### Pilot Launch
- [ ] Start with one production line (PD-4 Curing recommended)
- [ ] Run parallel with paper system for 2 weeks
- [ ] Monitor adoption and usage
- [ ] Provide on-site support
- [ ] Gather feedback daily
- [ ] Fix issues quickly

### Expansion
- [ ] Add second production line (PD-3 Building)
- [ ] Add third production line (PD-2 Extrusion)
- [ ] Add fourth production line (PD-1 Mixing)
- [ ] Full Plant B deployment
- [ ] Evaluate for Plant A expansion

---

## PHASE 12: CONTINUOUS IMPROVEMENT ✓

### Monitoring
- [ ] Track system usage
- [ ] Monitor user adoption
- [ ] Track quality improvements
- [ ] Measure ROI
- [ ] Gather user feedback

### Iteration
- [ ] Weekly feedback sessions
- [ ] Monthly feature releases
- [ ] Quarterly major updates
- [ ] Continuous bug fixes
- [ ] Performance optimization

### Expansion Features
- [ ] Maintenance module integration
- [ ] Inventory module integration
- [ ] Production planning integration
- [ ] Supplier quality management
- [ ] Customer complaint tracking
- [ ] Full ERP integration

---

## SUCCESS METRICS

### Quantitative
- [ ] B+R rate reduction: Target 0.5-1.0% reduction in 6 months
- [ ] Cost of quality reduction: Target 20% reduction in 12 months
- [ ] Defect detection time: Target < 1 hour from production to visibility
- [ ] Root cause resolution time: Target 50% faster
- [ ] Inspector productivity: Target 30% more inspections per day
- [ ] Report generation time: Target 90% time savings

### Qualitative
- [ ] User satisfaction: Target 80%+ satisfaction score
- [ ] System adoption: Target 90%+ daily active users
- [ ] Data quality: Target 95%+ data accuracy
- [ ] Management confidence: Improved decision-making speed
- [ ] Cultural shift: Data-driven quality culture

---

## NOTES

**Current Status:** Planning phase complete, ready to start implementation

**Priority Order:**
1. Phase 1-2: Data foundation (1-2 weeks)
2. Phase 3-5: Core features and dashboards (3-4 weeks)
3. Phase 6-7: Mobile and intelligence (2-3 weeks)
4. Phase 8-10: Polish and testing (2 weeks)
5. Phase 11: Pilot deployment (4 weeks with support)

**Total Estimated Timeline:** 12-15 weeks from start to pilot launch

**Critical Path:**
- Google Drive data pipeline (must work reliably)
- Mobile inspection interface (must be easy for inspectors)
- Real-time dashboard (must be fast and accurate)
- Bilingual support (must support Burmese)

**Risk Mitigation:**
- Start with one production line to limit risk
- Run parallel with paper system initially
- Provide extensive training and support
- Build offline capability for network issues
- Have rollback plan if pilot fails
