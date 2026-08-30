import { describe, it, expect } from 'vitest'
import { canRenameTeam, normalizeTeamName, teamNameProblem, TEAM_NAME_MAX_LENGTH } from './teamName'

/**
 * These import ./teamName rather than ./seasonApi on purpose — the latter
 * reaches ./firebase, which builds a Firebase app at import time and throws
 * without the VITE_FIREBASE_* variables that CI does not have.
 */

describe('normalizeTeamName', () => {
  it('trims the ends', () => {
    expect(normalizeTeamName('  The Traitors  ')).toBe('The Traitors')
  })

  it('collapses runs of whitespace inside', () => {
    expect(normalizeTeamName('The\t Faithful   Few')).toBe('The Faithful Few')
  })

  it('leaves an already-clean name alone', () => {
    expect(normalizeTeamName("Ada's Team")).toBe("Ada's Team")
  })
})

describe('teamNameProblem', () => {
  it('accepts an ordinary name', () => {
    expect(teamNameProblem('Round Table Rejects')).toBeNull()
  })

  it('rejects an empty name', () => {
    expect(teamNameProblem('')).toBe('empty')
  })

  it('rejects a name that is only whitespace — it would store as empty', () => {
    expect(teamNameProblem('   ')).toBe('empty')
  })

  it('accepts a name exactly at the limit', () => {
    expect(teamNameProblem('a'.repeat(TEAM_NAME_MAX_LENGTH))).toBeNull()
  })

  it('rejects a name past the limit', () => {
    expect(teamNameProblem('a'.repeat(TEAM_NAME_MAX_LENGTH + 1))).toBe('too-long')
  })

  it('measures the name as it would be stored, not as typed', () => {
    expect(teamNameProblem(`  ${'a'.repeat(TEAM_NAME_MAX_LENGTH)}  `)).toBeNull()
  })
})

describe('canRenameTeam', () => {
  it('allows it before the draft opens', () => {
    expect(canRenameTeam({ state: 'setup', firstEpisodeScoredAt: null })).toBe(true)
  })

  it('allows it while the draft is running', () => {
    expect(canRenameTeam({ state: 'draft', firstEpisodeScoredAt: null })).toBe(true)
  })

  // The draft ending moves the season to `active` in the same write, so the
  // member reading "Draft complete!" is already looking at an active season.
  it('allows it while the draft-complete banner is up', () => {
    expect(canRenameTeam({ state: 'active', firstEpisodeScoredAt: null })).toBe(true)
  })

  it('refuses once an episode has been scored', () => {
    expect(canRenameTeam({ state: 'active', firstEpisodeScoredAt: 1_700_000_000_000 })).toBe(false)
  })

  it('refuses once the season is over', () => {
    expect(canRenameTeam({ state: 'complete', firstEpisodeScoredAt: null })).toBe(false)
  })

  it('treats a season document without the field as unscored', () => {
    expect(canRenameTeam({ state: 'active' })).toBe(true)
  })
})
