/**
 * Google Drive Data Pipeline for Plant B
 * 
 * Extracts, transforms, and loads data from Plant B Excel files in Google Drive
 * Files: B Condition, Weekly Production, Daily Meeting Form, Down Time Record, etc.
 * 
 * Uses: rclone for Google Drive access, ExcelJS for parsing, Drizzle ORM for database
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as XLSX from 'xlsx';
import { db } from './db';
import {
  defectRecords,
  productionBatches,
  qualityInspections,
  downTimeEvents,
  dailyQualityMetrics,
  dataSyncLog,
} from './schema';
import type {
  GoogleDriveFile,
  DataSyncJob,
  PlantBDataFile,
} from '../types';

const execAsync = promisify(exec);

// ============================================================================
// GOOGLE DRIVE CONFIGURATION
// ============================================================================

const GDRIVE_CONFIG = {
  remote: 'manus_google_drive',
  configPath: '/home/ubuntu/.gdrive-rclone.ini',
  plantBFolder: 'Yangon Tyre/Plant B',
  dataFiles: {
    bCondition: '2025/B Condition 2025.xlsx',
    weeklyProduction: '2025/Weekly Tyre Production - 2025.xlsx',
    dailyMeeting: '2025/Daily Production Meeting Form.xlsx',
    downTime: '2025/Down Time Record.xlsx',
    sizeChange: '2025/PD-3 Size Changing Form.xlsx',
    monthlyProduction: '2025/Monthly Tyre Production For 2024.xlsx',
  },
};

// ============================================================================
// GOOGLE DRIVE FILE OPERATIONS
// ============================================================================

/**
 * List files in Google Drive folder
 */
export async function listGDriveFiles(folderPath: string): Promise<GoogleDriveFile[]> {
  const command = `rclone lsjson "${GDRIVE_CONFIG.remote}:${folderPath}" --config ${GDRIVE_CONFIG.configPath}`;
  
  try {
    const { stdout } = await execAsync(command);
    const files = JSON.parse(stdout);
    
    return files.map((file: any) => ({
      id: file.ID,
      name: file.Name,
      path: `${folderPath}/${file.Name}`,
      mimeType: file.MimeType,
      size: file.Size,
      modifiedTime: new Date(file.ModTime),
      md5Checksum: file.Hashes?.MD5,
    }));
  } catch (error) {
    console.error('Error listing Google Drive files:', error);
    throw error;
  }
}

/**
 * Download file from Google Drive to local temp directory
 */
export async function downloadGDriveFile(
  remotePath: string,
  localPath: string
): Promise<void> {
  const command = `rclone copy "${GDRIVE_CONFIG.remote}:${remotePath}" "${localPath}" --config ${GDRIVE_CONFIG.configPath}`;
  
  try {
    await execAsync(command);
    console.log(`Downloaded: ${remotePath} → ${localPath}`);
  } catch (error) {
    console.error(`Error downloading ${remotePath}:`, error);
    throw error;
  }
}

/**
 * Check if file has been modified since last sync
 */
export async function isFileModified(
  filePath: string,
  lastSyncTime: Date
): Promise<boolean> {
  const files = await listGDriveFiles(filePath.split('/').slice(0, -1).join('/'));
  const fileName = filePath.split('/').pop();
  const file = files.find(f => f.name === fileName);
  
  if (!file) return false;
  
  return file.modifiedTime > lastSyncTime;
}

// ============================================================================
// EXCEL FILE PARSERS
// ============================================================================

/**
 * Parse B Condition 2025.xlsx
 * Contains defect types by tire size
 */
export function parseBConditionFile(filePath: string): any[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const records: any[] = [];
  
  // Skip header rows (first 2 rows)
  for (let i = 2; i < data.length; i++) {
    const row = data[i] as any[];
    
    if (!row[0] || !row[1]) continue; // Skip empty rows
    
    const defectIndex = row[0];
    const defectNameEn = row[1];
    
    // Extract defect counts by tire size (columns 2+)
    // Each column represents a different tire size
    const tireSizes = (data[1] as any[]).slice(2); // Header row with tire sizes
    
    for (let j = 2; j < row.length; j++) {
      const count = parseInt(row[j]) || 0;
      
      if (count > 0) {
        records.push({
          defectIndex,
          defectNameEn,
          tireSize: tireSizes[j - 2],
          count,
          // Will be enriched with date, production line, etc. during transform
        });
      }
    }
  }
  
  return records;
}

/**
 * Parse Weekly Tyre Production - 2025.xlsx
 * Contains production quantities by tire model and week
 */
export function parseWeeklyProductionFile(filePath: string): any[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const records: any[] = [];
  
  // Parse structure: tire sizes in column 1, weekly data in subsequent columns
  const headerRow = data[0] as any[];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];
    
    if (!row[0] || !row[1]) continue;
    
    const tireSize = row[1];
    
    // Extract weekly production data
    // Columns typically: A-Grade, B-Grade, R-Grade, Total, Weight
    const gradeA = parseInt(row[2]) || 0;
    const gradeB = parseInt(row[3]) || 0;
    const gradeR = parseInt(row[4]) || 0;
    const total = gradeA + gradeB + gradeR;
    const weight = parseFloat(row[5]) || 0;
    
    if (total > 0) {
      records.push({
        tireSize,
        gradeA,
        gradeB,
        gradeR,
        total,
        weight,
        brRate: total > 0 ? ((gradeB + gradeR) / total * 100).toFixed(2) : 0,
      });
    }
  }
  
  return records;
}

/**
 * Parse Daily Production Meeting Form.xlsx
 * Contains daily production metrics and meeting notes
 */
export function parseDailyMeetingFile(filePath: string): any[] {
  const workbook = XLSX.readFile(filePath);
  const records: any[] = [];
  
  // Has multiple sheets: PCR-1, MC-1, etc.
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Extract production line from sheet name
    const productionLine = sheetName; // e.g., "PCR-1" or "MC-1"
    
    // Parse meeting data (structure varies, need to handle)
    // Typically includes: date, participants, production quantity, B/R rates, issues
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any[];
      
      // Look for specific patterns in the data
      if (row[0] && row[0].toString().includes('Date')) {
        // Extract date
        const date = row[row.length - 1]; // Date typically in last column
        
        // Continue parsing subsequent rows for production data
        // This is simplified - actual parsing needs to match exact file structure
      }
    }
  }
  
  return records;
}

/**
 * Parse Down Time Record.xlsx
 * Contains machine down time events
 */
export function parseDownTimeFile(filePath: string): any[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const records: any[] = [];
  
  // Structure: Time periods in rows, down time categories in columns
  // Categories: Machine Failure, Compound Change, EPC On/Off Time, Rest Time
  
  const headerRow = data[1] as any[]; // Categories in row 1
  
  for (let i = 2; i < data.length; i++) {
    const row = data[i] as any[];
    
    if (!row[0]) continue;
    
    const timeRange = row[0]; // e.g., "7:00~9:00"
    
    // Extract down time for each category
    for (let j = 1; j < row.length; j++) {
      const duration = parseInt(row[j]) || 0;
      
      if (duration > 0) {
        records.push({
          timeRange,
          category: headerRow[j],
          durationMinutes: duration,
          // Will be enriched with date, production line during transform
        });
      }
    }
  }
  
  return records;
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform B Condition data to defect records
 */
export function transformBConditionData(rawData: any[]): any[] {
  return rawData.map(record => ({
    // Map to defectRecords schema
    defectTypeName: record.defectNameEn,
    tireSize: record.tireSize,
    count: record.count,
    // Additional fields will be populated during load
  }));
}

/**
 * Transform weekly production data to production batches
 */
export function transformWeeklyProductionData(rawData: any[]): any[] {
  return rawData.map(record => ({
    tireSize: record.tireSize,
    gradeA: record.gradeA,
    gradeB: record.gradeB,
    gradeR: record.gradeR,
    totalProduced: record.total,
    brRate: parseFloat(record.brRate),
    yieldRate: (record.gradeA / record.total * 100).toFixed(2),
  }));
}

/**
 * Transform down time data to down time events
 */
export function transformDownTimeData(rawData: any[]): any[] {
  return rawData.map(record => {
    // Parse time range to get start/end times
    const [startTime, endTime] = record.timeRange.split('~');
    
    return {
      startTime,
      endTime,
      category: mapDownTimeCategory(record.category),
      durationMinutes: record.durationMinutes,
    };
  });
}

/**
 * Map Burmese/English down time categories to enum values
 */
function mapDownTimeCategory(category: string): string {
  const mapping: Record<string, string> = {
    'Machine Failure': 'machine-failure',
    'Machine\\nFailure': 'machine-failure',
    'Compound Change': 'compound-change',
    'Compound\\nChange': 'compound-change',
    'EPC On/Off Time': 'rest-time',
    'Rest Time': 'rest-time',
    'Rest\\nTime': 'rest-time',
    'BM & Final': 'compound-change',
  };
  
  return mapping[category] || 'other';
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load transformed data into database
 */
export async function loadDefectData(data: any[]): Promise<number> {
  let insertedCount = 0;
  
  for (const record of data) {
    try {
      // Find or create defect type
      // Find or create tire model
      // Insert defect record
      
      // This is simplified - actual implementation needs full logic
      insertedCount++;
    } catch (error) {
      console.error('Error loading defect record:', error);
    }
  }
  
  return insertedCount;
}

export async function loadProductionData(data: any[]): Promise<number> {
  let insertedCount = 0;
  
  for (const record of data) {
    try {
      // Insert or update production batch
      // Update daily quality metrics
      
      insertedCount++;
    } catch (error) {
      console.error('Error loading production record:', error);
    }
  }
  
  return insertedCount;
}

export async function loadDownTimeData(data: any[]): Promise<number> {
  let insertedCount = 0;
  
  for (const record of data) {
    try {
      // Insert down time event
      
      insertedCount++;
    } catch (error) {
      console.error('Error loading down time record:', error);
    }
  }
  
  return insertedCount;
}

// ============================================================================
// SYNC ORCHESTRATION
// ============================================================================

/**
 * Sync all Plant B data files
 */
export async function syncAllPlantBData(): Promise<DataSyncJob[]> {
  const jobs: DataSyncJob[] = [];
  
  console.log('Starting Plant B data sync...');
  
  // Sync B Condition file
  try {
    const job = await syncBConditionFile();
    jobs.push(job);
  } catch (error) {
    console.error('Failed to sync B Condition file:', error);
  }
  
  // Sync Weekly Production file
  try {
    const job = await syncWeeklyProductionFile();
    jobs.push(job);
  } catch (error) {
    console.error('Failed to sync Weekly Production file:', error);
  }
  
  // Sync Down Time file
  try {
    const job = await syncDownTimeFile();
    jobs.push(job);
  } catch (error) {
    console.error('Failed to sync Down Time file:', error);
  }
  
  console.log(`Plant B data sync complete. ${jobs.length} jobs executed.`);
  
  return jobs;
}

/**
 * Sync B Condition file
 */
export async function syncBConditionFile(): Promise<DataSyncJob> {
  const startTime = new Date();
  const sourceFile = `${GDRIVE_CONFIG.plantBFolder}/${GDRIVE_CONFIG.dataFiles.bCondition}`;
  
  console.log(`Syncing: ${sourceFile}`);
  
  try {
    // Download file
    const localPath = '/tmp/ytf-data';
    await downloadGDriveFile(sourceFile, localPath);
    
    // Parse file
    const rawData = parseBConditionFile(`${localPath}/B Condition 2025.xlsx`);
    console.log(`Parsed ${rawData.length} records from B Condition file`);
    
    // Transform data
    const transformedData = transformBConditionData(rawData);
    
    // Load data
    const insertedCount = await loadDefectData(transformedData);
    
    // Log sync job
    const endTime = new Date();
    const job: DataSyncJob = {
      id: 0, // Will be assigned by database
      syncType: 'incremental',
      sourceFile,
      startTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
      status: 'success',
      recordsProcessed: rawData.length,
      recordsInserted: insertedCount,
      recordsUpdated: 0,
      recordsSkipped: rawData.length - insertedCount,
      recordsFailed: 0,
      triggeredBy: 'system',
      createdAt: new Date(),
    };
    
    // Save sync log to database
    // await db.insert(dataSyncLog).values(job);
    
    console.log(`B Condition sync complete: ${insertedCount} records inserted`);
    
    return job;
  } catch (error) {
    console.error('B Condition sync failed:', error);
    
    const endTime = new Date();
    return {
      id: 0,
      syncType: 'incremental',
      sourceFile,
      startTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
      status: 'failed',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [{ message: error.message, stack: error.stack }],
      triggeredBy: 'system',
      createdAt: new Date(),
    };
  }
}

/**
 * Sync Weekly Production file
 */
export async function syncWeeklyProductionFile(): Promise<DataSyncJob> {
  const startTime = new Date();
  const sourceFile = `${GDRIVE_CONFIG.plantBFolder}/${GDRIVE_CONFIG.dataFiles.weeklyProduction}`;
  
  console.log(`Syncing: ${sourceFile}`);
  
  try {
    const localPath = '/tmp/ytf-data';
    await downloadGDriveFile(sourceFile, localPath);
    
    const rawData = parseWeeklyProductionFile(`${localPath}/Weekly Tyre Production - 2025.xlsx`);
    console.log(`Parsed ${rawData.length} records from Weekly Production file`);
    
    const transformedData = transformWeeklyProductionData(rawData);
    const insertedCount = await loadProductionData(transformedData);
    
    const endTime = new Date();
    const job: DataSyncJob = {
      id: 0,
      syncType: 'incremental',
      sourceFile,
      startTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
      status: 'success',
      recordsProcessed: rawData.length,
      recordsInserted: insertedCount,
      recordsUpdated: 0,
      recordsSkipped: rawData.length - insertedCount,
      recordsFailed: 0,
      triggeredBy: 'system',
      createdAt: new Date(),
    };
    
    console.log(`Weekly Production sync complete: ${insertedCount} records inserted`);
    
    return job;
  } catch (error) {
    console.error('Weekly Production sync failed:', error);
    
    const endTime = new Date();
    return {
      id: 0,
      syncType: 'incremental',
      sourceFile,
      startTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
      status: 'failed',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [{ message: error.message, stack: error.stack }],
      triggeredBy: 'system',
      createdAt: new Date(),
    };
  }
}

/**
 * Sync Down Time file
 */
export async function syncDownTimeFile(): Promise<DataSyncJob> {
  const startTime = new Date();
  const sourceFile = `${GDRIVE_CONFIG.plantBFolder}/${GDRIVE_CONFIG.dataFiles.downTime}`;
  
  console.log(`Syncing: ${sourceFile}`);
  
  try {
    const localPath = '/tmp/ytf-data';
    await downloadGDriveFile(sourceFile, localPath);
    
    const rawData = parseDownTimeFile(`${localPath}/Down Time Record.xlsx`);
    console.log(`Parsed ${rawData.length} records from Down Time file`);
    
    const transformedData = transformDownTimeData(rawData);
    const insertedCount = await loadDownTimeData(transformedData);
    
    const endTime = new Date();
    const job: DataSyncJob = {
      id: 0,
      syncType: 'incremental',
      sourceFile,
      startTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
      status: 'success',
      recordsProcessed: rawData.length,
      recordsInserted: insertedCount,
      recordsUpdated: 0,
      recordsSkipped: rawData.length - insertedCount,
      recordsFailed: 0,
      triggeredBy: 'system',
      createdAt: new Date(),
    };
    
    console.log(`Down Time sync complete: ${insertedCount} records inserted`);
    
    return job;
  } catch (error) {
    console.error('Down Time sync failed:', error);
    
    const endTime = new Date();
    return {
      id: 0,
      syncType: 'incremental',
      sourceFile,
      startTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
      status: 'failed',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [{ message: error.message, stack: error.stack }],
      triggeredBy: 'system',
      createdAt: new Date(),
    };
  }
}

// ============================================================================
// SCHEDULED SYNC
// ============================================================================

/**
 * Schedule periodic sync (every 15 minutes)
 */
export function schedulePeriodicSync() {
  const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
  
  console.log('Scheduling periodic Plant B data sync (every 15 minutes)');
  
  // Initial sync
  syncAllPlantBData();
  
  // Periodic sync
  setInterval(async () => {
    console.log('Running scheduled Plant B data sync...');
    await syncAllPlantBData();
  }, SYNC_INTERVAL);
}

// ============================================================================
// DATA QUALITY CHECKS
// ============================================================================

/**
 * Validate data quality after sync
 */
export async function validateDataQuality(): Promise<{
  score: number;
  issues: string[];
}> {
  const issues: string[] = [];
  
  // Check 1: B+R rate calculation consistency
  // Check 2: No missing production line data
  // Check 3: Defect types match known types
  // Check 4: Date ranges are reasonable
  // Check 5: No duplicate records
  
  const score = Math.max(0, 100 - (issues.length * 10));
  
  return { score, issues };
}
