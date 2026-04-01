import type { LeadRow, LeadSource } from './tooling'

const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
const requestTimeoutMs = 12000

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

type OpenStreetMapPlace = {
  place_id?: number
  name?: string
  display_name?: string
  type?: string
  class?: string
  lat?: string
  lon?: string
  extratags?: Record<string, string>
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
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

function buildOpenStreetMapScore(place: OpenStreetMapPlace, keywords: string[]) {
  let score = 2
  const website = place.extratags?.website || place.extratags?.contact_website || ''
  const phone = place.extratags?.phone || place.extratags?.contact_phone || ''

  if (website) score += 2
  if (phone) score += 1

  const haystack = [
    place.name,
    place.display_name,
    place.type,
    place.class,
    place.extratags?.brand,
    place.extratags?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 1
    }
  }

  return Math.min(score, 10)
}

function buildOpenStreetMapReasons(place: OpenStreetMapPlace, keywords: string[]) {
  const haystack = [
    place.name,
    place.display_name,
    place.type,
    place.class,
    place.extratags?.brand,
    place.extratags?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const reasons = uniqueValues(
    keywords.map((keyword) => (haystack.includes(keyword.toLowerCase()) ? `matched ${keyword}` : '')),
  )

  return reasons.length ? reasons : ['matched public map search']
}

function buildOpenStreetMapRows(places: OpenStreetMapPlace[], keywords: string[]) {
  return places.map((place) => {
    const website = place.extratags?.website || place.extratags?.contact_website || ''
    const phone = place.extratags?.phone || place.extratags?.contact_phone || ''
    const mapUrl =
      place.lat && place.lon ? `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}` : ''

    return {
      name: place.name?.trim() || place.display_name?.split(',')[0]?.trim() || 'Unknown lead',
      email: '',
      phone: phone.trim(),
      website: website.trim(),
      source: place.display_name?.trim() || 'OpenStreetMap',
      source_url: mapUrl,
      snippet: place.type?.trim() || place.class?.trim() || place.display_name?.trim() || 'OpenStreetMap result',
      social_profiles: [],
      fit_reasons: buildOpenStreetMapReasons(place, keywords),
      provider: 'OpenStreetMap (browser)',
      score: buildOpenStreetMapScore(place, keywords),
    } satisfies LeadRow
  })
}

export function publicLeadFinderAvailable() {
  return true
}

async function searchGooglePlaces(input: {
  query: string
  keywords: string[]
  limit: number
}) {
  if (!googleMapsApiKey) {
    throw new Error('Google Places is not configured on this host.')
  }

  const response = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
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
    throw new Error(`Google Places failed with ${response.status}.`)
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

async function searchOpenStreetMap(input: {
  query: string
  keywords: string[]
  limit: number
}) {
  const params = new URLSearchParams({
    q: input.query,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: String(Math.min(Math.max(input.limit, 1), 20)),
  })

  const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`OpenStreetMap search failed with ${response.status}.`)
  }

  const payload = (await response.json()) as OpenStreetMapPlace[]

  return {
    rows: buildOpenStreetMapRows(payload ?? [], input.keywords),
    provider: 'OpenStreetMap (browser)',
  }
}

export async function searchPublicLeads(input: {
  query: string
  keywords: string[]
  sources: LeadSource[]
  limit: number
}): Promise<{ rows: LeadRow[]; provider: string }> {
  if (!input.query.trim()) {
    return { rows: [], provider: googleMapsApiKey ? 'Google Places (browser)' : 'OpenStreetMap (browser)' }
  }

  try {
    return await searchGooglePlaces(input)
  } catch {
    return searchOpenStreetMap(input)
  }
}
