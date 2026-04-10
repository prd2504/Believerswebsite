# BBA Sports Platform

The digital platform for **BBA Sports Private Limited** — operating the **Believers Badminton Academy** brand.

A multi-centre, multi-role coaching management platform built with React + Firebase, designed for
badminton coaching today and multi-sport expansion later.

---

## Repository structure

This is a **TypeScript monorepo** managed with npm workspaces.

```
.
├── webapp/       # React + Vite + Tailwind frontend (the web/mobile-responsive app)
├── functions/    # Firebase Cloud Functions (backend: payments, AI, WhatsApp, webhooks)
├── shared/       # Shared TypeScript types and utilities (data models, role/RBAC, constants)
├── package.json  # Workspace root
└── tsconfig.base.json
```

---

## Tech stack

| Layer              | Technology                                             |
|--------------------|--------------------------------------------------------|
| Frontend           | React 18 + Vite + TypeScript + Tailwind CSS            |
| State / forms      | React Context + react-hook-form + zod                  |
| Routing            | react-router-dom                                       |
| Backend            | Firebase (Firestore, Auth, Storage, Cloud Functions)   |
| Payments           | Razorpay (architecture ready, gated by feature flag)   |
| Notifications      | FCM + WhatsApp Business API (feature-flagged)          |
| AI                 | Anthropic Claude API (`claude-sonnet-4-6`)             |
| Hosting            | Firebase Hosting                                       |

---

## Prerequisites

- **Node.js** >= 20
- **npm** >= 10
- A **Firebase project** (already provisioned: `bba-sports-prod`)
- **Firebase CLI** (only needed for deployment / emulators): `npm i -g firebase-tools`

---

## Local setup

### 1. Clone and install

```bash
git clone <repo-url>
cd Believerswebsite
npm install        # installs all workspaces (shared, webapp, functions)
```

### 2. Create environment files

The real `.env` files are **gitignored**. Copy the examples and fill in values.

```bash
cp webapp/.env.example webapp/.env
cp functions/.env.example functions/.env
```

The Firebase web config values are already populated in `webapp/.env.example` (they are safe to
expose — Firebase security is enforced via security rules, not API key secrecy).

Leave the following blank until the company is ready to go live — they are feature-flagged:

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID`
- `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `ANTHROPIC_API_KEY` (fill whenever AI progress reports are needed)

### 3. Run the web app

```bash
npm run dev
```

This starts the Vite dev server at http://localhost:5173.

### 4. Build everything

```bash
npm run build
```

---

## Firebase Console — one-time setup needed

Before the app will actually sign a user in, the following must be enabled **once** in the
Firebase Console for project `bba-sports-prod`:

1. **Authentication → Sign-in method**
   - Enable **Phone**
   - Enable **Email/Password**
2. **Authentication → Settings → Authorised domains**
   - Add `localhost` (already present by default)
   - Add your production hosting domain when ready
3. **Authentication → Sign-in method → Phone → Phone numbers for testing** (optional but
   recommended while developing to avoid real SMS cost)
   - Add e.g. `+91 99999 99999` → code `123456`
4. **Firestore Database**
   - Create database in **production mode**
   - Region: `asia-south1` (Mumbai) — matches the business geography
5. **Storage**
   - Enable default bucket
6. **App Check** (recommended before going live — can defer)

The app will crash with a clear error if Phone or Email sign-in is not enabled.

---

## Feature flags

Flags live in `webapp/.env` (as `VITE_*`) and in `functions/.env`:

| Flag                 | Purpose                                            | Default |
|----------------------|----------------------------------------------------|---------|
| `VITE_RAZORPAY_LIVE` | Enables the online payment flow in the frontend   | `false` |
| `VITE_WHATSAPP_LIVE` | Enables WhatsApp message triggers                  | `false` |
| `RAZORPAY_LIVE`      | Enables Razorpay webhook handler on the backend    | `false` |
| `WHATSAPP_LIVE`      | Enables WhatsApp sender on the backend             | `false` |

Flipping these to `true` (plus filling the corresponding secrets) activates the full flow with
**zero code changes**.

---

## Roles

| Role             | Can do                                                                 |
|------------------|------------------------------------------------------------------------|
| `SUPER_ADMIN`    | Everything across all centres (the founder)                            |
| `CENTRE_MANAGER` | Everything within their assigned centre(s)                             |
| `COACH`          | View own batches, mark attendance, update scores and progress notes    |
| `STUDENT`        | View own schedule, attendance, progress, fees                          |
| `PARENT`         | Same as student, but for their linked child                            |

Role is stored on `/users/{uid}.role` and enforced by both React routing AND Firestore security
rules.

---

## Current build status

**Step 1 — Scaffold & Auth: complete.**

Working right now:
- Monorepo (`shared`, `webapp`, `functions`)
- Firebase Auth: phone OTP and email/password login
- RBAC context and protected role-based routes
- Shell layouts for every role with placeholder pages for every module in the spec

Not yet implemented (coming in later steps):
- Steps 2–13: Centre/Batch, Student, Attendance, Payments, Progress, Tournaments, Notifications,
  Firestore rules, Hosting deploy.

See the `claude/badminton-coaching-platform-6j8is` branch for the latest work.

---

## License

Proprietary — © BBA Sports Private Limited. All rights reserved.
