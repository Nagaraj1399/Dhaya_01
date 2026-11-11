# Test Automation Master Prompt — Sakshi (run after the app exists)

```
PROJECT: Sakshi — full test coverage pass
CONTEXT: The app (Next.js + Supabase/Postgres + Groq agents, described in BOB_LOG.md and
README.md) is built. Your job now is to raise it to hackathon-demo-proof test coverage
across every layer. Follow TDD discipline for anything you add or fix: if a test is
missing for existing code, write it, confirm you understand what production change would
make it fail, then verify it actually passes against current behavior before moving on —
do not write a test that trivially passes without exercising real logic.

SCOPE — build these five layers, in order, each with a passing run before moving to the next

1. UNIT TESTS (lib/agents/* and any pure helper functions)
   - Geo-resolution: point clearly inside a ward, point exactly on a ward boundary edge,
     point outside Bengaluru entirely (should reject or flag, not silently assign a ward).
   - Dedup clustering: two reports 10m apart same category (merge), two reports 10m apart
     different category (do not merge), two reports exactly at the 50m radius boundary
     (define and test the boundary behavior explicitly), reports against an already-
     RESOLVED hazard (must not merge into a closed record).
   - Photo hashing: identical bytes produce identical hash, one-byte difference produces a
     different hash, hash is computed before any lossy resize/compression step if one
     exists.
   - Severity/category parsing from the vision model response: valid response, malformed/
     unexpected response (must not crash — must fall back to "needs human review" state),
     timeout or API error from Groq (must degrade gracefully, never silently drop the
     report).

2. INTEGRATION TESTS (API routes against a real or realistically seeded test database —
   not mocks of your own database layer)
   - POST /api/hazards: valid submission end-to-end, missing photo, missing GPS, GPS
     outside bounding box, oversized photo file, non-image file upload.
   - POST /api/hazards/:id/confirm: confirming an open hazard, confirming a resolved one
     (expected behavior must be defined and tested), confirming a nonexistent id, duplicate
     confirmation from the same device_id in quick succession (decide and test whether
     that's rate-limited or allowed).
   - POST /api/hazards/:id/evidence-packet: generates correctly from real stored data,
     fails cleanly for a hazard with no photos, output never contains placeholder/
     fabricated fields.
   - GET /api/wards and GET /api/hazards: correct filtering by ward and status, pagination
     if present, response shape matches what the frontend actually consumes.

3. END-TO-END TESTS (Playwright, against a running local or staging build)
   - Full report flow: open app → tap report → mock camera/photo input → GPS permission
     granted → submit → new pin appears on map.
   - GPS permission denied path: app must not crash, must show a clear fallback (manual
     pin placement or a clear error state).
   - Confirm flow: tap an existing pin → confirm → confirmation count visibly increments.
   - Evidence packet flow: request packet → file downloads or renders → spot-check its
     contents match the hazard's actual stored data.
   - Dashboard: numbers shown match a direct query against the test database at the same
     point in time (write the test to assert this equivalence, not just that numbers
     render).

4. CROSS-CUTTING CHECKS
   - Accessibility: run axe-core (or equivalent) against the report page, map page, and
     dashboard; fail the suite on any critical/serious violation.
   - Security/input-safety: XSS payload in the free-text description field must be escaped
     on render; attempt SQL-injection-style strings through every text input and confirm
     Supabase/Postgres parameterization holds; confirm Supabase row-level security (or
     equivalent) actually blocks an unauthenticated client from reading/writing another
     device's confirmations if that's a stated guarantee.
   - Basic load check: script (k6 or autocannon) firing N concurrent POST /api/hazards
     requests and confirming no dropped writes, no duplicate-hash collisions, and
     reasonable p95 latency — report the actual numbers, don't estimate them.

5. COVERAGE + CI
   - Wire coverage reporting (Vitest/Jest coverage or equivalent) and set a minimum
     threshold (85% statements on /lib/agents and /app/api at minimum) that fails the build
     if not met.
   - Add a GitHub Actions workflow running unit + integration tests on every push, and
     Playwright E2E tests at least on the main branch, with coverage report as a build
     artifact.
   - Produce a short TEST_REPORT.md summarizing: total tests, coverage percentage per
     layer, every edge case covered (as a checklist), and any known gap you deliberately
     chose not to cover and why.

RULES
- Every test must assert on real behavior (actual function output, actual API response,
  actual rendered DOM state) — never assert against a mock's own recorded call, and never
  write a test that would pass even if the underlying feature were deleted.
- If an edge case above reveals an actual bug in the app, fix the bug via its own
  red → green cycle before continuing the test sweep; log it in TEST_REPORT.md as a bug
  found by the test suite, not the other way around.
- Do not report coverage or pass/fail numbers you have not actually run — paste real test
  runner output into your final summary.
```
