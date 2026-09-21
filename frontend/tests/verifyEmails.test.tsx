import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LeadsList } from '../src/components/LeadsList'

const mocks = vi.hoisted(() => ({
  getMany: vi.fn(),
  verifyEmails: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../src/api', () => ({
  api: { leads: { getMany: mocks.getMany, verifyEmails: mocks.verifyEmails } },
}))
vi.mock('react-hot-toast', () => ({ default: { success: mocks.success, error: mocks.error } }))
vi.mock('../src/components/CsvImportModal', () => ({ CsvImportModal: () => null }))
vi.mock('../src/components/MessageTemplateModal', () => ({ MessageTemplateModal: () => null }))

let root: Root
let container: HTMLDivElement
let client: QueryClient
const button = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!
const click = async (element: HTMLElement) => {
  await act(async () => element.click())
}
const render = async () => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <LeadsList />
      </QueryClientProvider>
    )
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  await click(container.querySelector('input[type="checkbox"]')!)
  await click(button('Enrich'))
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  mocks.getMany.mockResolvedValue(
    [1, 2, 3].map((id) => ({
      id,
      firstName: `Lead ${id}`,
      lastName: 'Test',
      email: `lead${id}@example.com`,
      emailVerified: null,
      createdAt: '2026-09-21',
    }))
  )
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

it('shows progress, prevents duplicate clicks, and distinguishes partial technical failures from invalid emails', async () => {
  let finish!: (data: unknown) => void
  mocks.verifyEmails.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  await render()
  await click(button('Verify Email'))
  expect(container.querySelector('[role="status"]')).toHaveTextContent('Verifying 3 emails')
  expect(button('Enrich')).toBeDisabled()
  await click(button('Enrich'))
  expect(mocks.verifyEmails).toHaveBeenCalledTimes(1)
  expect(mocks.verifyEmails).toHaveBeenCalledWith({ leadIds: [1, 2, 3] })

  const rows = await mocks.getMany()
  rows[0].emailVerified = true
  rows[1].emailVerified = false
  await act(async () =>
    finish({
      success: false,
      verifiedCount: 2,
      results: [
        { leadId: 1, emailVerified: true },
        { leadId: 2, emailVerified: false },
      ],
      errors: [{ leadId: 3, leadName: 'Lead 3 Test', error: 'Timed out' }],
    })
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  expect(mocks.error).toHaveBeenCalledWith('1 valid, 1 invalid, 1 technical failures')
  expect(mocks.success).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')).toHaveTextContent(
    '2 checked; 1 technical failures: Lead 3 Test'
  )
  expect(container.textContent).toContain('✅ Valid')
  expect(container.textContent).toContain('❌ Invalid')
  expect(container.textContent).toContain('⚠ Verification failed')
  expect(button('Enrich')).not.toBeDisabled()
})

it('reports a request failure and lets the user retry without claiming emails are invalid', async () => {
  mocks.verifyEmails.mockRejectedValue(new Error('Request timed out'))
  await render()
  await click(button('Verify Email'))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  expect(container.querySelector('[role="alert"]')).toHaveTextContent('Verification could not complete')
  expect(container.textContent).not.toContain('❌ Invalid')
  expect(mocks.success).not.toHaveBeenCalled()
  expect(button('Enrich')).not.toBeDisabled()
})
