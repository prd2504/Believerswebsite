# Tests

```
npm test            # run once — what CI will run
npm run test:watch  # re-run on save while working
```

No build step. Vitest imports the TypeScript source directly (`@bba/shared` is
aliased to `shared/src`, the same as the webapp and the functions bundle), so a
test always runs against the code that ships.

The suite is timezone-independent — verified passing under UTC, Asia/Kolkata and
America/Los_Angeles. Deploys run from an IST laptop; CI will run in UTC.

## What's covered

| File | Protects |
|---|---|
| `court-clock.test.ts` | IST conversion; an hour stops selling the moment it starts; coaching hours never sellable, even via override; month navigation |
| `court-pricing.test.ts` | Court totals, guest fees (per booking, not per hour), add-ons, hour-range labels |
| `booking-horizon.test.ts` | Next month opens on the 25th; the Ruia slot window gate |
| `quarterly-coverage.test.ts` | Quarterly coverage, the double-charge guard, legacy payments, year boundaries |
| `ruia-batch-resolution.test.ts` | Which Ruia batch a booking becomes an enrolment in |
| `ruia-roster.test.ts` | The daily roster coaches mark attendance from (real module, not a copy) |
| `gate-pass.test.ts` | Month colours, pass codes, day-pass validity, rollout constants |
| `sheet-column-contract.test.ts` | Apps Script headers and Cloud Function row builders stay aligned |

## Verified to catch real bugs

A test that passes proves little on its own. Each of these was checked by
deliberately breaking the real code and confirming the suite fails:

- included players changed from 4 → 5
- an hour that has already started becoming sellable
- the coaching-hour guard removed
- a quarterly payment losing its last month
- the roster's Tuesday label changed
- a `Court_Rentals` header deleted from `Code.gs`

## Not covered — known gaps

These were checked during development, but not in a way that could be kept:

- **Gate pass UPCOMING state** (a pass paid for next month). The original check
  compared two string literals and could never fail. The real logic is in
  `buildStandingPass` (`functions/src/passes/gatePassApi.ts`), which initialises
  Firebase on import.
- **Which month `/fees` bills** (the 25th rollover). `getDefaultMonth` is private
  inside the `FeesPortal` page, which also initialises Firebase on import. The
  original check tested a copy of it.
- **Sheet date/money formatters** in `courtSheetSync.ts` — private, same reason.
  The original checks tested copies.
- **The Ruia enrolment sync itself** (`syncBookingToEnrollments`) — needs Firestore.

Closing these means moving the pure logic out of the Firebase-initialising
modules so it can be imported on its own.

Also not covered: anything needing a live Firestore (rules, triggers, queries),
and UI rendering.
