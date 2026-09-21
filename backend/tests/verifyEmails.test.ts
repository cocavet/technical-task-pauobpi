import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  findMany: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  withDeadline: vi.fn(),
}))

vi.mock('express', () => {
  const app = {
    use: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn(),
    post: (path: string, handler: Function) => mocks.handlers.set(path, handler),
  }
  return { default: Object.assign(() => app, { json: vi.fn() }) }
})
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    lead = { findMany: mocks.findMany, update: mocks.update }
  },
}))
vi.mock('@temporalio/client', () => ({
  Connection: { connect: mocks.connect },
  Client: class {
    workflow = { execute: mocks.execute }
  },
}))
vi.mock('../src/workflows', () => ({ verifyEmailWorkflow: vi.fn() }))
vi.mock('../src/worker', () => ({ runTemporalWorker: vi.fn().mockResolvedValue(undefined) }))

import '../src/index'

const leads = [
  { id: 1, firstName: 'Slow', lastName: 'Test', email: 'jane.smith@example.com' },
  { id: 2, firstName: 'Valid', lastName: 'Test', email: 'valid@example.com' },
  { id: 3, firstName: 'Invalid', lastName: 'Test', email: 'john.doe@example.com' },
]
const request = async () => {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  await mocks.handlers.get('/leads/verify-emails')!({ body: { leadIds: [1, 2, 3] } }, res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue(leads)
  mocks.update.mockResolvedValue({})
  mocks.connect.mockResolvedValue({ close: mocks.close, withDeadline: mocks.withDeadline })
  mocks.withDeadline.mockImplementation((_deadline, fn) => fn())
})

describe('email verification endpoint', () => {
  it('processes the other leads while the first is slow, and reports its failure separately', async () => {
    let rejectSlow!: (error: Error) => void
    mocks.execute.mockImplementation((_workflow, options) => {
      if (options.args[0].includes('jane.smith'))
        return new Promise((_, reject) => {
          rejectSlow = reject
        })
      return Promise.resolve(!options.args[0].includes('john.doe'))
    })
    const pending = request()
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { emailVerified: true } })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { emailVerified: false } })
    rejectSlow(new Error('Activity timed out'))
    const res = await pending
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      verifiedCount: 2,
      results: [
        { leadId: 2, emailVerified: true },
        { leadId: 3, emailVerified: false },
      ],
      errors: [
        { leadId: 1, leadName: 'Slow Test', error: 'Verification failed or timed out. Please retry.' },
      ],
    })
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      workflowId: 'verify-email-1',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowExecutionTimeout: '15 seconds',
    })
    const deadline = mocks.withDeadline.mock.calls[0][0]
    expect(deadline).toBeGreaterThan(Date.now())
    expect(deadline).toBeLessThanOrEqual(Date.now() + 20_000)
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('treats false as an invalid email, not a technical failure', async () => {
    mocks.findMany.mockResolvedValue([leads[2]])
    mocks.execute.mockResolvedValue(false)
    const res = await request()
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      verifiedCount: 1,
      results: [{ leadId: 3, emailVerified: false }],
      errors: [],
    })
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('finishes when all Temporal calls fail, preserves stored statuses and closes the connection', async () => {
    mocks.withDeadline.mockRejectedValue(new Error('Deadline exceeded'))
    const res = await request()
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, verifiedCount: 0, results: [] })
    expect(res.json.mock.calls[0][0].errors).toHaveLength(3)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('returns a technical error when Temporal cannot connect within the connection timeout', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.connect.mockRejectedValueOnce(new Error('Connection timed out'))
      const res = await request()
      expect(mocks.connect).toHaveBeenCalledWith({ address: 'localhost:7233', connectTimeout: '3 seconds' })
      expect(res.status).toHaveBeenCalledWith(500)
      expect(mocks.update).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})
