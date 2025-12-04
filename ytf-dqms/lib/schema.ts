/**
 * YTF DQMS Database Schema
 * 
 * Comprehensive data model for Yangon Tyre Factory Digital Quality Management System
 * Based on actual Plant B operational data and requirements
 * 
 * Technology: Drizzle ORM + PostgreSQL
 * Context: Plant B has 4 production lines (PD-1 to PD-4), produces radial/motorcycle/bias tires
 * Quality System: A/B/R grading (A=good, B=minor defect, R=reject)
 * Target: B+R rate < 3.0%
 */

import { pgTable, serial, text, integer, timestamp, decimal, boolean, jsonb, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// PRODUCTION LINE CONFIGURATION
// ============================================================================

export const productionLines = pgTable('production_lines', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 10 }).notNull().unique(), // PD-1, PD-2, PD-3, PD-4
  name: text('name').notNull(), // Mixing, Extrusion, Building, Curing
  nameEn: text('name_en').notNull(),
  nameMy: text('name_my'), // Burmese name
  description: text('description'),
  plant: varchar('plant', { length: 10 }).notNull().default('Plant B'),
  
  // Equipment details
  equipment: jsonb('equipment'), // { "270L Mixer": {...}, "100L Mixer": {...} }
  
  // Capacity and targets
  dailyCapacity: integer('daily_capacity'), // tires per day
  targetOutput: integer('target_output'),
  targetBRRate: decimal('target_br_rate', { precision: 5, scale: 2 }).default('3.00'), // 3.0%
  
  // Current status
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, down, maintenance
  currentShift: varchar('current_shift', { length: 10 }), // day, night
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  codeIdx: uniqueIndex('production_lines_code_idx').on(table.code),
  plantIdx: index('production_lines_plant_idx').on(table.plant),
}));

// ============================================================================
// TIRE MODELS & SPECIFICATIONS
// ============================================================================

export const tireModels = pgTable('tire_models', {
  id: serial('id').primaryKey(),
  sku: varchar('sku', { length: 50 }).notNull().unique(),
  name: text('name').notNull(), // 185/70 R14, 195 R14 C, etc.
  category: varchar('category', { length: 20 }).notNull(), // radial, motorcycle, bias
  
  // Specifications
  size: varchar('size', { length: 50 }).notNull(),
  type: varchar('type', { length: 50 }), // Premier Taxi, Commercial, etc.
  pattern: varchar('pattern', { length: 100 }),
  
  // Quality parameters
  targetWeight: decimal('target_weight', { precision: 6, scale: 2 }), // kg
  weightTolerance: decimal('weight_tolerance', { precision: 5, scale: 2 }), // ±kg
  minWeight: decimal('min_weight', { precision: 6, scale: 2 }),
  maxWeight: decimal('max_weight', { precision: 6, scale: 2 }),
  
  // Process parameters (stored as JSON for flexibility)
  processParams: jsonb('process_params'), // { mixing: {...}, building: {...}, curing: {...} }
  
  // Production info
  productionLines: jsonb('production_lines'), // ["PD-1", "PD-2", "PD-3", "PD-4"]
  cycleTime: integer('cycle_time'), // seconds per tire
  
  // Cost
  standardCost: decimal('standard_cost', { precision: 10, scale: 2 }),
  sellingPrice: decimal('selling_price', { precision: 10, scale: 2 }),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  skuIdx: uniqueIndex('tire_models_sku_idx').on(table.sku),
  categoryIdx: index('tire_models_category_idx').on(table.category),
  activeIdx: index('tire_models_active_idx').on(table.isActive),
}));

// ============================================================================
// DEFECT TYPES & CLASSIFICATION
// ============================================================================

export const defectTypes = pgTable('defect_types', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameMy: text('name_my'), // Burmese name
  
  // Classification
  category: varchar('category', { length: 50 }).notNull(), // inner, sidewall, bead, tread, ply
  severity: varchar('severity', { length: 10 }).notNull(), // minor, major, critical
  typicalGrade: varchar('typical_grade', { length: 1 }).notNull(), // B or R
  
  // Description and guidance
  description: text('description'),
  descriptionMy: text('description_my'),
  identificationGuide: text('identification_guide'),
  photoExamples: jsonb('photo_examples'), // Array of S3 URLs
  
  // Root cause information
  commonCauses: jsonb('common_causes'), // ["Curing temperature too high", "Material quality issue"]
  affectedLines: jsonb('affected_lines'), // ["PD-3", "PD-4"]
  
  // Cost impact
  avgCostImpact: decimal('avg_cost_impact', { precision: 10, scale: 2 }), // USD per defect
  reworkPossible: boolean('rework_possible').default(false),
  
  // Frequency tracking (updated periodically)
  occurrenceCount: integer('occurrence_count').default(0),
  lastOccurrence: timestamp('last_occurrence'),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  codeIdx: uniqueIndex('defect_types_code_idx').on(table.code),
  categoryIdx: index('defect_types_category_idx').on(table.category),
  severityIdx: index('defect_types_severity_idx').on(table.severity),
}));

// ============================================================================
// OPERATORS & PERSONNEL
// ============================================================================

export const operators = pgTable('operators', {
  id: serial('id').primaryKey(),
  employeeId: varchar('employee_id', { length: 50 }).notNull().unique(),
  name: text('name').notNull(),
  nameMy: text('name_my'),
  
  // Assignment
  productionLine: varchar('production_line', { length: 10 }).notNull(),
  station: varchar('station', { length: 100 }),
  shift: varchar('shift', { length: 10 }).notNull(), // day, night
  
  // Skills and experience
  skillLevel: varchar('skill_level', { length: 20 }).notNull(), // trainee, junior, senior, expert
  yearsExperience: decimal('years_experience', { precision: 4, scale: 1 }),
  certifications: jsonb('certifications'),
  
  // Quality performance (updated daily)
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }), // 0-100
  avgBRRate: decimal('avg_br_rate', { precision: 5, scale: 2 }), // Last 30 days
  totalProduced: integer('total_produced').default(0),
  totalDefects: integer('total_defects').default(0),
  
  // Training records
  lastTrainingDate: timestamp('last_training_date'),
  nextTrainingDue: timestamp('next_training_due'),
  trainingHistory: jsonb('training_history'),
  
  // Contact
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 100 }),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  employeeIdIdx: uniqueIndex('operators_employee_id_idx').on(table.employeeId),
  lineIdx: index('operators_line_idx').on(table.productionLine),
  shiftIdx: index('operators_shift_idx').on(table.shift),
  activeIdx: index('operators_active_idx').on(table.isActive),
}));

// ============================================================================
// PRODUCTION BATCHES
// ============================================================================

export const productionBatches = pgTable('production_batches', {
  id: serial('id').primaryKey(),
  batchNumber: varchar('batch_number', { length: 50 }).notNull().unique(),
  
  // Production details
  tireModelId: integer('tire_model_id').notNull().references(() => tireModels.id),
  productionLineId: integer('production_line_id').notNull().references(() => productionLines.id),
  
  // Timing
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  shift: varchar('shift', { length: 10 }).notNull(),
  
  // Quantities
  targetQuantity: integer('target_quantity').notNull(),
  actualQuantity: integer('actual_quantity').default(0),
  gradeA: integer('grade_a').default(0),
  gradeB: integer('grade_b').default(0),
  gradeR: integer('grade_r').default(0),
  
  // Calculated metrics
  brRate: decimal('br_rate', { precision: 5, scale: 2 }), // (B+R)/Total * 100
  yieldRate: decimal('yield_rate', { precision: 5, scale: 2 }), // A/Total * 100
  
  // Operator assignments
  operatorIds: jsonb('operator_ids'), // Array of operator IDs
  supervisorId: integer('supervisor_id'),
  
  // Material traceability
  materialBatches: jsonb('material_batches'), // { rubber: "RB-2024-001", carbon: "CB-2024-050" }
  
  // Machine settings
  machineSettings: jsonb('machine_settings'), // { temperature: 165, pressure: 180, time: 12 }
  
  // Down time during batch
  downTimeMinutes: integer('down_time_minutes').default(0),
  downTimeReasons: jsonb('down_time_reasons'),
  
  // Status
  status: varchar('status', { length: 20 }).notNull().default('in-progress'), // in-progress, completed, cancelled
  
  // Notes
  notes: text('notes'),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  batchNumberIdx: uniqueIndex('production_batches_batch_number_idx').on(table.batchNumber),
  tireModelIdx: index('production_batches_tire_model_idx').on(table.tireModelId),
  lineIdx: index('production_batches_line_idx').on(table.productionLineId),
  startTimeIdx: index('production_batches_start_time_idx').on(table.startTime),
  statusIdx: index('production_batches_status_idx').on(table.status),
}));

// ============================================================================
// QUALITY INSPECTIONS
// ============================================================================

export const qualityInspections = pgTable('quality_inspections', {
  id: serial('id').primaryKey(),
  inspectionNumber: varchar('inspection_number', { length: 50 }).notNull().unique(),
  
  // Tire identification
  tireSerialNumber: varchar('tire_serial_number', { length: 100 }).notNull(),
  tireModelId: integer('tire_model_id').notNull().references(() => tireModels.id),
  batchId: integer('batch_id').references(() => productionBatches.id),
  
  // Inspection details
  inspectionType: varchar('inspection_type', { length: 30 }).notNull(), // in-process, final, random, customer-return
  inspectionStage: varchar('inspection_stage', { length: 30 }).notNull(), // mixing, building, curing, final
  productionLineId: integer('production_line_id').notNull().references(() => productionLines.id),
  
  // Inspector
  inspectorId: integer('inspector_id').notNull().references(() => operators.id),
  inspectionTime: timestamp('inspection_time').notNull().defaultNow(),
  
  // Result
  grade: varchar('grade', { length: 1 }).notNull(), // A, B, R
  passed: boolean('passed').notNull(),
  
  // Measurements
  actualWeight: decimal('actual_weight', { precision: 6, scale: 2 }),
  weightDeviation: decimal('weight_deviation', { precision: 5, scale: 2 }),
  
  // Defects found (if any)
  defectCount: integer('defect_count').default(0),
  defectIds: jsonb('defect_ids'), // Array of defect IDs
  defectDetails: jsonb('defect_details'), // Detailed defect information
  
  // Photos
  photos: jsonb('photos'), // Array of S3 URLs
  
  // Notes
  notes: text('notes'),
  notesMy: text('notes_my'),
  
  // Disposition
  disposition: varchar('disposition', { length: 30 }), // pass, rework, scrap, hold
  reworkInstructions: text('rework_instructions'),
  
  // Traceability
  operatorId: integer('operator_id').references(() => operators.id), // Who made this tire
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  inspectionNumberIdx: uniqueIndex('quality_inspections_inspection_number_idx').on(table.inspectionNumber),
  tireSerialIdx: index('quality_inspections_tire_serial_idx').on(table.tireSerialNumber),
  batchIdx: index('quality_inspections_batch_idx').on(table.batchId),
  inspectorIdx: index('quality_inspections_inspector_idx').on(table.inspectorId),
  timeIdx: index('quality_inspections_time_idx').on(table.inspectionTime),
  gradeIdx: index('quality_inspections_grade_idx').on(table.grade),
}));

// ============================================================================
// DEFECT RECORDS (Detailed defect instances)
// ============================================================================

export const defectRecords = pgTable('defect_records', {
  id: serial('id').primaryKey(),
  
  // Link to inspection
  inspectionId: integer('inspection_id').notNull().references(() => qualityInspections.id),
  defectTypeId: integer('defect_type_id').notNull().references(() => defectTypes.id),
  
  // Defect details
  location: varchar('location', { length: 100 }), // inner, sidewall-left, bead-right, tread
  severity: varchar('severity', { length: 10 }), // minor, major, critical
  size: varchar('size', { length: 50 }), // small, medium, large, or specific measurements
  
  // Cost impact
  costImpact: decimal('cost_impact', { precision: 10, scale: 2 }),
  reworkCost: decimal('rework_cost', { precision: 10, scale: 2 }),
  scrapCost: decimal('scrap_cost', { precision: 10, scale: 2 }),
  
  // Photos
  photos: jsonb('photos'), // Array of S3 URLs with annotations
  
  // Root cause (if identified)
  rootCauseId: integer('root_cause_id'),
  
  // Notes
  description: text('description'),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  inspectionIdx: index('defect_records_inspection_idx').on(table.inspectionId),
  defectTypeIdx: index('defect_records_defect_type_idx').on(table.defectTypeId),
  createdAtIdx: index('defect_records_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// DOWN TIME EVENTS
// ============================================================================

export const downTimeEvents = pgTable('down_time_events', {
  id: serial('id').primaryKey(),
  
  // Production line
  productionLineId: integer('production_line_id').notNull().references(() => productionLines.id),
  
  // Timing
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  durationMinutes: integer('duration_minutes'),
  
  // Classification
  category: varchar('category', { length: 50 }).notNull(), // machine-failure, compound-change, rest-time, size-change, maintenance
  subcategory: varchar('subcategory', { length: 100 }),
  
  // Details
  description: text('description'),
  descriptionMy: text('description_my'),
  
  // Impact
  productionLoss: integer('production_loss'), // tires not produced
  costImpact: decimal('cost_impact', { precision: 10, scale: 2 }),
  
  // Resolution
  resolution: text('resolution'),
  resolvedBy: integer('resolved_by').references(() => operators.id),
  
  // Related batch
  batchId: integer('batch_id').references(() => productionBatches.id),
  
  // Status
  status: varchar('status', { length: 20 }).notNull().default('ongoing'), // ongoing, resolved
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  lineIdx: index('down_time_events_line_idx').on(table.productionLineId),
  startTimeIdx: index('down_time_events_start_time_idx').on(table.startTime),
  categoryIdx: index('down_time_events_category_idx').on(table.category),
  statusIdx: index('down_time_events_status_idx').on(table.status),
}));

// ============================================================================
// DAILY QUALITY METRICS (Aggregated)
// ============================================================================

export const dailyQualityMetrics = pgTable('daily_quality_metrics', {
  id: serial('id').primaryKey(),
  
  // Date and scope
  date: timestamp('date').notNull(),
  productionLineId: integer('production_line_id').references(() => productionLines.id),
  shift: varchar('shift', { length: 10 }), // day, night, or null for full day
  
  // Production quantities
  totalProduced: integer('total_produced').notNull(),
  gradeA: integer('grade_a').notNull(),
  gradeB: integer('grade_b').notNull(),
  gradeR: integer('grade_r').notNull(),
  
  // Calculated rates
  brRate: decimal('br_rate', { precision: 5, scale: 2 }).notNull(),
  yieldRate: decimal('yield_rate', { precision: 5, scale: 2 }).notNull(),
  defectRate: decimal('defect_rate', { precision: 5, scale: 2 }),
  
  // Defect breakdown
  topDefectTypes: jsonb('top_defect_types'), // [{ defectTypeId, count, percentage }]
  defectsByCategory: jsonb('defects_by_category'), // { inner: 5, sidewall: 3, bead: 2 }
  
  // Cost of quality
  internalFailureCost: decimal('internal_failure_cost', { precision: 10, scale: 2 }),
  externalFailureCost: decimal('external_failure_cost', { precision: 10, scale: 2 }),
  appraisalCost: decimal('appraisal_cost', { precision: 10, scale: 2 }),
  preventionCost: decimal('prevention_cost', { precision: 10, scale: 2 }),
  totalCOQ: decimal('total_coq', { precision: 10, scale: 2 }),
  
  // Operator performance
  operatorPerformance: jsonb('operator_performance'), // [{ operatorId, produced, brRate }]
  
  // Down time
  totalDownTimeMinutes: integer('total_down_time_minutes').default(0),
  downTimeByCategory: jsonb('down_time_by_category'),
  
  // Comparisons
  vsTarget: decimal('vs_target', { precision: 5, scale: 2 }), // % difference from target
  vsYesterday: decimal('vs_yesterday', { precision: 5, scale: 2 }),
  vsLastWeek: decimal('vs_last_week', { precision: 5, scale: 2 }),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  dateLineIdx: uniqueIndex('daily_quality_metrics_date_line_idx').on(table.date, table.productionLineId, table.shift),
  dateIdx: index('daily_quality_metrics_date_idx').on(table.date),
  lineIdx: index('daily_quality_metrics_line_idx').on(table.productionLineId),
}));

// ============================================================================
// ROOT CAUSE ANALYSIS
// ============================================================================

export const rootCauseAnalysis = pgTable('root_cause_analysis', {
  id: serial('id').primaryKey(),
  rcaNumber: varchar('rca_number', { length: 50 }).notNull().unique(),
  
  // Problem definition
  problemStatement: text('problem_statement').notNull(),
  problemStatementMy: text('problem_statement_my'),
  
  // Scope
  defectTypeId: integer('defect_type_id').references(() => defectTypes.id),
  productionLineId: integer('production_line_id').references(() => productionLines.id),
  affectedBatches: jsonb('affected_batches'), // Array of batch IDs
  
  // Timeline
  problemStartDate: timestamp('problem_start_date'),
  problemEndDate: timestamp('problem_end_date'),
  investigationStartDate: timestamp('investigation_start_date').notNull(),
  investigationEndDate: timestamp('investigation_end_date'),
  
  // Team
  leadInvestigator: integer('lead_investigator').notNull().references(() => operators.id),
  teamMembers: jsonb('team_members'), // Array of operator IDs
  
  // Analysis
  fiveWhys: jsonb('five_whys'), // { why1: "...", why2: "...", ... }
  fishboneDiagram: jsonb('fishbone_diagram'), // { man: [...], machine: [...], material: [...], method: [...], environment: [...] }
  dataAnalysis: jsonb('data_analysis'), // Charts, correlations, etc.
  
  // Root cause
  rootCause: text('root_cause'),
  rootCauseCategory: varchar('root_cause_category', { length: 50 }), // man, machine, material, method, environment
  contributingFactors: jsonb('contributing_factors'),
  
  // AI insights
  aiSuggestedCauses: jsonb('ai_suggested_causes'), // Claude-generated suggestions
  aiConfidenceScore: decimal('ai_confidence_score', { precision: 5, scale: 2 }),
  
  // Corrective actions
  correctiveActions: jsonb('corrective_actions'), // [{ action, responsible, dueDate, status }]
  preventiveActions: jsonb('preventive_actions'),
  
  // Verification
  effectivenessVerified: boolean('effectiveness_verified').default(false),
  verificationDate: timestamp('verification_date'),
  verificationNotes: text('verification_notes'),
  
  // Impact
  estimatedCostSavings: decimal('estimated_cost_savings', { precision: 10, scale: 2 }),
  actualCostSavings: decimal('actual_cost_savings', { precision: 10, scale: 2 }),
  
  // Status
  status: varchar('status', { length: 20 }).notNull().default('open'), // open, in-progress, actions-pending, closed
  
  // Attachments
  attachments: jsonb('attachments'), // S3 URLs for reports, photos, etc.
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  rcaNumberIdx: uniqueIndex('root_cause_analysis_rca_number_idx').on(table.rcaNumber),
  defectTypeIdx: index('root_cause_analysis_defect_type_idx').on(table.defectTypeId),
  statusIdx: index('root_cause_analysis_status_idx').on(table.status),
  startDateIdx: index('root_cause_analysis_start_date_idx').on(table.investigationStartDate),
}));

// ============================================================================
// ALERTS & NOTIFICATIONS
// ============================================================================

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  
  // Alert details
  alertType: varchar('alert_type', { length: 50 }).notNull(), // br-rate-high, defect-spike, line-down, operator-issue
  severity: varchar('severity', { length: 20 }).notNull(), // info, warning, critical
  title: text('title').notNull(),
  message: text('message').notNull(),
  messageMy: text('message_my'),
  
  // Context
  productionLineId: integer('production_line_id').references(() => productionLines.id),
  relatedEntityType: varchar('related_entity_type', { length: 50 }), // batch, inspection, defect, operator
  relatedEntityId: integer('related_entity_id'),
  
  // Data
  currentValue: decimal('current_value', { precision: 10, scale: 2 }),
  thresholdValue: decimal('threshold_value', { precision: 10, scale: 2 }),
  additionalData: jsonb('additional_data'),
  
  // Recipients
  recipientRoles: jsonb('recipient_roles'), // ["plant-manager", "qc-manager"]
  recipientIds: jsonb('recipient_ids'), // Specific user IDs
  
  // Delivery
  channels: jsonb('channels'), // ["in-app", "email", "sms"]
  sentAt: timestamp('sent_at'),
  deliveryStatus: jsonb('delivery_status'),
  
  // Actions
  actionRequired: boolean('action_required').default(false),
  actionTaken: text('action_taken'),
  actionTakenBy: integer('action_taken_by'),
  actionTakenAt: timestamp('action_taken_at'),
  
  // Status
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, acknowledged, resolved, dismissed
  acknowledgedBy: integer('acknowledged_by'),
  acknowledgedAt: timestamp('acknowledged_at'),
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('alerts_type_idx').on(table.alertType),
  severityIdx: index('alerts_severity_idx').on(table.severity),
  statusIdx: index('alerts_status_idx').on(table.status),
  createdAtIdx: index('alerts_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// DATA SYNC LOG (Google Drive integration tracking)
// ============================================================================

export const dataSyncLog = pgTable('data_sync_log', {
  id: serial('id').primaryKey(),
  
  // Sync details
  syncType: varchar('sync_type', { length: 50 }).notNull(), // full, incremental, manual
  sourceFile: text('source_file').notNull(), // Google Drive file path
  sourceFileId: varchar('source_file_id', { length: 100 }),
  
  // Timing
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  durationSeconds: integer('duration_seconds'),
  
  // Results
  status: varchar('status', { length: 20 }).notNull(), // success, partial, failed
  recordsProcessed: integer('records_processed').default(0),
  recordsInserted: integer('records_inserted').default(0),
  recordsUpdated: integer('records_updated').default(0),
  recordsSkipped: integer('records_skipped').default(0),
  recordsFailed: integer('records_failed').default(0),
  
  // Errors
  errors: jsonb('errors'),
  warnings: jsonb('warnings'),
  
  // Data quality
  dataQualityScore: decimal('data_quality_score', { precision: 5, scale: 2 }),
  dataQualityIssues: jsonb('data_quality_issues'),
  
  // Metadata
  triggeredBy: varchar('triggered_by', { length: 50 }), // system, user, schedule
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  sourceFileIdx: index('data_sync_log_source_file_idx').on(table.sourceFile),
  statusIdx: index('data_sync_log_status_idx').on(table.status),
  startTimeIdx: index('data_sync_log_start_time_idx').on(table.startTime),
}));

// ============================================================================
// RELATIONS (Drizzle ORM)
// ============================================================================

export const productionBatchesRelations = relations(productionBatches, ({ one, many }) => ({
  tireModel: one(tireModels, {
    fields: [productionBatches.tireModelId],
    references: [tireModels.id],
  }),
  productionLine: one(productionLines, {
    fields: [productionBatches.productionLineId],
    references: [productionLines.id],
  }),
  inspections: many(qualityInspections),
  downTimeEvents: many(downTimeEvents),
}));

export const qualityInspectionsRelations = relations(qualityInspections, ({ one, many }) => ({
  tireModel: one(tireModels, {
    fields: [qualityInspections.tireModelId],
    references: [tireModels.id],
  }),
  batch: one(productionBatches, {
    fields: [qualityInspections.batchId],
    references: [productionBatches.id],
  }),
  productionLine: one(productionLines, {
    fields: [qualityInspections.productionLineId],
    references: [productionLines.id],
  }),
  inspector: one(operators, {
    fields: [qualityInspections.inspectorId],
    references: [operators.id],
  }),
  operator: one(operators, {
    fields: [qualityInspections.operatorId],
    references: [operators.id],
  }),
  defects: many(defectRecords),
}));

export const defectRecordsRelations = relations(defectRecords, ({ one }) => ({
  inspection: one(qualityInspections, {
    fields: [defectRecords.inspectionId],
    references: [qualityInspections.id],
  }),
  defectType: one(defectTypes, {
    fields: [defectRecords.defectTypeId],
    references: [defectTypes.id],
  }),
}));

export const rootCauseAnalysisRelations = relations(rootCauseAnalysis, ({ one }) => ({
  defectType: one(defectTypes, {
    fields: [rootCauseAnalysis.defectTypeId],
    references: [defectTypes.id],
  }),
  productionLine: one(productionLines, {
    fields: [rootCauseAnalysis.productionLineId],
    references: [productionLines.id],
  }),
  leadInvestigator: one(operators, {
    fields: [rootCauseAnalysis.leadInvestigator],
    references: [operators.id],
  }),
}));
