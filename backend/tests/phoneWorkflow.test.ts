import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  loadPhoneLead: vi.fn(),
  lookupOrionPhone: vi.fn(),
  lookupAstraPhone: vi.fn(),
  lookupNimbusPhone: vi.fn(),
  persistPhoneResult: vi.fn(),
  proxy: vi.fn(),
}))
vi.mock('@temporalio/workflow', () => ({
  proxyActivities: (options: unknown) => {
    mocks.proxy(options)
    return mocks
  },
  isCancellation: () => false,
}))
import { enrichPhoneWorkflow } from '../src/workflows/phoneEnrichment'
const search = { leadId: 1, requestId: 'request' }
beforeEach(() => {
  for (const name of [
    'loadPhoneLead',
    'lookupOrionPhone',
    'lookupAstraPhone',
    'lookupNimbusPhone',
    'persistPhoneResult',
  ] as const)
    mocks[name].mockReset()
  mocks.loadPhoneLead.mockResolvedValue({ firstName: 'Ada' })
  mocks.lookupOrionPhone.mockResolvedValue({ status: 'not_found' })
  mocks.lookupAstraPhone.mockResolvedValue({ status: 'not_found' })
  mocks.lookupNimbusPhone.mockResolvedValue({ status: 'not_found' })
})
it('bounds provider retries and timeouts', () => {
  expect(mocks.proxy).toHaveBeenCalledWith({
    startToCloseTimeout: '5 seconds',
    scheduleToCloseTimeout: '20 seconds',
    retry: {
      maximumAttempts: 3,
      initialInterval: '1 second',
      backoffCoefficient: 2,
      maximumInterval: '2 seconds',
    },
  })
})
it('stops immediately on Orion success', async () => {
  mocks.lookupOrionPhone.mockResolvedValue({ status: 'found', phone: '+34 600 123 456' })
  expect(await enrichPhoneWorkflow(search)).toMatchObject({ status: 'found', provider: 'orion' })
  expect(mocks.lookupAstraPhone).not.toHaveBeenCalled()
  expect(mocks.lookupNimbusPhone).not.toHaveBeenCalled()
})
it('continues Orion → Astra → Nimbus and persists a confirmed absence', async () => {
  expect(await enrichPhoneWorkflow(search)).toMatchObject({ status: 'not_found' })
  expect(mocks.lookupOrionPhone.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.lookupAstraPhone.mock.invocationCallOrder[0]
  )
  expect(mocks.lookupAstraPhone.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.lookupNimbusPhone.mock.invocationCallOrder[0]
  )
  expect(mocks.persistPhoneResult).toHaveBeenCalledOnce()
})
it('continues after exhausted failures and succeeds with a later provider', async () => {
  mocks.lookupOrionPhone.mockRejectedValue(new Error('Attempts exhausted'))
  mocks.lookupAstraPhone.mockResolvedValue({ status: 'found', phone: '0034 600 123 456' })
  expect(await enrichPhoneWorkflow(search)).toMatchObject({ status: 'found', provider: 'astra' })
  expect(mocks.lookupNimbusPhone).not.toHaveBeenCalled()
})
it('distinguishes technical failure from no data', async () => {
  mocks.lookupOrionPhone.mockRejectedValue(new Error('Attempts exhausted'))
  expect(await enrichPhoneWorkflow(search)).toMatchObject({ status: 'error' })
})
it('distinguishes missing input from no data', async () => {
  mocks.lookupOrionPhone.mockResolvedValue({ status: 'missing_input', reason: 'companyWebsite missing' })
  expect(await enrichPhoneWorkflow(search)).toMatchObject({ status: 'missing_input' })
})
it('does not query more providers if persistence fails', async () => {
  mocks.lookupOrionPhone.mockResolvedValue({ status: 'found', phone: '+34 600 123 456' })
  mocks.persistPhoneResult.mockRejectedValue(new Error('Database unavailable'))
  await expect(enrichPhoneWorkflow(search)).rejects.toThrow('Database unavailable')
  expect(mocks.lookupAstraPhone).not.toHaveBeenCalled()
})
it('does not continue cancelled or stale requests', async () => {
  mocks.lookupOrionPhone.mockResolvedValue({ status: 'stopped' })
  expect(await enrichPhoneWorkflow(search)).toBeNull()
  expect(mocks.lookupAstraPhone).not.toHaveBeenCalled()
  expect(mocks.persistPhoneResult).not.toHaveBeenCalled()
})
