import { Navigate, useParams } from 'react-router-dom'

/**
 * The draft's old address, kept as a redirect.
 *
 * The room is a section of the season page now (see DraftRoom), so there is
 * nothing here to render. The route stays because the URL is out in the world:
 * bookmarked, pasted into the group chat that arranged the draft night, and
 * open in a tab belonging to whoever was in the room when this shipped. All of
 * those should land on the draft, which is one level up.
 *
 * `replace` so Back does not bounce off this and straight back here.
 */
export function DraftRoomPage() {
  const { leagueId, seasonId } = useParams<{ leagueId: string; seasonId: string }>()
  return <Navigate to={`/leagues/${leagueId}/seasons/${seasonId}`} replace />
}
