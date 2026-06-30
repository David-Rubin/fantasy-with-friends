// ── Role / State enums ────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member'
export type SeasonState = 'setup' | 'draft' | 'active' | 'complete'
export type DraftFormat = 'snake'
export type PickOrderMethod = 'randomized' | 'admin-set'
export type TimerExpiry = 'auto-pick' | 'admin-picks' | 'skip'
export type DraftStatus = 'lobby' | 'active' | 'complete'
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
