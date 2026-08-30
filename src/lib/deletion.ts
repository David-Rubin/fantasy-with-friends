/**
 * When a typed confirmation counts as a match.
 *
 * Free of Firebase so it can be tested anywhere; the deleting lives in
 * ./deleteApi. Small enough to inline, kept here because getting it wrong in
 * either direction is expensive — too strict and an admin cannot delete a
 * league whose name has an em dash in it, too loose and the safeguard is
 * decorative.
 */

/**
 * Whether what the admin typed matches the name they were asked to type.
 *
 * Case and surrounding whitespace are forgiven: someone who typed the name is
 * someone who read the name, which is the whole point of asking. Everything
 * else must match exactly — no prefix matching, no ignoring punctuation. An
 * empty expected name never matches anything, so a league with no name cannot
 * be deleted by pressing the button with an empty box.
 */
export function confirmationMatches(typed: string, expected: string): boolean {
  const wanted = expected.trim()
  if (wanted === '') return false
  return typed.trim().localeCompare(wanted, undefined, { sensitivity: 'accent' }) === 0
}
