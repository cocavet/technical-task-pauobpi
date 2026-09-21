import { randomUUID } from 'node:crypto'
import type { Client } from '@temporalio/client'
import type { lead } from '@prisma/client'
import { prisma } from '../db'
import { activeSearchWhere } from './activities'
import { isPhoneSearchActive } from '../../../shared/phoneEnrichment'

export const phoneWorkflowId = (leadId: number) => `enrich-phone-${leadId}`

export async function startPhoneSearch(client: Client, leadId: number) {
  const requestId = randomUUID()
  const claimed = await prisma.lead.updateMany({
    where: {
      id: leadId,
      AND: [
        { OR: [{ phoneNumber: null }, { phoneNumber: '' }] },
        {
          OR: [{ phoneEnrichmentStatus: null }, { phoneEnrichmentStatus: { notIn: ['queued', 'running'] } }],
        },
      ],
    },
    data: {
      phoneEnrichmentStatus: 'queued',
      phoneEnrichmentRequestId: requestId,
      phoneEnrichmentRunId: null,
      phoneEnrichmentProvider: null,
      phoneEnrichmentError: null,
      phoneEnrichmentStartedAt: new Date(),
      phoneEnrichedAt: null,
    },
  })
  if (!claimed.count) {
    const current = await prisma.lead.findUnique({ where: { id: leadId } })
    return {
      leadId,
      outcome: !current ? 'error' : current.phoneNumber ? 'preserved' : 'already_running',
      error: !current ? 'Lead not found' : null,
    }
  }
  try {
    const handle = await client.workflow.start('enrichPhoneWorkflow', {
      taskQueue: process.env.TASK_QUEUE || 'myQueue',
      workflowId: phoneWorkflowId(leadId),
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      workflowExecutionTimeout: '90 seconds',
      retry: { maximumAttempts: 1 },
      memo: { requestId },
      args: [{ leadId, requestId }],
    })
    const description = await handle.describe()
    if (description.memo?.requestId !== requestId) {
      throw new Error('A previous phone search is still finishing. Please retry shortly.')
    }
    await prisma.lead.updateMany({
      where: { id: leadId, phoneEnrichmentRequestId: requestId },
      data: { phoneEnrichmentRunId: description.runId },
    })
    return { leadId, outcome: 'started', error: null }
  } catch {
    // Invalidate an ambiguous start so a late execution cannot write into a later search.
    await prisma.lead.updateMany({
      where: activeSearchWhere({ leadId, requestId }),
      data: {
        phoneEnrichmentStatus: 'error',
        phoneEnrichmentError: 'Could not confirm start. Retry after the current execution finishes.',
        phoneEnrichedAt: new Date(),
      },
    })
    return { leadId, outcome: 'error', error: 'Could not confirm start. Please retry.' }
  }
}

export async function reconcilePhoneSearch(client: Client, lead: lead) {
  if (!isPhoneSearchActive(lead.phoneEnrichmentStatus) || !lead.phoneEnrichmentRequestId) return
  let error: string | null = null
  try {
    const execution = await client.workflow
      .getHandle(phoneWorkflowId(lead.id), lead.phoneEnrichmentRunId || undefined)
      .describe()
    if (execution.memo?.requestId !== lead.phoneEnrichmentRequestId) {
      if (Date.now() - (lead.phoneEnrichmentStartedAt?.getTime() || 0) < 15_000) return
      error = 'Phone search was not confirmed. Please retry.'
    } else if (execution.status.name === 'RUNNING') {
      return
    } else {
      // Normal completion has already persisted a terminal status; only repair active records.
      error = `Phone search ended (${execution.status.name.toLowerCase()}) before saving a result. Please retry.`
    }
  } catch (cause) {
    if (!(cause instanceof Error) || cause.name !== 'WorkflowNotFoundError') throw cause
    if (Date.now() - (lead.phoneEnrichmentStartedAt?.getTime() || 0) < 15_000) return
    error = 'Phone search was not started. Please retry.'
  }
  if (error) {
    await prisma.lead.updateMany({
      where: activeSearchWhere({ leadId: lead.id, requestId: lead.phoneEnrichmentRequestId }),
      data: { phoneEnrichmentStatus: 'error', phoneEnrichmentError: error, phoneEnrichedAt: new Date() },
    })
  }
}
