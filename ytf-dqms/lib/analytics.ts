/**
 * YTF DQMS Advanced Analytics Engine
 * 
 * Real-time quality metrics, statistical process control, cost of quality,
 * trend analysis, anomaly detection, and predictive analytics
 * 
 * Based on Plant B operational data and industry best practices
 */

import type {
  DailyQualityMetrics,
  QualityTrendData,
  DefectAnalysis,
  OperatorPerformance,
  RealTimeQualityStatus,
  CostOfQualityReport,
  DefectPrediction,
  QualityAnomalyDetection,
} from '../types';

// ============================================================================
// REAL-TIME QUALITY METRICS
// ============================================================================

/**
 * Calculate B+R rate (B grade + R grade) / Total * 100
 */
export function calculateBRRate(gradeA: number, gradeB: number, gradeR: number): number {
  const total = gradeA + gradeB + gradeR;
  if (total === 0) return 0;
  
  return parseFloat(((gradeB + gradeR) / total * 100).toFixed(2));
}

/**
 * Calculate yield rate (A grade / Total * 100)
 */
export function calculateYieldRate(gradeA: number, gradeB: number, gradeR: number): number {
  const total = gradeA + gradeB + gradeR;
  if (total === 0) return 0;
  
  return parseFloat((gradeA / total * 100).toFixed(2));
}

/**
 * Calculate defect rate (defects / total inspections * 100)
 */
export function calculateDefectRate(defectCount: number, totalInspections: number): number {
  if (totalInspections === 0) return 0;
  
  return parseFloat((defectCount / totalInspections * 100).toFixed(2));
}

/**
 * Get real-time quality status for a production line
 */
export async function getRealTimeQualityStatus(
  productionLineId: number,
  db: any
): Promise<RealTimeQualityStatus> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Determine current shift
  const currentHour = now.getHours();
  const currentShift = (currentHour >= 7 && currentHour < 19) ? 'day' : 'night';
  const shiftStartTime = currentShift === 'day' 
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0);
  
  // Get production line info
  const line = await db.query.productionLines.findFirst({
    where: (lines, { eq }) => eq(lines.id, productionLineId),
  });
  
  // Get today's production
  const todayProduction = await db.query.productionBatches.findMany({
    where: (batches, { and, eq, gte }) => and(
      eq(batches.productionLineId, productionLineId),
      gte(batches.startTime, todayStart)
    ),
  });
  
  const tiresProducedToday = todayProduction.reduce((sum, batch) => sum + batch.actualQuantity, 0);
  
  // Get this shift's production
  const shiftProduction = todayProduction.filter(batch => batch.startTime >= shiftStartTime);
  const tiresProducedThisShift = shiftProduction.reduce((sum, batch) => sum + batch.actualQuantity, 0);
  
  // Calculate current B+R rate
  const totalA = todayProduction.reduce((sum, batch) => sum + batch.gradeA, 0);
  const totalB = todayProduction.reduce((sum, batch) => sum + batch.gradeB, 0);
  const totalR = todayProduction.reduce((sum, batch) => sum + batch.gradeR, 0);
  const currentBRRate = calculateBRRate(totalA, totalB, totalR);
  
  // Calculate shift B+R rate
  const shiftA = shiftProduction.reduce((sum, batch) => sum + batch.gradeA, 0);
  const shiftB = shiftProduction.reduce((sum, batch) => sum + batch.gradeB, 0);
  const shiftR = shiftProduction.reduce((sum, batch) => sum + batch.gradeR, 0);
  const shiftBRRate = calculateBRRate(shiftA, shiftB, shiftR);
  
  // Get recent defects (last 2 hours)
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const recentInspections = await db.query.qualityInspections.findMany({
    where: (inspections, { and, eq, gte }) => and(
      eq(inspections.productionLineId, productionLineId),
      gte(inspections.inspectionTime, twoHoursAgo)
    ),
    with: {
      defects: {
        with: {
          defectType: true,
        },
      },
    },
  });
  
  // Aggregate recent defects by type
  const defectCounts: Record<string, { count: number; lastOccurrence: Date }> = {};
  
  for (const inspection of recentInspections) {
    for (const defect of inspection.defects || []) {
      const defectTypeName = defect.defectType.nameEn;
      
      if (!defectCounts[defectTypeName]) {
        defectCounts[defectTypeName] = { count: 0, lastOccurrence: inspection.inspectionTime };
      }
      
      defectCounts[defectTypeName].count++;
      
      if (inspection.inspectionTime > defectCounts[defectTypeName].lastOccurrence) {
        defectCounts[defectTypeName].lastOccurrence = inspection.inspectionTime;
      }
    }
  }
  
  const recentDefects = Object.entries(defectCounts).map(([defectType, data]) => ({
    defectType,
    count: data.count,
    lastOccurrence: data.lastOccurrence,
  }));
  
  // Determine status
  let status: 'normal' | 'warning' | 'critical' = 'normal';
  
  if (currentBRRate > 3.5) {
    status = 'critical';
  } else if (currentBRRate > 2.8) {
    status = 'warning';
  }
  
  // Check for defect spikes
  const hasDefectSpike = recentDefects.some(d => d.count >= 5);
  if (hasDefectSpike && status === 'normal') {
    status = 'warning';
  }
  
  // Get active alerts
  const alerts = await db.query.alerts.findMany({
    where: (alerts, { and, eq }) => and(
      eq(alerts.productionLineId, productionLineId),
      eq(alerts.status, 'active')
    ),
    orderBy: (alerts, { desc }) => [desc(alerts.createdAt)],
    limit: 5,
  });
  
  // Check if line is down
  const activeDownTime = await db.query.downTimeEvents.findFirst({
    where: (events, { and, eq }) => and(
      eq(events.productionLineId, productionLineId),
      eq(events.status, 'ongoing')
    ),
    orderBy: (events, { desc }) => [desc(events.startTime)],
  });
  
  return {
    timestamp: now,
    productionLineId,
    lineCode: line.code,
    lineName: line.name,
    shift: currentShift,
    shiftStartTime,
    tiresProducedToday,
    tiresProducedThisShift,
    currentBatchId: todayProduction[todayProduction.length - 1]?.id,
    currentBRRate,
    shiftBRRate,
    lastInspectionTime: recentInspections[recentInspections.length - 1]?.inspectionTime,
    recentDefects,
    status,
    alerts,
    isDown: !!activeDownTime,
    downSince: activeDownTime?.startTime,
    downReason: activeDownTime?.description,
  };
}

// ============================================================================
// STATISTICAL PROCESS CONTROL (SPC)
// ============================================================================

/**
 * Calculate control limits for SPC charts
 */
export function calculateControlLimits(data: number[]): {
  mean: number;
  ucl: number;
  lcl: number;
  usl?: number;
  lsl?: number;
} {
  if (data.length === 0) {
    return { mean: 0, ucl: 0, lcl: 0 };
  }
  
  // Calculate mean
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  
  // Calculate standard deviation
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  
  // Control limits (±3 sigma)
  const ucl = mean + (3 * stdDev);
  const lcl = Math.max(0, mean - (3 * stdDev)); // Can't be negative
  
  return {
    mean: parseFloat(mean.toFixed(2)),
    ucl: parseFloat(ucl.toFixed(2)),
    lcl: parseFloat(lcl.toFixed(2)),
  };
}

/**
 * Calculate process capability indices (Cp, Cpk)
 */
export function calculateProcessCapability(
  data: number[],
  lsl: number,
  usl: number
): {
  cp: number;
  cpk: number;
  interpretation: string;
} {
  if (data.length === 0) {
    return { cp: 0, cpk: 0, interpretation: 'Insufficient data' };
  }
  
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  
  // Cp = (USL - LSL) / (6 * σ)
  const cp = (usl - lsl) / (6 * stdDev);
  
  // Cpk = min((USL - μ) / (3 * σ), (μ - LSL) / (3 * σ))
  const cpkUpper = (usl - mean) / (3 * stdDev);
  const cpkLower = (mean - lsl) / (3 * stdDev);
  const cpk = Math.min(cpkUpper, cpkLower);
  
  // Interpretation
  let interpretation = '';
  if (cpk >= 2.0) {
    interpretation = 'Excellent - Process is highly capable';
  } else if (cpk >= 1.33) {
    interpretation = 'Good - Process is capable';
  } else if (cpk >= 1.0) {
    interpretation = 'Adequate - Process meets minimum requirements';
  } else {
    interpretation = 'Poor - Process is not capable';
  }
  
  return {
    cp: parseFloat(cp.toFixed(2)),
    cpk: parseFloat(cpk.toFixed(2)),
    interpretation,
  };
}

/**
 * Generate X-bar and R chart data for tire weight
 */
export async function generateXbarRChart(
  tireModelId: number,
  startDate: Date,
  endDate: Date,
  db: any
): Promise<{
  xbarChart: { date: Date; mean: number; ucl: number; lcl: number; data: number[] }[];
  rChart: { date: Date; range: number; ucl: number; lcl: number }[];
}> {
  // Get inspection data
  const inspections = await db.query.qualityInspections.findMany({
    where: (inspections, { and, eq, gte, lte }) => and(
      eq(inspections.tireModelId, tireModelId),
      gte(inspections.inspectionTime, startDate),
      lte(inspections.inspectionTime, endDate)
    ),
    orderBy: (inspections, { asc }) => [asc(inspections.inspectionTime)],
  });
  
  // Group by date
  const groupedByDate: Record<string, number[]> = {};
  
  for (const inspection of inspections) {
    if (!inspection.actualWeight) continue;
    
    const dateKey = inspection.inspectionTime.toISOString().split('T')[0];
    
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = [];
    }
    
    groupedByDate[dateKey].push(inspection.actualWeight);
  }
  
  // Calculate X-bar chart data
  const xbarChart = Object.entries(groupedByDate).map(([dateStr, weights]) => {
    const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const { ucl, lcl } = calculateControlLimits(weights);
    
    return {
      date: new Date(dateStr),
      mean: parseFloat(mean.toFixed(2)),
      ucl,
      lcl,
      data: weights,
    };
  });
  
  // Calculate R chart data (range chart)
  const rChart = Object.entries(groupedByDate).map(([dateStr, weights]) => {
    const range = Math.max(...weights) - Math.min(...weights);
    
    return {
      date: new Date(dateStr),
      range: parseFloat(range.toFixed(2)),
      ucl: 0, // Will be calculated based on historical ranges
      lcl: 0,
    };
  });
  
  // Calculate R chart control limits
  const ranges = rChart.map(r => r.range);
  const avgRange = ranges.reduce((sum, r) => sum + r, 0) / ranges.length;
  const rUcl = avgRange * 2.114; // D4 constant for n=5
  const rLcl = Math.max(0, avgRange * 0); // D3 constant for n=5
  
  rChart.forEach(r => {
    r.ucl = parseFloat(rUcl.toFixed(2));
    r.lcl = parseFloat(rLcl.toFixed(2));
  });
  
  return { xbarChart, rChart };
}

// ============================================================================
// COST OF QUALITY (COQ)
// ============================================================================

/**
 * Calculate Cost of Quality for a period
 */
export async function calculateCostOfQuality(
  startDate: Date,
  endDate: Date,
  db: any
): Promise<CostOfQualityReport> {
  // Get all defect records in period
  const defects = await db.query.defectRecords.findMany({
    where: (defects, { and, gte, lte }) => and(
      gte(defects.createdAt, startDate),
      lte(defects.createdAt, endDate)
    ),
  });
  
  // Internal failure costs (rework + scrap)
  const reworkCost = defects.reduce((sum, d) => sum + (d.reworkCost || 0), 0);
  const scrapCost = defects.reduce((sum, d) => sum + (d.scrapCost || 0), 0);
  
  // Get down time costs
  const downTimeEvents = await db.query.downTimeEvents.findMany({
    where: (events, { and, gte, lte }) => and(
      gte(events.startTime, startDate),
      lte(events.startTime, endDate)
    ),
  });
  
  const downTimeCost = downTimeEvents.reduce((sum, e) => sum + (e.costImpact || 0), 0);
  
  const internalFailureCost = reworkCost + scrapCost + downTimeCost;
  
  // External failure costs (warranty, returns, complaints)
  // This would come from customer complaint/return data
  const externalFailureCost = 0; // Placeholder
  
  // Appraisal costs (inspection, testing)
  // Estimate: number of inspections * cost per inspection
  const inspections = await db.query.qualityInspections.findMany({
    where: (inspections, { and, gte, lte }) => and(
      gte(inspections.inspectionTime, startDate),
      lte(inspections.inspectionTime, endDate)
    ),
  });
  
  const costPerInspection = 0.5; // USD (estimated)
  const appraisalCost = inspections.length * costPerInspection;
  
  // Prevention costs (training, process improvement)
  // This would come from training records and improvement projects
  const preventionCost = 0; // Placeholder
  
  const totalCOQ = internalFailureCost + externalFailureCost + appraisalCost + preventionCost;
  
  // Calculate COQ per tire
  const totalProduction = await db.query.productionBatches.findMany({
    where: (batches, { and, gte, lte }) => and(
      gte(batches.startTime, startDate),
      lte(batches.startTime, endDate)
    ),
  });
  
  const totalTires = totalProduction.reduce((sum, batch) => sum + batch.actualQuantity, 0);
  const coqPerTire = totalTires > 0 ? totalCOQ / totalTires : 0;
  
  // Get previous period for comparison
  const periodDuration = endDate.getTime() - startDate.getTime();
  const prevStartDate = new Date(startDate.getTime() - periodDuration);
  const prevEndDate = startDate;
  
  const prevCOQ = await calculateCostOfQuality(prevStartDate, prevEndDate, db);
  const vsLastPeriod = prevCOQ.totalCOQ > 0 
    ? ((totalCOQ - prevCOQ.totalCOQ) / prevCOQ.totalCOQ * 100)
    : 0;
  
  const trend = vsLastPeriod < -5 ? 'improving' : vsLastPeriod > 5 ? 'worsening' : 'stable';
  
  // Top cost drivers
  const topCostDrivers = [
    { category: 'Rework', cost: reworkCost, percentage: (reworkCost / totalCOQ * 100) },
    { category: 'Scrap', cost: scrapCost, percentage: (scrapCost / totalCOQ * 100) },
    { category: 'Down Time', cost: downTimeCost, percentage: (downTimeCost / totalCOQ * 100) },
    { category: 'Inspection', cost: appraisalCost, percentage: (appraisalCost / totalCOQ * 100) },
  ].sort((a, b) => b.cost - a.cost);
  
  return {
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    startDate,
    endDate,
    internalFailureCost: parseFloat(internalFailureCost.toFixed(2)),
    externalFailureCost: parseFloat(externalFailureCost.toFixed(2)),
    appraisalCost: parseFloat(appraisalCost.toFixed(2)),
    preventionCost: parseFloat(preventionCost.toFixed(2)),
    totalCOQ: parseFloat(totalCOQ.toFixed(2)),
    internalFailureBreakdown: {
      rework: parseFloat(reworkCost.toFixed(2)),
      scrap: parseFloat(scrapCost.toFixed(2)),
      downtime: parseFloat(downTimeCost.toFixed(2)),
      other: 0,
    },
    coqPerTire: parseFloat(coqPerTire.toFixed(2)),
    vsLastPeriod: parseFloat(vsLastPeriod.toFixed(2)),
    trend,
    potentialSavings: parseFloat((internalFailureCost * 0.5).toFixed(2)), // Estimate 50% reduction potential
    topCostDrivers: topCostDrivers.map(d => ({
      ...d,
      cost: parseFloat(d.cost.toFixed(2)),
      percentage: parseFloat(d.percentage.toFixed(2)),
    })),
  };
}

// ============================================================================
// DEFECT ANALYSIS
// ============================================================================

/**
 * Perform comprehensive defect analysis
 */
export async function analyzeDefects(
  startDate: Date,
  endDate: Date,
  db: any
): Promise<DefectAnalysis> {
  // Get all defects in period
  const defects = await db.query.defectRecords.findMany({
    where: (defects, { and, gte, lte }) => and(
      gte(defects.createdAt, startDate),
      lte(defects.createdAt, endDate)
    ),
    with: {
      defectType: true,
      inspection: {
        with: {
          productionLine: true,
        },
      },
    },
  });
  
  const totalDefects = defects.length;
  
  // By type
  const defectsByType: Record<number, { name: string; count: number }> = {};
  
  for (const defect of defects) {
    const typeId = defect.defectTypeId;
    
    if (!defectsByType[typeId]) {
      defectsByType[typeId] = {
        name: defect.defectType.nameEn,
        count: 0,
      };
    }
    
    defectsByType[typeId].count++;
  }
  
  const byType = Object.entries(defectsByType).map(([typeId, data]) => ({
    defectTypeId: parseInt(typeId),
    defectTypeName: data.name,
    count: data.count,
    percentage: parseFloat((data.count / totalDefects * 100).toFixed(2)),
    trend: 'stable' as 'up' | 'down' | 'stable', // Would need historical comparison
  })).sort((a, b) => b.count - a.count);
  
  // By category
  const byCategory: Record<string, number> = {};
  
  for (const defect of defects) {
    const category = defect.defectType.category;
    byCategory[category] = (byCategory[category] || 0) + 1;
  }
  
  // By production line
  const byLine: Record<string, { code: string; count: number }> = {};
  
  for (const defect of defects) {
    const lineCode = defect.inspection.productionLine.code;
    
    if (!byLine[lineCode]) {
      byLine[lineCode] = { code: lineCode, count: 0 };
    }
    
    byLine[lineCode].count++;
  }
  
  const byLineArray = Object.values(byLine).map(line => ({
    lineCode: line.code,
    count: line.count,
    percentage: parseFloat((line.count / totalDefects * 100).toFixed(2)),
  }));
  
  // Pareto analysis (80/20)
  const sortedDefects = [...byType].sort((a, b) => b.count - a.count);
  let cumulativeCount = 0;
  
  const paretoDefects = sortedDefects.map(defect => {
    cumulativeCount += defect.count;
    
    return {
      defectTypeName: defect.defectTypeName,
      count: defect.count,
      cumulativePercentage: parseFloat((cumulativeCount / totalDefects * 100).toFixed(2)),
    };
  });
  
  return {
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    totalDefects,
    byType,
    byCategory,
    byLine: byLineArray,
    byShift: { day: 0, night: 0 }, // Would need shift data from inspections
    paretoDefects,
  };
}

// ============================================================================
// OPERATOR PERFORMANCE ANALYSIS
// ============================================================================

/**
 * Analyze operator quality performance
 */
export async function analyzeOperatorPerformance(
  operatorId: number,
  startDate: Date,
  endDate: Date,
  db: any
): Promise<OperatorPerformance> {
  const operator = await db.query.operators.findFirst({
    where: (operators, { eq }) => eq(operators.id, operatorId),
  });
  
  // Get inspections for tires produced by this operator
  const inspections = await db.query.qualityInspections.findMany({
    where: (inspections, { and, eq, gte, lte }) => and(
      eq(inspections.operatorId, operatorId),
      gte(inspections.inspectionTime, startDate),
      lte(inspections.inspectionTime, endDate)
    ),
  });
  
  const tiresProduced = inspections.length;
  const gradeA = inspections.filter(i => i.grade === 'A').length;
  const gradeB = inspections.filter(i => i.grade === 'B').length;
  const gradeR = inspections.filter(i => i.grade === 'R').length;
  const brRate = calculateBRRate(gradeA, gradeB, gradeR);
  
  // Calculate quality score (0-100)
  const qualityScore = 100 - (brRate * 10); // Simple formula
  
  // Get average for all operators on same line
  const allOperators = await db.query.operators.findMany({
    where: (operators, { eq }) => eq(operators.productionLine, operator.productionLine),
  });
  
  const avgBRRate = allOperators.reduce((sum, op) => sum + (op.avgBRRate || 0), 0) / allOperators.length;
  const vsAverage = parseFloat((brRate - avgBRRate).toFixed(2));
  
  const targetBRRate = 3.0;
  const vsTarget = parseFloat((brRate - targetBRRate).toFixed(2));
  
  // Determine trend (would need historical data)
  const trend = 'stable' as 'improving' | 'stable' | 'declining';
  
  // Training recommendations
  const trainingNeeded = brRate > 3.5 || qualityScore < 70;
  const trainingRecommendations = trainingNeeded 
    ? ['Review defect identification', 'Machine settings training', 'Quality standards refresher']
    : [];
  
  return {
    operatorId,
    operatorName: operator.name,
    productionLine: operator.productionLine,
    shift: operator.shift,
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    tiresProduced,
    gradeA,
    gradeB,
    gradeR,
    brRate,
    qualityScore: parseFloat(qualityScore.toFixed(2)),
    vsAverage,
    vsTarget,
    trend,
    trainingNeeded,
    trainingRecommendations,
  };
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect quality anomalies using statistical methods
 */
export async function detectQualityAnomalies(
  productionLineId: number,
  db: any
): Promise<QualityAnomalyDetection[]> {
  const anomalies: QualityAnomalyDetection[] = [];
  
  // Get last 30 days of data
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  
  const metrics = await db.query.dailyQualityMetrics.findMany({
    where: (metrics, { and, eq, gte }) => and(
      eq(metrics.productionLineId, productionLineId),
      gte(metrics.date, thirtyDaysAgo)
    ),
    orderBy: (metrics, { asc }) => [asc(metrics.date)],
  });
  
  if (metrics.length < 7) {
    return anomalies; // Need at least 7 days of data
  }
  
  // Check for B+R rate spike
  const brRates = metrics.map(m => m.brRate);
  const { mean, ucl } = calculateControlLimits(brRates);
  const latestBRRate = brRates[brRates.length - 1];
  
  if (latestBRRate > ucl) {
    anomalies.push({
      timestamp: now,
      anomalyType: 'spike',
      severity: latestBRRate > 4.0 ? 'high' : 'medium',
      metric: 'B+R Rate',
      currentValue: latestBRRate,
      expectedValue: mean,
      deviation: parseFloat((latestBRRate - mean).toFixed(2)),
      productionLineId,
      possibleCauses: [
        'Machine settings drift',
        'Material quality issue',
        'Operator training needed',
        'Process parameter change',
      ],
      suggestedActions: [
        'Review machine settings',
        'Check material batch quality',
        'Inspect recent production',
        'Conduct root cause analysis',
      ],
      confidenceScore: 0.85,
    });
  }
  
  // Check for trend (drift)
  if (metrics.length >= 7) {
    const last7Days = brRates.slice(-7);
    const isIncreasing = last7Days.every((rate, i) => i === 0 || rate >= last7Days[i - 1]);
    
    if (isIncreasing && last7Days[last7Days.length - 1] > mean) {
      anomalies.push({
        timestamp: now,
        anomalyType: 'drift',
        severity: 'medium',
        metric: 'B+R Rate',
        currentValue: latestBRRate,
        expectedValue: mean,
        deviation: parseFloat((latestBRRate - mean).toFixed(2)),
        productionLineId,
        possibleCauses: [
          'Gradual process degradation',
          'Tool wear',
          'Material batch variation',
        ],
        suggestedActions: [
          'Schedule preventive maintenance',
          'Review process parameters',
          'Investigate material changes',
        ],
        confidenceScore: 0.75,
      });
    }
  }
  
  return anomalies;
}
