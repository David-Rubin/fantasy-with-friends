import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { listenDoc } from './listen'
import type { WatchProgressDoc } from './types'

/**
 * Reading and writing how far somebody has watched. What it is for, and why it
 * is one number, is in src/lib/spoilers.ts.
 *
 * No audit event: nobody but the writer is affected by it, and nobody but the
 * writer can read it.
 */

function watchProgressRef(seasonId: string, uid: string) {
  return doc(db, 'seasons', seasonId, 'watchProgress', uid)
}

/**
 * Record that `uid` has watched through `episode`.
 *
 * The caller passes the larger of this and where they already are — it never
 * goes backwards, since nothing in the app offers to un-watch an episode.
 */
export async function markCaughtUp(seasonId: string, uid: string, episode: number): Promise<void> {
  const key = progressKey(seasonId, uid)
  lastKnown.set(key, Math.max(lastKnown.get(key) ?? 0, episode))
  await setDoc(watchProgressRef(seasonId, uid), {
    caughtUpThroughEpisode: episode,
    updatedAt: Date.now(),
  } satisfies WatchProgressDoc)
}

/**
 * Where the signed-in participant is caught up to, and whether that is known.
 *
 * `enabled` is whether they play in the season. A superadmin or league admin
 * reading one they are not in has nothing to be protected from here — they
 * hold no document, and the rules would refuse them one.
 *
 * `loaded` waits for the server. On a stalled connection the SDK answers from
 * its cache, where this document is missing on a fresh page, and "missing"
 * would read as "watched nothing" and put the prompt up over a season they
 * are caught up on — see useMySeasonIds for the same trap. The exception is
 * their own write, which is the answer by definition.
 *
 * Except that it rarely has to wait more than once. The value only ever goes
 * up, so the last one this tab heard is a floor on the real one: starting
 * from it can at worst ask about an episode somebody has since confirmed on
 * another device, and never shows one they have not. So a page opened after
 * another page of the same season starts from what that page knew, instead of
 * sitting behind "Checking for spoilers" while a congested connection — the
 * emulator with several tabs open, or a bad phone signal — delivers a fresh
 * listener's first answer.
 */
export function useWatchProgress(
  seasonId: string | undefined,
  uid: string | undefined,
  enabled: boolean
): { caughtUpThrough: number; loaded: boolean } {
  const [state, setState] = useState<{ key: string; caughtUpThrough: number } | null>(null)
  const key = progressKey(seasonId, uid)

  useEffect(() => {
    if (!seasonId || !uid || !enabled) return
    return listenDoc(
      watchProgressRef(seasonId, uid),
      'watch progress',
      (snap) => {
        if (snap.metadata.fromCache && !snap.metadata.hasPendingWrites) return
        const data = snap.data() as WatchProgressDoc | undefined
        const caughtUpThrough = data?.caughtUpThroughEpisode ?? 0
        lastKnown.set(progressKey(seasonId, uid), caughtUpThrough)
        setState({ key: progressKey(seasonId, uid), caughtUpThrough })
      },
      undefined,
      { includeMetadataChanges: true }
    )
  }, [seasonId, uid, enabled])

  // Keyed, so a value heard for one season is never read as another's while
  // the listener for the new one is on its way.
  // The higher of the two, so a value just written by markCaughtUp is not
  // undercut by the snapshot from before it; once the listener hears the
  // write, the two agree.
  const heard = state?.key === key ? state.caughtUpThrough : undefined
  const remembered = lastKnown.get(key)
  const caughtUpThrough = !enabled
    ? undefined
    : heard === undefined || remembered === undefined
      ? (heard ?? remembered)
      : Math.max(heard, remembered)
  return { caughtUpThrough: caughtUpThrough ?? 0, loaded: caughtUpThrough !== undefined }
}

/**
 * The last value heard or written per season and person, for the life of the
 * tab. See useWatchProgress for why a remembered value is safe to start from.
 */
const lastKnown = new Map<string, number>()

/** What this tab last knew, if anything — see useSpoilerGuard's `participant`. */
export function rememberedProgress(
  seasonId: string | undefined,
  uid: string | undefined
): number | undefined {
  return lastKnown.get(progressKey(seasonId, uid))
}

function progressKey(seasonId: string | undefined, uid: string | undefined) {
  return `${seasonId}/${uid}`
}
