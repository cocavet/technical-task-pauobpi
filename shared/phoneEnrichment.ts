export type PhoneProvider = 'orion' | 'astra' | 'nimbus'
export type PhoneStatus =
  | 'queued'
  | 'running'
  | 'found'
  | 'not_found'
  | 'missing_input'
  | 'error'
  | 'preserved'
export const isPhoneSearchActive = (status?: string | null) => status === 'queued' || status === 'running'

export interface PhoneProgress {
  id: number
  phoneNumber: string | null
  phoneEnrichmentStatus: PhoneStatus | null
  phoneEnrichmentProvider: PhoneProvider | null
  phoneEnrichmentError: string | null
  phoneEnrichmentStartedAt: string | null
  phoneEnrichedAt: string | null
}
