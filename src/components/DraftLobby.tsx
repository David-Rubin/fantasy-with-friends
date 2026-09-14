import { Button } from './Button'
import { ContestantGrid } from './ContestantGrid'
import { ScoringRulesCard } from './ScoringRulesCard'
import { UserAvatar } from './UserAvatar'
import type { Contestant, PhotoCrop, ScoringRule } from '../lib/types'
import { t } from '../lib/i18n'

/** Who is in the season, as the lobby lists them. */
export interface LobbyMember {
  uid: string
  displayName: string
  photoUrl?: string
  photoCrop?: PhotoCrop
  pickPosition: number | null
}

/**
 * The draft room before the draft starts.
 *
 * A season leaves setup the moment an admin opens the draft, and then everyone
 * waits — sometimes for days, until the evening the league agreed on. That wait
 * used to be a sentence and a list of names, which is the least useful the app
 * has ever been at the moment people most want to study the season: they are
 * working out who they want, and the cast and the scoring rules are precisely
 * what decides that.
 *
 * Both are settled by now. Nothing here can be edited — the rules card is passed
 * `canEdit={false}` even for an admin, because changing a rule at this point
 * means reopening setup, which is what the room's own Edit settings button does,
 * properly and with a warning. Offering an inline edit beside it would be two
 * doors to the same room, one of which skips the sign.
 */
export function DraftLobby({
  members,
  contestants,
  rules,
  seasonId,
  leagueId,
  episodeCount,
  isAdmin,
  onStartDraft,
  startingDraft,
}: {
  members: LobbyMember[]
  contestants: Contestant[]
  rules: ScoringRule[]
  seasonId: string
  leagueId: string
  episodeCount: number
  isAdmin: boolean
  onStartDraft: () => void
  startingDraft: boolean
}) {
  return (
    <div className="mb-6 flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500 mb-4">{t('draft.lobby.waitingForAdmin')}</p>
        <div className="flex flex-col gap-2 mb-4">
          {members.map((m) => (
            <div key={m.uid} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar
                  displayName={m.displayName}
                  photoUrl={m.photoUrl}
                  photoCrop={m.photoCrop}
                />
                <span className="truncate font-medium text-gray-800">{m.displayName}</span>
              </span>
              {m.pickPosition && (
                <span className="text-gray-400">
                  {t('draft.lobby.yourPosition', { n: m.pickPosition })}
                </span>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <Button onClick={onStartDraft} loading={startingDraft}>
            {t('draft.lobby.startDraft')}
          </Button>
        )}
      </div>

      {/* Compact cards: the whole cast at once is what a lobby is for — looking
          the field over — rather than a few at a time to choose between, which
          is the board's job once picking starts. */}
      {contestants.length > 0 && (
        <ContestantGrid
          heading={t('draft.lobby.cast', { n: contestants.length })}
          contestants={contestants}
          compact
        />
      )}

      <ScoringRulesCard
        seasonId={seasonId}
        leagueId={leagueId}
        rules={rules}
        episodeCount={episodeCount}
        canEdit={false}
      />
    </div>
  )
}
