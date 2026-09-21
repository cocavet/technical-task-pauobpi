export type LeadsCreateInput = {
  firstName: string
  lastName: string
  companyWebsite?: string | null
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
  email: string
}

export type LeadsCreateOutput = {
  id: number
  firstName: string
  companyWebsite?: string | null
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
  email: string
}
