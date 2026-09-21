import type { PhoneProvider, PhoneStatus } from '../../../shared/phoneEnrichment'

export interface PhoneSearch {
  leadId: number
  requestId: string
}
export interface PhoneLead {
  firstName: string
  lastName: string
  email: string
  companyWebsite: string | null
  jobTitle: string | null
}
export type ProviderResult =
  | { status: 'found'; phone: string }
  | { status: 'not_found' }
  | { status: 'missing_input'; reason: string }
  | { status: 'preserved' }
  | { status: 'stopped' }
export interface PhoneResult {
  status: Exclude<PhoneStatus, 'queued' | 'running'>
  provider: PhoneProvider | null
  phone?: string
  detail: string | null
}
