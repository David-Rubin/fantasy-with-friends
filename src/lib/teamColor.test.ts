import { describe, it, expect } from 'vitest'
import {
  TEAM_COLORS,
  fallbackTeamColor,
  takenTeamColors,
  teamColorFor,
  teamHoldingColor,
} from './teamColor'
import { DEFAULT_ACCENT, accent } from './accentColor'
import { TEAM_COLORS as SERVER_TEAM_COLORS } from '../../functions/src/teamColor'

/**
 * These import ./teamColor rather than ./seasonApi on purpose — the latter
 * reaches ./firebase, which builds a Firebase app at import time and throws
 * without the VITE_FIREBASE_* variables that CI does not have.
 */

describe('the palette', () => {
  // The browser bundle and the Cloud Functions tree cannot import each other,
  // so the list is written down twice. If they drift, the server hands out a
  // colour the picker cannot draw, or refuses one it offers.
  it('is the same list on both sides of the wire', () => {
    expect(TEAM_COLORS).toEqual(SERVER_TEAM_COLORS)
  })

  it('has no duplicates', () => {
    expect(new Set(TEAM_COLORS).size).toBe(TEAM_COLORS.length)
  })

  // The three colours this palette replaced are gone from the codebase rather
  // than translated at read time — a document still carrying one is handled by
  // accent(), below, which needs to know nothing about what it used to mean.
  it('has retired its old names completely', () => {
    for (const gone of ['purple', 'indigo', 'teal']) {
      expect(TEAM_COLORS).not.toContain(gone)
    }
  })
})

describe('accent', () => {
  it('passes a colour from the palette through', () => {
    expect(accent('sage')).toBe('sage')
  })

  // A document written before the palette changed, edited by hand, or restored
  // from a backup. It reaches a class map as `undefined` and draws nothing,
  // which looks like a bug rather than a stale record — so it gets the default.
  it('falls back for a colour the palette does not know', () => {
    expect(accent('teal')).toBe(DEFAULT_ACCENT)
    expect(accent('chartreuse')).toBe(DEFAULT_ACCENT)
    expect(accent(undefined)).toBe(DEFAULT_ACCENT)
  })

  it('offers a default that is itself in the palette', () => {
    expect(TEAM_COLORS).toContain(DEFAULT_ACCENT)
  })
})

describe('takenTeamColors', () => {
  const roster = [
    { uid: 'ada', teamColor: 'sage' as const },
    { uid: 'bob', teamColor: 'rose' as const },
    { uid: 'mia' },
  ]

  it('lists the colours other teams hold', () => {
    expect(takenTeamColors(roster).sort()).toEqual(['rose', 'sage'])
  })

  it('does not take a member their own colour', () => {
    expect(takenTeamColors(roster, 'ada')).toEqual(['rose'])
  })

  it('ignores a member who holds no colour yet', () => {
    expect(takenTeamColors(roster, 'mia')).toEqual(['sage', 'rose'])
  })

  it('is empty for an empty roster', () => {
    expect(takenTeamColors([])).toEqual([])
  })
})

describe('fallbackTeamColor', () => {
  it('always answers with a colour from the palette', () => {
    for (const uid of ['a', 'ada', 'x'.repeat(64), '', '0123456789abcdefghij']) {
      expect(TEAM_COLORS).toContain(fallbackTeamColor(uid))
    }
  })

  it('gives the same uid the same colour every time', () => {
    expect(fallbackTeamColor('ada')).toBe(fallbackTeamColor('ada'))
  })
})

describe('teamColorFor', () => {
  it('uses the stored colour when there is one', () => {
    expect(teamColorFor({ uid: 'ada', teamColor: 'brown' })).toBe('brown')
  })

  it('falls back for a member document written before the field existed', () => {
    expect(teamColorFor({ uid: 'ada' })).toBe(fallbackTeamColor('ada'))
  })
})

describe('teamHoldingColor', () => {
  const roster = [
    { uid: 'ada', teamName: 'Round Table Rejects', teamColor: 'sage' as const },
    { uid: 'bob', teamName: 'Castle Crashers', teamColor: 'rose' as const },
    { uid: 'mia', teamName: "Mia's Team" },
  ]

  it('names the team holding a colour', () => {
    expect(teamHoldingColor(roster, 'sage')).toBe('Round Table Rejects')
  })

  it('is undefined for a colour nobody holds', () => {
    expect(teamHoldingColor(roster, 'brown')).toBeUndefined()
  })

  it('does not name the member doing the looking', () => {
    expect(teamHoldingColor([roster[0]], 'sage', 'ada')).toBeUndefined()
  })

  // A fallback colour is drawn but never claimed, so it cannot make somebody
  // else's swatch unavailable.
  it('ignores a member with no stored colour', () => {
    expect(teamHoldingColor([roster[2]], fallbackTeamColor('mia'))).toBeUndefined()
  })
})
