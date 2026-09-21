export type LeadsVerifyEmailsInput = {
  leadIds: number[]
}

export type LeadsVerifyEmailsOutput = {
  success: boolean
  verifiedCount: number
  results: Array<{
    leadId: number
    emailVerified: boolean
  }>
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}

