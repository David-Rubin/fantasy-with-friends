/**
 * The letter drawn in someone's avatar.
 *
 * `Array.from` rather than `charAt` or `[0]`: a name starting with an emoji or
 * any character outside the basic plane is stored as a surrogate pair, and
 * indexing would take half of one and render the replacement glyph.
 *
 * Returns '' for a name that is empty or only whitespace. Sign-up requires a
 * display name so that should not happen, but the avatar draws its circle
 * either way rather than collapsing — an empty circle keeps the header on one
 * line, where a missing element would make it jump.
 *
 * Kept free of Firebase (see src/lib/documentTitle.ts for the same reasoning).
 */
export function avatarInitial(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim() ?? ''
  if (!trimmed) return ''
  return (Array.from(trimmed)[0] ?? '').toUpperCase()
}
