import type { Express } from 'express'
import { Client, Connection } from '@temporalio/client'
import { prisma } from '../db'
import { startPhoneSearch, reconcilePhoneSearch } from './service'

export function registerPhoneRoutes(app: Express) {
  app.post('/leads/enrich-phones', async (req, res) => {
    const ids = req.body?.leadIds
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return res.status(400).json({ error: 'leadIds must be a non-empty array of positive integers' })
    }
    let connection: Connection | undefined
    try {
      connection = await Connection.connect({ address: 'localhost:7233', connectTimeout: '3 seconds' })
      const client = new Client({ connection, namespace: 'default' })
      const results = await Promise.all(
        [...new Set<number>(ids)].map((leadId) =>
          connection!.withDeadline(Date.now() + 8_000, () => startPhoneSearch(client, leadId))
        )
      )
      return res.status(202).json({ results })
    } catch {
      return res
        .status(503)
        .json({ error: 'Phone searches could not be started. Check progress before retrying.' })
    } finally {
      await connection?.close()
    }
  })

  app.get('/leads/phone-enrichment', async (_req, res) => {
    let connection: Connection | undefined
    try {
      const active = await prisma.lead.findMany({
        where: { phoneEnrichmentStatus: { in: ['queued', 'running'] } },
      })
      if (active.length) {
        connection = await Connection.connect({ address: 'localhost:7233', connectTimeout: '3 seconds' })
        const client = new Client({ connection, namespace: 'default' })
        await Promise.all(
          active.map((lead) =>
            connection!.withDeadline(Date.now() + 5_000, () => reconcilePhoneSearch(client, lead))
          )
        )
      }
      return res.json(
        await prisma.lead.findMany({
          select: {
            id: true,
            phoneNumber: true,
            phoneEnrichmentStatus: true,
            phoneEnrichmentProvider: true,
            phoneEnrichmentError: true,
            phoneEnrichmentStartedAt: true,
            phoneEnrichedAt: true,
          },
        })
      )
    } catch {
      return res
        .status(503)
        .json({ error: 'Phone progress is temporarily unavailable. Stored phones have not been changed.' })
    } finally {
      await connection?.close()
    }
  })
}
