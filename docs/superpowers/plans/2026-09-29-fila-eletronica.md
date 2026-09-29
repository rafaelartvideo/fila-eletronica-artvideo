# Sistema de fila da Eletrônica Artvideo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive queue system with staff and kiosk ticket issuance plus a realtime customer display with configurable video media.

**Architecture:** Build a React/TypeScript single-page app with separate `/painel`, `/totem` and `/display` routes. Supabase provides admin authentication, PostgreSQL transaction-safe queue operations and realtime updates; public display data is kept separate from customer details.

**Tech Stack:** Vite, React, TypeScript, React Router, Supabase JS, PostgreSQL/Supabase migrations, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-fila-eletronica-design.md`

## Global Constraints

- The business date and daily sequence use `America/Sao_Paulo`.
- Staff panel requires authentication; public routes must not expose customer names or administrative data.
- Ticket issuance is atomic and shared by staff and kiosk, without duplicate numbers for concurrent requests.
- State transitions are validated by database functions; invalid transitions are rejected.
- A failed or blocked video embed must leave the queue visible and recoverable.
- No Supabase secrets are committed; setup uses `.env.example` and a reviewed SQL migration.
- The layout must work on mobile, desktop, tablet and TV display sizes.

## Review Focus

- Simultaneous issue requests must produce unique consecutive numbers; pin with a concurrent RPC integration test in Task 2.
- Date rollover around midnight in São Paulo must allocate the next daily sequence; pin with database timezone tests in Task 2.
- Inactive service types and invalid state transitions must be rejected; pin with database contract tests in Task 2.
- Malformed, `javascript:`, unsupported and non-embeddable media URLs must never inject markup or obscure the queue; pin with parser tests in Task 1 and display fallback tests in Task 5.
- Realtime disconnects and browser autoplay restrictions must recover gracefully; pin with display hook/component tests in Task 5.

---

## File Structure

- `src/app/` owns route setup and route guards.
- `src/features/auth/` owns staff sign-in and sign-out.
- `src/features/staff/` owns queue controls, service type settings, media settings and ticket actions.
- `src/features/kiosk/` owns public service selection and ticket confirmation/printing.
- `src/features/display/` owns sanitized live calls, recent history, media playback and reconnect handling.
- `src/domain/` owns ticket state types, ticket-number formatting and safe media URL normalization.
- `src/lib/supabase/` owns the Supabase client and typed RPC access.
- `src/styles/` owns reset, design tokens and responsive shared styles.
- `supabase/migrations/` owns schema, RLS, RPCs and sanitized display events.
- `supabase/tests/` owns SQL contract tests; `tests/e2e/` owns cross-route browser acceptance tests.

## Tasks

### Task 1: Scaffold the application shell and tested domain helpers

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/app/App.tsx`, `src/app/routes.tsx`
- Create: `src/domain/queue.ts`, `src/domain/queue.test.ts`, `src/domain/media.ts`, `src/domain/media.test.ts`
- Create: `src/styles/tokens.css`, `src/styles/global.css`, `src/features/{staff,kiosk,display}/Page.tsx`
- Create: `.env.example`, `.gitignore`, `README.md`

**Interfaces:**
- Produces `TicketStatus = 'waiting' | 'called' | 'serving' | 'completed' | 'cancelled'` and `QueueTicket` with `id`, `ticketNumber`, `serviceTypeId`, `serviceTypeName`, `status`, `counterLabel`, and ISO timestamp fields.
- Produces `normalizeMediaUrl(input: string): MediaSource`, returning a tagged `youtube`, `direct-video`, `embed`, or `unsupported` result; it never returns executable markup.
- Produces `formatTicketNumber(sequence: number): string`, rendering positive integers as three or more digits (for example, `7` as `007`).

- [ ] **Step 1: Create the minimal Vite/TypeScript package and Vitest test harness** in `package.json`, `vite.config.ts`, and test setup files; install React, React Router, Supabase JS, Vitest and React Testing Library.
- [ ] **Step 2: Write failing tests** for ticket number formatting (1, 7, 1000), and media URL normalization (YouTube watch/short links, direct MP4, valid HTTPS embed, malformed URL, `javascript:` URL, and unsupported site).
- [ ] **Step 3: Run `npm test -- --run src/domain`** and confirm the tests fail because the helpers are not implemented.
- [ ] **Step 4: Implement the domain types and helpers** in `src/domain/queue.ts` and `src/domain/media.ts`; allow only `http:`/`https:` URLs and construct provider-specific embed URLs from parsed URL components.
- [ ] **Step 5: Add the app shell and route placeholders** for `/painel`, `/totem`, and `/display`, plus CSS tokens, `.env.example`, and setup instructions.
- [ ] **Step 6: Run `npm test -- --run` and `npm run build`**; expect all domain tests and TypeScript/Vite build to pass.
- [ ] **Step 7: Commit** as `feat: scaffold queue app and domain helpers`.

### Task 2: Add the Supabase queue schema and secure transactional operations

**Files:**
- Create: `supabase/config.toml`, CLI-generated timestamped migration in `supabase/migrations/`, `supabase/tests/queue_contract_test.sql`
- Create: `scripts/test-queue-concurrency.mjs`
- Modify: `README.md`

**Interfaces:**
- Tables: `admin_users`, `ticket_types`, `daily_ticket_sequences`, `tickets`, `display_calls`, and `display_media`.
- RPC `issue_ticket(p_type_id uuid, p_customer_name text default null)` returns only the issued ticket details to the caller.
- RPC `is_queue_admin()` returns only whether the authenticated session belongs to `private.admin_users`; it never exposes the admin roster.
- RPC `call_next_ticket(p_type_id uuid, p_counter_label text default null)` atomically calls the oldest waiting ticket and returns the public call fields.
- RPC `repeat_ticket_call(p_ticket_id uuid)` refreshes call time without changing the ticket state.
- RPC `transition_ticket(p_ticket_id uuid, p_to_status text)` allows only `called → serving`, `waiting/called → cancelled`, and `serving → completed`.
- Realtime `display_calls` contains no customer name or private ticket fields and supports public read of current/recent calls only.

- [ ] **Step 1: Write SQL contract tests** for sequential daily numbering, inactive service rejection, allowed/forbidden transitions, name-free display rows and São Paulo midnight rollover.
- [ ] **Step 2: Run `supabase start && supabase test db`** and confirm the contract tests fail against the empty schema.
- [ ] **Step 3: Implement the migration** with foreign keys, unique `(business_date, service_type_id, sequence_number)`, São Paulo date calculation, transactional number allocation, transition validation, sanitized display event trigger, admin-only configuration writes, public ticket issue/read grants limited to RPC/view, and RLS. Pin `search_path` on `SECURITY DEFINER` functions and revoke direct table writes from public roles.
- [ ] **Step 4: Run `supabase test db`** and confirm all SQL contract tests pass.
- [ ] **Step 5: Add the concurrency integration check** that submits 25 simultaneous `issue_ticket` calls to local Supabase and asserts 25 distinct, consecutive numbers; add `test:queue-concurrency` to `package.json` and document its command.
- [ ] **Step 6: Run `npm run test:queue-concurrency` against local Supabase** and confirm the assertions pass.
- [ ] **Step 7: Commit** as `feat: add transactional queue database`.

### Task 3: Implement staff authentication and queue controls

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/queue-api.ts`
- Create: `src/features/auth/AuthProvider.tsx`, `src/features/auth/SignInPage.tsx`, `src/features/auth/RequireAdmin.tsx`
- Create: `src/features/staff/StaffPage.tsx`, `src/features/staff/QueueColumn.tsx`, `src/features/staff/ServiceTypeSettings.tsx`, `src/features/staff/MediaSettings.tsx`
- Create: `src/features/staff/staff.test.tsx`, `src/lib/supabase/queue-api.test.ts`

**Interfaces:**
- `queue-api.ts` exports `issueTicket`, `callNextTicket`, `repeatTicketCall`, and `transitionTicket`, mapping typed UI inputs to the Task 2 RPC signatures.
- `AuthProvider` exposes the current Supabase session and sign-out action; `RequireAdmin` checks `admin_users` membership before rendering staff routes.
- `StaffPage` displays one queue column per active service type and offers call, repeat, start, complete and cancel actions.

- [ ] **Step 1: Write failing tests** for admin route denial without a session, queue action mapping to the correct RPC, and disabling duplicate actions while a request is pending.
- [ ] **Step 2: Run `npm test -- --run src/features/auth src/features/staff src/lib/supabase/queue-api.test.ts`** and confirm expected failures.
- [ ] **Step 3: Implement the typed Supabase client and RPC adapter**, returning actionable Portuguese errors rather than raw object text.
- [ ] **Step 4: Implement login, route guard, staff queue controls and settings forms**; service types and display media can only be changed by an admin.
- [ ] **Step 5: Run the focused tests and `npm run build`**; expect protected routes, RPC payload assertions and build to pass.
- [ ] **Step 6: Commit** as `feat: implement protected staff queue panel`.

### Task 4: Implement customer self-service ticket issuance

**Files:**
- Create: `src/features/kiosk/KioskPage.tsx`, `src/features/kiosk/TicketConfirmation.tsx`, `src/features/kiosk/kiosk.test.tsx`
- Modify: `src/app/routes.tsx`, `src/styles/global.css`

**Interfaces:**
- Kiosk uses `issueTicket` from Task 3's RPC adapter, passes a selected active service type and optional trimmed name, then renders only the issued ticket and service label.
- Print action invokes the browser print dialog with a ticket-only print stylesheet; no printer-specific API is assumed.

- [ ] **Step 1: Write failing tests** for active service selection, optional-name trimming, successful ticket confirmation, issue error recovery, and print view hiding controls.
- [ ] **Step 2: Run `npm test -- --run src/features/kiosk`** and confirm expected failures.
- [ ] **Step 3: Implement kiosk steps and confirmation** with large touch targets and a clear return-to-start action.
- [ ] **Step 4: Run kiosk tests and `npm run build`**; confirm error/success states and printed ticket content.
- [ ] **Step 5: Commit** as `feat: add self-service ticket kiosk`.

### Task 5: Implement the realtime public display and media playlist

**Files:**
- Create: `src/features/display/useDisplayCalls.ts`, `src/features/display/DisplayPage.tsx`, `src/features/display/CallAnnouncement.tsx`, `src/features/display/MediaPlayer.tsx`, `src/features/display/display.test.tsx`
- Modify: `src/lib/supabase/queue-api.ts`, `src/styles/global.css`

**Interfaces:**
- `useDisplayCalls(): { currentCall: DisplayCall | null; recentCalls: DisplayCall[]; connection: 'connecting' | 'connected' | 'reconnecting' }` loads sanitized calls, subscribes to `display_calls`, and re-fetches after reconnect.
- `MediaPlayer` accepts ordered `MediaItem[]` and uses `normalizeMediaUrl`; unsupported or failed media falls back to the next item while keeping the queue region mounted.
- `CallAnnouncement` announces ticket number, service label and counter visually; audio starts only after a user gesture enables sound.

- [ ] **Step 1: Write failing tests** for live call updates, reconnect resync, name-free display data, queue visibility on unsupported/embed-error media, playlist advance, and audio opt-in.
- [ ] **Step 2: Run `npm test -- --run src/features/display`** and confirm expected failures.
- [ ] **Step 3: Implement realtime subscription with status tracking and reconnect refresh**, sanitized call presentation, responsive display layout and sequential media playback.
- [ ] **Step 4: Run display tests and `npm run build`**; confirm no customer names render, queue remains visible on media failure, and reconnect reloads current state.
- [ ] **Step 5: Commit** as `feat: add realtime queue display and media playlist`.

### Task 6: Verify end-to-end flows, security boundaries and setup documentation

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/queue-flow.spec.ts`, `tests/e2e/display.spec.ts`
- Modify: `README.md`, `.env.example`, `supabase/tests/queue_contract_test.sql`

**Interfaces:**
- End-to-end tests use local Supabase and Playwright; test data is isolated per run and cleaned up by a test helper.
- README documents local Supabase startup, migration/test commands, first admin provisioning, environment variables, routes and deployment steps.

- [ ] **Step 1: Write failing browser tests** for staff issue→call→complete, kiosk issue→print view, realtime display update, and unauthenticated staff route denial.
- [ ] **Step 2: Run `npx playwright test`** against local Vite/Supabase and confirm failures against the incomplete flow.
- [ ] **Step 3: Complete any missing integration and responsive states**, ensuring the mobile panel, kiosk touch targets and TV display layout do not overlap.
- [ ] **Step 4: Run the full verification sequence:** `supabase test db`, `npm test -- --run`, `npm run test:queue-concurrency`, `npx playwright test`, and `npm run build`.
- [ ] **Step 5: Review tracked files for secrets and unintended customer data exposure**, then document any external setup that cannot be completed without Supabase credentials.
- [ ] **Step 6: Commit** as `test: verify queue flows and document deployment`.

## Coverage Check

- Staff and kiosk issuance, concurrent sequencing, São Paulo rollover, and status transitions are covered by Tasks 2–4.
- Sanitized realtime calls, reconnect handling and media URL/embed fallback are covered by Tasks 1, 2 and 5.
- Responsiveness, auth route protection, print behavior, environment setup and secret checks are covered by Tasks 1, 3, 4 and 6.
