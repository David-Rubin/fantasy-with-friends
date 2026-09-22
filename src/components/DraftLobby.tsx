import { ContestantGrid } from './ContestantGrid'
import { ScoringRulesCard } from './ScoringRulesCard'
import { PlayerAvatars, playerNames, type EntryPlayer } from './PlayerAvatars'
import type { Contestant, ScoringRule } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * Who is drafting, as the lobby lists them: a member each in a solo season,
 * a team each in team mode. See src/lib/entries.ts.
 */
export interface LobbyEntry {
  key: string
  teamName: string
  players: EntryPlayer[]
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
  entries,
  teamMode,
  contestants,
  rules,
  seasonId,
  leagueId,
  episodeCount,
}: {
  entries: LobbyEntry[]
  /** Whether the rows are teams — in which case the team's name leads. */
  teamMode: boolean
  contestants: Contestant[]
  rules: ScoringRule[]
  seasonId: string
  leagueId: string
  episodeCount: number
}) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      {/* A marquee, because the wait is the point: the sentence is the only
          thing on this screen that is not a list, and it moving is what says
          the room is live rather than stuck. It re-enters on the left the
          instant it clears the right — see .lobby-marquee in src/index.css,
          which is where the width of this window becomes the distance. */}
      <div className="lobby-marquee overflow-hidden">
        <p className="lobby-marquee-track w-max whitespace-nowrap italic">
          {t('draft.lobby.waitingForAdmin')}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="mb-4 text-sm">{t('draft.lobby.yourOpponentsHeading')}</p>
        <div className="flex gap-4 flex-wrap">
          {entries.map((entry) => (
            <div key={entry.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <PlayerAvatars players={entry.players} />
                {/* In a solo season the team name is a joke the member made
                    up and the person is who you are waiting on; in team mode
                    the team is the thing drafting and its players are who it
                    is made of. */}
                {teamMode ? (
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800">
                      {entry.teamName}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {playerNames(entry.players)}
                    </span>
                  </span>
                ) : (
                  <span className="truncate font-medium text-gray-800">
                    {playerNames(entry.players)}
                  </span>
                )}
              </span>
              {entry.pickPosition && (
                <span className="text-gray-400">
                  {t('draft.lobby.yourPosition', { n: entry.pickPosition })}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <ScoringRulesCard
        seasonId={seasonId}
        leagueId={leagueId}
        rules={rules}
        episodeCount={episodeCount}
        canEdit={false}
      />

      {/* Compact cards: the whole cast at once is what a lobby is for — looking
          the field over — rather than a few at a time to choose between, which
          is the board's job once picking starts. */}
      {contestants.length > 0 && (
        <ContestantGrid
          heading={t('draft.lobby.contestants', { n: contestants.length })}
          contestants={contestants}
          compact
        />
      )}
    </div>
  )
}
