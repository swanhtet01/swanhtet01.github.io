import {
  shopBusinessChoiceFromIndustryPack,
  shopBusinessTemplateFromQuery,
  shopBusinessTemplates,
} from '../products/shop/business-templates.ts'
import { shopIndustryPacks, type ShopIndustryPackId } from './shop-service-scheduling.ts'
import { signupBusinessChoices } from './signup-trial.ts'
import { normalizeShopBusinessChoiceId } from './product-setup.ts'

const shopPickerChoices = signupBusinessChoices(shopBusinessTemplates, shopIndustryPacks)

// The picker stays de-duplicated: trades cover packs with a single trade, and
// only service packs without a trade are listed directly. Legacy pack URLs use
// the source-owned canonical choice for that pack, including pack fallbacks
// where several trades share one pack.
export const SHOP_BUSINESS_CHOICE_IDS: ReadonlySet<string> = new Set([
  ...shopPickerChoices.map((choice) => choice.id),
  ...shopIndustryPacks.map((pack) => shopBusinessChoiceFromIndustryPack(pack.id)),
])

export function requestedShopBusinessChoiceFromSearch(search: string): string | null {
  const query = new URLSearchParams(search)
  const tradeId = shopBusinessTemplateFromQuery(query.get('template'))
  if (tradeId) return normalizeShopBusinessChoiceId(`trade:${tradeId}`, SHOP_BUSINESS_CHOICE_IDS) ?? null
  const packId = query.get('pack')?.trim().toLowerCase()
  const pack = shopIndustryPacks.find((candidate) => candidate.id === packId)
  const choiceId = pack ? shopBusinessChoiceFromIndustryPack(pack.id) : null
  return normalizeShopBusinessChoiceId(choiceId, SHOP_BUSINESS_CHOICE_IDS) ?? null
}

export function shopIndustryPackIdForBusinessChoice(value: unknown): ShopIndustryPackId | null {
  const choiceId = normalizeShopBusinessChoiceId(value, SHOP_BUSINESS_CHOICE_IDS)
  if (!choiceId) return null
  if (choiceId.startsWith('trade:')) {
    const templateId = shopBusinessTemplateFromQuery(choiceId.slice('trade:'.length))
    return shopBusinessTemplates.find((template) => template.id === templateId)?.industryPackId ?? null
  }
  return shopIndustryPacks.find((pack) => pack.id === choiceId.slice('pack:'.length))?.id ?? null
}
