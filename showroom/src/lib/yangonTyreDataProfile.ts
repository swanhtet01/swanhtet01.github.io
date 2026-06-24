export type YangonTyreMonthlyQualityPoint = {
  month: string
  totalOutput: number
  bCount: number
  rCount: number
  bPlusRRate: number
}

export type YangonTyreFocusProduct = {
  name: string
  units: number
  bCount: number
  rCount: number
  bPlusRRate: number
  specWeight: number
  avgActualWeight: number
}

export const YANGON_TYRE_MONTHLY_QUALITY_2024: YangonTyreMonthlyQualityPoint[] = [
  { month: 'January', totalOutput: 24617, bCount: 81, rCount: 31, bPlusRRate: 0.45 },
  { month: 'February', totalOutput: 21721, bCount: 84, rCount: 31, bPlusRRate: 0.53 },
  { month: 'March', totalOutput: 23444, bCount: 136, rCount: 43, bPlusRRate: 0.76 },
  { month: 'April', totalOutput: 15679, bCount: 58, rCount: 22, bPlusRRate: 0.51 },
  { month: 'May', totalOutput: 23997, bCount: 109, rCount: 31, bPlusRRate: 0.58 },
  { month: 'June', totalOutput: 24680, bCount: 70, rCount: 22, bPlusRRate: 0.37 },
  { month: 'July', totalOutput: 23997, bCount: 90, rCount: 39, bPlusRRate: 0.54 },
  { month: 'August', totalOutput: 24542, bCount: 68, rCount: 31, bPlusRRate: 0.4 },
  { month: 'September', totalOutput: 17580, bCount: 66, rCount: 26, bPlusRRate: 0.52 },
  { month: 'October', totalOutput: 13066, bCount: 35, rCount: 25, bPlusRRate: 0.46 },
  { month: 'November', totalOutput: 18122, bCount: 72, rCount: 17, bPlusRRate: 0.49 },
  { month: 'December', totalOutput: 20222, bCount: 59, rCount: 27, bPlusRRate: 0.43 },
]

export const YANGON_TYRE_FOCUS_PRODUCTS_2025: YangonTyreFocusProduct[] = [
  { name: '155 R 12C YT-168', units: 3714, bCount: 16, rCount: 3, bPlusRRate: 0.51, specWeight: 7.49, avgActualWeight: 7.54 },
  { name: '7.00 - 16', units: 3438, bCount: 2, rCount: 8, bPlusRRate: 0.29, specWeight: 18.37, avgActualWeight: 18.57 },
  { name: '8.25 - 16', units: 3146, bCount: 8, rCount: 6, bPlusRRate: 0.45, specWeight: 29.13, avgActualWeight: 29.08 },
  { name: '7.50 - 16', units: 2724, bCount: 2, rCount: 5, bPlusRRate: 0.26, specWeight: 23.31, avgActualWeight: 22.8 },
  { name: '5.00 - 12 12PR', units: 2450, bCount: 3, rCount: 0, bPlusRRate: 0.12, specWeight: 7.01, avgActualWeight: 7.27 },
  { name: '6.00 - 15', units: 2408, bCount: 5, rCount: 4, bPlusRRate: 0.37, specWeight: 12.06, avgActualWeight: 11.74 },
]

export const YANGON_TYRE_DATA_PROFILE = {
  sourceNote:
    'Profile built from the local Yangon Tyre workbooks in ../InsightFactory/data plus the YTF DQMS project notes already in this repo.',
  annualBiasOutput2024: 251667,
  annualBPlusRRate2024: 0.51,
  bestMonth2024: {
    month: 'June',
    totalOutput: 24680,
    bPlusRRate: 0.37,
  },
  worstMonth2024: {
    month: 'March',
    totalOutput: 23444,
    bPlusRRate: 0.76,
  },
  qualityTargets: [
    'Keep B+R consistently below 3.0%, then drive toward a 2.5% operating target.',
    'Cut defect-detection time from hours to minutes with line-linked incident capture.',
    'Attach every major closeout to root cause, evidence, owner, and verification.',
  ],
  productionLines: [
    'PD-1 Mixing: 270L mixer and 100L mixer',
    'PD-2 Extrusion and calendering',
    'PD-3 Building',
    'PD-4 Curing and final release',
  ],
  machineClusters: ['270L mixer', '100L mixer', 'extruder', 'calender', 'building machine', 'curing press'],
  topDefects: ['Inner separation', 'Sidewall crack', 'Bead deformation', 'Inner undercure', 'Tire weight wrong'],
  productFamilies: ['Bias tyres', 'Radial tyres', 'Motorcycle tyres', 'Commercial and light-truck tyres'],
  monthlyQuality2024: YANGON_TYRE_MONTHLY_QUALITY_2024,
  focusProducts2025: YANGON_TYRE_FOCUS_PRODUCTS_2025,
}
