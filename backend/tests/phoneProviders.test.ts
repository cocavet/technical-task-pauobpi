import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { lookupPhone } from '../src/phone/providers'
import { normalizeCompanyWebsite } from '../../shared/utils/validators'
const lead = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  companyWebsite: 'https://example.com/about',
  jobTitle: 'CTO',
}
const fetchMock = vi.fn()
beforeEach(() => vi.stubGlobal('fetch', fetchMock.mockReset()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it.each([
  ['orion', { phone: '+34 600 123 456' }, '+34 600 123 456', 'orionConnect'],
  ['astra', { phoneNmbr: '0034 600 123 456' }, '0034 600 123 456', 'astraDialer'],
  ['nimbus', { number: 34600123456, countryCode: 'ES' }, '34600123456', 'numbusLookup'],
] as const)('adapts %s requests, authentication and responses', async (provider, response, phone, path) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(response)))
  expect(await lookupPhone(provider, lead)).toEqual({ status: 'found', phone })
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toContain(`/api/tmp/${path}`)
  expect(options.method).toBe('POST')
  if (provider === 'orion') {
    expect(options.headers['x-auth-me']).toBeTruthy()
    expect(JSON.parse(options.body)).toEqual({ fullName: 'Ada Lovelace', companyWebsite: 'example.com' })
  } else if (provider === 'astra') {
    expect(options.headers.apiKey).toBeTruthy()
    expect(JSON.parse(options.body)).toEqual({ email: lead.email })
  } else {
    expect(new URL(url).searchParams.get('api')).toBeTruthy()
    expect(JSON.parse(options.body)).toEqual({ email: lead.email, jobTitle: lead.jobTitle })
  }
})
it('skips missing inputs without inventing domains or making a request', async () => {
  expect(await lookupPhone('orion', { ...lead, companyWebsite: null })).toMatchObject({
    status: 'missing_input',
  })
  expect(await lookupPhone('nimbus', { ...lead, jobTitle: null })).toMatchObject({ status: 'missing_input' })
  expect(fetchMock).not.toHaveBeenCalled()
})
it.each([
  ['orion', { phone: null }],
  ['astra', {}],
  ['astra', { phoneNmbr: null }],
] as const)('recognizes documented empty %s responses', async (provider, data) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(data)))
  expect(await lookupPhone(provider, lead)).toEqual({ status: 'not_found' })
})
it('accepts explicit HTTP 204 absence but treats malformed Nimbus JSON as an error', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
  expect(await lookupPhone('nimbus', lead)).toEqual({ status: 'not_found' })
  for (const body of [{ number: null }, {}, { number: Number.MAX_SAFE_INTEGER + 1, countryCode: 'ES' }]) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)))
    await expect(lookupPhone('nimbus', lead)).rejects.toMatchObject({ nonRetryable: true })
  }
})
it.each([401, 400, 403])('does not retry permanent HTTP %s errors', async (status) => {
  fetchMock.mockResolvedValue(new Response('', { status }))
  await expect(lookupPhone('orion', lead)).rejects.toMatchObject({ nonRetryable: true })
})
it.each([429, 500, 503])('allows Temporal to retry transient HTTP %s errors', async (status) => {
  fetchMock.mockResolvedValue(new Response('', { status }))
  await expect(lookupPhone('orion', lead)).rejects.toThrow(`HTTP ${status}`)
})
it('aborts HTTP after four seconds and clears its timer', async () => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('aborted')))
      )
  )
  const check = expect(lookupPhone('orion', lead)).rejects.toThrow('aborted')
  await vi.advanceTimersByTimeAsync(4000)
  await check
  expect(vi.getTimerCount()).toBe(0)
})
it.each(['example.com', 'https://example.com/team', 'http://www.example.com'])(
  'accepts explicit company websites: %s',
  (website) => {
    expect(normalizeCompanyWebsite(website)).toBeTruthy()
  }
)
it.each([
  'Acme Corp',
  'person@example.com',
  'javascript:alert(1)',
  'https://user:pass@example.com',
  'http://127.0.0.1',
])('rejects invalid company websites: %s', (website) => {
  expect(normalizeCompanyWebsite(website)).toBeNull()
})
