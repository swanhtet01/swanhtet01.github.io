import type { CommerceState } from './commerce-workspace.ts'

export type ShopStorefrontCustomerNamePhoneBrief = {
  totalProfiles: number
  uniqueNames: number
  topNamesByCount: Array<{ name: string; count: number }>
  uniquePhoneNumbers: number
  topPhonesByCount: Array<{ phone: string; count: number }>
}

export function projectShopStorefrontCustomerNamePhoneBrief(
  commerce: CommerceState,
): ShopStorefrontCustomerNamePhoneBrief {
  let totalProfiles = 0
  const nameMap = new Map<string, number>()
  const phoneMap = new Map<string, number>()

  for (const request of commerce.storefrontRequests ?? []) {
    const profile = request.customerProfile
    if (profile !== undefined) {
      totalProfiles++
      nameMap.set(profile.name, (nameMap.get(profile.name) ?? 0) + 1)
      phoneMap.set(profile.phone, (phoneMap.get(profile.phone) ?? 0) + 1)
    }
  }

  const topNamesByCount = Array.from(nameMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)

  const topPhonesByCount = Array.from(phoneMap.entries())
    .map(([phone, count]) => ({ phone, count }))
    .sort((a, b) => b.count - a.count || a.phone.localeCompare(b.phone))
    .slice(0, 5)

  return {
    totalProfiles,
    uniqueNames: nameMap.size,
    topNamesByCount,
    uniquePhoneNumbers: phoneMap.size,
    topPhonesByCount,
  }
}
