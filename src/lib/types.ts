// ── Role / State enums ────────────────────────────────────────────────────────

/**
 * Roles within a single league. Separate from the app-level superadmin role,
 * which is not stored here — see the `superadmins` collection.
 */
export type MemberRole = 'owner' | 'admin' | 'member'

/** A row in the superadmin user directory. */
export interface AppUser {
  uid: string
  displayName: string
  email: string
  createdAt: number | null
}
export type SeasonState = 'setup' | 'draft' | 'active' | 'complete'
export type DraftFormat = 'snake'
export type PickOrderMethod = 'randomized' | 'admin-set'
export type TimerExpiry = 'auto-pick' | 'admin-picks' | 'skip'
/**
 * `paused` means a pick timer expired under the `admin-picks` policy: the turn
 * stays with the member who missed it, the clock stops, and an admin picks on
 * their behalf. Nobody else may pick until that resolves.
 */
/**
 * `paused` means a pick timer expired under the `admin-picks` policy: the turn
 * stays with the member who missed it, the clock stops, and an admin picks on
 * their behalf. Nobody else may pick until that resolves.
 *
 * `awaiting-close` means the picking rounds are over but the draft is not
 * settled: contestants are still on the bench and somebody's roster is short —
 * which happens when a turn was skipped. An admin may top up the short teams
 * from the bench, and must confirm before the draft closes.
 */
export type DraftStatus = 'lobby' | 'active' | 'paused' | 'awaiting-close' | 'complete'
/**
 * One kind, deliberately. A rule names something that either happened to a
 * contestant in an episode or did not, and pays its points when it did.
 * Numeric and bonus-challenge rules existed alongside it and were dropped: each
 * needed its own scoring input, its own scope, and its own explanation, for a
 * league that only ever wanted to tick boxes.
 */
export type ScoringRuleType = 'binary'
/**
 * The palette a team's colour is picked from — the only thing that has one.
 * Leagues and seasons used to carry an accent too; it decided nothing a reader
 * could use, so it went. The list, and why these twelve, is in ./accentColor.
 */
export type AccentColor =
  | 'violet'
  | 'lavender'
  | 'pink'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'sage'
  | 'cyan'
  | 'blue'
  | 'brown'
  | 'slate'

// ── Firestore document shapes ─────────────────────────────────────────────────

/**
 * Everything the app stores about an account. No credential of any kind belongs
 * here: the password lives in Firebase Authentication as a salted hash and is
 * never readable, and the rules refuse a write to this document that carries a
 * password-shaped field.
 */
export interface UserDoc {
  displayName: string
  email: string
  createdAt: number // epoch ms
  /** Storage URL of an uploaded profile picture. Absent until one is uploaded. */
  photoUrl?: string
}

export interface LeagueDoc {
  name: string
  /**
   * The show this league plays. A league is a group watching one show, and its
   * seasons are seasons of that show — so the show belongs here, not on each
   * season, where two seasons of one league could name different shows.
   */
  showName: string
  description: string
  ownerId: string
  createdAt: number
  /**
   * Denormalized count of `leagues/{id}/members`, maintained by the
   * onLeagueMemberWritten trigger. The dashboard lists every league to every
   * signed-in user, but member documents stay readable to members only — so a
   * prospective member has no way to count the roster itself.
   */
  memberCount: number
}

export interface LeagueMemberDoc {
  /**
   * Denormalized copy of the document ID. Required because the dashboard's
   * collectionGroup('members') query can only be authorized by a rule that
   * filters on a field — the {uid} path wildcard is unbound during a list.
   */
  uid: string
  /**
   * Denormalized from the owner's user doc. Member lists cannot read
   * `users/{uid}` for anyone but themselves — that document also holds the
   * email address, which PRD §7.3 keeps private between members — so the
   * display name is copied here at write time instead.
   */
  displayName: string
  role: MemberRole
  joinedAt: number
  /**
   * Denormalized from the owner's user doc, for the same reason as
   * `displayName`: a roster cannot read `users/{uid}` for anyone but the
   * signed-in person. Kept current by the onUserProfileWritten trigger.
   * Absent for anyone who has not uploaded a picture, and for member documents
   * written before this field existed — both fall back to the lettered circle.
   */
  photoUrl?: string
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'

/**
 * A user's request to join a league, at `leagues/{leagueId}/joinRequests/{uid}`.
 *
 * Keyed by the requester's uid so a user cannot stack up duplicate requests for
 * the same league — a second request overwrites the first document rather than
 * creating another one. Decided requests are kept, not deleted: the owner keeps
 * the history, and a rejected user can ask again by rewriting their own doc.
 */
export interface LeagueJoinRequestDoc {
  /**
   * Denormalized copy of the document ID. The dashboard needs every request the
   * signed-in user has open, across all leagues, to decide whether each league's
   * button reads "Join" or "Request pending" — and a collectionGroup query can
   * only be authorized by a rule filtering on a field. See LeagueMemberDoc.uid.
   */
  uid: string
  /** Denormalized display name — see LeagueMemberDoc.displayName */
  displayName: string
  /**
   * Denormalized picture, carried so the owner can stamp it onto the member
   * document on approval. The owner cannot read the requester's user doc, so
   * without it a newly admitted member would be a blank circle on the roster
   * until their next profile edit.
   */
  photoUrl?: string
  status: JoinRequestStatus
  requestedAt: number
  /** Set when an owner approves or rejects; null while pending */
  decidedAt: number | null
  /** uid of the owner who decided — null while pending */
  decidedBy: string | null
}

export interface SeasonDoc {
  leagueId: string
  /** Which season of the league's show this is, e.g. "Season 3 — 2026". */
  label: string
  episodeCount: number
  state: SeasonState
  draftFormat: DraftFormat
  pickOrderMethod: PickOrderMethod
  /**
   * The order an admin arranged by hand, as uids, used when
   * `pickOrderMethod` is 'admin-set'. Kept on the season rather than as each
   * member's `pickPosition` because a position is what the draft assigns when
   * it opens — this is the intention beforehand, and it has to survive the
   * season going back to setup and the draft being drawn again.
   *
   * Optional: absent on every season created before this field existed, and on
   * any season whose order was never arranged. Read through reconcilePickOrder
   * (src/lib/draft.ts), which squares it with the current roster — the list
   * can name someone who has since left, or miss someone who has since joined.
   */
  adminPickOrder?: string[]
  timerSeconds: number
  timerExpiry: TimerExpiry
  createdAt: number
  firstEpisodeScoredAt: number | null
  /** Written by Cloud Function after each episode score submission */
  teamTotals: Record<string, number>
  /** [uid][episodeNumber] running cumulative total through that episode */
  teamEpisodeTotals: Record<string, Record<string, number>>
}

export interface SeasonMemberDoc {
  /** Denormalized copy of the document ID — see LeagueMemberDoc.uid */
  uid: string
  /** Denormalized display name — see LeagueMemberDoc.displayName */
  displayName: string
  teamName: string
  /**
   * The colour this team is drawn in, everywhere it appears. Unique within a
   * season: handed out at random by the onSeasonMemberWritten trigger when
   * somebody joins, and changed only through the setTeamColor callable, which
   * refuses a colour another team already holds. Closed to clients in the
   * rules, because "no other team has this" is a question about the whole
   * roster and a rule cannot ask it.
   *
   * Optional: member documents written before the field existed have no value
   * for it, and are drawn in a fallback colour until the trigger fills it in.
   * See src/lib/teamColor.ts.
   */
  teamColor?: AccentColor
  pickPosition: number | null
  joinedAt: number
  /**
   * Denormalized from the owner's user doc, for the same reason as
   * `displayName`: a roster cannot read `users/{uid}` for anyone but the
   * signed-in person. Kept current by the onUserProfileWritten trigger.
   * Absent for anyone who has not uploaded a picture, and for member documents
   * written before this field existed — both fall back to the lettered circle.
   */
  photoUrl?: string
}

export interface ContestantDoc {
  name: string
  photoUrl: string
  bio: string
  draftedByUid: string | null
  draftedRound: number | null
  eliminatedEpisode: number | null
}

export interface ScoringRuleDoc {
  type: ScoringRuleType
  name: string
  points: number
  /**
   * The episodes this rule applies to, or `null` for all of them.
   *
   * `null` is not shorthand for "1..episodeCount frozen at save time" — it
   * follows the season. A rule saved covering every episode of a five-episode
   * season still covers every episode after the count goes to eight, which is
   * what an admin who ticked them all meant. A partial selection is stored as
   * written and stays as written.
   *
   * Optional because rules written before this field existed do not carry it;
   * reads treat an absent value the same as `null`. See ruleCoversEpisode.
   */
  episodeNumbers?: number[] | null
}

export interface EpisodeScoreDoc {
  submittedAt: number
  submittedBy: string
  locked: boolean
  /**
   * The rules as they stood when these scores were submitted — enough to draw
   * the table again exactly as it was, not merely to notice it has changed.
   *
   * A scored episode is a record. Its columns, their point values and the
   * totals beside them have to keep saying what was actually recorded, however
   * the season's rules move afterwards. Rendering a locked episode from the
   * live rules showed a column worth one thing and a stored total worked out
   * from another.
   *
   * Only the rules that covered this episode are kept, which is precisely the
   * set the table draws.
   *
   * Optional: episodes submitted before this field existed have no snapshot,
   * and fall back to the live rules — the stored totals are still shown as
   * recorded, but the column headings cannot be recovered.
   */
  appliedRules?: AppliedRule[]
}

/** One rule, frozen as it applied to an episode. See EpisodeScoreDoc.appliedRules. */
export interface AppliedRule {
  id: string
  name: string
  points: number
}

/**
 * A scorecard filled in by somebody who cannot submit one.
 *
 * At `seasons/{seasonId}/scoreProposals/{episodeNumber}`, deliberately not
 * under `episodeScores`. The onEpisodeScoreWritten trigger recomputes every
 * team total from `episodeScores/{n}/contestantScores`, so a suggestion written
 * anywhere beneath that path would move the leaderboard the moment it was
 * saved — which is the one thing a suggestion must not do. Nothing watches this
 * collection.
 *
 * The whole card is one document rather than a document per contestant: it is
 * read and written as a unit, it is a few hundred booleans at worst, and one
 * document is one atomic write and one security rule.
 */
export type ScoreProposalStatus = 'pending' | 'approved' | 'discarded'

export interface ScoreProposalDoc {
  status: ScoreProposalStatus
  /** contestantId → the same shape a contestantScores document stores. */
  scores: Record<string, ContestantScoreEntry>
  /** Contestants the proposer marked as going out this episode. */
  eliminations: string[]
  submittedBy: string
  /**
   * Denormalized — see LeagueMemberDoc.displayName. Not shown on the card,
   * which says only that scores are pending; kept because the proposal is a
   * record of somebody's work, and an admin cannot read the proposer's user
   * document to find out afterwards whose it was.
   */
  submittedByName: string
  submittedAt: number
  /**
   * Set when an admin resets the card. A soft delete: the suggestion stays
   * readable, and the episode is open to be suggested again.
   */
  decidedAt: number | null
  decidedBy: string | null
}

// ruleId → whether that rule applied to this contestant in this episode
export type ContestantScoreEntry = Record<string, boolean>

export interface ContestantScoreDoc {
  scores: ContestantScoreEntry
  totalPoints: number
}

export interface DraftDoc {
  status: DraftStatus
  currentPickerUid: string | null
  currentRound: number
  currentPickNumber: number
  pickOrder: string[] // uid[]
  timerExpiresAt: number | null
  /**
   * Turns skipped in a row without anyone picking. Reset by any pick, manual or
   * automatic. Once it reaches the number of players a full round has gone by
   * with nobody drafting, which means the draft has stalled rather than
   * progressed, so it halts for an admin instead of cycling forever.
   */
  consecutiveSkips: number
  /** Why the draft halted, when it did so for a reason other than finishing. */
  haltedReason: 'skips' | null
  /**
   * Milliseconds left on the clock when an admin paused it, or null when it is
   * running. Distinct from `status: 'paused'`, which means a turn expired under
   * the admin-picks policy and is waiting on a proxy pick. Here the turn still
   * belongs to whoever holds it and they can still pick — only the clock stops.
   */
  timerPausedRemainingMs: number | null
}

export interface DraftPickDoc {
  contestantId: string
  pickerUid: string
  actingAdminUid: string | null
  round: number
  pickNumber: number
  timestamp: number
}

export interface AuditLogDoc {
  action: string
  actorUid: string
  targetUid?: string
  seasonId?: string
  leagueId?: string
  contestantId?: string
  episodeNumber?: number
  oldValue?: unknown
  newValue?: unknown
  timestamp: number
}

// ── Client-side enriched types (doc + id) ────────────────────────────────────

export interface League extends LeagueDoc {
  id: string
}
export interface LeagueMember extends LeagueMemberDoc {
  uid: string
}
export interface LeagueJoinRequest extends LeagueJoinRequestDoc {
  uid: string
}
export interface Season extends SeasonDoc {
  id: string
}
export interface SeasonMember extends SeasonMemberDoc {
  uid: string
}
export interface Contestant extends ContestantDoc {
  id: string
}
export interface ScoringRule extends ScoringRuleDoc {
  id: string
}
export interface DraftPick extends DraftPickDoc {
  id: string
}
