/**
 * Snake-draft turn arithmetic, mirrored from src/lib/draft.ts.
 *
 * Kept as a standalone copy rather than shared with the client bundle: the
 * client's version drives what the UI shows, this one decides what is actually
 * written. If the two ever disagree the server wins, which is the point —
 * a modified client cannot talk its way into an extra turn.
 */

/**
 * The next turn slot. Purely positional: it wraps through pickOrder and starts
 * a new round at the end, and never decides that the draft is over or whether
 * the player at that slot can still pick — see nextTurn for both.
 */
export function nextSlot(
  pickOrder: string[],
  currentRound: number,
  currentPickNumber: number
): { round: number; pickNumber: number } {
  if (currentPickNumber >= pickOrder.length) {
    return { round: currentRound + 1, pickNumber: 1 }
  }
  return { round: currentRound, pickNumber: currentPickNumber + 1 }
}

/**
 * How many contestants each team gets: the pool shared out evenly, with the
 * remainder left on the bench as free agents.
 *
 * This is what makes a team "full", and it is fixed by the board rather than
 * configured. Counting the whole draftable pool — taken and untaken alike —
 * keeps it constant through the draft, so a player who was skipped still has
 * room later, and a player who has drawn level has none.
 *
 * Never below one: a board with fewer contestants than teams cannot be shared
 * out at all, and a capacity of zero would call every team full before the
 * first pick. At one, such a draft runs until the board is bare instead, and
 * the players the order reaches first get the contestants there are.
 *
 * @param draftable contestants in the season that are not eliminated
 */
export function teamCapacity(draftable: number, teams: number): number {
  if (teams <= 0) return 0
  return Math.max(1, Math.floor(draftable / teams))
}

/**
 * Who picks next: the following slot in the snake whose player still has room,
 * or null when nobody does.
 *
 * The order is walked slot by slot, past anyone already at capacity, so a
 * player whose clock expired under `skip` gets their turn back around once
 * everyone else is full — rather than the round count deciding when picking
 * stops and an admin having to top them up from the bench (PRD 3.3.4). The
 * penalty for the skip is that their pick comes late, once the board has
 * been picked over.
 *
 * Two laps of the order is enough to visit every player from any slot: one
 * lap of consecutive snake slots can double up on the players at the turn.
 *
 * @param rosterCounts contestants held per team, in pickOrder order
 * @param capacity     see teamCapacity
 */
export function nextTurn(
  pickOrder: string[],
  currentRound: number,
  currentPickNumber: number,
  rosterCounts: number[],
  capacity: number
): { round: number; pickNumber: number; uid: string } | null {
  let round = currentRound
  let pickNumber = currentPickNumber
  for (let step = 0; step < pickOrder.length * 2; step++) {
    ;({ round, pickNumber } = nextSlot(pickOrder, round, pickNumber))
    const uid = pickerAt(pickOrder, round, pickNumber)
    if (rosterCounts[pickOrder.indexOf(uid)] < capacity) return { round, pickNumber, uid }
  }
  return null
}

/**
 * What happens once a turn has been used: keep going, or close.
 *
 * The draft is over when every team is full, whatever the order says. A
 * skipped player is not full, so the draft keeps circulating among whoever is
 * short until they are level or the board runs bare; it never ends with a
 * roster short while a contestant sits on the bench. What is left over once
 * everyone is at capacity is the remainder the pool never divided into, and
 * those are free agents rather than anything to adjudicate.
 *
 * `remaining === 0` is the backstop: with nothing left there is nothing to
 * continue for, whatever the rosters look like.
 *
 * `awaiting-close` is not an outcome here. A draft only holds for an admin
 * when a whole round has gone by with nobody picking — see draftStalled.
 *
 * @param remaining    undrafted, uneliminated contestants left after this turn
 * @param rosterCounts contestants held per team after this turn, one entry per team
 * @param capacity     see teamCapacity
 */
export function draftOutcome(
  remaining: number,
  rosterCounts: number[],
  capacity: number
): 'continue' | 'complete' {
  if (remaining === 0) return 'complete'
  return rosterCounts.every((count) => count >= capacity) ? 'complete' : 'continue'
}

/**
 * Has a whole round gone by with nobody picking?
 *
 * Skips advance the turn without taking anyone, so a room where everybody has
 * wandered off would otherwise cycle indefinitely, burning a slot per expiry and
 * running the round counter up forever. A round in which every player the
 * rotation reached let their turn pass is the point at which that stops being
 * a draft in progress and starts being an abandoned one.
 *
 * A round, not a count of skips. Counting skips against the players still
 * short halted too early: with two players full and two short, the two short
 * ones skipping once each looked like a full lap, when in fact the round had
 * picks in it and neither had yet been offered a second turn. Only the skip
 * that closes a round can stall the draft, and only if nothing was taken in
 * that round — automatic picks included, so a draft that is still moving never
 * trips this, however many individual turns get missed.
 *
 * Evaluated after a skip, once the next turn is known.
 *
 * @param currentRound  the round the skipped turn was in
 * @param nextRound     the round of the next turn the rotation found, or null
 *                      when it found nobody with room
 * @param lastPickRound the round of the most recent pick, or null before any
 */
export function draftStalled(
  currentRound: number,
  nextRound: number | null,
  lastPickRound: number | null
): boolean {
  if (nextRound === null) return true
  return nextRound > currentRound && lastPickRound !== currentRound
}

/**
 * How many contestants a team may still be given from the bench: up to its
 * capacity, and no further. Nobody gets topped up past what a full team holds.
 */
export function openSlots(rosterCount: number, capacity: number): number {
  return Math.max(0, capacity - rosterCount)
}

/**
 * Whose turn (round, pickNumber) belongs to. Even rounds run backwards — that
 * reversal is the whole of "snake". Rounds may run past the number a full board
 * implies when turns get skipped; nextTurn walks them all the same.
 */
export function pickerAt(pickOrder: string[], round: number, pickNumber: number): string {
  const isEvenRound = round % 2 === 0
  const idx = isEvenRound ? pickOrder.length - pickNumber : pickNumber - 1
  return pickOrder[idx]
}

// ── Pick order resolution ─────────────────────────────────────────────────────

/**
 * A saved admin-set order, brought back into line with who is in the season.
 *
 * Mirrored from src/lib/draft.ts for the same reason as the turn arithmetic
 * above: the client's copy decides what the setup panel shows, this one decides
 * what the draft is actually run from.
 */
export function reconcilePickOrder(
  savedOrder: string[] | undefined | null,
  memberUids: string[]
): string[] {
  const members = new Set(memberUids)
  const placed = (savedOrder ?? []).filter(
    (uid, i, all) => members.has(uid) && all.indexOf(uid) === i
  )
  const seen = new Set(placed)
  return [...placed, ...memberUids.filter((uid) => !seen.has(uid))]
}

/** The order the draft will run in. See src/lib/draft.ts. */
export function resolvePickOrder(
  method: 'randomized' | 'admin-set',
  memberUids: string[],
  adminSetOrder?: string[] | null
): string[] {
  if (method === 'admin-set' && adminSetOrder?.length) {
    return reconcilePickOrder(adminSetOrder, memberUids)
  }
  const arr = [...memberUids]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
