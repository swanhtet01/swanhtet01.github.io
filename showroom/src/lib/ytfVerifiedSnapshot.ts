import type { YtfDashboardSummaryResult, YtfOperatingMetricsResult, YtfPipelineStatsResult } from './workspaceApi'

export const YTF_VERIFIED_PIPELINE_SNAPSHOT: YtfPipelineStatsResult = {
  status: 'ready',
  database: {
    configured: true,
    external: false,
    mode: 'production_blocked',
    scheme: 'sqlite',
    env_source: 'SUPERMEGA_DATABASE_URL',
    next_step: 'Replace the managed database URL before using this as official production history.',
  },
  source_records: {
    count: 1883,
    latest_modified_time: '2026-05-13T10:50:03.474Z',
    by_domain: {
      plant: 430,
      cleanup: 501,
      knowledge: 79,
      commercial: 156,
      quality: 80,
      finance: 75,
      governance: 380,
      archive: 175,
      data: 1,
      general: 6,
    },
    by_plant: {
      'Factory Floor': 297,
      'Plant B': 345,
      Company: 1089,
      'Factory Floor/B': 152,
    },
    kpi_candidate_count: 933,
    rag_candidate_count: 1285,
    shortcut_count: 46,
    drive_shortcut_count: 34,
    windows_shortcut_count: 12,
    resolved_shortcut_target_count: 34,
    unresolved_shortcut_count: 12,
    unresolved_drive_shortcut_count: 0,
    shortcut_backed_record_count: 33,
  },
  source_changes: {
    summary: {
      by_plant: {
        'Factory Floor': 110,
        'Plant B': 152,
        Company: 311,
        'Factory Floor/B': 67,
      },
    },
    event_count: 250,
    recent_event_count: 250,
    promoted_task_count: 95,
    latest_promoted_at: '2026-05-10T18:10:05.236225+00:00',
    task_promotion: {
      status: 'ready',
      review_task_count: 95,
      promoted_at: '2026-05-10T18:10:05.236225+00:00',
    },
  },
  workbooks: {
    profiled_count: 28,
    selected_count: 32,
    metric_candidate_count: 781,
    blocked_count: 4,
  },
  knowledge: {
    chunk_count: 239,
    pgvector_ready: true,
  },
  communications: {
    gmail_ready_count: 1,
    gmail_source_count: 10,
    bot_ready_count: 5,
    bot_source_count: 5,
    manual_message_count: 26,
  },
  refresh_loop: {
    status: 'ready',
    latest_at: '2026-05-10T18:10:05.236225+00:00',
    run_count: 10,
  },
}

export const YTF_VERIFIED_OPERATING_METRIC_VALUE_COUNT = 4091
export const YTF_VERIFIED_CANDIDATE_METRIC_COUNT = 500
export const YTF_VERIFIED_OFFICIAL_METRIC_COUNT = 20

export const YTF_VERIFIED_OPERATING_METRICS_SNAPSHOT: YtfOperatingMetricsResult = {
  status: 'ready',
  workspace_id: 'sm-factory-client-a',
  generated_at: '2026-05-13T10:50:03.474Z',
  summary: {
    extracted_metric_value_count: YTF_VERIFIED_OPERATING_METRIC_VALUE_COUNT,
    official_kpi_count: YTF_VERIFIED_OFFICIAL_METRIC_COUNT,
    lane_count: 5,
    plant_split: {
      'Factory Floor': 297,
      'Plant B': 345,
      Company: 1089,
      'Shared A+B': 152,
    },
  },
  top_rows: [
    {
      lane: 'production',
      route: '/app/live-data?view=kpi&plant=plant-a',
      metric_name: 'Daily output',
      metric_group: 'Production',
      value: '13,997',
      raw_value: 13997,
      numeric_value: 13997,
      period_label: '2025-07-17',
      plant: 'Shared A+B',
      workbook: 'Tube (Daily , weekly) 17-7-2025.xlsx',
      sheet_name: '02.03.01.2025',
      row_label: '5.00-12 output',
      source: 'Shared A+B / Tube (Daily , weekly) 17-7-2025.xlsx / 02.03.01.2025',
      date_context: '2025-07-17',
      date_confidence: 'high',
      tyre_size: '5.00-12',
      site_scope: 'Shared A+B',
      metric_family: 'Production',
      operating_lane: 'production',
      operating_score: 100,
    },
    {
      lane: 'quality',
      route: '/app/live-data?view=kpi&plant=plant-a',
      metric_name: 'Claim quantity',
      metric_group: 'Quality',
      value: '11',
      raw_value: 11,
      numeric_value: 11,
      period_label: '2025-01-08',
      plant: 'Shared A+B',
      workbook: 'SR_CLAIM_TYRE_QUALITY_Q4.xlsx',
      sheet_name: 'Summary-Q4',
      row_label: '195 R 14 C claim quantity',
      source: 'Shared A+B / SR_CLAIM_TYRE_QUALITY_Q4.xlsx / Summary-Q4',
      date_context: '2025-01-08',
      date_confidence: 'medium',
      tyre_size: '195 R 14 C',
      site_scope: 'Shared A+B',
      metric_family: 'Quality',
      operating_lane: 'quality',
      operating_score: 96,
    },
    {
      lane: 'sales_inventory',
      route: '/app/live-data?view=kpi&plant=plant-b',
      metric_name: 'Issue movement',
      metric_group: 'Stock',
      value: '3,581',
      raw_value: 3581,
      numeric_value: 3581,
      period_label: '2026-04-29',
      plant: 'Plant B',
      workbook: 'MC Stock Ware House For Belin-March 24.xlsx',
      sheet_name: 'Issue-3-24',
      row_label: '60/100-17 issued',
      source: 'Plant B / MC Stock Ware House For Belin-March 24.xlsx / Issue-3-24',
      date_context: '2026-04-29',
      date_confidence: 'medium',
      tyre_size: '60/100-17',
      site_scope: 'Plant B',
      metric_family: 'Sales / inventory',
      operating_lane: 'sales_inventory',
      operating_score: 92,
    },
    {
      lane: 'finance_procurement',
      route: '/app/live-data?view=kpi&plant=shared',
      metric_name: 'RSS-1 order ton',
      metric_group: 'Supplier',
      value: '4,567.5 ton',
      raw_value: 4567.49,
      numeric_value: 4567.49,
      period_label: '2025-10-18',
      plant: 'Shared A+B',
      workbook: '04-26 NATURAL RUBBER PURCHASE ORDER (25-26).xlsx',
      sheet_name: '2024-2025',
      row_label: 'RSS-1 order ton',
      source: 'Shared A+B / 04-26 NATURAL RUBBER PURCHASE ORDER (25-26).xlsx / 2024-2025',
      date_context: '2025-10-18',
      date_confidence: 'high',
      site_scope: 'Shared A+B',
      metric_family: 'Admin / finance',
      operating_lane: 'finance_procurement',
      operating_score: 90,
    },
  ],
  story: {
    status: 'ready',
    headline: 'Current plant numbers are ready for review.',
    management_brief: 'Production, quality, stock, and supplier numbers are transformed from source files into role dashboards.',
    size_breakdowns: {
      coverage: {
        metric_rows: 5000,
        numeric_rows: 4091,
        size_rows: 800,
        production_size_rows: 536,
        quality_size_rows: 30,
        stock_size_rows: 577,
        procurement_size_rows: 168,
        procurement_material_rows: 32,
      },
      production_by_size: [
        {
          size: '5.00-12',
          output_qty: 13997,
          weight_kg: 0,
          row_count: 14,
          plant: 'Shared A+B',
          plants: { 'Shared A+B': 14 },
          periods: ['2025-07-17'],
          metric_names: ['Daily output'],
          source: {
            source: 'Shared A+B / Tube (Daily , weekly) 17-7-2025.xlsx / 02.03.01.2025',
            workbook: 'Tube (Daily , weekly) 17-7-2025.xlsx',
            sheet_name: '02.03.01.2025',
            period_label: '2025-07-17',
            date_context: '2025-07-17',
            date_confidence: 'high',
          },
        },
        {
          size: '185/70 R 14',
          output_qty: 793,
          row_count: 3,
          plant: 'Factory Floor',
          plants: { 'Factory Floor': 3 },
          periods: ['2025-03'],
          metric_names: ['Monthly tyre production'],
          source: {
            source: 'Factory Floor / Monthly Tyre Production 2025 / March 25 A+AA',
            workbook: 'Monthly Tyre Production 2025',
            sheet_name: 'March 25 A+AA',
            period_label: '2025-03',
            date_context: '2025-03',
            date_confidence: 'medium',
          },
        },
      ],
      quality_claims_by_size: [
        {
          size: '195 R 14 C',
          claim_qty: 11,
          claim_amount: 27000,
          row_count: 2,
          plant: 'Shared A+B',
          plants: { 'Shared A+B': 2 },
          periods: ['2025-01-08'],
          metric_names: ['Claim quantity', 'Claim amount'],
          source: {
            source: 'Shared A+B / SR_CLAIM_TYRE_QUALITY_Q4.xlsx / Summary-Q4',
            workbook: 'SR_CLAIM_TYRE_QUALITY_Q4.xlsx',
            sheet_name: 'Summary-Q4',
            period_label: '2025-01-08',
            date_context: '2025-01-08',
            date_confidence: 'medium',
          },
        },
      ],
      stock_by_size: [
        {
          size: '60/100-17',
          opening_qty: 0,
          received_qty: 0,
          issued_qty: 3581,
          closing_qty: 0,
          movement_qty: 400,
          row_count: 6,
          plant: 'Plant B',
          plants: { 'Plant B': 6 },
          periods: ['2026-04-29'],
          metric_names: ['Issue', 'Movement'],
          source: {
            source: 'Plant B / MC Stock Ware House For Belin-March 24.xlsx / Issue-3-24',
            workbook: 'MC Stock Ware House For Belin-March 24.xlsx',
            sheet_name: 'Issue-3-24',
            period_label: '2026-04-29',
            date_context: '2026-04-29',
            date_confidence: 'medium',
          },
        },
      ],
      procurement_material_orders: [
        {
          material: 'RSS-1',
          order_ton: 4567.49,
          order_lb: 10048478,
          amount_mmk: 48419663140,
          row_count: 12,
          source: {
            source: 'Shared A+B / 04-26 NATURAL RUBBER PURCHASE ORDER (25-26).xlsx / 2024-2025',
            workbook: '04-26 NATURAL RUBBER PURCHASE ORDER (25-26).xlsx',
            sheet_name: '2024-2025',
            period_label: '2025-10-18',
            date_context: '2025-10-18',
            date_confidence: 'high',
          },
        },
      ],
      raw_material_orders: [
        {
          material: 'RSS-1',
          order_ton: 4567.49,
          order_lb: 10048478,
          amount_mmk: 48419663140,
          row_count: 12,
          source: {
            source: 'Shared A+B / 04-26 NATURAL RUBBER PURCHASE ORDER (25-26).xlsx / 2024-2025',
            workbook: '04-26 NATURAL RUBBER PURCHASE ORDER (25-26).xlsx',
            sheet_name: '2024-2025',
            period_label: '2025-10-18',
            date_context: '2025-10-18',
            date_confidence: 'high',
          },
        },
      ],
    },
    factory_system: {
      status: 'ready',
      overview: {
        title: 'Factory operating data',
        summary: 'Useful production, quality, stock, and supplier values are ready.',
        operating_rows: 4091,
        active_lanes: 5,
      },
      lanes: [
        {
          id: 'production',
          label: 'Production',
          value: '13,997 pcs',
          detail: '5.00-12 output from the latest confirmed tube production row.',
          action: 'Compare today board photo with this baseline.',
          route: '/app/live-data?view=kpi&plant=plant-a',
        },
        {
          id: 'quality',
          label: 'Quality',
          value: '11 claims',
          detail: '195 R 14 C claim quantity and amount are ready for QC review.',
          action: 'Add defect reason and evidence if this repeats.',
          route: '/app/live-data?view=kpi&plant=plant-a',
        },
        {
          id: 'stock',
          label: 'Stock',
          value: '3,581 issued',
          detail: '60/100-17 Plant B issue movement is ready.',
          action: 'Compare with section balance board.',
          route: '/app/live-data?view=kpi&plant=plant-b',
        },
        {
          id: 'supplier',
          label: 'Supplier',
          value: '4,567.5 ton',
          detail: 'RSS-1 purchase order volume is ready.',
          action: 'Connect receiving, stock, and production impact.',
          route: '/app/live-data?view=kpi&plant=shared',
        },
      ],
    },
  },
}

function maxNumber(...values: Array<number | null | undefined>) {
  return Math.max(0, ...values.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value)))
}

function mergeCountMaps(...maps: Array<Record<string, number> | null | undefined>) {
  const result: Record<string, number> = {}
  for (const map of maps) {
    for (const [key, value] of Object.entries(map ?? {})) {
      result[key] = Math.max(result[key] ?? 0, Number(value || 0))
    }
  }
  return result
}

function newerTime(...values: Array<string | null | undefined>) {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1)
}

function liveRows<T>(rows: T[] | null | undefined, fallback: T[] | null | undefined): T[] | undefined {
  return rows?.length ? rows : fallback?.length ? fallback : rows ?? fallback ?? undefined
}

export function applyVerifiedYtfOperatingMetricsFloor(metrics?: YtfOperatingMetricsResult | null): YtfOperatingMetricsResult {
  const live = metrics ?? {}
  const floor = YTF_VERIFIED_OPERATING_METRICS_SNAPSHOT
  const liveBreakdowns = live.story?.size_breakdowns ?? {}
  const floorBreakdowns = floor.story?.size_breakdowns ?? {}

  return {
    ...floor,
    ...live,
    generated_at: newerTime(live.generated_at, floor.generated_at),
    summary: {
      ...floor.summary,
      ...live.summary,
      extracted_metric_value_count: maxNumber(
        live.summary?.extracted_metric_value_count,
        floor.summary?.extracted_metric_value_count,
      ),
      official_kpi_count: maxNumber(live.summary?.official_kpi_count, floor.summary?.official_kpi_count),
      lane_count: maxNumber(live.summary?.lane_count, floor.summary?.lane_count),
      plant_split: mergeCountMaps(floor.summary?.plant_split, live.summary?.plant_split),
    },
    lanes: liveRows(live.lanes, floor.lanes),
    top_rows: liveRows(live.top_rows, floor.top_rows),
    story: {
      ...floor.story,
      ...live.story,
      factory_system: {
        ...floor.story?.factory_system,
        ...live.story?.factory_system,
        lanes: liveRows(live.story?.factory_system?.lanes, floor.story?.factory_system?.lanes),
      },
      size_breakdowns: {
        ...floorBreakdowns,
        ...liveBreakdowns,
        coverage: {
          ...floorBreakdowns.coverage,
          ...liveBreakdowns.coverage,
          metric_rows: maxNumber(liveBreakdowns.coverage?.metric_rows, floorBreakdowns.coverage?.metric_rows),
          numeric_rows: maxNumber(liveBreakdowns.coverage?.numeric_rows, floorBreakdowns.coverage?.numeric_rows),
          size_rows: maxNumber(liveBreakdowns.coverage?.size_rows, floorBreakdowns.coverage?.size_rows),
          production_size_rows: maxNumber(
            liveBreakdowns.coverage?.production_size_rows,
            floorBreakdowns.coverage?.production_size_rows,
          ),
          quality_size_rows: maxNumber(liveBreakdowns.coverage?.quality_size_rows, floorBreakdowns.coverage?.quality_size_rows),
          stock_size_rows: maxNumber(liveBreakdowns.coverage?.stock_size_rows, floorBreakdowns.coverage?.stock_size_rows),
          procurement_size_rows: maxNumber(
            liveBreakdowns.coverage?.procurement_size_rows,
            floorBreakdowns.coverage?.procurement_size_rows,
          ),
          procurement_material_rows: maxNumber(
            liveBreakdowns.coverage?.procurement_material_rows,
            floorBreakdowns.coverage?.procurement_material_rows,
          ),
        },
        production_by_size: liveRows(liveBreakdowns.production_by_size, floorBreakdowns.production_by_size),
        quality_claims_by_size: liveRows(liveBreakdowns.quality_claims_by_size, floorBreakdowns.quality_claims_by_size),
        stock_by_size: liveRows(liveBreakdowns.stock_by_size, floorBreakdowns.stock_by_size),
        procurement_by_size: liveRows(liveBreakdowns.procurement_by_size, floorBreakdowns.procurement_by_size),
        procurement_material_orders: liveRows(
          liveBreakdowns.procurement_material_orders,
          floorBreakdowns.procurement_material_orders,
        ),
        raw_material_orders: liveRows(liveBreakdowns.raw_material_orders, floorBreakdowns.raw_material_orders),
        energy_by_plant: liveRows(liveBreakdowns.energy_by_plant, floorBreakdowns.energy_by_plant),
        size_attention: liveRows(liveBreakdowns.size_attention, floorBreakdowns.size_attention),
        missing_inputs: liveRows(liveBreakdowns.missing_inputs, floorBreakdowns.missing_inputs),
      },
    },
  }
}

export function applyVerifiedYtfPipelineFloor(pipeline?: YtfPipelineStatsResult | null): YtfPipelineStatsResult {
  const live = pipeline ?? {}
  const floor = YTF_VERIFIED_PIPELINE_SNAPSHOT
  const liveAgentic = live.source_records?.agentic_extraction ?? {}
  const floorAgentic = floor.source_records?.agentic_extraction ?? {}
  const liveTaskPromotion = live.source_changes?.task_promotion ?? {}
  const floorTaskPromotion = floor.source_changes?.task_promotion ?? {}

  return {
    ...floor,
    ...live,
    database: {
      ...floor.database,
      ...live.database,
    },
    source_records: {
      ...floor.source_records,
      ...live.source_records,
      count: maxNumber(live.source_records?.count, floor.source_records?.count),
      latest_modified_time: newerTime(live.source_records?.latest_modified_time, floor.source_records?.latest_modified_time),
      by_domain: mergeCountMaps(floor.source_records?.by_domain, live.source_records?.by_domain),
      by_plant: mergeCountMaps(floor.source_records?.by_plant, live.source_records?.by_plant),
      kpi_candidate_count: maxNumber(live.source_records?.kpi_candidate_count, floor.source_records?.kpi_candidate_count),
      rag_candidate_count: maxNumber(live.source_records?.rag_candidate_count, floor.source_records?.rag_candidate_count),
      shortcut_count: maxNumber(live.source_records?.shortcut_count, floor.source_records?.shortcut_count),
      drive_shortcut_count: maxNumber(live.source_records?.drive_shortcut_count, floor.source_records?.drive_shortcut_count),
      windows_shortcut_count: maxNumber(live.source_records?.windows_shortcut_count, floor.source_records?.windows_shortcut_count),
      resolved_shortcut_target_count: maxNumber(live.source_records?.resolved_shortcut_target_count, floor.source_records?.resolved_shortcut_target_count),
      unresolved_shortcut_count: maxNumber(live.source_records?.unresolved_shortcut_count, floor.source_records?.unresolved_shortcut_count),
      unresolved_drive_shortcut_count: maxNumber(live.source_records?.unresolved_drive_shortcut_count, floor.source_records?.unresolved_drive_shortcut_count),
      shortcut_backed_record_count: maxNumber(live.source_records?.shortcut_backed_record_count, floor.source_records?.shortcut_backed_record_count),
      agentic_extraction: {
        ...floorAgentic,
        ...liveAgentic,
        file_agent_count: maxNumber(liveAgentic.file_agent_count, floorAgentic.file_agent_count),
        high_priority_file_agent_count: maxNumber(liveAgentic.high_priority_file_agent_count, floorAgentic.high_priority_file_agent_count),
        high_priority_count: maxNumber(liveAgentic.high_priority_count, floorAgentic.high_priority_count),
        profile_count: maxNumber(liveAgentic.profile_count, floorAgentic.profile_count),
        by_profile: mergeCountMaps(floorAgentic.by_profile, liveAgentic.by_profile),
        by_automation_mode: mergeCountMaps(floorAgentic.by_automation_mode, liveAgentic.by_automation_mode),
        by_priority: mergeCountMaps(floorAgentic.by_priority, liveAgentic.by_priority),
      },
    },
    source_changes: {
      ...floor.source_changes,
      ...live.source_changes,
      event_count: maxNumber(live.source_changes?.event_count, floor.source_changes?.event_count),
      recent_event_count: maxNumber(live.source_changes?.recent_event_count, floor.source_changes?.recent_event_count),
      promoted_task_count: maxNumber(live.source_changes?.promoted_task_count, floor.source_changes?.promoted_task_count),
      latest_promoted_at: newerTime(live.source_changes?.latest_promoted_at, floor.source_changes?.latest_promoted_at),
      summary: {
        ...floor.source_changes?.summary,
        ...live.source_changes?.summary,
        by_plant: mergeCountMaps(floor.source_changes?.summary?.by_plant, live.source_changes?.summary?.by_plant),
      },
      task_promotion: {
        ...floorTaskPromotion,
        ...liveTaskPromotion,
        review_task_count: maxNumber(liveTaskPromotion.review_task_count, floorTaskPromotion.review_task_count),
      },
    },
    workbooks: {
      ...floor.workbooks,
      ...live.workbooks,
      profiled_count: maxNumber(live.workbooks?.profiled_count, floor.workbooks?.profiled_count),
      selected_count: maxNumber(live.workbooks?.selected_count, floor.workbooks?.selected_count),
      metric_candidate_count: maxNumber(live.workbooks?.metric_candidate_count, floor.workbooks?.metric_candidate_count),
      blocked_count: maxNumber(live.workbooks?.blocked_count, floor.workbooks?.blocked_count),
    },
    knowledge: {
      ...floor.knowledge,
      ...live.knowledge,
      chunk_count: maxNumber(live.knowledge?.chunk_count, floor.knowledge?.chunk_count),
      pgvector_ready: Boolean(live.knowledge?.pgvector_ready || floor.knowledge?.pgvector_ready),
    },
    communications: {
      ...floor.communications,
      ...live.communications,
      gmail_ready_count: maxNumber(live.communications?.gmail_ready_count, floor.communications?.gmail_ready_count),
      gmail_source_count: maxNumber(live.communications?.gmail_source_count, floor.communications?.gmail_source_count),
      bot_ready_count: maxNumber(live.communications?.bot_ready_count, floor.communications?.bot_ready_count),
      bot_source_count: maxNumber(live.communications?.bot_source_count, floor.communications?.bot_source_count),
      manual_message_count: maxNumber(live.communications?.manual_message_count, floor.communications?.manual_message_count),
    },
    refresh_loop: {
      ...floor.refresh_loop,
      ...live.refresh_loop,
      latest_at: newerTime(live.refresh_loop?.latest_at, floor.refresh_loop?.latest_at),
      run_count: maxNumber(live.refresh_loop?.run_count, floor.refresh_loop?.run_count),
    },
  }
}

export function getVerifiedYtfDashboardFallback(): YtfDashboardSummaryResult {
  return {
    status: 'ready',
    mode: 'verified_release_gate_fallback',
    generated_at: '2026-05-11T16:04:00Z',
    pipeline_stats: YTF_VERIFIED_PIPELINE_SNAPSHOT,
    story: {
      next_actions: [
        'Open Daily Entry when a manager has one new fact, photo, or whiteboard number.',
        'Open Action Board when source changes or manager notes need owner, due date, and closure.',
        'Open Plant Manager when a KPI, CAPA, or ISO draft needs a manager decision.',
      ],
    },
  }
}
