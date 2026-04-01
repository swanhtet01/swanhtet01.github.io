import type { LeadRow, LeadSource } from './tooling'

const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''

type GooglePlacesResponse = {
  places?: Array<{
    displayName?: { text?: string }
    formattedAddress?: string
    websiteUri?: string
    nationalPhoneNumber?: string
    googleMapsUri?: string
    editorialSummary?: { text?: string }
    types?: string[]
  }>
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function buildScore(place: NonNullable<GooglePlacesResponse['places']>[number], keywords: string[]) {
  let score = 2

  if (place.websiteUri) score += 2
  if (place.nationalPhoneNumber) score += 1

  const haystack = [place.displayName?.text, place.formattedAddress, ...(place.types ?? [])].join(' ').toLowerCase()
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 1
    }
  }

  return Math.min(score, 10)
}

function buildFitReasons(place: NonNullable<GooglePlacesResponse['places']>[number], keywords: string[]) {
  const reasons = uniqueValues(
    keywords
      .filter(Boolean)
      .map((keyword) => {
        const haystack = [place.displayName?.text, place.formattedAddress, ...(place.types ?? [])].join(' ').toLowerCase()
        return haystack.includes(keyword.toLowerCase()) ? keyword : ''
      }),
  )

  if (reasons.length) {
    return reasons.map((keyword) => `matched ${keyword}`)
  }

  return ['matched public place search']
}

export function publicLeadFinderAvailable() {
  return Boolean(googleMapsApiKey)
}

export async function searchPublicLeads(input: {
  query: string
  keywords: string[]
  sources: LeadSource[]
  limit: number
}): Promise<{ rows: LeadRow[]; provider: string }> {
  if (!googleMapsApiKey) {
    throw new Error('Public lead search is not configured on this host.')
  }

  if (!input.query.trim()) {
    return { rows: [], provider: 'Google Places (browser)' }
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsApiKey,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.editorialSummary,places.types',
    },
    body: JSON.stringify({
      textQuery: input.query,
      languageCode: 'en',
      maxResultCount: Math.min(Math.max(input.limit, 1), 20),
    }),
  })

  if (!response.ok) {
    throw new Error(`Public lead search failed with ${response.status}.`)
  }

  const payload = (await response.json()) as GooglePlacesResponse
  const rows =
    payload.places?.map((place) => ({
      name: place.displayName?.text?.trim() || 'Unknown lead',
      email: '',
      phone: place.nationalPhoneNumber?.trim() || '',
      website: place.websiteUri?.trim() || '',
      source: place.formattedAddress?.trim() || 'Google Places',
      source_url: place.googleMapsUri?.trim() || '',
      snippet: place.editorialSummary?.text?.trim() || place.formattedAddress?.trim() || 'Google Places result',
      social_profiles: [],
      fit_reasons: buildFitReasons(place, input.keywords),
      provider: 'Google Places (browser)',
      score: buildScore(place, input.keywords),
    })) ?? []

  return {
    rows,
    provider: 'Google Places (browser)',
  }
}
