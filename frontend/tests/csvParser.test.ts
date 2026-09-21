import { describe, it, expect } from 'vitest'
import { parseCsv, isValidEmail } from '../src/utils/csvParser'
import leadsWithErrors from '../../docs/leads-with-errors.csv?raw'
import leadsOk1 from '../../docs/leads-ok-1.csv?raw'
import leadsOk2 from '../../docs/leads-ok-2.csv?raw'
import leadsOk3 from '../../docs/leads-ok-3.csv?raw'

describe('isValidEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
    expect(isValidEmail('first.last+tag@example.org')).toBe(true)
    expect(isValidEmail('123@456.com')).toBe(true)
  })

  it('should return false for invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test.example.com')).toBe(false)
    expect(isValidEmail('test@.com')).toBe(false)
    expect(isValidEmail('test@example')).toBe(false)
  })
})

describe('parseCsv', () => {
  it('rejects the invalid countries from the real CSV without corrupting accents', () => {
    const leads = parseCsv(leadsWithErrors)

    for (const rowIndex of [6, 11, 14, 16, 18]) {
      const lead = leads.find((lead) => lead.rowIndex === rowIndex)!
      expect(lead.isValid, `CSV row ${rowIndex}`).toBe(false)
      expect(lead.errors).toContain('Country code must be two uppercase letters')
    }
    expect(leads[0]).toMatchObject({
      firstName: 'Iñaki',
      lastName: 'Álvarez',
      countryCode: 'ES',
      isValid: true,
      errors: [],
    })
  })

  it.each([leadsOk1, leadsOk2, leadsOk3])('preserves every valid example country', (csv) => {
    const leads = parseCsv(csv)
    const originalCodes = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((row) => row.match(/,([A-Z]{2}),/)![1])
    expect(leads.every((lead) => lead.isValid)).toBe(true)
    expect(leads.map((lead) => lead.countryCode)).toEqual(originalCodes)
  })

  it('keeps countries optional and preserves accented fields when trimming', () => {
    const leads = parseCsv(`firstName,lastName,email,jobTitle,countryCode,companyName
 Iñaki , Álvarez ,inaki@example.com, Técnico , ES , Compañía Ñ
Zoé,Muñoz,zoe@example.com,Diseñadora,,Éxito`)
    expect(leads[0]).toMatchObject({
      firstName: 'Iñaki',
      lastName: 'Álvarez',
      jobTitle: 'Técnico',
      countryCode: 'ES',
      companyName: 'Compañía Ñ',
      isValid: true,
    })
    expect(leads[1]).toMatchObject({
      firstName: 'Zoé',
      lastName: 'Muñoz',
      jobTitle: 'Diseñadora',
      countryCode: undefined,
      companyName: 'Éxito',
      isValid: true,
    })
  })

  it('should throw error for empty content', () => {
    expect(() => parseCsv('')).toThrow('CSV content cannot be empty')
    expect(() => parseCsv('   ')).toThrow('CSV content cannot be empty')
  })

  it('should throw error for CSV with only headers', () => {
    const csv = 'firstName,lastName,email'
    expect(() => parseCsv(csv)).toThrow('CSV file appears to be empty or contains no valid data')
  })

  it('should throw error for malformed CSV content', () => {
    const malformedCsv = `firstName,lastName,email
"John,Doe,john@example.com,extra"field`
    expect(() => parseCsv(malformedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with mismatched field count', () => {
    const mismatchedCsv = `firstName,lastName,email
John,Doe,john@example.com,ExtraField,AnotherExtra
Jane,Smith`
    expect(() => parseCsv(mismatchedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with critical delimiter issues', () => {
    const noDelimiterCsv = `firstName lastName email
John Doe john@example.com`
    expect(() => parseCsv(noDelimiterCsv)).toThrow()
  })

  it('should parse valid CSV with all required fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode,companyName
John,Doe,john.doe@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      jobTitle: 'Developer',
      countryCode: 'US',
      companyName: 'Tech Corp',
      isValid: true,
      errors: [],
      rowIndex: 2,
    })
  })

  it('should handle missing required fields and mark as invalid', () => {
    const csv = `firstName,lastName,email
,Smith,john@example.com
John,,john@example.com
John,Smith,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('First name is required')

    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('Last name is required')

    expect(result[2].isValid).toBe(false)
    expect(result[2].errors).toContain('Email is required')
  })

  it('should validate email format', () => {
    const csv = `firstName,lastName,email
John,Doe,invalid-email
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid email format')
    expect(result[1].isValid).toBe(true)
  })

  it('should handle CSV with quoted values', () => {
    const csv = `firstName,lastName,email,jobTitle
"John","Doe","john.doe@example.com","Software Engineer"`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john.doe@example.com')
    expect(result[0].jobTitle).toBe('Software Engineer')
  })

  it('should skip empty rows', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,,
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('John')
    expect(result[1].firstName).toBe('Jane')
  })

  it('should handle case-insensitive headers', () => {
    const csv = `FIRSTNAME,LASTNAME,EMAIL,JOBTITLE,COUNTRYCODE,COMPANYNAME
John,Doe,john@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].jobTitle).toBe('Developer')
  })

  it('should handle missing optional fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode
John,Doe,john@example.com,,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].jobTitle).toBeUndefined()
    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].isValid).toBe(true)
  })

  it('should preserve row index correctly', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
Jane,Smith,jane@example.com
Bob,Johnson,bob@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].rowIndex).toBe(2)
    expect(result[1].rowIndex).toBe(3)
    expect(result[2].rowIndex).toBe(4)
  })

  it('should handle multiple validation errors per lead', () => {
    const csv = `firstName,lastName,email
 , ,invalid-email`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toHaveLength(3)
    expect(result[0].errors).toContain('First name is required')
    expect(result[0].errors).toContain('Last name is required')
    expect(result[0].errors).toContain('Invalid email format')
  })

  it('should handle extra columns not in header mapping', () => {
    const csv = `firstName,lastName,email,unknownColumn
John,Doe,john@example.com,someValue`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })

  it('should handle mixed valid and invalid leads', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,Smith,invalid-email
Jane,Johnson,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].isValid).toBe(true)
    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('First name is required')
    expect(result[1].errors).toContain('Invalid email format')
    expect(result[2].isValid).toBe(true)
  })

  it('should handle whitespace in fields', () => {
    const csv = `firstName,lastName,email
 John , Doe , john@example.com `

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })
})

describe('new optional fields', () => {
  it('parses present, absent and zero values without converting phones to numbers', () => {
    const rows = parseCsv(`firstName,lastName,email,phoneNumber,yearsAtCompany,linkedinUrl
Ana,Test,ana@example.com,+34 612 345 678,5,https://linkedin.com/in/ana
Luis,Test,luis@example.com,,,
Zoe,Test,zoe@example.com,0034 612 345 678,0,https://linkedin.com/in/zoe`)
    expect(rows.every((row) => row.isValid)).toBe(true)
    expect(rows[0]).toMatchObject({
      phoneNumber: '+34 612 345 678',
      yearsAtCompany: 5,
      linkedinUrl: 'https://linkedin.com/in/ana',
    })
    expect(rows[1].yearsAtCompany).toBeUndefined()
    expect(rows[1].phoneNumber).toBeUndefined()
    expect(rows[2]).toMatchObject({ phoneNumber: '0034 612 345 678', yearsAtCompany: 0 })
  })
  it('does not map yearsInRole to yearsAtCompany', () => {
    const [row] = parseCsv('firstName,lastName,email,yearsInRole\nAna,Test,ana@example.com,8')
    expect(row.isValid).toBe(true)
    expect(row.yearsAtCompany).toBeUndefined()
  })
  it.each(['-1', '1.5', 'NaN', '1e2', '0x10', '2147483648'])('rejects invalid CSV years: %s', (years) => {
    expect(
      parseCsv(`firstName,lastName,email,yearsAtCompany\nAna,Test,ana@example.com,${years}`)[0].isValid
    ).toBe(false)
  })
  it('flags invalid phone and LinkedIn values before importing', () => {
    const [row] = parseCsv(
      'firstName,lastName,email,phoneNumber,linkedinUrl\nAna,Test,ana@example.com,call me,https://linkedin.com.evil.test/in/ana'
    )
    expect(row.errors).toEqual([
      'Invalid phone number format',
      'LinkedIn URL must be an HTTP(S) LinkedIn profile URL',
    ])
  })
})
