# Yangon Tyre - Complete ERP+DQMS Deployment Plan

## Project Overview

### Live Demo & Status
- **Public URL**: https://ytf.supermega.dev (served from this repo's `/ytf-demo.html`).
- **Data feed**: front-end fetches `aws_status_report.json` every 60 seconds and renders real-time agent, API, and IoT connectivity states.
- **Agent guardrails**: the Conscience agent watches the status feed and will auto-roll back or redeploy workloads if two consecutive failures occur.
- **Demo narrative**: walk prospects through OEE, DQMS, supplier agent, and predictive maintenance loops while highlighting the dual-plane intent fabric powering the experience.


**Client**: Yangon Tyre Factory
**Timeline**: 12 weeks from contract to production
**Budget**: $50,000 initial setup + $2,000/month AWS + $1,500/month support

---

## Phase 1: Discovery & Setup (Week 1-2)

### Business Requirements
- Current production capacity: X units/day
- Number of machines: Y
- Shift patterns: 3 shifts, 24/7 operation
- Quality parameters: Visual inspection, dimensional checks, compound testing
- Current pain points:
  - Manual log books prone to errors
  - Delayed quality issue detection
  - Unclear downtime reasons
  - Inventory discrepancies
  - Slow supplier response

### Technical Assessment
- Existing systems: SAP/Excel/Paper-based
- Network infrastructure: WiFi coverage on shop floor
- Hardware available: Tablets, cameras, barcode scanners
- Integration points: Accounting system, PLC data (if available)

### AWS Account Setup
```bash
# 1. Create AWS account (use Asia Pacific region)
# 2. Set up IAM users and roles
# 3. Configure billing alerts
# 4. Set up VPC with proper security groups

terraform init
terraform apply -var="project=yangon-tyre" -var="region=ap-southeast-1"
```

---

## Phase 2: Infrastructure Deployment (Week 2-3)

### AWS Resources Provisioned

```yaml
Infrastructure:
  Compute:
    - EC2 t3.large (Agent Orchestrator)
    - ECS Fargate (API services)
    
  Database:
    - RDS PostgreSQL db.t3.medium (Multi-AZ)
      - Storage: 100GB, auto-scaling enabled
      - Backup: Daily snapshots, 7-day retention
    
  Storage:
    - S3 Buckets:
      - yangon-tyre-defect-images
      - yangon-tyre-documents
      - yangon-tyre-backups
    
  Caching:
    - ElastiCache Redis (cache.t3.micro)
    
  AI/ML:
    - SageMaker endpoint (defect detection model)
    - Rekognition (visual inspection)
    
  Monitoring:
    - CloudWatch dashboards
    - SNS for alerts
    - X-Ray for tracing
```

### Database Schema

```sql
-- Core tables for Yangon Tyre

-- Production Log
CREATE TABLE production_logs (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL,
    operator_id VARCHAR(50) NOT NULL,
    shift_date DATE NOT NULL,
    shift_type VARCHAR(20) NOT NULL, -- day/night/graveyard
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    target_quantity INT NOT NULL,
    actual_quantity INT DEFAULT 0,
    good_quantity INT DEFAULT 0,
    reject_quantity INT DEFAULT 0,
    downtime_minutes INT DEFAULT 0,
    downtime_reason TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- OEE Calculation
CREATE TABLE oee_metrics (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL,
    shift_date DATE NOT NULL,
    shift_type VARCHAR(20) NOT NULL,
    availability_percent DECIMAL(5,2),
    performance_percent DECIMAL(5,2),
    quality_percent DECIMAL(5,2),
    oee_percent DECIMAL(5,2),
    calculated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(machine_id, shift_date, shift_type)
);

-- Quality Inspection
CREATE TABLE quality_inspections (
    id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) NOT NULL,
    product_code VARCHAR(50) NOT NULL,
    inspection_type VARCHAR(50) NOT NULL, -- incoming/in-process/final
    inspector_id VARCHAR(50) NOT NULL,
    inspection_datetime TIMESTAMP NOT NULL,
    passed BOOLEAN,
    defect_codes TEXT[], -- Array of defect codes
    defect_images TEXT[], -- S3 URLs
    measurements JSONB, -- Dynamic measurements
    remarks TEXT,
    corrective_action TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Defect Master
CREATE TABLE defect_master (
    defect_code VARCHAR(20) PRIMARY KEY,
    defect_description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL, -- critical/major/minor
    category VARCHAR(50), -- visual/dimensional/functional
    active BOOLEAN DEFAULT TRUE
);

-- Material Inventory
CREATE TABLE material_inventory (
    id SERIAL PRIMARY KEY,
    material_code VARCHAR(50) NOT NULL,
    material_name VARCHAR(200) NOT NULL,
    location VARCHAR(100) NOT NULL,
    lot_number VARCHAR(50),
    quantity DECIMAL(12,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    min_stock DECIMAL(12,2),
    max_stock DECIMAL(12,2),
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(material_code, location, lot_number)
);

-- Material Transactions
CREATE TABLE material_transactions (
    id SERIAL PRIMARY KEY,
    transaction_type VARCHAR(20) NOT NULL, -- receipt/issue/adjustment
    material_code VARCHAR(50) NOT NULL,
    lot_number VARCHAR(50),
    quantity DECIMAL(12,2) NOT NULL,
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    reference_doc VARCHAR(100), -- PO number, production order, etc.
    transaction_datetime TIMESTAMP NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Equipment Maintenance
CREATE TABLE equipment_maintenance (
    id SERIAL PRIMARY KEY,
    equipment_id VARCHAR(50) NOT NULL,
    maintenance_type VARCHAR(50) NOT NULL, -- preventive/breakdown/predictive
    scheduled_date DATE,
    completed_date DATE,
    technician_id VARCHAR(50),
    work_description TEXT,
    parts_used JSONB,
    downtime_minutes INT,
    next_maintenance_date DATE,
    status VARCHAR(20), -- scheduled/in-progress/completed
    created_at TIMESTAMP DEFAULT NOW()
);

-- Equipment Sensors (IoT data)
CREATE TABLE equipment_sensors (
    id SERIAL PRIMARY KEY,
    equipment_id VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL, -- temperature/pressure/vibration
    reading_value DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20),
    reading_datetime TIMESTAMP NOT NULL,
    alert_triggered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Suppliers
CREATE TABLE suppliers (
    supplier_code VARCHAR(50) PRIMARY KEY,
    supplier_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(50),
    address TEXT,
    payment_terms VARCHAR(50),
    lead_time_days INT,
    rating DECIMAL(3,2), -- 0-5 rating
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE purchase_orders (
    po_number VARCHAR(50) PRIMARY KEY,
    supplier_code VARCHAR(50) NOT NULL REFERENCES suppliers(supplier_code),
    po_date DATE NOT NULL,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    total_amount DECIMAL(12,2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(20), -- draft/sent/acknowledged/delivered/closed
    created_by VARCHAR(50),
    approved_by VARCHAR(50),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- PO Line Items
CREATE TABLE po_line_items (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) NOT NULL REFERENCES purchase_orders(po_number),
    line_number INT NOT NULL,
    material_code VARCHAR(50) NOT NULL,
    description TEXT,
    quantity DECIMAL(12,2) NOT NULL,
    unit VARCHAR(20),
    unit_price DECIMAL(12,2),
    total_price DECIMAL(12,2),
    received_quantity DECIMAL(12,2) DEFAULT 0,
    UNIQUE(po_number, line_number)
);

-- Supplier Communications (AI Agent logs)
CREATE TABLE supplier_communications (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) NOT NULL REFERENCES suppliers(supplier_code),
    communication_type VARCHAR(50), -- email/call/meeting
    subject TEXT,
    message_body TEXT,
    sent_by VARCHAR(50), -- user or 'AI-Agent'
    sent_datetime TIMESTAMP NOT NULL,
    response_received BOOLEAN DEFAULT FALSE,
    response_datetime TIMESTAMP,
    related_po VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users & Roles
CREATE TABLE users (
    user_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(100),
    full_name VARCHAR(200),
    role VARCHAR(50), -- admin/manager/operator/qc/maintenance
    department VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Agent Activity Log
CREATE TABLE agent_activity_log (
    id SERIAL PRIMARY KEY,
    agent_type VARCHAR(50) NOT NULL,
    task_description TEXT NOT NULL,
    input_data JSONB,
    output_data JSONB,
    status VARCHAR(20), -- success/failed/in-progress
    execution_time_ms INT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_production_logs_machine_date ON production_logs(machine_id, shift_date);
CREATE INDEX idx_quality_inspections_batch ON quality_inspections(batch_number);
CREATE INDEX idx_quality_inspections_date ON quality_inspections(inspection_datetime);
CREATE INDEX idx_material_inventory_code ON material_inventory(material_code);
CREATE INDEX idx_equipment_sensors_equipment_date ON equipment_sensors(equipment_id, reading_datetime);
CREATE INDEX idx_po_status ON purchase_orders(status);
```

---

## Phase 3: Module Development (Week 3-8)

### Module 1: OEE Dashboard (Week 3-4)

**Frontend**: React + TypeScript + Recharts
**Backend**: FastAPI + SQLAlchemy

```typescript
// Real-time OEE Dashboard Component
interface OEEData {
  machineId: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  status: 'running' | 'idle' | 'down';
}

const OEEDashboard: React.FC = () => {
  const [oeeData, setOeeData] = useState<OEEData[]>([]);
  
  useEffect(() => {
    // WebSocket connection for real-time updates
    const ws = new WebSocket('wss://api.yangon-tyre.supermega.dev/ws/oee');
    ws.onmessage = (event) => {
      setOeeData(JSON.parse(event.data));
    };
    return () => ws.close();
  }, []);
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {oeeData.map(machine => (
        <OEECard key={machine.machineId} data={machine} />
      ))}
    </div>
  );
};
```

**API Endpoint**:
```python
from fastapi import FastAPI, WebSocket
from sqlalchemy.orm import Session

@app.get("/api/oee/current")
async def get_current_oee(db: Session):
    """Get current shift OEE for all machines"""
    return calculate_oee_all_machines(db)

@app.websocket("/ws/oee")
async def oee_websocket(websocket: WebSocket):
    """Real-time OEE updates"""
    await websocket.accept()
    while True:
        data = await get_realtime_oee()
        await websocket.send_json(data)
        await asyncio.sleep(5)
```

---

### Module 2: Quality Inspection Mobile App (Week 4-5)

**Tech**: React Native + AWS Amplify

```typescript
// Mobile QC Inspection Form
const DefectCaptureScreen: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [defects, setDefects] = useState<string[]>([]);
  
  const captureImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true
    });
    
    if (!result.cancelled) {
      setImage(result.uri);
      
      // AI analysis
      const analysis = await analyzeDefect(result.base64);
      setDefects(analysis.detected_defects);
    }
  };
  
  const submitInspection = async () => {
    const s3Url = await uploadToS3(image);
    
    await fetch('https://api.yangon-tyre.supermega.dev/api/quality/inspection', {
      method: 'POST',
      body: JSON.stringify({
        batchNumber: batchNumber,
        defectCodes: defects,
        imageUrl: s3Url,
        inspectorId: currentUser.id
      })
    });
    
    Alert.alert('Success', 'Inspection logged');
  };
  
  return (
    <View>
      <Button title="Capture Defect" onPress={captureImage} />
      {image && <Image source={{ uri: image }} />}
      <DefectSelector selected={defects} onChange={setDefects} />
      <Button title="Submit" onPress={submitInspection} />
    </View>
  );
};
```

---

### Module 3: Inventory Management (Week 5-6)

**Features**:
- Barcode scanning for receipts/issues
- FIFO tracking
- Min/Max alerts
- Material traceability

```python
# FastAPI endpoint for material transaction
@app.post("/api/inventory/transaction")
async def create_transaction(
    transaction: MaterialTransaction,
    db: Session,
    current_user: User
):
    """Create material transaction and update inventory"""
    
    # Update inventory
    if transaction.transaction_type == "issue":
        # Check stock availability
        stock = get_material_stock(db, transaction.material_code, transaction.from_location)
        if stock < transaction.quantity:
            raise HTTPException(400, "Insufficient stock")
        
        # Update inventory (FIFO)
        update_inventory_fifo(db, transaction)
    
    elif transaction.transaction_type == "receipt":
        # Add to inventory
        add_to_inventory(db, transaction)
    
    # Log transaction
    db.add(transaction)
    db.commit()
    
    # Check if reorder needed
    await check_reorder_point(db, transaction.material_code)
    
    return {"status": "success", "transaction_id": transaction.id}
```

---

### Module 4: Predictive Maintenance (Week 6-7)

**ML Model**: Train on historical breakdown data

```python
# SageMaker model training script
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import boto3

def train_maintenance_model():
    # Load historical data
    data = pd.read_sql("SELECT * FROM equipment_sensors", conn)
    
    # Feature engineering
    features = engineer_features(data)
    
    # Train model
    model = RandomForestClassifier(n_estimators=100)
    model.fit(X_train, y_train)
    
    # Deploy to SageMaker
    deploy_to_sagemaker(model, 'maintenance-predictor')

# Real-time prediction
@app.get("/api/maintenance/predict/{equipment_id}")
async def predict_maintenance(equipment_id: str, db: Session):
    """Predict maintenance needs"""
    
    # Get recent sensor readings
    readings = get_recent_readings(db, equipment_id, days=7)
    
    # Call SageMaker endpoint
    prediction = sagemaker_runtime.invoke_endpoint(
        EndpointName='maintenance-predictor',
        Body=json.dumps({'readings': readings})
    )
    
    result = json.loads(prediction['Body'].read())
    
    if result['failure_probability'] > 0.7:
        # Create maintenance task automatically
        await create_maintenance_task(db, equipment_id, 'predictive')
        
        # Send alert
        await send_alert(f"Equipment {equipment_id} requires maintenance")
    
    return result
```

---

### Module 5: Supplier Communication Agent (Week 7-8)

**Autonomous email handling**:

```python
class SupplierCommunicationAgent:
    """AI Agent for supplier interactions"""
    
    async def monitor_purchase_orders(self):
        """Check POs and send follow-ups"""
        overdue_pos = get_overdue_pos()
        
        for po in overdue_pos:
            # Generate follow-up email
            email_body = await self.generate_followup_email(po)
            
            # Send via SES
            await send_email(
                to=po.supplier.email,
                subject=f"Follow-up: PO #{po.po_number}",
                body=email_body
            )
            
            # Log communication
            log_communication(po, email_body)
    
    async def generate_followup_email(self, po: PurchaseOrder) -> str:
        """Use Claude to generate professional email"""
        prompt = f"""
        Generate a professional follow-up email for:
        - PO Number: {po.po_number}
        - Supplier: {po.supplier.name}
        - Expected Delivery: {po.expected_delivery_date}
        - Days Overdue: {(datetime.now() - po.expected_delivery_date).days}
        
        Tone: Professional but urgent
        """
        
        response = await claude_client.ainvoke(prompt)
        return response.content
    
    async def auto_create_purchase_order(self, material_code: str):
        """Automatically create PO when stock is low"""
        material = get_material(material_code)
        supplier = get_preferred_supplier(material_code)
        
        # Calculate order quantity
        order_qty = material.max_stock - get_current_stock(material_code)
        
        # Create PO
        po = PurchaseOrder(
            po_number=generate_po_number(),
            supplier_code=supplier.code,
            expected_delivery_date=datetime.now() + timedelta(days=supplier.lead_time_days),
            status='draft'
        )
        
        po_line = POLineItem(
            material_code=material_code,
            quantity=order_qty,
            unit_price=material.last_price
        )
        
        # Save to database
        db.add(po)
        db.add(po_line)
        db.commit()
        
        # Send email to supplier
        email_body = await self.generate_po_email(po)
        await send_email(supplier.email, f"Purchase Order {po.po_number}", email_body)
        
        return po
```

---

## Phase 4: Agent Integration (Week 8-10)

### Deploy All Agents on EC2

```bash
# Start agent orchestrator
cd ~/supermega-agents
docker-compose up -d

# Verify agents are running
docker ps

# Check logs
docker logs supermega-orchestrator --tail=100 -f
```

### Schedule Recurring Tasks

```python
# Celery beat schedule
from celery import Celery
from celery.schedules import crontab

app = Celery('yangon-tyre')

@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    # Every hour: Calculate OEE
    sender.add_periodic_task(3600.0, calculate_hourly_oee.s())
    
    # Every day at 6 AM: Generate production report
    sender.add_periodic_task(
        crontab(hour=6, minute=0),
        generate_daily_report.s()
    )
    
    # Every day at 8 AM: Check overdue POs
    sender.add_periodic_task(
        crontab(hour=8, minute=0),
        check_overdue_pos.s()
    )
    
    # Every week: Supplier performance review
    sender.add_periodic_task(
        crontab(day_of_week=1, hour=9, minute=0),
        analyze_supplier_performance.s()
    )
    
    # Real-time: Equipment health monitoring
    sender.add_periodic_task(300.0, monitor_equipment_health.s())
```

---

## Phase 5: User Training & Go-Live (Week 10-12)

### Training Plan

**Week 10**: Management & IT Team
- System overview
- Dashboard navigation
- Report generation
- User management

**Week 11**: Operators & QC Team
- Mobile app training
- Production log entry
- Quality inspection process
- Defect reporting

**Week 12**: Soft Launch
- Run parallel with existing system
- Daily sync meetings
- Issue resolution
- Performance tuning

---

## Success Metrics (Post-Launch)

### Month 1
- 95% operator adoption of mobile app
- 100% production data digitized
- Zero system downtime

### Month 3
- 30% reduction in defect escapes
- 20% improvement in OEE
- 50% faster quality issue response

### Month 6
- 40% reduction in inventory carrying cost
- Predictive maintenance accuracy >80%
- Full ROI documentation

---

## Support & Maintenance

### Included in $1,500/month
- 24/7 system monitoring
- Agent performance optimization
- Monthly feature updates
- User support (email + phone)
- AWS infrastructure management
- Data backup & disaster recovery

### SLA
- 99.9% uptime guarantee
- <4 hour response time for critical issues
- Monthly system health reports

---

## Total Investment

**Initial Setup**: $50,000
- Infrastructure: $15,000
- Development: $25,000
- Training: $5,000
- Contingency: $5,000

**Monthly Recurring**: $3,500
- AWS: $2,000
- Support: $1,500

**ROI**: 12-15 months based on efficiency gains

---

## Next Steps

1. Sign contract and initiate AWS setup (Week 1)
2. Kick-off meeting with Yangon Tyre team
3. Begin infrastructure provisioning
4. Iterative development with bi-weekly demos
5. Go-live celebration 🎉


