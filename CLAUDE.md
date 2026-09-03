# Working notes for Claude

Durable context for this repo. Committed deliberately: Claude's sessions run in
ephemeral containers, so anything not in the repository is gone by the next one.

---

## Product model

### A league is one show

- A **league** is a group of friends playing **a single show**. The show is the
  league's identity, not an incidental detail of it.
- A **season** is one season **of that same show**.
- Seasons within a league do not change show. A group that wants to play a
  different show starts a different league.

The schema enforces this: `showName` lives on `LeagueDoc` and a season carries
only its `label` (`src/lib/types.ts`). Creating a league asks for the show;
creating a season does not. Leagues made before that move have no `showName`, so
reads tolerate it being absent — an owner sets it from the league's edit dialog.

### Dummy data must reflect that

Test data gets read by a human following along in the browser, so it has to be
recognisable at a glance. Keep the show consistent within a league, and make the
league name say which show it is.

Good:

| League                         | Seasons                                          |
| ------------------------------ | ------------------------------------------------ |
| Traitors — Thursday Night Crew | The Traitors — Season 2, The Traitors — Season 3 |
| Survivor Superfans             | Survivor — Season 49, Survivor — Season 50       |

Wrong — a generic league name with unrelated shows under it, which is what makes
a screenshot impossible to read:

| League       | Seasons                   |
| ------------ | ------------------------- |
| Bravo League | Survivor, Big Brother     |
| Delta League | The Traitors, Love Island |

Naming people is free-form, but keep it obvious who is who — `Ada Owner`,
`Bob Member`, `Mia Requester` read better in a screenshot than three plain names.

---

## Where a rule belongs

Three places, in order of preference. Choosing the wrong one is the most
consequential mistake available in this codebase.

**1. A Firestore security rule** — the default. If a constraint can be expressed
in `firestore.rules`, it belongs there and the client can write directly. Most of
the join-request flow works this way: a requester writing their own pending
request and an owner writing their league's membership are both writes the rules
already authorise, so none of it needs a Cloud Function.

**2. A Cloud Function** — when a rule _cannot_ express the constraint. Rules
cannot query across a collection, read an unbounded set of documents, or compute
an aggregate. When the check needs one of those, the write path must be closed to
clients (`allow ...: if false`) and go through a callable instead. Precedents:

| Function             | Why a rule cannot do it                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `submitPick`         | Deriving whose turn it is means re-implementing snake order in a rule; detecting a finished draft needs an aggregate |
| `removeLeagueMember` | "Is this member in a season that is drafting or active?" is a query across `seasons` plus a read in each             |
| `listAllUsers`       | Keeps the `users` read rule own-document-only, so there is one audited path to anything wider                        |
| `setTeamColor`       | "No other team in this season holds this colour" is a question about the whole roster, which a rule cannot query     |

A check left in the client when it belongs here is **advice, not a constraint** —
anyone with devtools ignores it.

**3. The client** — only for things that are genuinely UX, where the actor
already has the authority and the check protects them from their own slip. The
episode-count guard in `src/lib/seasonDetails.ts` is the example: admins can
already rewrite scores, so stopping them stranding a scored episode is a
courtesy, not a boundary. Say so in a comment when you do this.

**Derived state belongs to a trigger.** `LeagueDoc.memberCount` is recomputed by
`onLeagueMemberWritten` and is immutable to clients in the rules. A counter
maintained by the client drifts permanently the first time a write is
interrupted; recomputing is self-healing.

---

## Codebase conventions

### Pure logic stays free of Firebase

`src/lib/firebase.ts` builds a Firebase app at import time and throws without the
`VITE_FIREBASE_*` variables. Anything importing it — directly or transitively —
can only load where those exist. So decisions worth testing live in modules that
import nothing reaching it:

`src/lib/breadcrumbs.ts`, `src/lib/seasonDetails.ts`, `src/lib/draft.ts`,
`src/lib/scoring.ts`, `functions/src/membership.ts`, `functions/src/draft.ts`,
`functions/src/scoring.ts`.

The pattern is a pure module beside a thin writer: `seasonDetails.ts` decides,
`seasonApi.ts` writes. Keep it that way when adding logic worth asserting on.

### Every listener goes through `src/lib/listen.ts`

Use `listenDoc` / `listenQuery`, never a bare `onSnapshot`. Firestore discards
listener errors when no error callback is given, so a denied read shows up as a
panel that never fills — no exception, nothing in the console. That is how a
missing security rule once passed for a loading bug. Wrap async snapshot handlers
in `guarded` so a rejection inside one cannot leave a loading flag stuck on.

### Collection-group queries need a denormalised field

A nested `match /leagues/{id}/members/{uid}` rule does **not** authorise a
collection-group query — that needs a `match /{path=**}/members/{uid}` rule, and
such a rule can only be written against a _field_, since the path wildcard is
unbound during a list. Hence `uid` is copied onto every member and join-request
document. Removing that field silently breaks the dashboard's listeners.

`displayName` is denormalised for a different reason: `users/{uid}` is readable
only by its owner (it holds the email address), so a roster cannot look up names
and copies them at write time.

### Strings live in `src/i18n.json`

All user-facing text goes through `t()`. No inline copy in components.

### Audit consequential actions

Route them through `logAuditEvent` (`src/lib/audit.ts`). Membership decisions,
role changes, removals, score edits and proxy picks are all recorded.

---

## Working locally

### Running the app

`.env.local` is gitignored and must exist to point the app at the emulator:

```
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:demo
VITE_FIREBASE_MEASUREMENT_ID=G-DEMO
VITE_USE_EMULATOR=true
VITE_TAB_SCOPED_AUTH=true
```

`VITE_TAB_SCOPED_AUTH` scopes a signed-in session to one tab instead of to the
whole browser, so several accounts can be driven side by side — which is what
makes testing a draft or a join request realistic. It is off unless set, so
production keeps Firebase's shared-across-tabs default until the same variable
is set in the hosting build config. Flipping it either way costs everyone
currently signed in one sign-out and nothing else; nothing persisted depends on
it. See `src/lib/authPersistence.ts`.

Then `npm run emulators` (builds the functions first, so the emulator can never
serve stale or missing function code) and `npm run dev`.

### Signing in locally

Sign-up takes a password you choose, so a new local account is usable straight
away. The accounts already in `.emulator-data` are not: they were made when the
password was a random 6-digit PIN nobody wrote down. `npm run seed:passwords`
sets every account in the running emulator to `abcd1234` and is the way back in.

It talks only to the Auth emulator's REST API on a hardcoded host and project,
and exits if nothing is listening there. Keep it that way — a known shared
password is precisely what production must never have, so the script must have
no way to be pointed at a real project.

### Tests

`vite.config.ts` supplies dummy `VITE_FIREBASE_*` values to the test env and pins
`VITE_USE_EMULATOR` off — Vite loads `.env.local` in test mode too, so without
that pin a developer running the emulator would have tests behaving differently
from CI. **Mocks are for observing behaviour, not for getting a module to load.**
If a test mocks something only so it will import, the fix belongs in the config.

Vite ranks env files `.env.[mode].local` > `.env.[mode]` > `.env.local` >
`.env`, so `.env.production` outranks `.env.local` in a production build and
`npm run build` produces the real bundle even on a machine set up for the
emulator. `.env.local` wins in `npm run dev`, where the mode is development and
`.env.production` is not read at all. So the two do not fight: dev is the
emulator, `build` is production, and no file needs moving aside to deploy.

What `.env.local` does still mask is a variable that exists nowhere else. To see
what a machine without it sees, move it aside and run the checks.

### Verify in the browser before saying it works

Tests passing is not the same as the feature working. For anything user-facing,
drive it in the emulator with a real browser — sign up, click through, screenshot
— and check the data in Firestore afterwards. Several bugs in this repo's history
were invisible to unit tests and obvious on the first click.

---

## Production

The live project is **`real-tv-draft`** (`.firebaserc`), on the Blaze plan
because Cloud Functions require it. `https://real-tv-draft.web.app`.

**Merging to `main` deploys.** `.github/workflows/ci.yml` runs lint, test and
build, then — only on a push to `main` — installs both npm trees, builds, and
deploys rules, indexes, storage, functions and hosting in that order. Backend
before hosting, always: a bundle must never reach a browser before the rules and
functions it expects exist.

`.env.production` is committed, and is the only place production Firebase config
comes from. That is not a leak — a Firebase web config ships inside the JS bundle
by design, and access control is `firestore.rules`, not the API key. It is
committed rather than kept in a GitHub secret so that the values a build used are
visible in the diff. Vite loads `.env.local` in every mode and it wins, so a
production build only comes out right where no `.env.local` exists — which is CI.
For a one-off local production build, move `.env.local` aside first.

`firebase.json` carries `predeploy` hooks for both hosting and functions, so a
manual `firebase deploy` cannot ship a stale `dist/` or `functions/lib/`.

Whoever signs up first on a fresh project becomes superadmin
(`grantFirstUserSuperadmin`), once, and it never re-arms.

### Data migrations are not part of the deploy

Nothing in `ci.yml` touches stored documents. A change that renames a stored
value therefore needs either a script somebody remembers to run, or a front end
that copes with both spellings — and merging to `main` ships the front end
whether or not the data moved.

So prefer coping to migrating. The accent palette dropped three colours and
renamed them, and the documents were never rewritten: `accent()` in
`src/lib/accentColor.ts` draws a colour the palette does not know as blue, which
turns "a value we no longer understand" into a wrong colour rather than a blank
badge. That is cheaper than a migration, and it keeps working for a document
restored from a backup or edited by hand, which a one-off script does not.

Where a script really is the answer, `scripts/seed-passwords.mjs` is the shape
to copy — plain `fetch`, no dependency on the functions tree — but note it is
deliberately hardcoded to the emulator, and a migration would have to be
reachable against the live project instead.

A single-field index belongs in `fieldOverrides`, never in `indexes` — the
`indexes` array is for composite indexes, and Firestore rejects a one-field
entry there with "this index is not necessary". The emulator does not validate
`firestore.indexes.json` at all, so the first real deploy is where such a
mistake surfaces. That is where `uid`'s collection-group indexes live: a nested
rule does not authorise a collection-group query, so `members` and
`joinRequests` both carry a denormalised `uid`, and both need collection-group
scope declared for it.

---

## This container (Claude only)

- **`firebase-tools` is not a dependency.** Install it with `npm install --no-save
firebase-tools` when the emulator is needed.
- **The emulator must be started with the agent proxy unset**, or registering
  Firestore triggers fails with `Unable to parse JSON: ... "request bl"...`:
  `env -u https_proxy -u HTTPS_PROXY -u GLOBAL_AGENT_HTTPS_PROXY npm run emulators`.
  This is specific to Claude's sandbox — never put it in a committed script.
- **Chromium for Playwright** lives at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Do not run
  `playwright install`.
- **The user cannot reach these ports.** They run inside the container with no
  public ingress, so "the dev server is up" never means the user can open it.
  Offer screenshots, or the commands to run it themselves.
- **Pushes do not reach the user's checkout.** Being on the same branch name is
  not the same as having the commits; they need to `git pull`.
