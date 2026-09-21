import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  scheduleToCloseTimeout: '12 seconds',
  retry: { maximumAttempts: 2, initialInterval: '1 second' },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}
