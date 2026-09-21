import { describe, expect, it } from 'vitest'
import { validateLeadFields } from '../src/utils/leadFields'
import { generateMessageFromTemplate } from '../src/utils/messageGenerator'

describe('optional lead fields', () => {
  it('preserves phone formatting, trims text and accepts zero', () => {
    expect(
      validateLeadFields({
        phoneNumber: ' 0034 612 345 678 ',
        yearsAtCompany: 0,
        linkedinUrl: ' https://www.linkedin.com/in/test ',
      })
    ).toEqual({
      phoneNumber: '0034 612 345 678',
      yearsAtCompany: 0,
      linkedinUrl: 'https://www.linkedin.com/in/test',
    })
  })
  it.each(['+1-280-754-0462x2154', '(731)123-9702', '063.430.8860x4762', '+34 612 345 678'])(
    'keeps formatted phones: %s',
    (phoneNumber) => {
      expect(validateLeadFields({ phoneNumber })).toEqual({ phoneNumber })
    }
  )
  it('distinguishes omission from explicit clearing and ignores yearsInRole', () => {
    expect(validateLeadFields({ yearsInRole: 7 })).toEqual({})
    expect(validateLeadFields({ phoneNumber: ' ', yearsAtCompany: '', linkedinUrl: null })).toEqual({
      phoneNumber: null,
      yearsAtCompany: null,
      linkedinUrl: null,
    })
  })
  it.each([12345678, true, {}, 'call me', '++1234', '1', '1'.repeat(65)])(
    'rejects invalid phones: %j',
    (phoneNumber) => {
      expect(() => validateLeadFields({ phoneNumber })).toThrow('phoneNumber')
    }
  )
  it.each([-1, 1.5, '2', 'NaN', NaN, Infinity, true, {}, 2147483648])(
    'rejects invalid years: %j',
    (yearsAtCompany) => {
      expect(() => validateLeadFields({ yearsAtCompany })).toThrow('yearsAtCompany')
    }
  )
  it.each([
    'javascript:alert(1)',
    'https://linkedin.com.evil.test/in/user',
    'https://example.com/in/user',
    'https://linkedin.com/company/company',
    'https://linkedin.com/in/',
    'https://user:pass@linkedin.com/in/test',
    123,
  ])('rejects invalid profile URLs: %j', (linkedinUrl) => {
    expect(() => validateLeadFields({ linkedinUrl })).toThrow('linkedinUrl')
  })
})

describe('message generation with new fields', () => {
  const lead = {
    firstName: 'Ana',
    phoneNumber: '+34 612 345 678',
    yearsAtCompany: 0,
    linkedinUrl: 'https://linkedin.com/in/ana',
  }
  it('substitutes all new fields, including zero and repeated variables', () => {
    expect(
      generateMessageFromTemplate('{phoneNumber}|{yearsAtCompany}|{linkedinUrl}|{yearsAtCompany}', lead)
    ).toBe('+34 612 345 678|0|https://linkedin.com/in/ana|0')
  })
  it.each(['phoneNumber', 'yearsAtCompany', 'linkedinUrl'])(
    'reports a missing %s only if referenced',
    (field) => {
      expect(() => generateMessageFromTemplate(`{${field}}`, { firstName: 'Ana' })).toThrow(
        `Missing required field: ${field}`
      )
      expect(generateMessageFromTemplate('Hi {firstName}', { firstName: 'Ana' })).toBe('Hi Ana')
    }
  )
  it('does not treat yearsInRole as company tenure', () => {
    expect(() => generateMessageFromTemplate('{yearsInRole}', lead)).toThrow(
      'Unknown field in template: yearsInRole'
    )
  })
})
