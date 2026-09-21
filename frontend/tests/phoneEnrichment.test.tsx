import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LeadsList } from '../src/components/LeadsList'
const mocks = vi.hoisted(() => ({
  getMany: vi.fn(),
  phoneProgress: vi.fn(),
  enrichPhones: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../src/api', () => ({ api: { leads: mocks } }))
vi.mock('react-hot-toast', () => ({ default: { success: mocks.success, error: mocks.error } }))
vi.mock('../src/components/CsvImportModal', () => ({ CsvImportModal: () => null }))
vi.mock('../src/components/MessageTemplateModal', () => ({ MessageTemplateModal: () => null }))
let root: Root, container: HTMLDivElement, client: QueryClient
const button = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!
const click = async (el: HTMLElement) => {
  await act(async () => el.click())
}
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15))
  })
}
const render = async () => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <LeadsList />
      </QueryClientProvider>
    )
  )
  await settle()
  await settle()
}
const states = () =>
  [1, 2, 3].map((id) => ({
    id,
    phoneNumber: null,
    phoneEnrichmentStatus: null,
    phoneEnrichmentProvider: null,
    phoneEnrichmentError: null,
  }))
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  mocks.getMany.mockResolvedValue(
    [1, 2, 3].map((id) => ({
      id,
      firstName: `Lead ${id}`,
      lastName: 'Test',
      email: 'test@example.com',
      emailVerified: null,
      createdAt: '2026-09-21',
    }))
  )
  mocks.phoneProgress.mockResolvedValue(states())
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  container.remove()
})
it('starts asynchronously and blocks duplicate searches and deletion during persisted progress', async () => {
  let finish!: (value: unknown) => void
  mocks.enrichPhones.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  await render()
  await click(container.querySelector('input[type="checkbox"]')!)
  await click(button('Enrich'))
  await click(button('Find phone'))
  expect(container.textContent).toContain('Starting phone searches')
  await click(button('Enrich'))
  expect(button('Find phone')).toBeDisabled()
  expect(button('Delete')).toBeDisabled()
  await click(button('Find phone'))
  expect(mocks.enrichPhones).toHaveBeenCalledTimes(1)
  mocks.phoneProgress.mockResolvedValue(
    states().map((row) => ({ ...row, phoneEnrichmentStatus: 'running', phoneEnrichmentProvider: 'astra' }))
  )
  await act(async () =>
    finish({ results: [1, 2, 3].map((leadId) => ({ leadId, outcome: 'started', error: null })) })
  )
  await settle()
  expect(container.textContent).toContain('Searching astra')
  expect(button('Find phone')).toBeDisabled()
})
it('restores running searches on a fresh mount without starting another workflow', async () => {
  mocks.phoneProgress.mockResolvedValue(
    states().map((row) => ({ ...row, phoneEnrichmentStatus: 'running', phoneEnrichmentProvider: 'orion' }))
  )
  await render()
  expect(container.textContent).toContain('3 phone searches in progress')
  expect(container.textContent).toContain('Searching orion')
  expect(mocks.enrichPhones).not.toHaveBeenCalled()
})
it('shows found, no-data and technical errors distinctly and enables manual retry', async () => {
  mocks.phoneProgress.mockResolvedValue([
    {
      ...states()[0],
      phoneNumber: '0034 600 123 456',
      phoneEnrichmentStatus: 'found',
      phoneEnrichmentProvider: 'astra',
    },
    { ...states()[1], phoneEnrichmentStatus: 'not_found' },
    { ...states()[2], phoneEnrichmentStatus: 'error', phoneEnrichmentError: 'orion: provider failed' },
  ])
  await render()
  expect(container.textContent).toContain('0034 600 123 456')
  expect(container.textContent).toContain('No data found')
  expect(container.textContent).toContain('Phone search failed')
  await click(container.querySelector('input[type="checkbox"]')!)
  await click(button('Enrich'))
  expect(button('Find phone')).not.toBeDisabled()
})
it('keeps progress retrieval failures distinct and blocks starting from an unknown status', async () => {
  mocks.phoneProgress.mockRejectedValue(new Error('Temporal unavailable'))
  await render()
  expect(container.textContent).toContain('Phone progress is temporarily unavailable')
  await click(container.querySelector('input[type="checkbox"]')!)
  await click(button('Enrich'))
  expect(button('Find phone')).toBeDisabled()
  expect(button('Retry status')).not.toBeDisabled()
})
