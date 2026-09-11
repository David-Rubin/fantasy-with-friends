import { describe, it, expect } from 'vitest'
import {
  nextSlot,
  nextTurn,
  pickerAt,
  teamCapacity,
  draftOutcome,
  openSlots,
  draftStalled,
  reconcilePickOrder,
  resolvePickOrder,
} from './draft'

describe('nextSlot', () => {
  const twoTeams = ['alice', 'bob']

  it('advances within a round', () => {
    expect(nextSlot(twoTeams, 1, 1)).toEqual({ round: 1, pickNumber: 2 })
  })

  it('wraps to the next round at the end of the order', () => {
    expect(nextSlot(twoTeams, 1, 2)).toEqual({ round: 2, pickNumber: 1 })
  })

  it('keeps going past the round count a full board would imply', () => {
    // Skipped turns burn slots without taking anyone, so a draft can run well
    // past the rounds its contestant count first suggested, until the skipped
    // player has caught up.
    expect(nextSlot(twoTeams, 7, 2)).toEqual({ round: 8, pickNumber: 1 })
  })
})

describe('pickerAt', () => {
  const order = ['alice', 'bob', 'cara']

  it('runs forwards on odd rounds', () => {
    expect(pickerAt(order, 1, 1)).toBe('alice')
    expect(pickerAt(order, 1, 3)).toBe('cara')
  })

  it('runs backwards on even rounds — the snake', () => {
    expect(pickerAt(order, 2, 1)).toBe('cara')
    expect(pickerAt(order, 2, 3)).toBe('alice')
  })

  it('keeps alternating in later rounds', () => {
    expect(pickerAt(order, 3, 1)).toBe('alice')
    expect(pickerAt(order, 4, 1)).toBe('cara')
  })
})

describe('teamCapacity', () => {
  it('shares the pool out evenly', () => {
    expect(teamCapacity(12, 4)).toBe(3)
  })

  it('leaves the remainder for the bench', () => {
    // 5 across 2 teams: 2 each, one free agent.
    expect(teamCapacity(5, 2)).toBe(2)
  })

  it('is at least one when the pool is smaller than the field', () => {
    // Zero would call every team full before anybody picked.
    expect(teamCapacity(3, 4)).toBe(1)
  })

  it('is zero with no teams, rather than dividing by nothing', () => {
    expect(teamCapacity(5, 0)).toBe(0)
  })
})

describe('nextTurn', () => {
  const order = ['alice', 'bob', 'cara']

  it('is the next slot in the snake when everyone has room', () => {
    expect(nextTurn(order, 1, 1, [1, 0, 0], 2)).toEqual({ round: 1, pickNumber: 2, uid: 'bob' })
    expect(nextTurn(order, 1, 3, [1, 1, 1], 2)).toEqual({ round: 2, pickNumber: 1, uid: 'cara' })
  })

  it('passes over a player whose team is full', () => {
    // Cara is full; the round-2 slot that would be hers goes to bob instead.
    expect(nextTurn(order, 1, 3, [1, 1, 2], 2)).toEqual({ round: 2, pickNumber: 2, uid: 'bob' })
  })

  it('keeps circulating back to the one player still short', () => {
    // Alice was skipped once. Everyone else is full, so the rotation runs on
    // to the next slot that is hers, however far away that is.
    expect(nextTurn(order, 2, 3, [1, 2, 2], 2)).toEqual({ round: 3, pickNumber: 1, uid: 'alice' })
    expect(nextTurn(order, 3, 1, [1, 2, 2], 2)).toEqual({ round: 4, pickNumber: 3, uid: 'alice' })
  })

  it('is null once every team is full', () => {
    expect(nextTurn(order, 2, 1, [2, 2, 2], 2)).toBeNull()
  })

  it('finds the last player short from any slot', () => {
    // Consecutive snake slots double up at the turn, so a single lap from some
    // slots never visits some players. Two laps must reach anybody.
    for (let round = 1; round <= 4; round++) {
      for (let pickNumber = 1; pickNumber <= order.length; pickNumber++) {
        expect(nextTurn(order, round, pickNumber, [2, 1, 2], 2)?.uid).toBe('bob')
      }
    }
  })
})

describe('draftOutcome', () => {
  it('keeps going while somebody has room', () => {
    expect(draftOutcome(4, [1, 0], 2)).toBe('continue')
  })

  it('closes once every team is full, with the leftovers as free agents', () => {
    // The 2-team, 5-contestant ending: nobody is short, so the spare is simply
    // a free agent and there is nothing for an admin to settle.
    expect(draftOutcome(1, [2, 2], 2)).toBe('complete')
  })

  it('closes the moment the board empties, whatever the rosters', () => {
    expect(draftOutcome(0, [2, 1], 2)).toBe('complete')
  })

  it('does not close on a round boundary while a skipped player is short', () => {
    // Under the old rule this was the awaiting-close case. Now the draft just
    // carries on to alice, who still has room.
    expect(draftOutcome(1, [1, 2], 2)).toBe('continue')
  })

  it('walks a 3-team, 7-contestant draft with a skip through to the end', () => {
    const order = ['alice', 'bob', 'cara']
    const capacity = teamCapacity(7, 3) // 2 each, one free agent
    const rosters = [0, 0, 0]
    let remaining = 7
    let turn = { round: 1, pickNumber: 0, uid: '' }
    const picks: string[] = []
    // Cara's clock expires under skip in round 1; every other turn is a pick.
    for (let guard = 0; guard < 20; guard++) {
      const next = nextTurn(order, turn.round, turn.pickNumber, rosters, capacity)
      expect(next).not.toBeNull()
      turn = next!
      if (turn.round === 1 && turn.uid === 'cara') continue
      rosters[order.indexOf(turn.uid)]++
      remaining--
      picks.push(`R${turn.round} ${turn.uid}`)
      if (draftOutcome(remaining, rosters, capacity) === 'complete') break
    }
    // Round 2 runs backwards; cara's makeup comes only once the others are full.
    expect(picks).toEqual(['R1 alice', 'R1 bob', 'R2 cara', 'R2 bob', 'R2 alice', 'R3 cara'])
    expect(rosters).toEqual([2, 2, 2])
    expect(remaining).toBe(1)
  })
})

describe('openSlots', () => {
  it('is the gap up to capacity', () => {
    expect(openSlots(1, 3)).toBe(2)
  })

  it('is zero for a full team', () => {
    expect(openSlots(3, 3)).toBe(0)
  })

  it('never goes negative', () => {
    expect(openSlots(5, 3)).toBe(0)
  })
})

describe('draftStalled', () => {
  it('does not stall mid-round, however many turns were skipped', () => {
    // Round 1 still has turns to come.
    expect(draftStalled(1, 1, null)).toBe(false)
  })

  it('does not stall at the end of a round that had a pick in it', () => {
    // 5 contestants, 4 players: alice and bob picked, cara and dan skipped.
    // Two skips against two players short is not a lap — the round had picks,
    // and neither cara nor dan has yet been offered a second turn.
    expect(draftStalled(1, 2, 1)).toBe(false)
  })

  it('stalls once a round closes with nothing picked in it', () => {
    // Round 2 came back round to dan and cara and both let it pass again.
    expect(draftStalled(2, 3, 1)).toBe(true)
  })

  it('stalls when a round with no picks at all closes', () => {
    // Nobody has picked yet and the first round is over: an empty room.
    expect(draftStalled(1, 2, null)).toBe(true)
  })

  it('stalls if the rotation finds nobody with room', () => {
    // Cannot happen after a skip — the skipper has room — but a null next
    // turn must not be handed to the clock.
    expect(draftStalled(2, null, 2)).toBe(true)
  })

  it('treats a round the rotation jumps over as closing this one', () => {
    // The only player short sits at slot 1; the snake reaches them next two
    // rounds on. The round they just skipped in had no pick, so: stalled.
    expect(draftStalled(3, 5, 2)).toBe(true)
  })
})

// The server's own copy, which decides what the draft is actually run from —
// see src/lib/draft.test.ts for the client's, which decides what setup shows.
describe('resolvePickOrder (server)', () => {
  it('runs an admin-set season in the order that was arranged', () => {
    expect(resolvePickOrder('admin-set', ['u1', 'u2', 'u3'], ['u3', 'u1', 'u2'])).toEqual([
      'u3',
      'u1',
      'u2',
    ])
  })

  it('squares that order with who is actually in the season', () => {
    // u2 left and u4 joined after the order was arranged.
    expect(resolvePickOrder('admin-set', ['u1', 'u3', 'u4'], ['u3', 'u2', 'u1'])).toEqual([
      'u3',
      'u1',
      'u4',
    ])
  })

  it('shuffles a randomized season without losing or repeating anyone', () => {
    const members = ['u1', 'u2', 'u3', 'u4']
    const result = resolvePickOrder('randomized', members, ['u4', 'u3'])
    expect([...result].sort()).toEqual(members)
  })

  it('falls back to a shuffle when admin-set has nothing arranged', () => {
    expect([...resolvePickOrder('admin-set', ['u1', 'u2'])].sort()).toEqual(['u1', 'u2'])
  })
})

describe('reconcilePickOrder (server)', () => {
  it('appends anyone who joined after the order was arranged', () => {
    expect(reconcilePickOrder(['u2', 'u1'], ['u1', 'u2', 'u3'])).toEqual(['u2', 'u1', 'u3'])
  })

  it('drops anyone no longer on the roster', () => {
    expect(reconcilePickOrder(['u2', 'gone', 'u1'], ['u1', 'u2'])).toEqual(['u2', 'u1'])
  })

  it('is the roster itself when nothing was arranged', () => {
    expect(reconcilePickOrder(undefined, ['u1', 'u2'])).toEqual(['u1', 'u2'])
  })
})
