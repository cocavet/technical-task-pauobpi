import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ verifyEmail: vi.fn(), proxyActivities: vi.fn() }))
vi.mock('@temporalio/workflow', () => ({
  proxyActivities: (options: unknown) => {
    mocks.proxyActivities(options)
    return { verifyEmail: mocks.verifyEmail }
  },
}))
import { verifyEmailWorkflow } from '../src/workflows/workflows'
import { verifyEmail } from '../src/workflows/activities/utils'

afterEach(() => vi.useRealTimers())

it('bounds attempts and the total activity execution time', () => {
  expect(mocks.proxyActivities).toHaveBeenCalledWith({
    startToCloseTimeout: '5 seconds',
    scheduleToCloseTimeout: '12 seconds',
    retry: { maximumAttempts: 2, initialInterval: '1 second' },
  })
})

it('propagates a technical failure instead of converting it to an invalid email', async () => {
  mocks.verifyEmail.mockRejectedValueOnce(new Error('Provider unavailable'))
  await expect(verifyEmailWorkflow('test@example.com')).rejects.toThrow('Provider unavailable')
})

it('checks the real valid, invalid and slow activity cases', async () => {
  vi.useFakeTimers()
  await expect(verifyEmail('valid@example.com')).resolves.toBe(true)
  await expect(verifyEmail('john.doe@example.com')).resolves.toBe(false)
  await expect(verifyEmail('test+invalid@example.com')).resolves.toBe(false)
  const slow = verifyEmail('jane.smith@example.com')
  await vi.advanceTimersByTimeAsync(20_000)
  await expect(slow).resolves.toBe(true)
})
