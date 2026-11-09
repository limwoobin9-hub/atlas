import { describe, expect, it } from 'vitest'
import { addDays, addMonths, addYears, formatDate, fromYearFraction, inRange, parseLooseDate, rangesOverlap, toYearFraction } from './dates'

describe('dates', () => {
  it('formats in Korean', () => {
    expect(formatDate('1936-01-01')).toBe('1936년 1월 1일')
  })
  it('adds months with end-of-month clamping', () => {
    expect(addMonths('1936-01-31', 1)).toBe('1936-02-29')
    expect(addMonths('1937-01-31', 1)).toBe('1937-02-28')
    expect(addMonths('1936-12-15', 1)).toBe('1937-01-15')
    expect(addMonths('1936-01-15', -1)).toBe('1935-12-15')
    expect(addYears('1936-02-29', 1)).toBe('1937-02-28')
  })
  it('adds days across years (including years < 100)', () => {
    expect(addDays('1936-12-31', 1)).toBe('1937-01-01')
    expect(addDays('0050-03-01', -1)).toBe('0050-02-28')
  })
  it('uses half-open ranges', () => {
    expect(inRange('1940-01-01', '1936-01-01', '1940-01-01')).toBe(false)
    expect(inRange('1939-12-31', '1936-01-01', '1940-01-01')).toBe(true)
    expect(inRange('1000-01-01', null, null)).toBe(true)
    expect(rangesOverlap('1936-01-01', '1940-01-01', '1940-01-01', null)).toBe(false)
  })
  it('parses loose input', () => {
    expect(parseLooseDate('1936년 3월 1일')).toBe('1936-03-01')
    expect(parseLooseDate('1940')).toBe('1940-01-01')
    expect(parseLooseDate('1940.13.1')).toBeNull()
  })
  it('converts to and from year fractions', () => {
    expect(fromYearFraction(toYearFraction('1941-06-22'))).toBe('1941-06-22')
  })
})
