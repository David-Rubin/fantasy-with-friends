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
export type ScoringRuleType = 'binary' | 'numeric' | 'bonus_challenge'
export type BonusChallengeScope = 'per_episode' | 'specific_episodes' | 'season_level'
export type AccentColor =
  | 'violet'
  | 'purple'
  | 'pink'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'blue'
  | 'indigo'
  | 'slate'

// ── Firestore document shapes ─────────────────────────────────────────────────

export interface UserDoc {
  displayName: string
  email: string
  createdAt: number // epoch ms
  loginAttempts: number
  lockedUntil: number | null
}

export interface LeagueDoc {
  name: string
  description: string
  ownerId: string
  createdAt: number
  accentColor: AccentColor
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
}

export interface SeasonDoc {
  leagueId: string
  showName: string
  label: string
  episodeCount: number
  state: SeasonState
  draftFormat: DraftFormat
  pickOrderMethod: PickOrderMethod
  timerSeconds: number
  timerExpiry: TimerExpiry
  accentColor: AccentColor
  inviteCode: string
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
  pickPosition: number | null
  joinedAt: number
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
  scope: BonusChallengeScope | null // only relevant for bonus_challenge type
  episodeNumbers: number[] | null // only when scope = specific_episodes
}

export interface EpisodeScoreDoc {
  submittedAt: number
  submittedBy: string
  locked: boolean
}

// ruleId → value (boolean for binary, number for numeric, contestantId for bonus_challenge)
export type ContestantScoreEntry = Record<string, boolean | number | string>

export interface ContestantScoreDoc {
  scores: ContestantScoreEntry
  totalPoints: number
}

export interface SeasonAwardDoc {
  ruleId: string
  contestantId: string
  awardedAt: number
  awardedBy: string
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
