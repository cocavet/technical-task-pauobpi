export type { PhoneProgress } from '../../../../../shared/phoneEnrichment'
export interface EnrichPhonesOutput {
  results: Array<{
    leadId: number
    outcome: 'started' | 'already_running' | 'preserved' | 'error'
    error: string | null
  }>
}
