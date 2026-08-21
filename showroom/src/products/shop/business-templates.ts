import type { CommerceItem, CommerceProductionMaterialUnit } from '../../core/commerce-workspace.ts'
import type { ShopIndustryPackId } from '../../core/shop-service-scheduling.ts'

export const SHOP_BUSINESS_TEMPLATE_SCHEMA = 'supermega.shop.business_template.v1' as const

export type ShopBusinessTemplateId =
  | 'mini-mart'
  | 'pharmacy'
  | 'phone-electronics'
  | 'fashion'
  | 'hardware'
  | 'tea-coffee'
  | 'auto-parts'
  | 'restaurant'
  | 'beauty-spa'
  | 'bakery'

export type ShopBusinessTemplateUnit = CommerceProductionMaterialUnit

export const shopBusinessTemplateUnits: readonly ShopBusinessTemplateUnit[] = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm'] as const

export type ShopBusinessTemplateItem = {
  sku: string
  name: string
  unit: ShopBusinessTemplateUnit
  costMmk: number
  priceMmk: number
  openingStock: number
  reorderAt: number
}

export type ShopBusinessSamplePayment = 'Cash' | 'KBZPay' | 'WavePay'

export type ShopBusinessSampleLine = {
  sku: string
  quantity: number
}

export type ShopBusinessSampleSale = {
  id: string
  recordedAt: string
  payment: ShopBusinessSamplePayment
  lines: readonly ShopBusinessSampleLine[]
}

export type ShopBusinessSampleOrder = {
  id: string
  customerName: string
  contact: string
  requestedAt: string
  promisedFor: string
  status: 'pending'
  note: string
  lines: readonly ShopBusinessSampleLine[]
}

export type ShopBusinessTemplate = {
  id: ShopBusinessTemplateId
  schema: typeof SHOP_BUSINESS_TEMPLATE_SCHEMA
  name: { en: string; my: string }
  description: string
  industryPackId: ShopIndustryPackId
  workflowTemplateId: 'retail-wholesale' | 'restaurant-ordering' | 'social-commerce'
  catalog: readonly ShopBusinessTemplateItem[]
  counterSales: readonly ShopBusinessSampleSale[]
  pendingOrder: ShopBusinessSampleOrder
}

// Sample activity is authored at fixed instants so the intervals between the
// records are reviewable. Installing those instants verbatim means a workspace
// created later opens on a promise that is already overdue and takings that are
// days old. Shift the whole set so the newest sale lands at provisioning time,
// which keeps every authored interval and leaves the promise ahead of the
// client rather than behind them.
export function rebaseWorkingSampleActivity(
  activity: Pick<ShopBusinessTemplate, 'counterSales' | 'pendingOrder'>,
  provisionedAt: string,
): Pick<ShopBusinessTemplate, 'counterSales' | 'pendingOrder'> {
  const provisioned = Date.parse(provisionedAt)
  const latest = Math.max(...activity.counterSales.map((sale) => Date.parse(sale.recordedAt)))
  if (!Number.isFinite(provisioned) || !Number.isFinite(latest)) return activity
  const shift = (value: string) => {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed + provisioned - latest).toISOString() : value
  }
  // Nothing already recorded may land after provisioning. An order requested in the future is
  // refused by every accountable transition -- the owner presses the primary button and it does
  // nothing -- until the clock catches up. Templates are authored by hand, so clamp here rather
  // than trusting each one to keep its request instant behind its newest sale.
  const clampToProvisioned = (value: string) => {
    const parsed = Date.parse(value)
    if (!Number.isFinite(parsed)) return value
    const shifted = parsed + provisioned - latest
    return new Date(Math.min(shifted, provisioned)).toISOString()
  }
  const { pendingOrder } = activity
  const requestedAt = clampToProvisioned(pendingOrder.requestedAt)
  const promisedFor = shift(pendingOrder.promisedFor)
  return {
    counterSales: activity.counterSales.map((sale) => ({ ...sale, recordedAt: clampToProvisioned(sale.recordedAt) })),
    pendingOrder: {
      ...pendingOrder,
      requestedAt,
      // The promise is the one instant that is meant to be ahead of the client. Keep the authored
      // interval, but never let a clamped request overtake it.
      promisedFor: Date.parse(promisedFor) > Date.parse(requestedAt) ? promisedFor : new Date(Date.parse(requestedAt) + 60 * 60 * 1000).toISOString(),
    },
  }
}

type ItemRow = readonly [sku: string, name: string, unit: ShopBusinessTemplateUnit, costMmk: number, priceMmk: number, openingStock: number, reorderAt: number]

const rows = (source: readonly ItemRow[]): readonly ShopBusinessTemplateItem[] =>
  source.map(([sku, name, unit, costMmk, priceMmk, openingStock, reorderAt]) => ({ sku, name, unit, costMmk, priceMmk, openingStock, reorderAt }))

// Seeds carry the goods a trade actually stocks. The bookable services its industry pack offers
// are appended below rather than repeated in all eight catalogs, so a new template cannot ship
// with an unchargeable service by omission.
const shopBusinessTemplateSeeds: readonly ShopBusinessTemplate[] = [
  {
    id: 'mini-mart',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Mini-mart & grocery', my: 'ကုန်စုံဆိုင်' },
    description: 'Everyday groceries, household items, and counter sales with reorder levels.',
    industryPackId: 'retail',
    workflowTemplateId: 'retail-wholesale',
    catalog: rows([
      ['RICE-25KG', 'Premium rice 25kg', 'bag', 68_000, 75_000, 14, 6],
      ['OIL-1L', 'Cooking oil 1L', 'l', 8_200, 9_500, 40, 16],
      ['SUGAR-1KG', 'White sugar 1kg', 'kg', 3_600, 4_300, 30, 10],
      ['SALT-500G', 'Iodized salt 500g', 'g', 500, 800, 48, 12],
      ['EGG-TRAY30', 'Chicken eggs tray of 30', 'pack', 8_500, 9_800, 20, 8],
      ['NOODLE-CUP', 'Instant noodle cup', 'pcs', 700, 1_000, 96, 30],
      ['MILK-COND', 'Condensed milk can', 'pcs', 1_900, 2_500, 36, 12],
      ['COFFEE-3IN1', 'Coffee mix 30 sachets', 'pack', 6_800, 8_000, 24, 8],
      ['SOAP-BAR', 'Bath soap bar', 'pcs', 900, 1_300, 40, 15],
      ['SHAMPOO-170ML', 'Shampoo 170ml', 'ml', 2_800, 3_600, 18, 6],
      ['TOOTHPASTE-150G', 'Toothpaste 150g', 'g', 2_300, 3_000, 22, 8],
      ['DETERGENT-900G', 'Detergent powder 900g', 'pack', 3_900, 4_800, 16, 6],
      ['WATER-1L', 'Purified drinking water 1L', 'pcs', 350, 600, 4, 12],
    ]),
    counterSales: [
      { id: 'mini-mart-sale-1', recordedAt: '2026-08-03T02:35:00.000Z', payment: 'Cash', lines: [{ sku: 'RICE-25KG', quantity: 1 }, { sku: 'OIL-1L', quantity: 2 }] },
      { id: 'mini-mart-sale-2', recordedAt: '2026-08-03T04:10:00.000Z', payment: 'KBZPay', lines: [{ sku: 'COFFEE-3IN1', quantity: 1 }, { sku: 'MILK-COND', quantity: 2 }] },
      { id: 'mini-mart-sale-3', recordedAt: '2026-08-03T08:45:00.000Z', payment: 'Cash', lines: [{ sku: 'SOAP-BAR', quantity: 2 }, { sku: 'TOOTHPASTE-150G', quantity: 1 }] },
    ],
    pendingOrder: {
      id: 'mini-mart-order-1',
      customerName: 'Daw Khin Aye',
      contact: '09-782-000-111',
      requestedAt: '2026-08-03T05:00:00.000Z',
      promisedFor: '2026-08-05T03:30:00.000Z',
      status: 'pending',
      note: 'Monthly household restock. Pickup at the counter.',
      lines: [{ sku: 'EGG-TRAY30', quantity: 2 }, { sku: 'RICE-25KG', quantity: 1 }, { sku: 'DETERGENT-900G', quantity: 1 }],
    },
  },
  {
    id: 'pharmacy',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Pharmacy', my: 'ဆေးဆိုင်' },
    description: 'Over-the-counter medicine and clinic supplies with strict reorder levels.',
    industryPackId: 'retail',
    workflowTemplateId: 'retail-wholesale',
    catalog: rows([
      ['PARA-500-STRIP', 'Paracetamol 500mg strip of 10', 'pack', 700, 1_000, 60, 20],
      ['ORS-SACHET', 'ORS rehydration sachet', 'pcs', 300, 500, 80, 30],
      ['VITC-1000', 'Vitamin C 1000mg bottle', 'pcs', 5_200, 6_500, 24, 8],
      ['COUGH-100ML', 'Cough syrup 100ml', 'ml', 2_600, 3_500, 18, 6],
      ['ANTACID-TAB', 'Antacid tablets strip', 'pack', 900, 1_400, 40, 15],
      ['BANDAGE-ROLL', 'Elastic bandage roll', 'roll', 1_500, 2_200, 25, 10],
      ['GAUZE-PACK', 'Sterile gauze pack', 'pack', 1_000, 1_500, 30, 12],
      ['ALCOHOL-250ML', 'Rubbing alcohol 250ml', 'ml', 1_400, 2_000, 20, 8],
      ['THERMO-DIG', 'Digital thermometer', 'pcs', 7_500, 9_500, 10, 4],
      ['MASK-BOX50', 'Surgical mask box of 50', 'pack', 6_500, 8_500, 15, 6],
      ['GLOVES-BOX', 'Examination gloves box', 'pack', 8_800, 11_000, 12, 5],
      ['BP-MONITOR', 'Blood pressure monitor', 'pcs', 38_000, 46_000, 3, 4],
      ['SALINE-500ML', 'Normal saline 500ml', 'ml', 1_800, 2_500, 26, 10],
    ]),
    counterSales: [
      { id: 'pharmacy-sale-1', recordedAt: '2026-08-03T03:05:00.000Z', payment: 'Cash', lines: [{ sku: 'PARA-500-STRIP', quantity: 2 }, { sku: 'ORS-SACHET', quantity: 4 }] },
      { id: 'pharmacy-sale-2', recordedAt: '2026-08-03T06:20:00.000Z', payment: 'WavePay', lines: [{ sku: 'VITC-1000', quantity: 1 }, { sku: 'MASK-BOX50', quantity: 1 }] },
    ],
    pendingOrder: {
      id: 'pharmacy-order-1',
      customerName: 'U Tun Lin (Shwe Clinic)',
      contact: '09-965-222-333',
      requestedAt: '2026-08-03T04:30:00.000Z',
      promisedFor: '2026-08-04T07:00:00.000Z',
      status: 'pending',
      note: 'Clinic weekly consumables. Confirm gauze batch dates on handover.',
      lines: [{ sku: 'GAUZE-PACK', quantity: 6 }, { sku: 'GLOVES-BOX', quantity: 2 }, { sku: 'ALCOHOL-250ML', quantity: 4 }],
    },
  },
  {
    id: 'phone-electronics',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Phone & electronics', my: 'ဖုန်းနှင့် အီလက်ထရွန်နစ်ဆိုင်' },
    description: 'Phone accessories and small electronics with fast-moving counter stock.',
    industryPackId: 'retail',
    workflowTemplateId: 'retail-wholesale',
    catalog: rows([
      ['CHARGER-TYPEC', 'Type-C fast charger 25W', 'pcs', 9_500, 13_500, 20, 8],
      ['CABLE-USBC-1M', 'USB-C cable 1m', 'm', 2_800, 4_500, 35, 12],
      ['EARBUD-TWS', 'Wireless earbuds', 'pcs', 24_000, 32_000, 12, 5],
      ['POWERBANK-10K', 'Power bank 10000mAh', 'pcs', 28_000, 36_000, 10, 4],
      ['SCREEN-67', 'Screen protector 6.7 inch', 'pcs', 1_500, 3_000, 50, 15],
      ['CASE-CLEAR', 'Clear phone case', 'pcs', 2_500, 4_500, 40, 12],
      ['SPEAKER-BT', 'Bluetooth speaker', 'pcs', 32_000, 42_000, 8, 3],
      ['MEMORY-64GB', 'MicroSD card 64GB', 'pcs', 12_000, 16_000, 18, 6],
      ['ADAPTER-3PIN', '3-pin travel adapter', 'pcs', 3_500, 5_500, 25, 8],
      ['HOLDER-CAR', 'Car phone holder', 'pcs', 6_500, 9_500, 14, 5],
      ['SIM-TOOL', 'SIM ejector tool set', 'pcs', 500, 1_200, 2, 6],
      ['BULB-LED9W', 'LED bulb 9W', 'pcs', 1_800, 2_800, 45, 15],
      ['EXTENSION-4WAY', 'Extension socket 4-way', 'pcs', 8_500, 12_000, 16, 6],
    ]),
    counterSales: [
      { id: 'phone-electronics-sale-1', recordedAt: '2026-08-03T03:40:00.000Z', payment: 'KBZPay', lines: [{ sku: 'CHARGER-TYPEC', quantity: 1 }, { sku: 'CABLE-USBC-1M', quantity: 1 }] },
      { id: 'phone-electronics-sale-2', recordedAt: '2026-08-03T05:55:00.000Z', payment: 'Cash', lines: [{ sku: 'SCREEN-67', quantity: 2 }, { sku: 'CASE-CLEAR', quantity: 1 }] },
      { id: 'phone-electronics-sale-3', recordedAt: '2026-08-03T09:15:00.000Z', payment: 'WavePay', lines: [{ sku: 'EARBUD-TWS', quantity: 1 }] },
    ],
    pendingOrder: {
      id: 'phone-electronics-order-1',
      customerName: 'Ko Zaw Myo',
      contact: '09-450-444-555',
      requestedAt: '2026-08-03T06:30:00.000Z',
      promisedFor: '2026-08-05T06:30:00.000Z',
      status: 'pending',
      note: 'Office order. Wants one receipt for all items.',
      lines: [{ sku: 'EXTENSION-4WAY', quantity: 3 }, { sku: 'BULB-LED9W', quantity: 10 }, { sku: 'ADAPTER-3PIN', quantity: 3 }],
    },
  },
  {
    id: 'fashion',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Fashion & clothing', my: 'ဖက်ရှင်အထည်ဆိုင်' },
    description: 'Clothing and accessories with size-level SKUs and seasonal reorder levels.',
    industryPackId: 'retail',
    workflowTemplateId: 'retail-wholesale',
    catalog: rows([
      ['TSHIRT-M-WHT', 'Cotton T-shirt medium white', 'pcs', 6_500, 11_000, 25, 8],
      ['TSHIRT-L-BLK', 'Cotton T-shirt large black', 'pcs', 6_500, 11_000, 22, 8],
      ['JEANS-32', 'Denim jeans size 32', 'pcs', 18_000, 28_000, 15, 5],
      ['LONGYI-MEN', 'Men pasoe longyi', 'pcs', 9_500, 15_000, 20, 6],
      ['LONGYI-WMN', 'Women htamein longyi', 'pcs', 10_500, 16_500, 18, 6],
      ['BLOUSE-S', 'Chiffon blouse small', 'pcs', 8_500, 14_000, 12, 4],
      ['HOODIE-L', 'Fleece hoodie large', 'pcs', 16_500, 24_000, 3, 5],
      ['CAP-BASE', 'Baseball cap', 'pcs', 4_500, 7_500, 30, 10],
      ['SOCKS-3PACK', 'Cotton socks 3 pack', 'pack', 3_000, 5_000, 40, 12],
      ['BELT-LTHR', 'Leather belt', 'pcs', 7_500, 12_000, 14, 5],
      ['SCARF-COT', 'Cotton scarf', 'pcs', 5_000, 8_500, 16, 6],
      ['SLIPPER-42', 'Velvet slippers size 42', 'pcs', 4_000, 6_500, 24, 8],
    ]),
    counterSales: [
      { id: 'fashion-sale-1', recordedAt: '2026-08-03T04:25:00.000Z', payment: 'Cash', lines: [{ sku: 'TSHIRT-M-WHT', quantity: 2 }, { sku: 'CAP-BASE', quantity: 1 }] },
      { id: 'fashion-sale-2', recordedAt: '2026-08-03T07:50:00.000Z', payment: 'KBZPay', lines: [{ sku: 'LONGYI-WMN', quantity: 1 }, { sku: 'SCARF-COT', quantity: 1 }] },
    ],
    pendingOrder: {
      id: 'fashion-order-1',
      customerName: 'Ma Thiri Win',
      contact: '09-799-666-777',
      // Must sit at or before the newest counter sale (07:50): rebaseWorkingSampleActivity anchors
      // that sale to provisioning time, so a later request instant lands in the future and every
      // payment action on the order silently refuses until the clock catches up.
      requestedAt: '2026-08-03T06:40:00.000Z',
      promisedFor: '2026-08-06T04:00:00.000Z',
      status: 'pending',
      note: 'Uniform order for a tea shop team. Sizes confirmed by phone.',
      lines: [{ sku: 'TSHIRT-L-BLK', quantity: 6 }, { sku: 'SOCKS-3PACK', quantity: 6 }],
    },
  },
  {
    id: 'hardware',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Hardware & construction supply', my: 'ဆောက်လုပ်ရေးပစ္စည်းဆိုင်' },
    description: 'Building materials, tools, and site consumables with bulk counter orders.',
    industryPackId: 'retail',
    workflowTemplateId: 'retail-wholesale',
    catalog: rows([
      ['CEMENT-50KG', 'Cement 50kg bag', 'bag', 14_500, 16_500, 40, 15],
      ['REBAR-10MM', 'Steel rebar 10mm 12m', 'm', 7_800, 9_500, 60, 20],
      ['NAIL-2IN-KG', 'Common nails 2 inch per kg', 'kg', 3_200, 4_500, 25, 8],
      ['PAINT-4L-WHT', 'Emulsion paint 4L white', 'l', 26_000, 34_000, 12, 4],
      ['BRUSH-3IN', 'Paint brush 3 inch', 'pcs', 1_800, 3_000, 20, 6],
      ['PVC-PIPE-1IN', 'PVC pipe 1 inch 4m', 'pcs', 4_200, 6_000, 35, 12],
      ['WIRE-2.5MM', 'Electrical wire 2.5mm 90m roll', 'roll', 42_000, 52_000, 8, 3],
      ['PLYWOOD-9MM', 'Plywood sheet 9mm', 'sheet', 19_500, 25_500, 2, 6],
      ['HAMMER-CLAW', 'Claw hammer', 'pcs', 6_500, 9_500, 10, 4],
      ['SAW-HAND', 'Hand saw 20 inch', 'pcs', 7_500, 11_000, 8, 3],
      ['LOCK-PAD60', 'Padlock 60mm', 'pcs', 5_500, 8_500, 15, 5],
      ['TAPE-MEAS5M', 'Measuring tape 5m', 'pcs', 3_200, 5_000, 18, 6],
      ['GLOVES-WORK', 'Work gloves', 'pcs', 1_500, 2_500, 30, 10],
    ]),
    counterSales: [
      { id: 'hardware-sale-1', recordedAt: '2026-08-03T02:50:00.000Z', payment: 'Cash', lines: [{ sku: 'CEMENT-50KG', quantity: 5 }, { sku: 'NAIL-2IN-KG', quantity: 2 }] },
      { id: 'hardware-sale-2', recordedAt: '2026-08-03T05:30:00.000Z', payment: 'KBZPay', lines: [{ sku: 'PAINT-4L-WHT', quantity: 2 }, { sku: 'BRUSH-3IN', quantity: 2 }] },
      { id: 'hardware-sale-3', recordedAt: '2026-08-03T09:40:00.000Z', payment: 'Cash', lines: [{ sku: 'LOCK-PAD60', quantity: 1 }, { sku: 'TAPE-MEAS5M', quantity: 1 }] },
    ],
    pendingOrder: {
      id: 'hardware-order-1',
      customerName: 'U Myint Soe (site foreman)',
      contact: '09-681-888-999',
      requestedAt: '2026-08-03T07:20:00.000Z',
      promisedFor: '2026-08-04T02:00:00.000Z',
      status: 'pending',
      note: 'Site delivery before concrete pour. Needs loading help at 8:30.',
      lines: [{ sku: 'CEMENT-50KG', quantity: 20 }, { sku: 'REBAR-10MM', quantity: 30 }, { sku: 'GLOVES-WORK', quantity: 10 }],
    },
  },
  {
    id: 'tea-coffee',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Tea & coffee shop', my: 'လက်ဖက်ရည်ဆိုင်' },
    description: 'Tea shop menu with counter orders, daily prep counts, and large preorders.',
    industryPackId: 'cafe',
    workflowTemplateId: 'restaurant-ordering',
    catalog: rows([
      ['TEA-SWEET', 'Myanmar sweet milk tea', 'pcs', 700, 1_500, 150, 40],
      ['TEA-PLAIN', 'Plain green tea pot', 'pcs', 200, 500, 120, 30],
      ['COFFEE-BLACK', 'Black coffee', 'pcs', 900, 2_000, 100, 30],
      ['COFFEE-MILK', 'Milk coffee', 'pcs', 1_200, 2_500, 90, 25],
      ['MOHINGA-BOWL', 'Mohinga bowl', 'pcs', 1_800, 3_500, 60, 20],
      ['NANPYAR-PE', 'Naan with pe byouk', 'pcs', 900, 2_000, 70, 20],
      ['EKYAKWAY', 'E kya kway pair', 'pcs', 500, 1_200, 80, 25],
      ['SAMOSA-VEG', 'Vegetable samosa', 'pcs', 400, 1_000, 90, 30],
      ['PARATA-SWEET', 'Sweet parata', 'pcs', 800, 1_800, 5, 20],
      ['BUN-CREAM', 'Cream bun', 'pcs', 600, 1_400, 40, 15],
      ['RICE-CHICKEN', 'Chicken rice plate', 'pcs', 3_200, 5_500, 40, 12],
      ['WATER-BOTTLE', 'Drinking water bottle', 'pcs', 350, 700, 96, 24],
    ]),
    counterSales: [
      { id: 'tea-coffee-sale-1', recordedAt: '2026-08-03T00:45:00.000Z', payment: 'Cash', lines: [{ sku: 'TEA-SWEET', quantity: 2 }, { sku: 'EKYAKWAY', quantity: 2 }] },
      { id: 'tea-coffee-sale-2', recordedAt: '2026-08-03T01:30:00.000Z', payment: 'KBZPay', lines: [{ sku: 'MOHINGA-BOWL', quantity: 1 }, { sku: 'TEA-PLAIN', quantity: 1 }] },
      { id: 'tea-coffee-sale-3', recordedAt: '2026-08-03T05:05:00.000Z', payment: 'Cash', lines: [{ sku: 'RICE-CHICKEN', quantity: 2 }, { sku: 'WATER-BOTTLE', quantity: 2 }] },
    ],
    pendingOrder: {
      id: 'tea-coffee-order-1',
      customerName: 'Daw Mya Sandar (office admin)',
      contact: '09-254-111-222',
      requestedAt: '2026-08-03T03:15:00.000Z',
      promisedFor: '2026-08-04T01:30:00.000Z',
      status: 'pending',
      note: 'Meeting breakfast for 20 people. Collect at 8:00, pack to go.',
      lines: [{ sku: 'TEA-SWEET', quantity: 20 }, { sku: 'SAMOSA-VEG', quantity: 20 }, { sku: 'BUN-CREAM', quantity: 20 }],
    },
  },
  {
    id: 'auto-parts',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Auto parts', my: 'ကားပစ္စည်းဆိုင်' },
    description: 'Vehicle consumables and spares with workshop counter sales.',
    industryPackId: 'retail',
    workflowTemplateId: 'retail-wholesale',
    catalog: rows([
      ['OIL-ENG-4L', 'Engine oil 10W-40 4L', 'l', 38_000, 48_000, 16, 6],
      ['FILTER-OIL', 'Oil filter', 'pcs', 6_500, 9_500, 24, 8],
      ['FILTER-AIR', 'Air filter', 'pcs', 8_500, 12_500, 18, 6],
      ['PLUG-SPARK', 'Spark plug', 'pcs', 4_500, 7_000, 40, 12],
      ['PAD-BRAKE-FR', 'Front brake pad set', 'pack', 28_000, 38_000, 10, 4],
      ['BATT-12V60', 'Car battery 12V 60Ah', 'pcs', 145_000, 175_000, 6, 2],
      ['BULB-H4', 'Headlight bulb H4', 'pcs', 3_500, 6_000, 30, 10],
      ['WIPER-20IN', 'Wiper blade 20 inch', 'pcs', 5_500, 8_500, 20, 6],
      ['COOLANT-4L', 'Radiator coolant 4L', 'l', 9_500, 13_500, 14, 5],
      ['BELT-FAN', 'Fan belt', 'pcs', 7_500, 11_000, 1, 4],
      ['FLUID-BRAKE', 'Brake fluid DOT4 500ml', 'ml', 6_000, 9_000, 12, 4],
      ['GREASE-500G', 'Multipurpose grease 500g', 'g', 4_200, 6_500, 15, 5],
      ['FUSE-KIT', 'Blade fuse assortment kit', 'pack', 2_500, 4_500, 22, 8],
    ]),
    counterSales: [
      { id: 'auto-parts-sale-1', recordedAt: '2026-08-03T03:20:00.000Z', payment: 'Cash', lines: [{ sku: 'OIL-ENG-4L', quantity: 1 }, { sku: 'FILTER-OIL', quantity: 1 }] },
      { id: 'auto-parts-sale-2', recordedAt: '2026-08-03T06:45:00.000Z', payment: 'KBZPay', lines: [{ sku: 'PLUG-SPARK', quantity: 4 }, { sku: 'BULB-H4', quantity: 2 }] },
    ],
    pendingOrder: {
      id: 'auto-parts-order-1',
      customerName: 'Ko Aung Ko (Golden Gate workshop)',
      contact: '09-540-333-444',
      requestedAt: '2026-08-03T04:50:00.000Z',
      promisedFor: '2026-08-04T05:00:00.000Z',
      status: 'pending',
      note: 'Workshop service job for two taxis. Invoice under workshop account.',
      lines: [{ sku: 'PAD-BRAKE-FR', quantity: 2 }, { sku: 'OIL-ENG-4L', quantity: 2 }, { sku: 'FILTER-AIR', quantity: 2 }],
    },
  },
  {
    id: 'restaurant',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Restaurant', my: 'စားသောက်ဆိုင်' },
    description: 'Full menu with table orders, kitchen prep counts, and booked group meals.',
    industryPackId: 'restaurant',
    workflowTemplateId: 'restaurant-ordering',
    catalog: rows([
      ['CURRY-CHICKEN', 'Chicken curry set with rice and soup', 'pcs', 4_200, 8_500, 40, 12],
      ['CURRY-PORK', 'Pork curry set with rice and soup', 'pcs', 4_600, 9_000, 32, 10],
      ['CURRY-FISH', 'Fish curry set with rice and soup', 'pcs', 4_900, 9_500, 28, 10],
      ['CURRY-MUTTON', 'Mutton curry set with rice and soup', 'pcs', 6_800, 12_500, 18, 6],
      ['RICE-STEAMED', 'Steamed rice plate', 'pcs', 300, 800, 120, 30],
      ['RICE-FRIED-EGG', 'Egg fried rice plate', 'pcs', 2_400, 5_000, 45, 15],
      ['NOODLE-KAUKSWE', 'Ohn no kauk swe bowl', 'pcs', 2_600, 5_500, 40, 12],
      ['NOODLE-SHAN', 'Shan noodle bowl', 'pcs', 2_200, 4_800, 38, 12],
      ['SALAD-LAHPET', 'Lahpet thoke tea leaf salad', 'pcs', 1_900, 4_500, 50, 15],
      ['SALAD-GINGER', 'Gyin thoke ginger salad', 'pcs', 1_700, 4_000, 4, 12],
      ['SOUP-CHINYAY', 'Chin yay hin sour soup bowl', 'pcs', 700, 2_000, 60, 20],
      ['GRILL-TILAPIA', 'Grilled whole tilapia', 'pcs', 6_500, 12_500, 14, 5],
      ['DRINK-LIME', 'Fresh lime juice', 'pcs', 900, 2_200, 60, 20],
    ]),
    counterSales: [
      { id: 'restaurant-sale-1', recordedAt: '2026-08-03T05:15:00.000Z', payment: 'Cash', lines: [{ sku: 'CURRY-CHICKEN', quantity: 2 }, { sku: 'RICE-STEAMED', quantity: 2 }] },
      { id: 'restaurant-sale-2', recordedAt: '2026-08-03T06:40:00.000Z', payment: 'KBZPay', lines: [{ sku: 'NOODLE-SHAN', quantity: 1 }, { sku: 'SALAD-LAHPET', quantity: 1 }, { sku: 'DRINK-LIME', quantity: 2 }] },
      { id: 'restaurant-sale-3', recordedAt: '2026-08-03T11:20:00.000Z', payment: 'Cash', lines: [{ sku: 'GRILL-TILAPIA', quantity: 1 }, { sku: 'RICE-STEAMED', quantity: 3 }, { sku: 'SOUP-CHINYAY', quantity: 3 }] },
    ],
    pendingOrder: {
      id: 'restaurant-order-1',
      customerName: 'Daw Nwe Nwe Aye (family booking)',
      contact: '09-317-555-666',
      requestedAt: '2026-08-03T07:45:00.000Z',
      promisedFor: '2026-08-04T11:00:00.000Z',
      status: 'pending',
      note: 'Family dinner for 12 people. Two tables held together from 17:30.',
      lines: [{ sku: 'CURRY-CHICKEN', quantity: 4 }, { sku: 'CURRY-FISH', quantity: 3 }, { sku: 'RICE-STEAMED', quantity: 12 }, { sku: 'SALAD-LAHPET', quantity: 2 }],
    },
  },
  {
    id: 'beauty-spa',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Beauty spa', my: 'စပါ အလှပြင်ဆိုင်' },
    description: 'Bookable treatments plus retail products, with the appointment book and a counter for both.',
    industryPackId: 'spa',
    workflowTemplateId: 'social-commerce',
    // Retail goods a spa sells alongside its services; the seven spa treatments
    // (SPA-SVC-*) are appended automatically from the spa industry pack.
    catalog: rows([
      ['SPA-OIL-AROMA', 'Aromatic massage oil 250ml', 'pcs', 6_000, 12_000, 24, 8],
      ['SPA-SCRUB-JAR', 'Herbal body scrub jar 200g', 'pcs', 5_000, 10_000, 18, 6],
      ['SPA-SERUM', 'Facial serum 30ml', 'pcs', 9_000, 18_000, 15, 5],
      ['SPA-THANAKA', 'Thanaka face pack 100g', 'pcs', 2_500, 5_500, 40, 12],
      ['SPA-TEA', 'Herbal wellness tea box', 'pcs', 3_000, 6_500, 30, 10],
      ['SPA-COMB', 'Bamboo hair comb', 'pcs', 1_200, 3_000, 25, 8],
      ['SPA-ROBE', 'Cotton spa robe', 'pcs', 12_000, 24_000, 12, 4],
      ['SPA-GIFT', 'Spa gift voucher card', 'pcs', 500, 2_000, 50, 15],
      ['SPA-ROLLON', 'Essential oil roll-on 10ml', 'pcs', 3_200, 7_000, 4, 6],
    ]),
    counterSales: [
      { id: 'beauty-spa-sale-1', recordedAt: '2026-08-03T04:30:00.000Z', payment: 'Cash', lines: [{ sku: 'SPA-SVC-MASSAGE', quantity: 1 }, { sku: 'SPA-OIL-AROMA', quantity: 1 }] },
      { id: 'beauty-spa-sale-2', recordedAt: '2026-08-03T07:15:00.000Z', payment: 'KBZPay', lines: [{ sku: 'SPA-SVC-FACIAL', quantity: 1 }, { sku: 'SPA-SERUM', quantity: 1 }] },
      { id: 'beauty-spa-sale-3', recordedAt: '2026-08-03T10:00:00.000Z', payment: 'Cash', lines: [{ sku: 'SPA-SVC-FOOT', quantity: 2 }] },
    ],
    pendingOrder: {
      id: 'beauty-spa-order-1',
      customerName: 'Daw Su Su Hlaing (bridal package)',
      contact: '09-255-444-333',
      requestedAt: '2026-08-03T08:00:00.000Z',
      promisedFor: '2026-08-05T02:00:00.000Z',
      status: 'pending',
      note: 'Bridal spa package for 3 before the wedding. Two therapists held for the morning.',
      lines: [{ sku: 'SPA-SVC-OIL', quantity: 3 }, { sku: 'SPA-SVC-FACIAL', quantity: 3 }, { sku: 'SPA-THANAKA', quantity: 3 }],
    },
  },
  {
    id: 'bakery',
    schema: SHOP_BUSINESS_TEMPLATE_SCHEMA,
    name: { en: 'Bakery & patisserie', my: 'မုန့်ဖုတ်ဆိုင်' },
    description: 'Fresh bread, cakes and pastries at the counter, with cake preorders held for a collection time.',
    industryPackId: 'cafe',
    workflowTemplateId: 'restaurant-ordering',
    catalog: rows([
      ['BREAD-WHITE', 'White sandwich loaf', 'pcs', 1_800, 3_000, 30, 10],
      ['BREAD-WHOLEWHEAT', 'Whole wheat loaf', 'pcs', 2_200, 3_800, 20, 8],
      ['BUN-COCONUT', 'Coconut bun', 'pcs', 500, 1_200, 60, 20],
      ['CROISSANT-BUTTER', 'Butter croissant', 'pcs', 1_200, 2_500, 36, 12],
      ['DONUT-GLAZED', 'Glazed donut', 'pcs', 700, 1_500, 48, 15],
      ['CAKE-SLICE-CHOC', 'Chocolate cake slice', 'pcs', 1_800, 3_500, 24, 8],
      ['CAKE-BIRTHDAY-1KG', 'Birthday cake 1kg', 'pcs', 18_000, 32_000, 6, 3],
      ['COOKIE-BUTTER-BOX', 'Butter cookie box', 'pack', 3_500, 6_500, 25, 8],
      ['TART-EGG', 'Egg tart', 'pcs', 900, 1_800, 40, 12],
      ['PUFF-CURRY', 'Curry puff', 'pcs', 800, 1_600, 5, 15],
      ['COFFEE-ICED', 'Iced coffee', 'pcs', 900, 2_200, 40, 15],
      ['WATER-500ML', 'Drinking water 500ml', 'pcs', 300, 600, 50, 15],
    ]),
    counterSales: [
      { id: 'bakery-sale-1', recordedAt: '2026-08-03T01:15:00.000Z', payment: 'Cash', lines: [{ sku: 'BREAD-WHITE', quantity: 2 }, { sku: 'CROISSANT-BUTTER', quantity: 3 }] },
      { id: 'bakery-sale-2', recordedAt: '2026-08-03T05:00:00.000Z', payment: 'KBZPay', lines: [{ sku: 'CAKE-SLICE-CHOC', quantity: 2 }, { sku: 'COFFEE-ICED', quantity: 2 }] },
      { id: 'bakery-sale-3', recordedAt: '2026-08-03T08:30:00.000Z', payment: 'Cash', lines: [{ sku: 'TART-EGG', quantity: 4 }, { sku: 'DONUT-GLAZED', quantity: 4 }] },
    ],
    pendingOrder: {
      id: 'bakery-order-1',
      customerName: 'Ma Ei Ei Phyu (birthday order)',
      contact: '09-273-555-666',
      requestedAt: '2026-08-03T06:00:00.000Z',
      promisedFor: '2026-08-04T03:00:00.000Z',
      status: 'pending',
      note: "Daughter's birthday party for 15. Collect the cake and cookie boxes at 9:00.",
      lines: [{ sku: 'CAKE-BIRTHDAY-1KG', quantity: 1 }, { sku: 'COOKIE-BUTTER-BOX', quantity: 2 }, { sku: 'BREAD-WHOLEWHEAT', quantity: 2 }],
    },
  },
] as const

// Every industry pack offers bookable services that carry a price, and the appointment book has
// no path to the ledger -- a booking reaches no order, no daily close and no accounting handoff.
// So unless the service is also a catalog item, the owner is quoted a price they cannot collect.
// SKUs and prices mirror the pack samples in client-onboarding.ts exactly, and
// test_industry_pack_sample_pairing.mjs pins both against shop-service-scheduling.ts so a price
// edited in one place and not the other fails the build rather than reaching a counter.
//
// costMmk is the staff time the service consumes, not a purchased good; the model requires a
// positive cost strictly below price, so it is carried at 60% of price to keep reported margin
// honest rather than showing service revenue as pure profit.
const packServiceRows: Readonly<Record<ShopIndustryPackId, readonly ItemRow[]>> = {
  retail: [
    ['RETAIL-SVC-SHOPPING', 'Personal shopping 30 min', 'pcs', 9_000, 15_000, 999, 0],
    ['RETAIL-SVC-PICKUP', 'Pickup window 15 min', 'pcs', 3_000, 5_000, 999, 0],
  ],
  cafe: [
    ['CAFE-SVC-CATERING', 'Catering consultation 30 min', 'pcs', 12_000, 20_000, 999, 0],
    ['CAFE-SVC-COLLECTION', 'Preorder collection 15 min', 'pcs', 3_000, 5_000, 999, 0],
  ],
  restaurant: [
    ['REST-SVC-DEPOSIT', 'Table reservation deposit', 'pcs', 6_000, 10_000, 999, 0],
    ['REST-SVC-EVENT', 'Private event consultation 45 min', 'pcs', 15_000, 25_000, 999, 0],
  ],
  spa: [
    // A deposit unit, copied from the restaurant pack's REST-SVC-DEPOSIT rather than invented --
    // including its NAME SHAPE. paymentStatus is binary, so part-payment cannot be expressed on
    // an order; it CAN be expressed as an ordinary counter sale, which is an ordinary order with
    // ordinary evidence that the daily close already understands. Priced as a 10,000 MMK unit so
    // quantity carries the amount: the shipped bridal package is 325,500 MMK, and ten of these is
    // the 100,000 a spa would actually ask for up front.
    //
    // The amount is deliberately NOT in the name. The price column is the only source of truth
    // for the price, and a name carrying its own copy of it becomes a lie the moment a shop
    // raises its deposit -- printing "deposit 10000 MMK" on a 15,000 MMK receipt, with nothing
    // enforcing the two stay in step. Name-and-price drift is exactly the class of fault
    // test_industry_pack_sample_pairing.mjs exists to catch, after it bit a real spa pilot.
    ['SPA-SVC-DEPOSIT', 'Treatment package deposit', 'pcs', 6_000, 10_000, 999, 0],
    ['SPA-SVC-CONSULT', 'Consultation 30 min', 'pcs', 12_000, 20_000, 999, 0],
    ['SPA-SVC-MASSAGE', 'Traditional Myanmar massage 60 min', 'pcs', 27_000, 45_000, 999, 0],
    ['SPA-SVC-OIL', 'Aromatic oil massage 90 min', 'pcs', 39_000, 65_000, 999, 0],
    ['SPA-SVC-FOOT', 'Foot massage 45 min', 'pcs', 16_800, 28_000, 999, 0],
    ['SPA-SVC-FACIAL', 'Facial treatment 45 min', 'pcs', 22_800, 38_000, 999, 0],
    ['SPA-SVC-SCRUB', 'Body scrub 60 min', 'pcs', 25_200, 42_000, 999, 0],
    ['SPA-SVC-STEAM', 'Herbal steam 30 min', 'pcs', 10_800, 18_000, 999, 0],
  ],
  gym: [
    // Same gap, same fix: a gym sells course blocks and memberships up front, and had no row to
    // take that money against either.
    ['GYM-SVC-DEPOSIT', 'Training package deposit', 'pcs', 6_000, 10_000, 999, 0],
    ['GYM-SVC-CONSULT', 'Fitness consultation 30 min', 'pcs', 9_000, 15_000, 999, 0],
    ['GYM-SVC-PT', 'Personal training 60 min', 'pcs', 18_000, 30_000, 999, 0],
    ['GYM-SVC-COMPOSITION', 'Body composition check 20 min', 'pcs', 4_800, 8_000, 999, 0],
    ['GYM-SVC-CLASS', 'Group class 60 min', 'pcs', 7_200, 12_000, 999, 0],
    ['GYM-SVC-YOGA', 'Yoga session 60 min', 'pcs', 9_000, 15_000, 999, 0],
    ['GYM-SVC-NUTRITION', 'Nutrition plan review 30 min', 'pcs', 12_000, 20_000, 999, 0],
  ],
  // School has the same gap -- term fees are paid in advance -- and deliberately does NOT get a
  // deposit row here. verify_app_build.mjs pins the school shop sample's SKU list EQUAL to its
  // storefront SKU list, in order, so adding one would force a deposit onto the storefront, where
  // openingStock 999 would also rank it above the coursebooks. That is a merchandising decision
  // for a person. test_industry_pack_sample_pairing.mjs asserts the pin still exists, so this
  // note cannot rot into a silent omission.
  school: [
    ['SCHOOL-SVC-ENROLL', 'Enrollment consultation 30 min', 'pcs', 6_000, 10_000, 999, 0],
    ['SCHOOL-SVC-PLACEMENT', 'Placement test 45 min', 'pcs', 3_000, 5_000, 999, 0],
    ['SCHOOL-SVC-ENGLISH', 'English class session 60 min', 'pcs', 12_000, 20_000, 999, 0],
    ['SCHOOL-SVC-MATHS', 'Maths class session 60 min', 'pcs', 12_000, 20_000, 999, 0],
    ['SCHOOL-SVC-TUTORING', 'Private tutoring 60 min', 'pcs', 21_000, 35_000, 999, 0],
    ['SCHOOL-SVC-EXAM', 'Exam preparation session 90 min', 'pcs', 18_000, 30_000, 999, 0],
  ],
}

/**
 * openingStock 999 on a service row means "always bookable", NOT deep stock on a shelf. Anything
 * that ranks a catalog by onHand has to demote these or they win every slot: the Ecommerce working
 * sample sorts by onHand and duly put "Catering consultation" and "Preorder collection" on a tea
 * shop's storefront ahead of the tea. Services became catalog items so they could be CHARGED for at
 * the counter; that is not the same as being the thing a shop merchandises online.
 */
const shopServiceSkus = new Set(Object.values(packServiceRows).flatMap((serviceRows) => serviceRows.map(([sku]) => sku)))

export function isShopServiceSku(sku: string) {
  return shopServiceSkus.has(sku)
}

export const shopBusinessTemplates: readonly ShopBusinessTemplate[] = shopBusinessTemplateSeeds.map(
  (template) => ({ ...template, catalog: [...template.catalog, ...rows(packServiceRows[template.industryPackId])] }),
)

export function shopBusinessTemplate(id: ShopBusinessTemplateId) {
  const template = shopBusinessTemplates.find((candidate) => candidate.id === id)
  if (!template) throw new Error('Choose a supported Shop business template.')
  return template
}

export function shopBusinessTemplateFromQuery(value: string | null): ShopBusinessTemplateId | null {
  if (!value) return null
  const requested = value.trim().toLowerCase()
  return shopBusinessTemplates.find((template) => template.id === requested)?.id ?? null
}

export function shopBusinessTemplateSetupPath(id: ShopBusinessTemplateId) {
  return `/settings/?product=shop&template=${encodeURIComponent(shopBusinessTemplate(id).id)}`
}

export function shopBusinessTemplateManagedCatalogPath(id: ShopBusinessTemplateId) {
  return `/shop/?template=${encodeURIComponent(shopBusinessTemplate(id).id)}`
}

export function shopBusinessChoiceFromIndustryPack(id: ShopIndustryPackId) {
  const matchingTemplates = shopBusinessTemplates.filter((template) => template.industryPackId === id)
  return matchingTemplates.length === 1 ? `trade:${matchingTemplates[0].id}` : `pack:${id}`
}

export function shopIndustryPackSetupPath(id: ShopIndustryPackId) {
  return `/settings/?product=shop&pack=${encodeURIComponent(id)}`
}

// Item names are the one free-text field here, and they were interpolated raw. No shipped
// name contains a comma today, so nothing was broken -- but "Front brake pad set, ceramic"
// is an ordinary thing to call a product, and it would have split into two columns and
// failed the whole template's import at provisioning time, with no clue as to why.
// Quoted per RFC 4180, which is what parseCsv in core/client-onboarding.ts already reads.
const csvField = (value: string) => `"${value.replaceAll('"', '""')}"`

export function shopBusinessTemplateCatalogCsv(id: ShopBusinessTemplateId) {
  const template = shopBusinessTemplate(id)
  const lines = template.catalog.map((item) => `${item.sku},${csvField(item.name)},${item.openingStock},${item.reorderAt},${item.priceMmk}`)
  return `sku,item_name,opening_stock,reorder_at,price_mmk\r\n${lines.join('\r\n')}\r\n`
}

export function shopBusinessTemplateCommerceItems(id: ShopBusinessTemplateId): CommerceItem[] {
  return shopBusinessTemplate(id).catalog.map((item) => ({
    sku: item.sku,
    name: item.name,
    onHand: item.openingStock,
    reorderAt: item.reorderAt,
    price: item.priceMmk,
  }))
}

export function shopBusinessTemplateLowStockItems(id: ShopBusinessTemplateId) {
  return shopBusinessTemplate(id).catalog.filter((item) => item.openingStock <= item.reorderAt)
}

export function shopBusinessTemplateSaleTotalMmk(id: ShopBusinessTemplateId, sale: ShopBusinessSampleSale) {
  const catalog = shopBusinessTemplate(id).catalog
  return sale.lines.reduce((total, line) => {
    const item = catalog.find((candidate) => candidate.sku === line.sku)
    if (!item) throw new Error(`Sample sale ${sale.id} references unknown SKU ${line.sku}.`)
    return total + item.priceMmk * line.quantity
  }, 0)
}

export function validateShopBusinessTemplates() {
  const templateIds = new Set<string>()
  const allowedUnits = new Set<string>(shopBusinessTemplateUnits)
  for (const template of shopBusinessTemplates) {
    if (template.schema !== SHOP_BUSINESS_TEMPLATE_SCHEMA) throw new Error(`${template.id} uses an unsupported schema.`)
    if (templateIds.has(template.id)) throw new Error(`Duplicate business template ${template.id}.`)
    templateIds.add(template.id)
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(template.id)) throw new Error(`${template.id} is not a canonical template id.`)
    if (!template.name.en.trim() || !template.name.my.trim()) throw new Error(`${template.id} needs both English and Myanmar display names.`)
    if (template.catalog.length < 12 || template.catalog.length > 20) throw new Error(`${template.id} must carry 12 to 20 starter items.`)
    const skus = new Set<string>()
    for (const item of template.catalog) {
      if (!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(item.sku)) throw new Error(`${template.id} item ${item.sku} is not a canonical SKU.`)
      if (skus.has(item.sku)) throw new Error(`${template.id} repeats SKU ${item.sku}.`)
      skus.add(item.sku)
      if (!item.name.trim() || item.name.length > 180 || item.name.includes(',')) throw new Error(`${template.id} item ${item.sku} has an invalid name.`)
      if (!allowedUnits.has(item.unit)) throw new Error(`${template.id} item ${item.sku} uses an unsupported unit.`)
      if (!Number.isSafeInteger(item.costMmk) || item.costMmk < 1) throw new Error(`${template.id} item ${item.sku} needs a positive whole MMK cost.`)
      if (!Number.isSafeInteger(item.priceMmk) || item.priceMmk < 1) throw new Error(`${template.id} item ${item.sku} needs a positive whole MMK price.`)
      if (item.costMmk >= item.priceMmk) throw new Error(`${template.id} item ${item.sku} must price above cost.`)
      if (!Number.isSafeInteger(item.openingStock) || item.openingStock < 0) throw new Error(`${template.id} item ${item.sku} needs whole opening stock.`)
      if (!Number.isSafeInteger(item.reorderAt) || item.reorderAt < 0) throw new Error(`${template.id} item ${item.sku} needs a whole reorder level.`)
    }
    if (shopBusinessTemplateLowStockItems(template.id).length !== 1) throw new Error(`${template.id} must stage exactly one low-stock situation.`)
    if (template.counterSales.length < 2 || template.counterSales.length > 3) throw new Error(`${template.id} must stage 2 or 3 sample counter sales.`)
    const saleIds = new Set<string>()
    for (const sale of template.counterSales) {
      if (saleIds.has(sale.id)) throw new Error(`${template.id} repeats sample sale ${sale.id}.`)
      saleIds.add(sale.id)
      if (Number.isNaN(Date.parse(sale.recordedAt)) || new Date(Date.parse(sale.recordedAt)).toISOString() !== sale.recordedAt) throw new Error(`${sale.id} needs an exact ISO timestamp.`)
      if (!sale.lines.length) throw new Error(`${sale.id} needs at least one line.`)
      for (const line of sale.lines) {
        if (!skus.has(line.sku)) throw new Error(`${sale.id} references unknown SKU ${line.sku}.`)
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error(`${sale.id} needs whole positive quantities.`)
      }
      if (shopBusinessTemplateSaleTotalMmk(template.id, sale) < 1) throw new Error(`${sale.id} must total a positive MMK amount.`)
    }
    const order = template.pendingOrder
    if (order.status !== 'pending') throw new Error(`${template.id} must stage one pending customer order.`)
    if (!order.customerName.trim() || !order.contact.trim() || !order.note.trim()) throw new Error(`${order.id} needs customer details.`)
    for (const stamp of [order.requestedAt, order.promisedFor]) {
      if (Number.isNaN(Date.parse(stamp)) || new Date(Date.parse(stamp)).toISOString() !== stamp) throw new Error(`${order.id} needs exact ISO timestamps.`)
    }
    if (Date.parse(order.promisedFor) <= Date.parse(order.requestedAt)) throw new Error(`${order.id} must promise after the request time.`)
    if (!order.lines.length) throw new Error(`${order.id} needs at least one line.`)
    for (const line of order.lines) {
      if (!skus.has(line.sku)) throw new Error(`${order.id} references unknown SKU ${line.sku}.`)
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error(`${order.id} needs whole positive quantities.`)
    }
  }
  if (templateIds.size !== 10) throw new Error('The Shop business template registry must carry exactly 10 templates.')
  return shopBusinessTemplates
}
