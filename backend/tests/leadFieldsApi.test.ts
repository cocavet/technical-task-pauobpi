import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
}))
vi.mock('express', () => {
  const app = {
    use: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn(),
    post: (path: string, handler: Function) => mocks.handlers.set(`POST ${path}`, handler),
    patch: (path: string, handler: Function) => mocks.handlers.set(`PATCH ${path}`, handler),
  }
  return { default: Object.assign(() => app, { json: vi.fn() }) }
})
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    lead = { create: mocks.create, update: mocks.update, findMany: mocks.findMany }
  },
}))
vi.mock('../src/worker', () => ({ runTemporalWorker: vi.fn().mockResolvedValue(undefined) }))
import '../src/index'

const call = async (route: string, body: unknown) => {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  await mocks.handlers.get(route)!({ body, params: { id: '1' } }, res)
  return res
}
const base = { firstName: 'Test', lastName: 'Lead', email: 'test@example.com' }
const fields = {
  phoneNumber: '0034 612 345 678',
  yearsAtCompany: 0,
  linkedinUrl: 'https://linkedin.com/in/test',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }))
  mocks.update.mockResolvedValue({})
})
it('creates via the frontend contract and keeps the legacy name alias', async () => {
  await call('POST /leads', { ...base, ...fields })
  expect(mocks.create).toHaveBeenCalledWith({ data: { ...base, ...fields } })
  await call('POST /leads', { name: 'Legacy', lastName: 'Lead', email: base.email })
  expect(mocks.create).toHaveBeenLastCalledWith({
    data: { firstName: 'Legacy', lastName: 'Lead', email: base.email },
  })
})
it('updates only provided fields and supports clearing', async () => {
  await call('PATCH /leads/:id', fields)
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { ...fields, firstName: undefined, email: undefined },
  })
  await call('PATCH /leads/:id', { phoneNumber: null, yearsAtCompany: null, linkedinUrl: '' })
  expect(mocks.update.mock.calls[1][0].data).toMatchObject({
    phoneNumber: null,
    yearsAtCompany: null,
    linkedinUrl: null,
  })
})
it.each(['POST /leads', 'PATCH /leads/:id'])('validates before writing via %s', async (route) => {
  for (const invalid of [
    { phoneNumber: 12345 },
    { yearsAtCompany: -1 },
    { linkedinUrl: 'https://example.com' },
  ]) {
    const res = await call(route, { ...base, ...invalid })
    expect(res.status).toHaveBeenCalledWith(400)
  }
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})
it('imports present, absent and zero values, excludes invalid new data and never maps yearsInRole', async () => {
  const res = await call('POST /leads/bulk', {
    leads: [
      { ...base, ...fields, yearsAtCompany: 5 },
      { ...base, firstName: 'Absent', yearsInRole: 8 },
      { ...base, firstName: 'Zero', ...fields },
      { ...base, firstName: 'Bad', yearsAtCompany: -1 },
    ],
  })
  expect(res.json.mock.calls[0][0]).toMatchObject({ importedCount: 3, duplicatesSkipped: 0 })
  expect(res.json.mock.calls[0][0].errors).toHaveLength(1)
  expect(mocks.create.mock.calls[1][0].data.yearsAtCompany).toBeUndefined()
  expect(mocks.create.mock.calls[2][0].data.yearsAtCompany).toBe(0)
})
it('generates present and zero values, reports absent fields and preserves their previous messages', async () => {
  mocks.findMany.mockResolvedValue([
    { id: 1, ...base, ...fields, yearsAtCompany: 5 },
    { id: 2, ...base, ...fields },
    { id: 3, ...base, phoneNumber: null, message: 'Previous message' },
  ])
  const res = await call('POST /leads/generate-messages', {
    leadIds: [1, 2, 3],
    template: '{phoneNumber}|{yearsAtCompany}|{linkedinUrl}',
  })
  expect(res.json.mock.calls[0][0].generatedCount).toBe(2)
  expect(res.json.mock.calls[0][0].errors).toEqual([
    { leadId: 3, leadName: 'Test Lead', error: 'Missing required field: phoneNumber' },
  ])
  expect(mocks.update).toHaveBeenCalledTimes(2)
  expect(mocks.update.mock.calls[1][0].data.message).toContain('|0|')
})
