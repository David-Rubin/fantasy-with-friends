/**
 * What a contestant's bio may be, decided without Firebase in sight.
 *
 * Free of Firebase so it can be tested without credentials; the writing lives
 * with the rest of the season setup.
 */

/** Characters, counted after normalising — what gets stored is what is capped. */
export const BIO_MAX_LENGTH = 300

/**
 * A bio as it should be stored.
 *
 * Whitespace inside the text survives exactly as typed: a bio is prose, and a
 * paragraph break or a deliberate run of spaces is the author's, not noise to
 * be collapsed. Only the ends are trimmed, where whitespace is invisible and
 * would otherwise ride along forever through every later edit.
 *
 * Whatever reads this back has to preserve the whitespace too — HTML collapses
 * runs of spaces and drops newlines unless told not to.
 */
export function normaliseBio(input: string): string {
  return input.trim()
}

/** Why a bio cannot be stored, or null when it is fine. An empty bio is fine. */
export function bioProblem(input: string): 'too-long' | null {
  return normaliseBio(input).length > BIO_MAX_LENGTH ? 'too-long' : null
}
