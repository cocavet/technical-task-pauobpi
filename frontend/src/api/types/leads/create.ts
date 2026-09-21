export type LeadsCreateInput = {
  firstName: string
  lastName: string
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
  email: string
}

export type LeadsCreateOutput = {
  id: number
  firstName: string
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
  email: string
}
