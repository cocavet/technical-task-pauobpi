import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  start: vi.fn(),
  describe: vi.fn(),
}))
vi.mock('../src/db', () => ({
  prisma: { lead: { updateMany: mocks.updateMany, findUnique: mocks.findUnique } },
}))
import { startPhoneSearch, reconcilePhoneSearch } from '../src/phone/service'
const client = { workflow: { start: mocks.start, getHandle: () => ({ describe: mocks.describe }) } } as any
beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.start.mockImplementation(async (_name, options) => ({
    describe: async () => ({ memo: options.memo, runId: 'run-1' }),
  }))
})
it('starts with explicit conflict/reuse policies and bounded workflow duration', async () => {
  expect(await startPhoneSearch(client, 10)).toMatchObject({ outcome: 'started' })
  expect(mocks.start).toHaveBeenCalledWith(
    'enrichPhoneWorkflow',
    expect.objectContaining({
      workflowId: 'enrich-phone-10',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      workflowExecutionTimeout: '90 seconds',
      retry: { maximumAttempts: 1 },
    })
  )
})
it.each([
  { phoneNumber: null, outcome: 'already_running' },
  { phoneNumber: '0034 600 123 456', outcome: 'preserved' },
])('does not start when atomic admission rejects: $outcome', async ({ phoneNumber, outcome }) => {
  mocks.updateMany.mockResolvedValue({ count: 0 })
  mocks.findUnique.mockResolvedValue({ phoneNumber, phoneEnrichmentStatus: 'running' })
  expect(await startPhoneSearch(client, 10)).toMatchObject({ outcome })
  expect(mocks.start).not.toHaveBeenCalled()
})
it('marks an ambiguous start as error with a guard against later runs', async () => {
  mocks.start.mockRejectedValue(new Error('Deadline exceeded'))
  expect(await startPhoneSearch(client, 10)).toMatchObject({ outcome: 'error' })
  const admission = mocks.updateMany.mock.calls[0][0].data
  expect(mocks.updateMany.mock.calls[1][0]).toMatchObject({
    where: {
      id: 10,
      phoneEnrichmentRequestId: admission.phoneEnrichmentRequestId,
      phoneEnrichmentStatus: { in: ['queued', 'running'] },
    },
    data: { phoneEnrichmentStatus: 'error' },
  })
})
it('does not bind a new request to an old workflow that is still finishing', async () => {
  mocks.start.mockResolvedValue({
    describe: async () => ({ memo: { requestId: 'older' }, runId: 'older-run' }),
  })
  expect(await startPhoneSearch(client, 10)).toMatchObject({ outcome: 'error' })
})
it('reconciles a terminal timeout without overwriting a newer request or saved result', async () => {
  mocks.describe.mockResolvedValue({ memo: { requestId: 'request-1' }, status: { name: 'TIMED_OUT' } })
  await reconcilePhoneSearch(client, {
    id: 10,
    phoneEnrichmentStatus: 'running',
    phoneEnrichmentRequestId: 'request-1',
    phoneEnrichmentRunId: 'run-1',
  } as any)
  expect(mocks.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: 10,
        phoneEnrichmentRequestId: 'request-1',
        phoneEnrichmentStatus: { in: ['queued', 'running'] },
      },
      data: expect.objectContaining({ phoneEnrichmentStatus: 'error' }),
    })
  )
})
it('reports a connectivity problem without converting it to no-data or terminating a running search', async () => {
  mocks.describe.mockRejectedValue(new Error('Service unavailable'))
  await expect(
    reconcilePhoneSearch(client, {
      id: 10,
      phoneEnrichmentStatus: 'running',
      phoneEnrichmentRequestId: 'request-1',
    } as any)
  ).rejects.toThrow('Service unavailable')
  expect(mocks.updateMany).not.toHaveBeenCalled()
})
