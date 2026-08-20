import { createShopServiceSchedule, type ShopIndustryPackId, type ShopService } from './shop-service-scheduling.ts'

/**
 * The one rule that says "this catalog line sells that bookable service".
 *
 * It lives in its own module because three unrelated things now depend on agreeing about it:
 * test_industry_pack_sample_pairing.mjs (every bookable service must have a catalog row),
 * shop-appointment-till-reconciliation.ts (which completed treatments never reached the till),
 * and withShopServiceMyanmarNames below (which catalog rows get the pack's Burmese name). Three
 * copies of a matching rule is three chances for them to drift apart silently.
 *
 * The rule: the catalog name either IS the service name, or is the service name followed by a
 * qualifier -- "Traditional Myanmar massage" pairs "Traditional Myanmar massage 60 min". The
 * trailing space matters; without it "Consultation" would pair "Consultationreport".
 *
 * Price is NOT part of this. The pairing test asserts price equality separately, on top of this
 * rule, because there it is checking shipped seed data. Callers reasoning about a real trading
 * day deliberately do not -- see shop-appointment-till-reconciliation.ts for why.
 */
export function catalogNameSellsShopService(catalogName: string, service: Pick<ShopService, 'name'>) {
  if (typeof catalogName !== 'string' || !service?.name) return false
  return catalogName === service.name || catalogName.startsWith(`${service.name} `)
}

/**
 * Which of these services does this catalog line sell, if any?
 *
 * Longest service name wins. Where one service name is a prefix of another -- "Facial treatment"
 * and a hypothetical "Facial treatment deluxe" -- the more specific one is the honest answer, and
 * resolving to exactly one service is what stops a single line being counted against two.
 */
export function shopServiceForCatalogName<T extends Pick<ShopService, 'name'>>(catalogName: string, services: readonly T[]): T | undefined {
  let best: T | undefined
  for (const service of services) {
    if (!catalogNameSellsShopService(catalogName, service)) continue
    if (!best || service.name.length > best.name.length) best = service
  }
  return best
}

type NameableCatalogItem = { name: string; nameMy?: string }

/**
 * Carry the pack's Burmese service names onto the catalog rows that sell those services.
 *
 * The appointment book has shown treatments in Burmese since the packs were deepened, while the
 * counter showed the same treatments in English -- and the translation was sitting thirty lines
 * away in shop-service-scheduling.ts the whole time, dropped by the copy that turns a CSV preview
 * into CommerceItems. The owner read one screen in her language and the next in someone else's.
 *
 * SERVICE ROWS ONLY, and that limit is deliberate. Catalog items across all ten trades carry no
 * Myanmar name at all. Inventing one here for "Herbal body scrub jar 200g" would put machine-made
 * retail copy in front of a paying customer under the product's own name; that needs a native
 * trade writer, not a build script. A row this cannot pair to a bookable service is returned
 * exactly as it arrived.
 *
 * Returns new objects; the input is not modified. Key order is stable because two callers compare
 * installed catalogs by JSON.stringify.
 */
export function withShopServiceMyanmarNames<T extends NameableCatalogItem>(items: readonly T[], industryPackId: ShopIndustryPackId): T[] {
  let services: readonly ShopService[]
  try {
    services = createShopServiceSchedule(industryPackId).services
  } catch {
    // An unrecognised pack means no Burmese to carry, not a failed provisioning run.
    return items.map((item) => ({ ...item }))
  }
  const named = services.filter((service) => service.nameMy !== undefined)
  return items.map((item) => {
    const service = shopServiceForCatalogName(item.name, named)
    return service?.nameMy === undefined ? { ...item } : { ...item, nameMy: service.nameMy }
  })
}
