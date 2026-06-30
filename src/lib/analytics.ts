type EventName =
  | 'sign_up'
  | 'league_created'
  | 'season_created'
  | 'draft_started'
  | 'draft_pick_made'
  | 'draft_completed'
  | 'episode_scored'
  | 'leaderboard_viewed'
  | 'team_drilldown_opened'

type EventParams = Record<string, string | number>

declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: EventParams) => void
  }
}

export function trackEvent(name: EventName, params?: EventParams): void {
  window.gtag?.('event', name, params)
}
