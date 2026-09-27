import { describe, it, expect } from 'vitest'
import {
  alreadyWatched,
  contestantsAsOf,
  episodeSpoiler,
  episodesAsOf,
  isAhead,
  seasonSpoiler,
  settlePrompt,
  spoilerPhase,
  standingAsOf,
  viewThrough,
} from './spoilers'

describe('alreadyWatched', () => {
  it('includes the episode the viewer is caught up to', () => {
    expect(alreadyWatched(3, 3)).toBe(true)
    expect(alreadyWatched(3, 1)).toBe(true)
  })

  it('excludes episodes after it', () => {
    expect(alreadyWatched(3, 4)).toBe(false)
  })

  it('agrees with episodeSpoiler, whatever else has been scored or suggested', () => {
    // The page settles on alreadyWatched before it has heard the episode list
    // or the suggestion, so the two must never disagree.
    for (const episode of [1, 2, 3]) {
      expect(alreadyWatched(3, episode)).toBe(true)
      expect(episodeSpoiler(3, episode, ['1', '2', '3', '4', '5'], true)).toBeNull()
    }
  })
})

describe('seasonSpoiler', () => {
  it('is nothing before any episode is scored', () => {
    expect(seasonSpoiler(0, [])).toBeNull()
  })

  it('names the latest scored episode past where the viewer is', () => {
    expect(seasonSpoiler(3, ['1', '2', '3', '5', '4'])).toEqual({ through: 5, kind: 'scored' })
  })

  it('is nothing once the viewer is caught up to the latest', () => {
    expect(seasonSpoiler(5, ['1', '5'])).toBeNull()
  })

  it('is nothing when the viewer has confirmed further than anything scored', () => {
    // Confirmed on a suggested card for episode 6 before an admin scored it.
    expect(seasonSpoiler(6, ['5'])).toBeNull()
  })

  it('is not moved by a correction to an episode already watched', () => {
    expect(seasonSpoiler(5, ['3'])).toBeNull()
  })
})

describe('episodeSpoiler', () => {
  it('is nothing for an episode the viewer has watched', () => {
    expect(episodeSpoiler(4, 3, ['3', '5'], false)).toBeNull()
  })

  it('names the episode itself when it has been scored', () => {
    expect(episodeSpoiler(3, 4, ['4', '5'], false)).toEqual({ through: 4, kind: 'scored' })
  })

  it('names the episode itself when it has a suggestion waiting', () => {
    expect(episodeSpoiler(5, 6, ['5'], true)).toEqual({ through: 6, kind: 'suggested' })
  })

  it('names an episode scored in between, whose eliminations the card would give away', () => {
    expect(episodeSpoiler(3, 6, ['5'], false)).toEqual({ through: 5, kind: 'scored' })
  })

  it('ignores episodes after this one', () => {
    expect(episodeSpoiler(3, 4, ['5', '6'], false)).toBeNull()
  })

  it('is nothing for an empty card with nothing scored in between', () => {
    expect(episodeSpoiler(5, 6, ['5'], false)).toBeNull()
  })
})

describe('the prompt', () => {
  const spoiler = { through: 5, kind: 'scored' as const }

  it('is checking until the answer is in', () => {
    expect(spoilerPhase(false, null, 'unsettled')).toBe('checking')
  })

  it('asks when there was something waiting on arrival', () => {
    expect(spoilerPhase(true, spoiler, 'unsettled')).toBe('prompt')
    expect(settlePrompt('unsettled', true, spoiler)).toBe('open')
  })

  it('is clear when there was nothing waiting on arrival', () => {
    expect(spoilerPhase(true, null, 'unsettled')).toBe('clear')
    expect(settlePrompt('unsettled', true, null)).toBe('closed')
  })

  it('only notifies about a result that lands while the page is open', () => {
    expect(spoilerPhase(true, spoiler, 'closed')).toBe('hidden')
  })

  it('stays hidden once the viewer has said they are not caught up', () => {
    expect(spoilerPhase(true, { through: 6, kind: 'scored' }, 'closed')).toBe('hidden')
  })

  it('closes for good when the viewer catches up elsewhere while it is open', () => {
    expect(settlePrompt('open', true, null)).toBe('closed')
    expect(spoilerPhase(true, spoiler, settlePrompt('open', true, null))).toBe('hidden')
  })

  it('does not settle on a partial answer', () => {
    expect(settlePrompt('unsettled', false, null)).toBe('unsettled')
  })
})

describe('viewThrough', () => {
  it('draws everything when clear', () => {
    expect(viewThrough('clear', 3)).toBeNull()
  })

  it.each(['checking', 'prompt', 'hidden'] as const)('draws through the watermark when %s', (p) => {
    expect(viewThrough(p, 3)).toBe(3)
  })
})

describe('isAhead', () => {
  it('reads episode keys as numbers, not strings', () => {
    expect(isAhead('10', 9)).toBe(true)
    expect(isAhead('9', 10)).toBe(false)
  })

  it('is never ahead of a live view', () => {
    expect(isAhead(99, null)).toBe(false)
  })
})

describe('contestantsAsOf', () => {
  const cast = [
    { id: 'a', eliminatedEpisode: null },
    { id: 'b', eliminatedEpisode: 2 },
    { id: 'c', eliminatedEpisode: 4 },
  ]

  it('brings back a contestant who went out after the watermark', () => {
    expect(contestantsAsOf(cast, 3).map((c) => c.eliminatedEpisode)).toEqual([null, 2, null])
  })

  it('keeps an elimination the viewer has seen', () => {
    expect(contestantsAsOf(cast, 4).map((c) => c.eliminatedEpisode)).toEqual([null, 2, 4])
  })

  it('leaves a live view alone', () => {
    expect(contestantsAsOf(cast, null)).toBe(cast)
  })
})

describe('episodesAsOf', () => {
  it('drops the episodes past the watermark', () => {
    expect(episodesAsOf({ '1': true, '2': false, '10': true }, 2)).toEqual({
      '1': true,
      '2': false,
    })
  })
})

describe('standingAsOf', () => {
  const running = { '1': 4, '2': 10, '4': 15 }

  it('uses the stored total on the live board', () => {
    expect(standingAsOf(15, running, null)).toEqual({ total: 15, delta: 5 })
  })

  it('reads the running total through the watermark', () => {
    expect(standingAsOf(15, running, 2)).toEqual({ total: 10, delta: 6 })
  })

  it('carries the last scored episode across an unscored one', () => {
    expect(standingAsOf(15, running, 3)).toEqual({ total: 10, delta: 6 })
  })

  it('is zero with no delta before anything the viewer has seen', () => {
    expect(standingAsOf(15, running, 0)).toEqual({ total: 0, delta: null })
  })

  it('counts the first episode in full as its delta', () => {
    expect(standingAsOf(15, running, 1)).toEqual({ total: 4, delta: 4 })
  })

  it('treats an entry with nothing stored as zero', () => {
    expect(standingAsOf(undefined, undefined, 3)).toEqual({ total: 0, delta: null })
  })
})
