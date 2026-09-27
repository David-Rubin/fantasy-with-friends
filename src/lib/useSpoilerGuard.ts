import { useState } from 'react'
import {
  settlePrompt,
  spoilerPhase,
  viewThrough,
  type PromptState,
  type SpoilerHorizon,
  type SpoilerPhase,
} from './spoilers'
import { markCaughtUp, rememberedProgress, useWatchProgress } from './watchProgressApi'

export interface SpoilerGuard {
  phase: SpoilerPhase
  /** What there is to catch up on, when there is anything. */
  horizon: SpoilerHorizon | null
  /** The episode the page is drawn through, or null for everything. */
  through: number | null
  /** Where the viewer is caught up to — zero until known. */
  caughtUpThrough: number
  /** "I'm caught up" and the notice's refresh: move to `horizon.through`. */
  catchUp: () => Promise<void>
  catchingUp: boolean
  /** "Not yet": close the prompt and keep the season as it was. */
  decline: () => void
  /**
   * The viewer has just shown they watched `episode` — they scored it, or
   * suggested scores for it — so they are not to be warned about it. Fired
   * before the write that would otherwise raise the warning, so the two land
   * in the local cache in that order. Not awaited by callers: failing it costs
   * one unnecessary prompt, not the score.
   */
  recordWatched: (episode: number) => void
}

/**
 * Everything a page needs to keep a season's results from a viewer who has
 * not watched them yet. The decisions are in ./spoilers; this holds the state.
 *
 * `scope` names what is being guarded — the season page, or one episode's
 * card — so moving between two episodes of the same season, which React Router
 * does without remounting, asks the question afresh for the new one.
 *
 * `inputsReady` is whether the page has heard everything `horizonAt` reads —
 * or enough to know without the rest, given where the viewer is caught up to.
 * `horizonAt` is only called once it has, and only for a participant.
 *
 * `participant` is undefined while membership is still being looked up. A
 * caught-up value this tab already remembers for the season is taken as a
 * yes meanwhile — only a participant ever has one — so a page opened from
 * another page of the same season is not held up by a lookup that, on a
 * congested connection, can take seconds. Nothing is lost by guessing: until
 * membership resolves the page reads no season data, so there is nothing yet
 * to hide.
 */
export function useSpoilerGuard({
  seasonId,
  uid,
  participant,
  scope,
  inputsReady,
  horizonAt,
}: {
  seasonId: string | undefined
  uid: string | undefined
  participant: boolean | undefined
  scope: string
  inputsReady: (caughtUpThrough: number) => boolean
  horizonAt: (caughtUpThrough: number) => SpoilerHorizon | null
}): SpoilerGuard {
  const playing = participant ?? rememberedProgress(seasonId, uid) !== undefined
  const progress = useWatchProgress(seasonId, uid, playing)
  const ready = (!playing || progress.loaded) && inputsReady(progress.caughtUpThrough)
  const horizon = playing && ready ? horizonAt(progress.caughtUpThrough) : null

  const [stored, setStored] = useState<{ scope: string; prompt: PromptState }>({
    scope,
    prompt: 'unsettled',
  })
  const storedPrompt = stored.scope === scope ? stored.prompt : 'unsettled'
  const prompt = settlePrompt(storedPrompt, ready, horizon)
  // Remembered as soon as it is decided, during render — React's pattern for
  // state derived from props — so the first frame that knows is already right.
  if (prompt !== storedPrompt) setStored({ scope, prompt })

  const phase = spoilerPhase(ready, horizon, prompt)
  const [catchingUp, setCatchingUp] = useState(false)

  async function catchUp() {
    if (!seasonId || !uid || !horizon) return
    setCatchingUp(true)
    try {
      await markCaughtUp(seasonId, uid, Math.max(progress.caughtUpThrough, horizon.through))
    } catch (error) {
      console.error('Could not record watch progress', error)
    } finally {
      setCatchingUp(false)
    }
  }

  function recordWatched(episode: number) {
    // Only against a known value: before it arrives, zero is a placeholder,
    // and writing max(0, episode) could move somebody backwards.
    if (!seasonId || !uid || !participant || !progress.loaded) return
    if (episode <= progress.caughtUpThrough) return
    markCaughtUp(seasonId, uid, episode).catch((error) =>
      console.error('Could not record watch progress', error)
    )
  }

  return {
    phase,
    horizon,
    through: viewThrough(phase, progress.caughtUpThrough),
    caughtUpThrough: progress.caughtUpThrough,
    catchUp,
    catchingUp,
    decline: () => setStored({ scope, prompt: 'closed' }),
    recordWatched,
  }
}
