/** Format checks only. Callers decide whether a field is required and how to normalize it. */
export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidCountryCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value)
}

export function isValidPhoneNumber(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false
  const digits = value.split(/x|ext\.?/i)[0].replace(/\D/g, '').length
  return /^\+?[\d ().-]+(?:(?:x|ext\.?)\s*\d{1,6})?$/i.test(value) && digits >= 3 && digits <= 20
}

export function isValidYearsAtCompany(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647
}

/** CSV supplies text; the API deliberately requires a number instead. */
export function isValidYearsAtCompanyText(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value) && isValidYearsAtCompany(Number(value))
}

export function isValidLinkedinUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
      /^\/in\/[^/]+\/?$/.test(url.pathname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
