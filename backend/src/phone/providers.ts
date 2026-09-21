import { ApplicationFailure } from '@temporalio/client'
import { isValidEmail, isValidPhoneNumber, normalizeCompanyWebsite } from '../../../shared/utils/validators'
import type { PhoneProvider } from '../../../shared/phoneEnrichment'
import type { PhoneLead, ProviderResult } from './types'

type RequestSpec = { url: string; headers: Record<string, string>; body: Record<string, string> }
interface ProviderAdapter {
  request(lead: PhoneLead): RequestSpec | null
  missingInput: string
  response(body: Record<string, unknown>): ProviderResult
}
const malformed = () =>
  ApplicationFailure.nonRetryable('Provider returned an invalid phone response', 'InvalidProviderResponse')
const phoneResult = (phone: unknown): ProviderResult => {
  if (typeof phone !== 'string' || !isValidPhoneNumber(phone.trim())) throw malformed()
  return { status: 'found', phone: phone.trim() }
}

export const phoneProviders: Record<PhoneProvider, ProviderAdapter> = {
  orion: {
    missingInput: 'Orion requires fullName and companyWebsite',
    request: (lead) => {
      const website = normalizeCompanyWebsite(lead.companyWebsite)
      if (!lead.firstName.trim() || !lead.lastName.trim() || !website) return null
      return {
        url: 'https://api.enginy.ai/api/tmp/orionConnect',
        headers: { 'x-auth-me': process.env.ORION_API_KEY || 'mySecretKey123' },
        body: { fullName: `${lead.firstName} ${lead.lastName}`.trim(), companyWebsite: website },
      }
    },
    response: (body) => (body.phone === null ? { status: 'not_found' } : phoneResult(body.phone)),
  },
  astra: {
    missingInput: 'Astra requires a valid email',
    request: (lead) =>
      !isValidEmail(lead.email)
        ? null
        : {
            url: 'https://api.enginy.ai/api/tmp/astraDialer',
            headers: { apiKey: process.env.ASTRA_API_KEY || '1234jhgf' },
            body: { email: lead.email },
          },
    response: (body) => (body.phoneNmbr == null ? { status: 'not_found' } : phoneResult(body.phoneNmbr)),
  },
  nimbus: {
    missingInput: 'Nimbus requires a valid email and jobTitle',
    request: (lead) =>
      !isValidEmail(lead.email) || !lead.jobTitle?.trim()
        ? null
        : {
            // Deliberately preserve the spelling in README.
            url: `https://api.enginy.ai/api/tmp/numbusLookup?api=${encodeURIComponent(process.env.NIMBUS_API_KEY || '000099998888')}`,
            headers: {},
            body: { email: lead.email, jobTitle: lead.jobTitle.trim() },
          },
    response: (body) => {
      if (
        typeof body.number !== 'number' ||
        !Number.isSafeInteger(body.number) ||
        body.number <= 0 ||
        typeof body.countryCode !== 'string' ||
        !body.countryCode.trim()
      )
        throw malformed()
      // The contract does not define countryCode as a dialling prefix. Never guess one.
      return phoneResult(String(body.number))
    },
  },
}

export async function lookupPhone(provider: PhoneProvider, lead: PhoneLead): Promise<ProviderResult> {
  const adapter = phoneProviders[provider]
  const request = adapter.request(lead)
  if (!request) return { status: 'missing_input', reason: adapter.missingInput }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4_000)
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...request.headers },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const message = `${provider} returned HTTP ${response.status}`
      if (response.status === 429 || response.status >= 500) throw new Error(message)
      throw ApplicationFailure.nonRetryable(message, 'ProviderRequestRejected')
    }
    // A successful response with explicitly no content is an empty lookup.
    if (response.status === 204) return { status: 'not_found' }
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (controller.signal.aborted) throw error
      throw malformed()
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw malformed()
    return adapter.response(body as Record<string, unknown>)
  } finally {
    clearTimeout(timeout)
  }
}
