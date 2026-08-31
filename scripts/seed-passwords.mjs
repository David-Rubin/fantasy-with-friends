#!/usr/bin/env node
/**
 * Give every account in the *emulator* the same known password.
 *
 * The dev accounts in .emulator-data were created back when a random 6-digit
 * PIN was the password, and nothing ever recorded which PIN went with which
 * account. Once real passwords replaced the PIN flow there was no way to sign in
 * as any of them, so this resets the lot to one password you can remember.
 *
 * Emulator only, and not by convention: the Auth emulator's REST API is the only
 * endpoint this speaks, it is hardcoded, and the script exits if nothing is
 * listening on it. There is no argument or environment variable that points it
 * at a real project, because a shared known password is exactly what a real
 * project must never have.
 */

const PASSWORD = 'abcd1234'
const HOST = '127.0.0.1:9099'
const PROJECT = 'demo-project'
const BASE = `http://${HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`

// The emulator accepts any bearer token; it authorizes on the header's presence.
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

async function main() {
  let accounts
  try {
    const res = await fetch(`${BASE}/accounts:query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    accounts = (await res.json()).userInfo ?? []
  } catch (err) {
    console.error(
      `Could not reach the Auth emulator at ${HOST}. Start it with \`npm run emulators\` first.`
    )
    console.error(err.message)
    process.exit(1)
  }

  if (accounts.length === 0) {
    console.log('No accounts in the emulator yet — sign up and run this again.')
    return
  }

  for (const account of accounts) {
    const res = await fetch(`${BASE}/accounts:update`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ localId: account.localId, password: PASSWORD }),
    })
    if (!res.ok) {
      console.error(`  ${account.email}: failed — ${res.status} ${await res.text()}`)
      continue
    }
    console.log(`  ${account.email}`)
  }

  console.log(`\n${accounts.length} account(s) now use the password: ${PASSWORD}`)
}

main()
