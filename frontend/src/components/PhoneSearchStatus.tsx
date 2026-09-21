import type { PhoneProgress } from '../../../shared/phoneEnrichment'

export function PhoneSearchStatus({ progress }: { progress?: PhoneProgress }) {
  if (!progress?.phoneEnrichmentStatus) return null
  const {
    phoneEnrichmentStatus: status,
    phoneEnrichmentProvider: provider,
    phoneEnrichmentError: detail,
  } = progress
  const labels = {
    queued: 'Phone search queued…',
    running: `Searching ${provider || 'providers'}…`,
    found: `Phone found${provider ? ` · ${provider}` : ''}`,
    not_found: 'No data found · select Find phone to retry',
    missing_input: 'Missing input · add details and retry',
    error: 'Phone search failed · select Find phone to retry',
    preserved: 'Existing phone kept',
  }
  return (
    <div
      className={`mt-1 text-xs whitespace-normal max-w-xs ${status === 'error' ? 'text-red-700' : status === 'found' ? 'text-green-700' : 'text-gray-600'}`}
    >
      <span>{labels[status]}</span>
      {detail && detail !== labels[status] && <div className="mt-1">{detail}</div>}
    </div>
  )
}
