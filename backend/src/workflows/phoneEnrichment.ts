import { proxyActivities, isCancellation } from '@temporalio/workflow'
import type * as activities from '../phone/activities'
import type { PhoneSearch, PhoneResult } from '../phone/types'

const { lookupOrionPhone, lookupAstraPhone, lookupNimbusPhone } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  scheduleToCloseTimeout: '20 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '2 seconds',
  },
})
const { loadPhoneLead, persistPhoneResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '3 seconds',
  scheduleToCloseTimeout: '10 seconds',
  retry: { maximumAttempts: 3, initialInterval: '1 second', backoffCoefficient: 2 },
})

export async function enrichPhoneWorkflow(search: PhoneSearch): Promise<PhoneResult | null> {
  const lead = await loadPhoneLead(search)
  if (!lead) return null
  const failures: string[] = []
  const missing: string[] = []
  const providers = [
    ['orion', lookupOrionPhone],
    ['astra', lookupAstraPhone],
    ['nimbus', lookupNimbusPhone],
  ] as const
  for (const [provider, lookup] of providers) {
    let result
    try {
      result = await lookup(search, lead)
    } catch (error) {
      if (isCancellation(error)) throw error
      failures.push(`${provider}: lookup failed or timed out`)
      continue
    }
    if (result.status === 'stopped') return null
    if (result.status === 'found' || result.status === 'preserved') {
      return save({
        status: result.status,
        provider,
        phone: result.status === 'found' ? result.phone : undefined,
        detail: [...failures, ...missing].join('; ') || null,
      })
    }
    if (result.status === 'missing_input') missing.push(result.reason)
  }
  return save({
    status: failures.length ? 'error' : missing.length ? 'missing_input' : 'not_found',
    provider: null,
    detail: [...failures, ...missing].join('; ') || null,
  })

  async function save(result: PhoneResult) {
    await persistPhoneResult(search, result)
    return result
  }
}
