import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

interface AuditPayload {
  action: string
  targetUid?: string
  seasonId?: string
  leagueId?: string
  contestantId?: string
  episodeNumber?: number
  oldValue?: unknown
  newValue?: unknown
}

const logAuditEventFn = httpsCallable(functions, 'logAuditEvent')

export async function logAuditEvent(payload: AuditPayload): Promise<void> {
  try {
    await logAuditEventFn(payload)
  } catch {
    // Audit failures are non-fatal — log to console only
    console.warn('[audit] Failed to log event:', payload.action)
  }
}
