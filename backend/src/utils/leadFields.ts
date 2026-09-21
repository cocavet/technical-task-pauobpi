import {
  isValidPhoneNumber,
  isValidYearsAtCompany,
  isValidLinkedinUrl,
} from '../../../shared/utils/validators'

export interface OptionalLeadFields {
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
}

// Omission preserves a value on PATCH; null or blank explicitly clears it.
export function validateLeadFields(input: Record<string, unknown>): OptionalLeadFields {
  const fields: OptionalLeadFields = {}
  for (const key of ['phoneNumber', 'linkedinUrl'] as const) {
    const value = input[key]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      throw new Error(`${key} must be text`)
    }
    fields[key] = typeof value === 'string' ? value.trim() || null : null
  }

  if (fields.phoneNumber && !isValidPhoneNumber(fields.phoneNumber)) {
    throw new Error('phoneNumber must be a phone number with optional +, spaces, punctuation or extension')
  }

  const years = input.yearsAtCompany
  if (years !== undefined) {
    if (years === null || (typeof years === 'string' && !years.trim())) {
      fields.yearsAtCompany = null
    } else if (!isValidYearsAtCompany(years)) {
      throw new Error('yearsAtCompany must be a non-negative integer (0 is valid)')
    } else {
      fields.yearsAtCompany = years
    }
  }

  if (fields.linkedinUrl && !isValidLinkedinUrl(fields.linkedinUrl)) {
    throw new Error('linkedinUrl must be an HTTP(S) LinkedIn profile URL')
  }
  return fields
}
