export type LeadsGetOneInput = {
  id: number
}

export type LeadsGetOneOutput = {
  id: number
  firstName: string
  companyWebsite?: string | null
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
  email: string
}
