// Test-only runner for an isolated backend with the phoneFetch.cjs preload.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PrismaClient } = require('@prisma/client')
const { Client, Connection } = require('@temporalio/client')
const folder = process.env.PHONE_TEST_DIR
if (!folder?.includes('phone-enrichment-e2e-')) throw new Error('An isolated PHONE_TEST_DIR is required')
const db = new PrismaClient({ datasourceUrl: `file:${folder}/dev.db` })
const request = async (path, data, method = 'POST') => {
  const response = await fetch('http://localhost:4001' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  })
  const body = await response.json()
  assert(response.ok, JSON.stringify(body))
  if (path === '/leads/enrich-phones') assert.equal(response.status, 202)
  return body
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitDone(ids) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const rows = (await request('/leads/phone-enrichment', null, 'GET')).filter((row) => ids.includes(row.id))
    if (
      rows.length === ids.length &&
      rows.every((row) => !['queued', 'running'].includes(row.phoneEnrichmentStatus))
    )
      return rows
    await pause(250)
  }
  throw new Error('Search did not finish')
}
async function main() {
  const offset = 1000000000 + (Date.now() % 100000000)
  const names = [
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
    'slowmanual',
    'orionokexisting',
  ]
  const leads = {}
  for (const [index, name] of names.entries())
    leads[name] = await db.lead.create({
      data: {
        id: offset + index,
        firstName: `${offset} PhoneE2E ${name}`,
        lastName: 'Test',
        email: `${offset}.${name}@example.com`,
        companyWebsite: name === 'missing' ? null : 'example.com',
        jobTitle: name === 'missing' ? null : 'CTO',
        phoneNumber: name === 'orionokexisting' ? '0034 600 000 000' : null,
      },
    })
  fs.writeFileSync(`${folder}/leads.json`, JSON.stringify(leads, null, 2))
  const startTime = Date.now()
  const results = await request('/leads/enrich-phones', {
    leadIds: Object.values(leads).map((lead) => lead.id),
  })
  assert(Date.now() - startTime < 3000, 'Start must not wait for providers')
  assert.equal(results.results.filter((row) => row.outcome === 'preserved').length, 1)
  const duplicate = await Promise.all(
    Array.from({ length: 3 }, () =>
      request('/leads/enrich-phones', { leadIds: [leads.slow.id, leads.slow.id] })
    )
  )
  assert(
    duplicate.every(
      (result) => result.results.length === 1 && result.results[0].outcome === 'already_running'
    )
  )
  await request(`/leads/${leads.slowmanual.id}`, { phoneNumber: '0034 999 999 999' }, 'PATCH')
  const rows = await waitDone(Object.values(leads).map((lead) => lead.id))
  const state = (name) => rows.find((row) => row.id === leads[name].id)
  for (const [name, provider] of [
    ['orionok', 'orion'],
    ['astraok', 'astra'],
    ['nimbusok', 'nimbus'],
    ['retry', 'orion'],
    ['slow', 'nimbus'],
    ['timeout', 'astra'],
  ]) {
    assert.equal(state(name).phoneEnrichmentStatus, 'found', name)
    assert.equal(state(name).phoneEnrichmentProvider, provider, name)
  }
  for (const [name, status] of [
    ['empty', 'not_found'],
    ['errors', 'error'],
    ['malformed', 'error'],
    ['missing', 'missing_input'],
    ['slowmanual', 'preserved'],
  ])
    assert.equal(state(name).phoneEnrichmentStatus, status, name)
  assert.equal(state('slowmanual').phoneNumber, '0034 999 999 999')
  assert.equal(state('orionokexisting').phoneNumber, '0034 600 000 000')
  const events = fs
    .readFileSync(`${folder}/providers.jsonl`, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter((row) => row.identity?.includes(String(offset)))
  const calls = (scenario, provider) =>
    events.filter((row) => row.scenario === scenario && (!provider || row.provider === provider))
  assert.equal(calls('orionok').length, 1)
  assert.deepEqual(
    calls('astraok').map((row) => row.provider),
    ['orion', 'astra']
  )
  assert.deepEqual(
    calls('nimbusok').map((row) => row.provider),
    ['orion', 'astra', 'nimbus']
  )
  assert.equal(calls('retry', 'orion').length, 3)
  const retry = calls('retry', 'orion')
  assert(retry[1].time - retry[0].time >= 900)
  assert(retry[2].time - retry[1].time >= 1900)
  assert.equal(calls('timeout', 'orion').length, 3)
  for (const provider of ['orion', 'astra', 'nimbus']) assert.equal(calls('errors', provider).length, 3)
  assert.equal(calls('malformed').length, 3)
  const oldRun = (await db.lead.findUnique({ where: { id: leads.empty.id } })).phoneEnrichmentRunId
  await request('/leads/enrich-phones', { leadIds: [leads.empty.id] })
  await waitDone([leads.empty.id])
  assert.notEqual((await db.lead.findUnique({ where: { id: leads.empty.id } })).phoneEnrichmentRunId, oldRun)
  const connection = await Connection.connect({ address: 'localhost:7233' })
  try {
    const client = new Client({ connection })
    const leadId = offset + 20,
      requestId = `timeout-${offset}`
    await db.lead.create({
      data: {
        id: leadId,
        firstName: 'PhoneE2E',
        lastName: 'No worker',
        email: 'no-worker@example.com',
        phoneEnrichmentStatus: 'queued',
        phoneEnrichmentRequestId: requestId,
        phoneEnrichmentStartedAt: new Date(),
      },
    })
    const handle = await client.workflow.start('enrichPhoneWorkflow', {
      workflowId: `enrich-phone-${leadId}`,
      taskQueue: `unpolled-${offset}`,
      workflowExecutionTimeout: '1 second',
      memo: { requestId },
      args: [{ leadId, requestId }],
    })
    await db.lead.update({
      where: { id: leadId },
      data: { phoneEnrichmentRunId: handle.firstExecutionRunId },
    })
    await pause(1200)
    const [row] = await waitDone([leadId])
    assert.equal(row.phoneEnrichmentStatus, 'error')
    assert.match(row.phoneEnrichmentError, /timed_out/)
  } finally {
    await connection.close()
  }
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        scenarios: names,
        duplicateRequests: 3,
        retriesAndBackoffVerified: true,
        manualPhonePreserved: true,
        repeatSearchNewRun: true,
        noWorkerTimeoutReconciled: true,
        elapsedMs: Date.now() - startTime,
      },
      null,
      2
    )
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
