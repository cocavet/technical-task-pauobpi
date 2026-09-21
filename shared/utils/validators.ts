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

/** Uses only an explicitly supplied website; never derives one from other lead data. */
export function normalizeCompanyWebsite(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) return null
  try {
    const text = value.trim()
    const url = new URL(text.includes('://') ? text : `https://${text}`)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null
    const hostname = url.hostname
    if (hostname.length > 253 || !hostname.includes('.') || /^\d+(?:\.\d+){3}$/.test(hostname)) return null
    if (!hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))
      return null
    return hostname
  } catch {
    return null
  }
}
