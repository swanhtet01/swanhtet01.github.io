# Manufacturing Intelligence Template
## Adaptable for ANY Manufacturing Company

This template allows rapid deployment (4-6 weeks) for any manufacturing business.

---

## Configuration Wizard

## Intent & Agent Configuration
```yaml
intent_plane:
  beacons:
    storage: neptune
    mirror_cache: dynamodb
    schema: intent_id, domain, desired_outcome, deadline, constraints
  routing:
    orchestrator: langgraph
    subscribers:
      - oee_agent
      - dqms_agent
      - supplier_agent
self_sovereign_agents:
  base_ami: ami-supermega-agent-2024
  local_model: mixtral-8x7b-q4
  remote_models:
    - bedrock.claude-3-haiku
    - openai.gpt-4o-mini
    - gemini-1.5-pro
  router_service: agent-llm-router
  telemetry:
    heartbeat_metric: SuperMega/Agents
    logs: /supermega/agent-conscience
```

Use this block inside client-specific config.json files so every deployment encodes both the physical configuration and the metaphysical intent layer.
```json
{
  "company_profile": {
    "name": "ABC Manufacturing Co.",
    "industry": "automotive|food|pharma|electronics|chemicals|textiles|metals",
    "production_type": "discrete|continuous|batch|hybrid",
    "certifications": ["ISO9001", "ISO14001", "IATF16949"],
    "plant_locations": [
      {"name": "Plant 1", "country": "US", "timezone": "America/New_York"},
      {"name": "Plant 2", "country": "CN", "timezone": "Asia/Shanghai"}
    ],
    "scale": {
      "employee_count": 500,
      "machine_count": 50,
      "shifts_per_day": 3,
      "production_lines": 5
    }
  },
  
  "enabled_modules": {
    "oee_monitoring": true,
    "quality_management": true,
    "inventory_tracking": true,
    "maintenance": true,
    "supplier_management": true,
    "mobile_app": true,
    "advanced_analytics": false,
    "ai_vision_inspection": false
  },
  
  "custom_workflows": {
    "approval_hierarchy": ["operator", "supervisor", "manager", "director"],
    "quality_stages": ["incoming", "in-process", "final", "customer-return"],
    "maintenance_types": ["preventive", "breakdown", "predictive", "calibration"]
  },
  
  "product_specifics": {
    "product_categories": ["Category A", "Category B"],
    "quality_parameters": [
      {"name": "Dimension_Length", "type": "numeric", "unit": "mm", "tolerance": 0.5},
      {"name": "Weight", "type": "numeric", "unit": "kg", "tolerance": 0.1},
      {"name": "Visual_Defects", "type": "categorical", "options": ["None", "Minor", "Major"]}
    ],
    "material_types": ["Raw Material", "WIP", "Finished Goods", "Packaging"],
    "machine_types": ["CNC", "Injection Molding", "Assembly", "Testing"]
  },
  
  "integrations": {
    "existing_erp": {"type": "SAP", "api_available": true},
    "accounting": {"type": "QuickBooks", "api_available": true},
    "plc_systems": {"vendor": "Siemens", "protocol": "OPC-UA"},
    "scada": {"vendor": "Wonderware", "integration": "database"}
  },
  
  "compliance_requirements": {
    "data_retention_years": 7,
    "audit_trail": true,
    "electronic_signatures": true,
    "cfr_21_part_11": false,
    "gdpr_compliant": true
  }
}
```

---

## One-Command Deployment

```bash
#!/bin/bash
# deploy-manufacturing-os.sh

# Usage:
# ./deploy-manufacturing-os.sh \
#   --company "ABC Manufacturing" \
#   --industry automotive \
#   --config config.json \
#   --region us-east-1

set -e

echo "🏭 SuperMega Manufacturing OS Deployment"
echo "=========================================="

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --company) COMPANY="$2"; shift 2;;
    --industry) INDUSTRY="$2"; shift 2;;
    --config) CONFIG_FILE="$2"; shift 2;;
    --region) AWS_REGION="$2"; shift 2;;
    --environment) ENVIRONMENT="$2"; shift 2;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

# Validate inputs
if [ -z "$COMPANY" ] || [ -z "$INDUSTRY" ] || [ -z "$CONFIG_FILE" ]; then
  echo "Error: Missing required parameters"
  echo "Usage: ./deploy-manufacturing-os.sh --company NAME --industry TYPE --config FILE --region REGION"
  exit 1
fi

# Load configuration
echo "📋 Loading configuration from $CONFIG_FILE..."
CONFIG=$(cat $CONFIG_FILE)

# Generate unique identifiers
STACK_NAME=$(echo "$COMPANY" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')-mfg-os
DB_NAME="${STACK_NAME//-/_}_db"

echo "🚀 Deploying stack: $STACK_NAME"
echo "📍 Region: $AWS_REGION"
echo "🏢 Company: $COMPANY"
echo "🏭 Industry: $INDUSTRY"

# Step 1: Infrastructure
echo ""
echo "Step 1/6: Provisioning AWS Infrastructure..."
terraform init
terraform workspace new $STACK_NAME || terraform workspace select $STACK_NAME
terraform apply \
  -var="company_name=$COMPANY" \
  -var="industry=$INDUSTRY" \
  -var="region=$AWS_REGION" \
  -var="config=$CONFIG" \
  -auto-approve

# Get outputs
VPC_ID=$(terraform output -raw vpc_id)
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
S3_BUCKET=$(terraform output -raw s3_bucket)

echo "✅ Infrastructure ready"
echo "   VPC: $VPC_ID"
echo "   Database: $RDS_ENDPOINT"
echo "   Cache: $REDIS_ENDPOINT"

# Step 2: Database Setup
echo ""
echo "Step 2/6: Initializing database schema..."
psql -h $RDS_ENDPOINT -U admin -d $DB_NAME < schemas/base_schema.sql
psql -h $RDS_ENDPOINT -U admin -d $DB_NAME < schemas/industry_${INDUSTRY}.sql

echo "✅ Database schema created"

# Step 3: Seed Data
echo ""
echo "Step 3/6: Loading seed data..."
python3 scripts/seed_data.py \
  --config $CONFIG_FILE \
  --db $RDS_ENDPOINT \
  --db-name $DB_NAME

echo "✅ Seed data loaded"

# Step 4: Deploy Application
echo ""
echo "Step 4/6: Deploying application containers..."
docker-compose -f docker-compose.template.yml \
  -p $STACK_NAME \
  up -d

echo "✅ Application deployed"

# Step 5: Deploy Agents
echo ""
echo "Step 5/6: Starting autonomous agents..."
python3 scripts/deploy_agents.py \
  --config $CONFIG_FILE \
  --stack $STACK_NAME

echo "✅ Agents running"

# Step 6: Create Users
echo ""
echo "Step 6/6: Creating initial users..."
python3 scripts/create_users.py \
  --config $CONFIG_FILE \
  --admin-email admin@${COMPANY// /.com}

echo ""
echo "🎉 Deployment Complete!"
echo "=========================================="
echo "🌐 Dashboard URL: https://${STACK_NAME}.supermega.dev"
echo "📱 Mobile App: Available on iOS/Android app stores"
echo "🔑 Admin credentials sent to admin email"
echo "📚 Documentation: https://docs.supermega.dev"
echo ""
echo "⏰ System is now operational 24/7"
echo "🤖 AI Agents are monitoring and optimizing"
echo ""
echo "Need help? support@supermega.dev | +1-555-MEGA-AI"
```

---

## Industry-Specific Configurations

### Automotive Manufacturing

```sql
-- Industry-specific tables for automotive
CREATE TABLE vehicle_production (
    vin VARCHAR(17) PRIMARY KEY,
    model_code VARCHAR(50) NOT NULL,
    production_line VARCHAR(50),
    start_datetime TIMESTAMP,
    completion_datetime TIMESTAMP,
    quality_gate_passed JSONB, -- {"body_shop": true, "paint": true, "assembly": true}
    test_results JSONB,
    customer_order_number VARCHAR(50)
);

CREATE TABLE automotive_quality_checks (
    id SERIAL PRIMARY KEY,
    vin VARCHAR(17) REFERENCES vehicle_production(vin),
    check_station VARCHAR(50), -- "dimensional", "paint_thickness", "water_leak"
    check_datetime TIMESTAMP,
    passed BOOLEAN,
    measurements JSONB,
    inspector_id VARCHAR(50)
);
```

### Food & Beverage

```sql
-- Food industry specific
CREATE TABLE batch_production (
    batch_number VARCHAR(50) PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL,
    production_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    lot_size DECIMAL(12,2),
    production_line VARCHAR(50),
    haccp_verified BOOLEAN,
    allergen_declaration TEXT[],
    certificates JSONB -- {"halal": true, "organic": false}
);

CREATE TABLE temperature_monitoring (
    id SERIAL PRIMARY KEY,
    equipment_id VARCHAR(50),
    temperature_celsius DECIMAL(5,2),
    reading_datetime TIMESTAMP,
    in_spec BOOLEAN,
    alert_triggered BOOLEAN,
    corrective_action TEXT
);
```

### Pharmaceutical

```sql
-- Pharma specific (21 CFR Part 11 compliant)
CREATE TABLE batch_manufacturing_record (
    bmr_number VARCHAR(50) PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL,
    batch_size INT,
    manufacturing_date DATE,
    expiry_date DATE,
    electronic_signature JSONB, -- {"user_id": "...", "timestamp": "...", "meaning": "approved"}
    audit_trail JSONB[],
    deviation_reports TEXT[],
    released BOOLEAN DEFAULT FALSE,
    released_by VARCHAR(50),
    released_datetime TIMESTAMP
);

CREATE TABLE material_traceability (
    id SERIAL PRIMARY KEY,
    bmr_number VARCHAR(50) REFERENCES batch_manufacturing_record(bmr_number),
    material_code VARCHAR(50),
    material_lot VARCHAR(50),
    supplier_name VARCHAR(200),
    coa_number VARCHAR(50), -- Certificate of Analysis
    quantity_used DECIMAL(12,2),
    used_datetime TIMESTAMP,
    recorded_by VARCHAR(50)
);
```

### Electronics Assembly

```sql
-- Electronics specific
CREATE TABLE pcb_production (
    serial_number VARCHAR(50) PRIMARY KEY,
    pcb_model VARCHAR(50),
    smt_line VARCHAR(50),
    solder_paste_lot VARCHAR(50),
    reflow_profile VARCHAR(50),
    aoi_result JSONB, -- Automated Optical Inspection
    ict_result JSONB, -- In-Circuit Test
    functional_test_passed BOOLEAN,
    production_datetime TIMESTAMP
);

CREATE TABLE component_traceability (
    id SERIAL PRIMARY KEY,
    pcb_serial VARCHAR(50) REFERENCES pcb_production(serial_number),
    component_partnumber VARCHAR(50),
    component_lot VARCHAR(50),
    placement_location VARCHAR(20), -- "U1", "R5"
    supplier VARCHAR(200)
);
```

---

## Dynamic Form Generator

```typescript
// Auto-generate forms based on configuration
import React from 'react';
import { useForm } from 'react-hook-form';

interface FieldConfig {
  name: string;
  type: 'text' | 'numeric' | 'select' | 'date' | 'image' | 'boolean';
  label: string;
  required: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface FormConfig {
  formType: string;
  fields: FieldConfig[];
}

const DynamicFormGenerator: React.FC<{ config: FormConfig }> = ({ config }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  
  const onSubmit = async (data: any) => {
    await fetch(`/api/${config.formType}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {config.fields.map(field => (
        <div key={field.name} className="form-field">
          <label>{field.label}</label>
          
          {field.type === 'text' && (
            <input
              type="text"
              {...register(field.name, { required: field.required })}
            />
          )}
          
          {field.type === 'numeric' && (
            <input
              type="number"
              step="0.01"
              {...register(field.name, {
                required: field.required,
                min: field.validation?.min,
                max: field.validation?.max
              })}
            />
          )}
          
          {field.type === 'select' && (
            <select {...register(field.name, { required: field.required })}>
              {field.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
          
          {field.type === 'date' && (
            <input
              type="date"
              {...register(field.name, { required: field.required })}
            />
          )}
          
          {field.type === 'boolean' && (
            <input
              type="checkbox"
              {...register(field.name)}
            />
          )}
          
          {errors[field.name] && (
            <span className="error">This field is required</span>
          )}
        </div>
      ))}
      
      <button type="submit">Submit</button>
    </form>
  );
};

// Usage: Load config from API
const QualityInspectionForm = () => {
  const [config, setConfig] = useState<FormConfig | null>(null);
  
  useEffect(() => {
    fetch('/api/config/forms/quality-inspection')
      .then(res => res.json())
      .then(setConfig);
  }, []);
  
  if (!config) return <div>Loading...</div>;
  
  return <DynamicFormGenerator config={config} />;
};
```

---

## Multi-Industry Agent Templates

```python
class IndustryAgentFactory:
    """Factory to create industry-specific agents"""
    
    @staticmethod
    def create_quality_agent(industry: str):
        """Create quality agent based on industry"""
        
        if industry == "pharmaceutical":
            return PharmaceuticalQualityAgent(
                compliance_standards=["21_CFR_Part_11", "GMP"],
                required_checks=["identity", "assay", "impurities", "dissolution"],
                documentation_level="full"
            )
        
        elif industry == "food":
            return FoodQualityAgent(
                compliance_standards=["HACCP", "FDA", "FSMA"],
                required_checks=["microbiology", "allergens", "foreign_material"],
                documentation_level="batch"
            )
        
        elif industry == "automotive":
            return AutomotiveQualityAgent(
                compliance_standards=["IATF_16949", "VDA"],
                required_checks=["dimensional", "functional", "endurance"],
                documentation_level="sample"
            )
        
        elif industry == "electronics":
            return ElectronicsQualityAgent(
                compliance_standards=["IPC_A_610", "J_STD_001"],
                required_checks=["aoi", "xray", "ict", "functional"],
                documentation_level="serial"
            )
        
        else:
            return GenericQualityAgent()
    
    @staticmethod
    def create_maintenance_agent(production_type: str):
        """Create maintenance agent based on production type"""
        
        if production_type == "continuous":
            # Continuous production can't afford downtime
            return PredictiveMaintenanceAgent(
                monitoring_frequency_minutes=5,
                early_warning_days=7,
                emergency_response_minutes=15
            )
        
        elif production_type == "batch":
            # Batch can schedule maintenance between batches
            return ScheduledMaintenanceAgent(
                maintenance_windows=["weekend", "between_batches"],
                preventive_maintenance_interval_days=30
            )
        
        else:  # discrete
            return FlexibleMaintenanceAgent(
                opportunistic_maintenance=True,
                downtime_tolerance_hours=4
            )
```

---

## Pricing Calculator

```python
def calculate_pricing(config: dict) -> dict:
    """Calculate pricing based on configuration"""
    
    base_price = 30000  # Base platform
    
    # Scale factors
    plant_count = len(config['company_profile']['plant_locations'])
    employee_count = config['company_profile']['scale']['employee_count']
    machine_count = config['company_profile']['scale']['machine_count']
    
    # Module pricing
    module_prices = {
        'oee_monitoring': 5000,
        'quality_management': 8000,
        'inventory_tracking': 6000,
        'maintenance': 7000,
        'supplier_management': 5000,
        'mobile_app': 4000,
        'advanced_analytics': 10000,
        'ai_vision_inspection': 15000
    }
    
    modules_cost = sum(
        module_prices[module]
        for module, enabled in config['enabled_modules'].items()
        if enabled
    )
    
    # Scale multipliers
    scale_multiplier = 1.0
    if employee_count > 1000:
        scale_multiplier = 2.0
    elif employee_count > 500:
        scale_multiplier = 1.5
    
    plant_multiplier = 1 + (plant_count - 1) * 0.3  # 30% per additional plant
    
    # Calculate totals
    setup_cost = (base_price + modules_cost) * scale_multiplier * plant_multiplier
    
    # Monthly costs
    aws_base = 1000
    aws_per_user = employee_count * 2  # $2 per user per month
    aws_per_machine = machine_count * 5  # $5 per machine per month
    
    monthly_aws = aws_base + aws_per_user + aws_per_machine
    monthly_support = setup_cost * 0.02  # 2% of setup for monthly support
    
    return {
        'setup_cost': round(setup_cost, 2),
        'monthly_recurring': round(monthly_aws + monthly_support, 2),
        'breakdown': {
            'base_platform': base_price,
            'modules': modules_cost,
            'scale_multiplier': scale_multiplier,
            'plant_multiplier': plant_multiplier,
            'aws_infrastructure': monthly_aws,
            'support_maintenance': monthly_support
        },
        'payment_plan': {
            'upfront': round(setup_cost * 0.5, 2),
            'milestone_payments': [
                {'phase': 'Infrastructure Ready', 'amount': round(setup_cost * 0.25, 2)},
                {'phase': 'Go-Live', 'amount': round(setup_cost * 0.25, 2)}
            ]
        }
    }

# Example usage
pricing = calculate_pricing(company_config)
print(f"Setup Cost: ${pricing['setup_cost']:,.2f}")
print(f"Monthly Cost: ${pricing['monthly_recurring']:,.2f}")
print(f"ROI Breakeven: ~{round(pricing['setup_cost'] / (pricing['monthly_recurring'] * 0.2))} months")
```

---

## Migration Toolkit

```python
class DataMigrationToolkit:
    """Migrate data from existing systems"""
    
    def migrate_from_excel(self, excel_file: str):
        """Migrate from Excel-based system"""
        df = pd.read_excel(excel_file)
        
        # Auto-detect columns
        column_mapping = self.auto_detect_columns(df)
        
        # Transform and load
        for index, row in df.iterrows():
            self.insert_production_log(
                machine_id=row[column_mapping['machine']],
                date=row[column_mapping['date']],
                quantity=row[column_mapping['quantity']],
                # ... more fields
            )
    
    def migrate_from_erp(self, erp_type: str, connection_string: str):
        """Migrate from existing ERP"""
        if erp_type == "SAP":
            return self._migrate_from_sap(connection_string)
        elif erp_type == "Oracle":
            return self._migrate_from_oracle(connection_string)
        # Add more ERP connectors
    
    def _migrate_from_sap(self, conn_str: str):
        """SAP-specific migration logic"""
        # Connect to SAP tables
        # Extract production orders, quality notifications, etc.
        pass
```

---

## Template Marketplace

Future enhancement: Allow companies to share and sell their custom configurations.

```json
{
  "template_name": "Automotive Tier-1 Supplier Complete",
  "author": "ABC Automotive Solutions",
  "industry": "automotive",
  "rating": 4.8,
  "downloads": 47,
  "price": 2000,
  "description": "Complete IATF 16949 compliant system for automotive suppliers",
  "includes": [
    "PPAP documentation workflow",
    "Advanced product quality planning (APQP)",
    "Production part approval process",
    "Measurement system analysis (MSA)",
    "Statistical process control (SPC) charts",
    "Customer portal for quality data sharing"
  ]
}
```

---

## Success Stories Template

```markdown
# Case Study: [Company Name]

## Challenge
- [Pain point 1]
- [Pain point 2]
- [Pain point 3]

## Solution
Deployed SuperMega Manufacturing OS in [X] weeks with:
- [Module 1]
- [Module 2]
- [Module 3]

## Results (After 6 Months)
- ✅ [Metric 1]: [X%] improvement
- ✅ [Metric 2]: $[X] savings
- ✅ [Metric 3]: [X] hours saved per week

## Quote
> "SuperMega transformed our operations. The AI agents handle routine tasks while our team focuses on continuous improvement."
> — [Name], [Title], [Company]
```

---

## Next Steps for Template Deployment

1. Create company-specific config.json
2. Run deployment script
3. System provisions automatically
4. Train users (1 week)
5. Go live with confidence

**Ready to deploy?** Contact: sales@supermega.dev


## Partner Onboarding Kit
1. **Discovery deck**: Auto-populate slides with metrics from the Yangon Tyre case (OEE lift, defect reduction, autonomous agent count).
2. **Intent starter file**: Provide `partner-intents.yaml` containing default beacons (OEE-stabilize, Supplier-accelerate, Maintenance-drift) so new manufacturers can plug into the fabric instantly.
3. **Codex environment preset**: Share a Codex .json export with secrets placeholders, container image, and setup script that installs the agent orchestrator.
4. **Runbook**: Reference `yangon-tyre-deployment.md` plus a partner-specific appendix outlining VPN, IAM, and compliance requirements.

Bundle these assets inside `/partners/<company>` folders to keep onboarding repeatable.





