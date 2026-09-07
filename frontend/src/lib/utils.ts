/** Shared UI utility functions */
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a Decimal string as currency */
export function formatCurrency(amount: string | number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined) return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Format a Decimal string as a plain number */
export function formatNumber(amount: string | null | undefined): string {
  if (!amount) return '0'
  return parseFloat(amount).toFixed(2)
}

/** Confidence badge class */
export function confidenceBadgeClass(level: string): string {
  switch (level) {
    case 'high': return 'badge-high'
    case 'medium': return 'badge-medium'
    case 'low': return 'badge-low'
    default: return 'badge-medium'
  }
}

/** Confidence label */
export function confidenceLabel(level: string): string {
  switch (level) {
    case 'high': return '✓ High'
    case 'medium': return '~ Medium'
    case 'low': return '⚠ Low'
    default: return level
  }
}
