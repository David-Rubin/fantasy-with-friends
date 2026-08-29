import { describe, it, expect } from 'vitest'
import { BIO_MAX_LENGTH, bioProblem, normaliseBio } from './contestants'

describe('normaliseBio', () => {
  it('keeps line breaks the author typed', () => {
    expect(normaliseBio('Line one\n\nLine two')).toBe('Line one\n\nLine two')
  })

  it('keeps runs of spaces inside the text', () => {
    expect(normaliseBio('Two  spaces here')).toBe('Two  spaces here')
  })

  it('trims whitespace off the ends', () => {
    expect(normaliseBio('  Padded  ')).toBe('Padded')
    expect(normaliseBio('\n\nPadded\n\n')).toBe('Padded')
    expect(normaliseBio('\tPadded\t')).toBe('Padded')
  })

  it('leaves an empty bio empty', () => {
    expect(normaliseBio('')).toBe('')
    expect(normaliseBio('   \n  ')).toBe('')
  })
})

describe('bioProblem', () => {
  it('accepts an empty bio', () => {
    expect(bioProblem('')).toBeNull()
  })

  it('accepts a bio at the limit', () => {
    expect(bioProblem('a'.repeat(BIO_MAX_LENGTH))).toBeNull()
  })

  it('refuses one character past the limit', () => {
    expect(bioProblem('a'.repeat(BIO_MAX_LENGTH + 1))).toBe('too-long')
  })

  it('measures what gets stored, not what was typed', () => {
    // Over the limit as typed, inside it once the padding comes off.
    const padded = `   ${'a'.repeat(BIO_MAX_LENGTH)}   `
    expect(padded.length).toBeGreaterThan(BIO_MAX_LENGTH)
    expect(bioProblem(padded)).toBeNull()
  })

  it('counts a newline as a character', () => {
    expect(bioProblem(`${'a'.repeat(BIO_MAX_LENGTH - 1)}\nb`)).toBe('too-long')
  })
})
