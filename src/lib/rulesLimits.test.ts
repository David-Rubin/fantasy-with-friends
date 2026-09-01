import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { MAX_AVATAR_MB } from './avatarFile'
import { TEAM_NAME_MAX_LENGTH } from './teamName'

/**
 * Every limit that is written down twice.
 *
 * A security rule is the one that counts — a check in the client is advice
 * anyone with devtools can ignore — but the client checks the same limits so a
 * file is refused before it uploads and a name before it is saved. Rules files
 * have no import, so those numbers cannot be shared with the TypeScript that
 * mirrors them, and both sides carry comments asking whoever changes one to
 * change the other. This is what happens when they don't.
 *
 * The failure it prevents is not a security hole — the rule still holds — but
 * a confusing one: a limit raised here and not there rejects at the end of an
 * upload rather than the start of one, or accepts a name in the form that the
 * server then refuses.
 *
 * Add a row when a rule grows another number the client also knows.
 */
const mirrored = [
  {
    what: 'the avatar size limit',
    file: 'storage.rules',
    // `request.resource.size <= 3 * 1024 * 1024`
    pattern: /request\.resource\.size <= (\d+) \* 1024 \* 1024/,
    constant: () => MAX_AVATAR_MB,
    source: 'MAX_AVATAR_MB in src/lib/avatarFile.ts',
  },
  {
    what: 'the team name length limit',
    file: 'firestore.rules',
    // `request.resource.data.teamName.size() <= 40`
    pattern: /request\.resource\.data\.teamName\.size\(\) <= (\d+)/,
    constant: () => TEAM_NAME_MAX_LENGTH,
    source: 'TEAM_NAME_MAX_LENGTH in src/lib/teamName.ts',
  },
]

describe('limits the rules enforce', () => {
  it.each(mirrored)('$what agrees with $source', ({ file, pattern, constant }) => {
    // From the project root: under jsdom `import.meta.url` is an http URL, and
    // vitest runs from the root either way.
    const rules = readFileSync(resolve(process.cwd(), file), 'utf8')
    const match = rules.match(pattern)
    expect(
      match,
      `${pattern} found nothing in ${file} — has the rule been rewritten?`
    ).not.toBeNull()
    expect(Number(match![1])).toBe(constant())
  })
})
