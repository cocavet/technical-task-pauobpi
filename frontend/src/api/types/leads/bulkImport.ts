export interface LeadsBulkImportInput {
  leads: {
    firstName: string
    lastName: string
    phoneNumber?: string | null
    yearsAtCompany?: number | null
    linkedinUrl?: string | null
    email: string
    jobTitle?: string
    countryCode?: string
    companyName?: string
  }[]
}

export interface LeadsBulkImportOutput {
  success: boolean
  importedCount: number
  duplicatesSkipped: number
  invalidLeads: number
  errors: Array<{
    lead: any
    error: string
  }>
}
