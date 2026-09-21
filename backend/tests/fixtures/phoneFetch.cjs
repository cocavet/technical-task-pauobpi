// Test-only preload. Never imported by production. Intercepts provider requests locally.
const fs = require('node:fs')
const originalFetch = global.fetch
const attempts = new Map()
global.fetch = async (url, options) => {
  const address = String(url)
  if (!address.startsWith('https://api.enginy.ai/api/tmp/')) return originalFetch(url, options)
  const provider = address.includes('orionConnect')
    ? 'orion'
    : address.includes('astraDialer')
      ? 'astra'
      : address.includes('numbusLookup')
        ? 'nimbus'
        : null
  if (!provider) throw new Error('Unexpected provider URL in test')
  const input = JSON.parse(options.body)
  const identity = (input.fullName || input.email).toLowerCase()
  const scenarios = [
    'orionok',
    'astraok',
    'nimbusok',
    'empty',
    'errors',
    'missing',
    'retry',
    'slow',
    'timeout',
    'malformed',
  ]
  const scenario = scenarios.find((name) => identity.includes(name))
  if (!scenario) throw new Error('Unknown fixture; external provider call blocked')
  const key = `${provider}:${identity}`
  const attempt = (attempts.get(key) || 0) + 1
  attempts.set(key, attempt)
  if (process.env.PHONE_TEST_LOG)
    fs.appendFileSync(
      process.env.PHONE_TEST_LOG,
      JSON.stringify({ provider, scenario, identity, attempt, time: Date.now() }) + '\n'
    )
  const wait = (ms) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      options.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new Error('Test HTTP timeout'))
        },
        { once: true }
      )
    })
  if (scenario === 'slow') await wait(2500)
  if (scenario === 'timeout' && provider === 'orion') await wait(6000)
  if (scenario === 'errors' || (scenario === 'retry' && provider === 'orion' && attempt < 3))
    return new Response('{}', { status: 503 })
  if (scenario === 'malformed') return new Response('{ invalid JSON')
  const found =
    (scenario === 'orionok' && provider === 'orion') ||
    (scenario === 'astraok' && provider === 'astra') ||
    (scenario === 'nimbusok' && provider === 'nimbus') ||
    (scenario === 'retry' && provider === 'orion') ||
    (scenario === 'slow' && provider === 'nimbus') ||
    (scenario === 'timeout' && provider === 'astra')
  if (provider === 'orion') return Response.json({ phone: found ? '+34 600 111 111' : null })
  if (provider === 'astra') return Response.json({ phoneNmbr: found ? '0034 600 222 222' : null })
  return found
    ? Response.json({ number: 34600333333, countryCode: 'ES' })
    : new Response(null, { status: 204 })
}
