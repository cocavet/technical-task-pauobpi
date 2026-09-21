import { LeadsGetOneOutput } from './getOne'

export type LeadsUpdateInput = {
  id: number
  firstName?: string
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
  email?: string
}

export type LeadsUpdateOutput = LeadsGetOneOutput
