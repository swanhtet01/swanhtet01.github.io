/**
 * YTF DQMS TypeScript Types
 * 
 * Comprehensive type definitions for the Digital Quality Management System
 * Based on Plant B operational requirements and data structures
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export enum ProductionLineCode {
  PD1 = 'PD-1', // Mixing
  PD2 = 'PD-2', // Extrusion & Calendering
  PD3 = 'PD-3', // Building
  PD4 = 'PD-4', // Curing
}

export enum TireCategory {
  RADIAL = 'radial',
  MOTORCYCLE = 'motorcycle',
  BIAS = 'bias',
}

export enum QualityGrade {
  A = 'A', // First quality
  B = 'B', // Minor defect
  R = 'R', // Reject
}

export enum DefectCategory {
  INNER = 'inner',
  SIDEWALL = 'sidewall',
  BEAD = 'bead',
  TREAD = 'tread',
  PLY = 'ply',
}

export enum DefectSeverity {
  MINOR = 'minor',
  MAJOR = 'major',
  CRITICAL = 'critical',
}

export enum Shift {
  DAY = 'day',
  NIGHT = 'night',
}

export enum OperatorSkillLevel {
  TRAINEE = 'trainee',
  JUNIOR = 'junior',
  SENIOR = 'senior',
  EXPERT = 'expert',
}

export enum InspectionType {
  IN_PROCESS = 'in-process',
  FINAL = 'final',
  RANDOM = 'random',
  CUSTOMER_RETURN = 'customer-return',
}

export enum InspectionStage {
  MIXING = 'mixing',
  BUILDING = 'building',
  CURING = 'curing',
  FINAL = 'final',
}

export enum Disposition {
  PASS = 'pass',
  REWORK = 'rework',
  SCRAP = 'scrap',
  HOLD = 'hold',
}

export enum DownTimeCategory {
  MACHINE_FAILURE = 'machine-failure',
  COMPOUND_CHANGE = 'compound-change',
  REST_TIME = 'rest-time',
  SIZE_CHANGE = 'size-change',
  MAINTENANCE = 'maintenance',
}

export enum RCAStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in-progress',
  ACTIONS_PENDING = 'actions-pending',
  CLOSED = 'closed',
}

export enum AlertType {
  BR_RATE_HIGH = 'br-rate-high',
  DEFECT_SPIKE = 'defect-spike',
  LINE_DOWN = 'line-down',
  OPERATOR_ISSUE = 'operator-issue',
  WEIGHT_DEVIATION = 'weight-deviation',
  MATERIAL_ISSUE = 'material-issue',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum UserRole {
  PLANT_MANAGER = 'plant-manager',
  QC_MANAGER = 'qc-manager',
  PRODUCTION_SUPERVISOR = 'production-supervisor',
  QC_INSPECTOR = 'qc-inspector',
  PRODUCTION_OPERATOR = 'production-operator',
  MAINTENANCE = 'maintenance',
  ADMIN = 'admin',
}

// ============================================================================
// PLANT B SPECIFIC CONSTANTS
// ============================================================================

export const PLANT_B_CONFIG = {
  targetBRRate: 3.0, // 3.0%
  brRateWarningThreshold: 2.8, // 2.8%
  brRateCriticalThreshold: 3.5, // 3.5%
  defectSpikeThreshold: 5, // 5 defects of same type in 2 hours
  productionLines: [
    { code: 'PD-1', name: 'Mixing', equipment: ['270L Mixer', '100L Mixer'] },
    { code: 'PD-2', name: 'Extrusion & Calendering', equipment: ['Extruder', 'Calender'] },
    { code: 'PD-3', name: 'Building', equipment: ['Building Machine'] },
    { code: 'PD-4', name: 'Curing', equipment: ['Curing Press'] },
  ],
  shifts: [
    { name: 'day', start: '07:00', end: '19:00' },
    { name: 'night', start: '19:00', end: '07:00' },
  ],
} as const;

export const COMMON_DEFECT_TYPES = [
  { code: 'INNER_SEPARATION', nameEn: 'Inner Separation', nameMy: 'အတွင်းပိုင်း ကွဲခြင်း', category: DefectCategory.INNER },
  { code: 'INNER_BARECORD', nameEn: 'Inner Barecord', nameMy: 'အတွင်းပိုင်း ကြိုးပေါက်', category: DefectCategory.INNER },
  { code: 'INNER_UNDERCURE', nameEn: 'Inner Undercure', nameMy: 'အတွင်းပိုင်း မမှည့်', category: DefectCategory.INNER },
  { code: 'INNER_CRACK', nameEn: 'Inner Crack', nameMy: 'အတွင်းပိုင်း အက်ကွဲ', category: DefectCategory.INNER },
  { code: 'SIDEWALL_SEPARATION', nameEn: 'Sidewall Separation', nameMy: 'နံရံ ကွဲခြင်း', category: DefectCategory.SIDEWALL },
  { code: 'SIDEWALL_CRACK', nameEn: 'Sidewall Crack', nameMy: 'နံရံအက်ကွဲ', category: DefectCategory.SIDEWALL },
  { code: 'BEAD_DEFORMATION', nameEn: 'Bead Deformation', nameMy: 'Bead ပုံပျက်', category: DefectCategory.BEAD },
  { code: 'BEAD_SEPARATION', nameEn: 'Bead Separation', nameMy: 'Bead ကွဲခြင်း', category: DefectCategory.BEAD },
  { code: 'PLY_SPLICE_THICK', nameEn: 'Ply Splice Thick', nameMy: 'Ply အဆက်ထူ', category: DefectCategory.PLY },
  { code: 'SPLICE_OPEN', nameEn: 'Splice Open', nameMy: 'Splice ပွင့်', category: DefectCategory.PLY },
  { code: 'TREAD_PATTERN_CRACK', nameEn: 'Tread Pattern Crack', nameMy: 'Pattern အက်ကွဲ', category: DefectCategory.TREAD },
  { code: 'TIRE_WEIGHT_WRONG', nameEn: 'Tire Weight Wrong', nameMy: 'တာယာအလေးချိန် မမှန်', category: DefectCategory.INNER },
] as const;

// ============================================================================
// CORE DATA TYPES
// ============================================================================

export interface ProductionLine {
  id: number;
  code: ProductionLineCode;
  name: string;
  nameEn: string;
  nameMy?: string;
  description?: string;
  plant: string;
  equipment?: Record<string, any>;
  dailyCapacity?: number;
  targetOutput?: number;
  targetBRRate: number;
  status: 'active' | 'down' | 'maintenance';
  currentShift?: Shift;
  createdAt: Date;
  updatedAt: Date;
}

export interface TireModel {
  id: number;
  sku: string;
  name: string;
  category: TireCategory;
  size: string;
  type?: string;
  pattern?: string;
  targetWeight?: number;
  weightTolerance?: number;
  minWeight?: number;
  maxWeight?: number;
  processParams?: Record<string, any>;
  productionLines?: ProductionLineCode[];
  cycleTime?: number;
  standardCost?: number;
  sellingPrice?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DefectType {
  id: number;
  code: string;
  nameEn: string;
  nameMy?: string;
  category: DefectCategory;
  severity: DefectSeverity;
  typicalGrade: QualityGrade;
  description?: string;
  descriptionMy?: string;
  identificationGuide?: string;
  photoExamples?: string[];
  commonCauses?: string[];
  affectedLines?: ProductionLineCode[];
  avgCostImpact?: number;
  reworkPossible: boolean;
  occurrenceCount: number;
  lastOccurrence?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Operator {
  id: number;
  employeeId: string;
  name: string;
  nameMy?: string;
  productionLine: ProductionLineCode;
  station?: string;
  shift: Shift;
  skillLevel: OperatorSkillLevel;
  yearsExperience?: number;
  certifications?: string[];
  qualityScore?: number;
  avgBRRate?: number;
  totalProduced: number;
  totalDefects: number;
  lastTrainingDate?: Date;
  nextTrainingDue?: Date;
  trainingHistory?: any[];
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionBatch {
  id: number;
  batchNumber: string;
  tireModelId: number;
  productionLineId: number;
  startTime: Date;
  endTime?: Date;
  shift: Shift;
  targetQuantity: number;
  actualQuantity: number;
  gradeA: number;
  gradeB: number;
  gradeR: number;
  brRate?: number;
  yieldRate?: number;
  operatorIds?: number[];
  supervisorId?: number;
  materialBatches?: Record<string, string>;
  machineSettings?: Record<string, any>;
  downTimeMinutes: number;
  downTimeReasons?: any[];
  status: 'in-progress' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QualityInspection {
  id: number;
  inspectionNumber: string;
  tireSerialNumber: string;
  tireModelId: number;
  batchId?: number;
  inspectionType: InspectionType;
  inspectionStage: InspectionStage;
  productionLineId: number;
  inspectorId: number;
  inspectionTime: Date;
  grade: QualityGrade;
  passed: boolean;
  actualWeight?: number;
  weightDeviation?: number;
  defectCount: number;
  defectIds?: number[];
  defectDetails?: any[];
  photos?: string[];
  notes?: string;
  notesMy?: string;
  disposition?: Disposition;
  reworkInstructions?: string;
  operatorId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DefectRecord {
  id: number;
  inspectionId: number;
  defectTypeId: number;
  location?: string;
  severity: DefectSeverity;
  size?: string;
  costImpact?: number;
  reworkCost?: number;
  scrapCost?: number;
  photos?: string[];
  rootCauseId?: number;
  description?: string;
  createdAt: Date;
}

export interface DownTimeEvent {
  id: number;
  productionLineId: number;
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  category: DownTimeCategory;
  subcategory?: string;
  description?: string;
  descriptionMy?: string;
  productionLoss?: number;
  costImpact?: number;
  resolution?: string;
  resolvedBy?: number;
  batchId?: number;
  status: 'ongoing' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyQualityMetrics {
  id: number;
  date: Date;
  productionLineId?: number;
  shift?: Shift;
  totalProduced: number;
  gradeA: number;
  gradeB: number;
  gradeR: number;
  brRate: number;
  yieldRate: number;
  defectRate?: number;
  topDefectTypes?: Array<{ defectTypeId: number; count: number; percentage: number }>;
  defectsByCategory?: Record<DefectCategory, number>;
  internalFailureCost?: number;
  externalFailureCost?: number;
  appraisalCost?: number;
  preventionCost?: number;
  totalCOQ?: number;
  operatorPerformance?: Array<{ operatorId: number; produced: number; brRate: number }>;
  totalDownTimeMinutes: number;
  downTimeByCategory?: Record<DownTimeCategory, number>;
  vsTarget?: number;
  vsYesterday?: number;
  vsLastWeek?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RootCauseAnalysis {
  id: number;
  rcaNumber: string;
  problemStatement: string;
  problemStatementMy?: string;
  defectTypeId?: number;
  productionLineId?: number;
  affectedBatches?: number[];
  problemStartDate?: Date;
  problemEndDate?: Date;
  investigationStartDate: Date;
  investigationEndDate?: Date;
  leadInvestigator: number;
  teamMembers?: number[];
  fiveWhys?: Record<string, string>;
  fishboneDiagram?: Record<string, string[]>;
  dataAnalysis?: any;
  rootCause?: string;
  rootCauseCategory?: string;
  contributingFactors?: string[];
  aiSuggestedCauses?: Array<{ cause: string; confidence: number; reasoning: string }>;
  aiConfidenceScore?: number;
  correctiveActions?: Array<{ action: string; responsible: number; dueDate: Date; status: string }>;
  preventiveActions?: Array<{ action: string; responsible: number; dueDate: Date; status: string }>;
  effectivenessVerified: boolean;
  verificationDate?: Date;
  verificationNotes?: string;
  estimatedCostSavings?: number;
  actualCostSavings?: number;
  status: RCAStatus;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: number;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  messageMy?: string;
  productionLineId?: number;
  relatedEntityType?: string;
  relatedEntityId?: number;
  currentValue?: number;
  thresholdValue?: number;
  additionalData?: any;
  recipientRoles?: UserRole[];
  recipientIds?: number[];
  channels?: Array<'in-app' | 'email' | 'sms'>;
  sentAt?: Date;
  deliveryStatus?: Record<string, any>;
  actionRequired: boolean;
  actionTaken?: string;
  actionTakenBy?: number;
  actionTakenAt?: Date;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: number;
  acknowledgedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface DashboardSummary {
  date: Date;
  plant: string;
  
  // Overall metrics
  totalProduced: number;
  gradeA: number;
  gradeB: number;
  gradeR: number;
  brRate: number;
  yieldRate: number;
  
  // Comparisons
  vsTarget: number;
  vsYesterday: number;
  vsLastWeek: number;
  
  // Cost
  totalCOQ: number;
  
  // By production line
  linePerformance: Array<{
    lineCode: ProductionLineCode;
    lineName: string;
    produced: number;
    brRate: number;
    status: string;
  }>;
  
  // Top issues
  topDefects: Array<{
    defectType: string;
    count: number;
    percentage: number;
  }>;
  
  // Alerts
  activeAlerts: number;
  criticalAlerts: number;
}

export interface QualityTrendData {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  dataPoints: Array<{
    date: Date;
    brRate: number;
    totalProduced: number;
    gradeA: number;
    gradeB: number;
    gradeR: number;
  }>;
  trend: 'improving' | 'stable' | 'declining';
  trendPercentage: number;
}

export interface DefectAnalysis {
  period: string;
  totalDefects: number;
  
  // By type
  byType: Array<{
    defectTypeId: number;
    defectTypeName: string;
    count: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  
  // By category
  byCategory: Record<DefectCategory, number>;
  
  // By production line
  byLine: Array<{
    lineCode: ProductionLineCode;
    count: number;
    percentage: number;
  }>;
  
  // By shift
  byShift: Record<Shift, number>;
  
  // Pareto analysis (80/20)
  paretoDefects: Array<{
    defectTypeName: string;
    count: number;
    cumulativePercentage: number;
  }>;
}

export interface OperatorPerformance {
  operatorId: number;
  operatorName: string;
  productionLine: ProductionLineCode;
  shift: Shift;
  
  // Current period
  period: string;
  tiresProduced: number;
  gradeA: number;
  gradeB: number;
  gradeR: number;
  brRate: number;
  qualityScore: number;
  
  // Comparisons
  vsAverage: number;
  vsTarget: number;
  ranking?: number;
  
  // Trends
  trend: 'improving' | 'stable' | 'declining';
  
  // Training
  trainingNeeded: boolean;
  trainingRecommendations?: string[];
}

export interface RealTimeQualityStatus {
  timestamp: Date;
  productionLineId: number;
  lineCode: ProductionLineCode;
  lineName: string;
  
  // Current shift
  shift: Shift;
  shiftStartTime: Date;
  
  // Production
  tiresProducedToday: number;
  tiresProducedThisShift: number;
  currentBatchId?: number;
  
  // Quality
  currentBRRate: number;
  shiftBRRate: number;
  lastInspectionTime?: Date;
  
  // Recent defects (last 2 hours)
  recentDefects: Array<{
    defectType: string;
    count: number;
    lastOccurrence: Date;
  }>;
  
  // Status
  status: 'normal' | 'warning' | 'critical';
  alerts: Alert[];
  
  // Down time
  isDown: boolean;
  downSince?: Date;
  downReason?: string;
}

export interface CostOfQualityReport {
  period: string;
  startDate: Date;
  endDate: Date;
  
  // COQ components
  internalFailureCost: number;
  externalFailureCost: number;
  appraisalCost: number;
  preventionCost: number;
  totalCOQ: number;
  
  // Breakdown
  internalFailureBreakdown: {
    rework: number;
    scrap: number;
    downtime: number;
    other: number;
  };
  
  // Metrics
  coqAsPercentOfSales?: number;
  coqPerTire: number;
  
  // Trends
  vsLastPeriod: number;
  trend: 'improving' | 'stable' | 'worsening';
  
  // Opportunities
  potentialSavings: number;
  topCostDrivers: Array<{
    category: string;
    cost: number;
    percentage: number;
  }>;
}

// ============================================================================
// GOOGLE DRIVE SYNC TYPES
// ============================================================================

export interface GoogleDriveFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  modifiedTime: Date;
  md5Checksum?: string;
}

export interface DataSyncJob {
  id: number;
  syncType: 'full' | 'incremental' | 'manual';
  sourceFile: string;
  sourceFileId?: string;
  startTime: Date;
  endTime?: Date;
  durationSeconds?: number;
  status: 'success' | 'partial' | 'failed';
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors?: any[];
  warnings?: any[];
  dataQualityScore?: number;
  dataQualityIssues?: any[];
  triggeredBy: string;
  createdAt: Date;
}

export interface PlantBDataFile {
  fileName: string;
  fileType: 'B Condition' | 'Weekly Production' | 'Daily Meeting' | 'Down Time' | 'Size Change';
  targetTable: string;
  parser: (data: any) => any[];
  validator: (record: any) => { valid: boolean; errors?: string[] };
}

// ============================================================================
// AI/ML TYPES
// ============================================================================

export interface DefectPrediction {
  tireModelId: number;
  productionLineId: number;
  timestamp: Date;
  
  // Prediction
  predictedDefectProbability: number;
  predictedDefectTypes: Array<{
    defectTypeId: number;
    defectTypeName: string;
    probability: number;
  }>;
  
  // Confidence
  confidenceScore: number;
  
  // Contributing factors
  factors: Array<{
    factor: string;
    importance: number;
    currentValue: any;
    optimalValue: any;
  }>;
  
  // Recommendations
  recommendations: string[];
}

export interface QualityAnomalyDetection {
  timestamp: Date;
  anomalyType: 'spike' | 'drift' | 'shift' | 'pattern';
  severity: 'low' | 'medium' | 'high';
  
  // Details
  metric: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  
  // Context
  productionLineId?: number;
  defectTypeId?: number;
  operatorId?: number;
  
  // Analysis
  possibleCauses: string[];
  suggestedActions: string[];
  
  // Confidence
  confidenceScore: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
}

export interface FilterParams {
  startDate?: Date;
  endDate?: Date;
  productionLineIds?: number[];
  tireModelIds?: number[];
  operatorIds?: number[];
  shifts?: Shift[];
  grades?: QualityGrade[];
  defectTypeIds?: number[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId: string;
  };
}
