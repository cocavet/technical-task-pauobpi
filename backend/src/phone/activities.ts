import { prisma } from '../db'
import { lookupPhone } from './providers'
import type { PhoneLead, PhoneResult, PhoneSearch, ProviderResult } from './types'
import type { PhoneProvider } from '../../../shared/phoneEnrichment'

export const activeSearchWhere = ({ leadId, requestId }: PhoneSearch) => ({
  id: leadId,
  phoneEnrichmentRequestId: requestId,
  phoneEnrichmentStatus: { in: ['queued', 'running'] },
})

export async function loadPhoneLead(search: PhoneSearch): Promise<PhoneLead | null> {
  const lead = await prisma.lead.findFirst({ where: activeSearchWhere(search) })
  return lead
}

async function runProvider(
  provider: PhoneProvider,
  search: PhoneSearch,
  lead: PhoneLead
): Promise<ProviderResult> {
  const current = await prisma.lead.findFirst({ where: activeSearchWhere(search) })
  if (!current) return { status: 'stopped' }
  if (current.phoneNumber) return { status: 'preserved' }
  const updated = await prisma.lead.updateMany({
    where: activeSearchWhere(search),
    data: { phoneEnrichmentStatus: 'running', phoneEnrichmentProvider: provider },
  })
  if (!updated.count) return { status: 'stopped' }
  return lookupPhone(provider, lead)
}

export const lookupOrionPhone = (search: PhoneSearch, lead: PhoneLead) => runProvider('orion', search, lead)
export const lookupAstraPhone = (search: PhoneSearch, lead: PhoneLead) => runProvider('astra', search, lead)
export const lookupNimbusPhone = (search: PhoneSearch, lead: PhoneLead) => runProvider('nimbus', search, lead)

export async function persistPhoneResult(search: PhoneSearch, result: PhoneResult): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.lead.findFirst({ where: activeSearchWhere(search) })
    if (!current) return // A late/retried activity must not touch a newer search or a deleted lead.
    const preserved = !!current.phoneNumber
    const data = {
      phoneEnrichmentStatus: preserved ? 'preserved' : result.status,
      phoneEnrichmentProvider: preserved ? null : result.provider,
      phoneEnrichmentError: preserved ? 'Existing phone kept' : result.detail,
      phoneEnrichedAt: new Date(),
    }
    if (result.status === 'found' && !preserved && result.phone) {
      await tx.lead.updateMany({
        where: { ...activeSearchWhere(search), OR: [{ phoneNumber: null }, { phoneNumber: '' }] },
        data: { ...data, phoneNumber: result.phone },
      })
    } else {
      await tx.lead.updateMany({ where: activeSearchWhere(search), data })
    }
  })
}
