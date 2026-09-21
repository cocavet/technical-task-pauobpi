import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MessageTemplateModal } from '../src/components/MessageTemplateModal'

vi.mock('../src/api', () => ({ api: { leads: { generateMessages: vi.fn() } } }))
let root: Root
let container: HTMLDivElement
let client: QueryClient
const close = vi.fn()
const button = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!
const click = async (element: HTMLElement) => {
  await act(async () => element.click())
}
const change = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    element.value = value
    Simulate.change(element)
  })
}
const textarea = () => document.querySelector('textarea')!
const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!
beforeEach(async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  close.mockClear()
  client = new QueryClient()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MessageTemplateModal isOpen onClose={close} selectedLeadIds={[1]} selectedLeadsCount={1} />
      </QueryClientProvider>
    )
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  container.remove()
})
it('searches case-insensitively and inserts at the saved cursor after focus moves to search', async () => {
  await change(textarea(), 'Hello world')
  await act(async () => {
    textarea().setSelectionRange(6, 6)
    Simulate.select(textarea())
    Simulate.blur(textarea())
  })
  await click(button('Insert field ▾'))
  await change(search(), 'PHONE')
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1)
  await click(document.querySelector('[role="option"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  expect(textarea().value).toBe('Hello {phoneNumber}world')
  expect(textarea().selectionStart).toBe(19)
  expect(document.activeElement).toBe(textarea())
})
it('replaces a selection using keyboard search and permits consecutive inserts', async () => {
  await change(textarea(), 'Before REPLACE after')
  await act(async () => {
    textarea().setSelectionRange(7, 14)
    Simulate.select(textarea())
    Simulate.blur(textarea())
  })
  await click(button('Insert field ▾'))
  await change(search(), 'years')
  await act(async () => Simulate.keyDown(search(), { key: 'Enter' }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  expect(textarea().value).toBe('Before {yearsAtCompany} after')
  await click(button('Insert field ▾'))
  await change(search(), 'linkedin')
  await act(async () => Simulate.keyDown(search(), { key: 'Enter' }))
  expect(textarea().value).toBe('Before {yearsAtCompany}{linkedinUrl} after')
})
it('handles no results and Escape without submitting or closing the modal', async () => {
  await click(button('Insert field ▾'))
  await change(search(), 'yearsInRole')
  expect(document.querySelector('[role="status"]')).toHaveTextContent('No fields found')
  await act(async () => Simulate.keyDown(search(), { key: 'Enter' }))
  expect(textarea().value).toBe('')
  await act(async () => Simulate.keyDown(search(), { key: 'Escape' }))
  expect(search()).toBeNull()
  expect(close).not.toHaveBeenCalled()
})
