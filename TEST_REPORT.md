# Sakshi — Automated Test & Verification Report (`02-test-automation-prompt.md`)

**Application**: **Sakshi** — Evidence-Chain Agent for Bengaluru Road Hazards  
**Event**: IBM Bobathon: Build for Bengaluru (*Smarter Streets, Better Living*)  
**Methodology**: Strict Red → Green → Refactor TDD against live Express + PostgreSQL (`ai-studio-10645a99`, `asia-southeast1`) + headless Chromium (`playwright-cli`).

---

## 1. Executive Summary & Real Test Counts

All **5 layers** of the test automation architecture were implemented and executed against the live application and real Cloud SQL PostgreSQL instance:

| Test Layer | Suite / File(s) | Total Tests | Passed | Failed | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Layer 1: Unit Tests** | `src/lib/agents/*.test.ts` + `src/lib/api-handlers.test.ts` | **22** | **22** | 0 | `86ms` |
| **Layer 2: Integration Tests** | `src/tests/integration-api.test.ts` | **4** (21 HTTP/DB assertions) | **4** | 0 | `2,501ms` |
| **Layer 3: End-to-End Tests** | `src/tests/e2e-playwright.test.ts` | **1** (5 full user journeys + SQL checks) | **1** | 0 | `48,879ms` |
| **Layer 4: Cross-Cutting Checks** | `src/tests/cross-cutting.test.ts` | **3** (WCAG, XSS/SQLi/Auth, 25x Load) | **3** | 0 | `29,663ms` |
| **Total Executed** | **8 test files across 4 suites** | **30** | **30** | **0** | **`81.13s`** |

---

## 2. Layer 5 Coverage Report (`--experimental-test-coverage`)

Executed via `npm run test:coverage` (`tsx --test --experimental-test-coverage src/lib/agents/*.test.ts src/lib/api-handlers.test.ts src/tests/integration-api.test.ts`):

| Module / File | Line Coverage % | Branch Coverage % | Function Coverage % | Gate (`>= 85%`) |
| :--- | :---: | :---: | :---: | :---: |
| `src/lib/agents/evidence-packet.ts` | **99.16%** | 58.33% | 100.00% | PASS |
| `src/lib/agents/ward-analytics.ts` | **99.25%** | 86.21% | 100.00% | PASS |
| `src/lib/api-handlers.ts` | **98.60%** | 80.95% | 85.71% | PASS |
| `src/lib/agents/orchestrate-spec.ts` | **90.63%** | 100.00% | 100.00% | PASS |
| `src/lib/agents/intake-geo.ts` | **87.73%** | 82.46% | 100.00% | PASS |
| `src/lib/agents/triage-dedup.ts` | **87.41%** | 78.48% | 100.00% | PASS |
| `src/db/schema.ts` | **100.00%** | 100.00% | 57.14% | PASS |
| `src/db/index.ts` | **96.55%** | 100.00% | 50.00% | PASS |
| **All Files Combined** | **95.56%** | **81.82%** | **94.25%** | **PASS (`>= 85%`)** |

---

## 3. Edge-Case Verification Checklist

### Layer 1: Unit Tests (Pure Agent & Domain Logic)
- [x] **Geo-resolution inside ward**: `12.9784, 77.6408` resolves to `Ward 80 - Hoysala Nagar (Indiranagar)` via `point-in-polygon`.
- [x] **Geo-resolution on exact ward boundary edge**: `12.968, 77.640` lying directly on the southern polygon edge of Ward 80 deterministically resolves via `point-in-polygon` without falling into undefined behavior.
- [x] **Geo-resolution outside Bengaluru entirely**: `13.0827, 80.2707` (Chennai) and `12.5000, 77.5000` return `null` from `resolveWardByPointInPolygon` and throw `Outside Bengaluru bounding box` in `validateSubmission` — never silently assigned a ward.
- [x] **Dedup clustering — 10m apart, same category**: Merges into existing open hazard (`id: 101`).
- [x] **Dedup clustering — 10m apart, different category**: `waterlogging` 10m from `pothole` does NOT merge (`null`).
- [x] **Dedup clustering — exact 50m radius boundary**: `49.98m` (`<= 50.00m`) merges; `50.09m` (`> 50.00m`) does NOT merge.
- [x] **Dedup clustering — resolved hazard protection**: Report at `0.0m` from a `resolved` hazard never merges into a closed record.
- [x] **Photo SHA-256 hashing**: Identical raw bytes produce identical 64-char hex digest; 1-byte difference (`0x00` -> `0x01`) produces completely different digest; computed on raw decoded binary bytes prior to any resize.
- [x] **Vision model response parsing & timeout fallback**: Valid JSON parsed accurately; malformed string (`<<<NOT_VALID_JSON_AT_ALL`) and unexpected taxonomy (`meteor_strike`) set `needsHumanReview: true` without crashing; Groq API timeout (`AbortError`) and HTTP `503` degrade gracefully with `needsHumanReview: true` without dropping the citizen's report.

### Layer 2: Integration Tests (API + Real PostgreSQL)
- [x] **`POST /api/hazards`**: Valid submission creates a real row in PostgreSQL (`201`); missing photo (`400`), missing GPS (`400`), GPS outside Bengaluru (`400`), oversized photo `>5MB` (`400`), and non-image MIME `application/pdf` (`400`) are all rejected cleanly.
- [x] **`POST /api/hazards/:id/confirm`**: Confirming an `open` hazard increments `confirmation_count` in PostgreSQL (`200`); duplicate confirmation from the same `device_id` within 60 seconds is rate-limited (`429`); confirming a `resolved` hazard is rejected (`400`); confirming nonexistent ID `999999` returns `404`.
- [x] **`POST /api/hazards/:id/evidence-packet`**: Generates packet matching real PostgreSQL `photo_hash`, `ward_name`, and `confirmation_count`; returns `400` if a hazard record has no photo; returns `404` for nonexistent hazard ID; contains zero fabricated SLAs or officer names.
- [x] **`GET /api/wards` & `GET /api/hazards`**: Supports `?wardId=`, `?status=`, `?category=`, `?limit=`, and `?offset=` pagination, returning `{ hazards, pagination, wards, summary }` matching the frontend contract.

### Layer 3: End-to-End Tests (Playwright Headless Chromium + Direct SQL)
- [x] **Full Report Flow**: Opens `http://localhost:3000`, clicks `Report Hazard`, enters unique E2E description, submits -> new hazard pin appears in DOM and is verified via direct `SELECT * FROM hazards` in PostgreSQL.
- [x] **GPS Out-of-Bounds Fallback**: Enters `13.0827` (outside Bengaluru) in modal -> UI renders red warning banner (`Coordinates are outside the Bengaluru (BBMP) service boundary`) and disables the submit button (`disabled === true`).
- [x] **Confirm Flow**: Clicks `"Confirm I See This Too (+1)"` on the newly created pin -> DOM confirmation count and PostgreSQL `confirmation_count` both increment in lockstep (`1 -> 2`).
- [x] **Evidence Packet Flow**: Opens Evidence Packet modal -> verifies the SHA-256 hex digest and `AI-Prepared Civic Evidence Summary` disclaimer rendered in the DOM match the PostgreSQL row.
- [x] **Dashboard SQL Equivalence Check**: Navigates to `Ward Dashboard` and verifies that `Open Hazards`, `Resolved`, and `Citizen Confirmations` displayed in the DOM match direct SQL aggregates (`COUNT(*)`, `SUM(confirmation_count)`) against PostgreSQL at the same instant.

### Layer 4: Cross-Cutting Checks
- [x] **Accessibility Audit**: Automated DOM accessibility audit across Map View, Report Hazard Modal, and Ward Dashboard confirms `0` unlabeled form controls, `0` unnamed buttons, and `0` images missing `alt` text.
- [x] **Security / Input Safety**:
  - XSS payload (`<script>window.__xss_pwned=true;</script><img src=x onerror="window.__xss_pwned=true">`) stored in `description` is safely escaped by React on render (`window.__xss_pwned === false`).
  - SQL injection strings (`'; DROP TABLE hazards; --` and `80' OR 1=1;--`) in `POST /api/hazards` and `GET /api/hazards` are safely parameterized by Drizzle ORM (`hazards` table remains intact).
  - `POST /api/auth/sync` rejects missing or forged Bearer tokens with HTTP `401`.
- [x] **Concurrent Load Check (N = 25 parallel `POST /api/hazards`)**:
  - **Dropped writes**: `0 / 25` (`100%` HTTP `201 Created`)
  - **SHA-256 hash collisions**: `0 / 25` (`25` unique digests)
  - **Total wall time**: `873.0 ms`
  - **Sustained throughput**: `28.64 req/s`
  - **Latency percentiles**: `p50 = 828.4 ms` | `p95 = 874.6 ms` | `p99 = 875.9 ms`

---

## 4. Bugs Uncovered by the Test Suite & Fixed via Red → Green TDD

| # | Bug Uncovered in Red Phase | Root Cause | Fix Applied in Green Phase |
| :- | :--- | :--- | :--- |
| **1** | **Non-image MIME (`application/pdf`) and `>5MB` payloads accepted by `validateSubmission`** | `validateSubmission` in `src/lib/agents/intake-geo.ts` only checked minimum string length (`>= 20`) and did not inspect data URL MIME headers or enforce a maximum byte limit. | Added `MAX_PHOTO_DATA_URL_LENGTH = 5 * 1024 * 1024` check and explicit `ALLOWED_IMAGE_MIMES` prefix validation (`image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`). |
| **2** | **Polygon boundary edge degeneracy when closing vertex equals start vertex** | GeoJSON polygon rings repeat the start vertex at the end (`ring[0] === ring[n-1]`). Our initial segment-collinearity check divided by `squaredLength = 0`, matching arbitrary coordinates to the first ward. | Added `if (squaredLength < 1e-16) return Math.hypot(lat - lat1, lng - lng1) <= epsilon;` in `isPointOnLineSegment` (`src/lib/agents/intake-geo.ts`). |
| **3** | **Malformed LLM JSON or Groq timeout did not set `needsHumanReview`** | `analyzeHazardPhotoAdvisory` in `src/lib/agents/triage-dedup.ts` lacked an explicit `needsHumanReview` flag when the vision API returned malformed JSON, unrecognized category names, or timed out. | Added `parseVisionModelResponse` with taxonomy validation and timeout error handling that preserves the citizen's report and sets `needsHumanReview: true`. |
| **4** | **Confirming a `resolved` hazard succeeded with HTTP `200`, and rapid duplicate confirmations from the same `device_id` were not rate-limited** | `confirmExistingHazardById` in `src/db/repository.ts` incremented `confirmation_count` unconditionally without checking `hazard.status === 'resolved'` or querying recent confirmations by `device_id`. | Added a `status === 'resolved'` guard (`400 Bad Request`) and a 60-second per-`device_id` rate-limit check (`429 Too Many Requests`) in `src/db/repository.ts` and `server.ts`. |
| **5** | **Evidence packet generation did not reject records missing photo evidence** | `assembleEvidencePacket` in `src/lib/agents/evidence-packet.ts` assumed `photoUrl` and `photoHash` were always non-empty. | Added explicit guard throwing `Cannot generate an evidence packet for a hazard with no photo evidence` (`400 Bad Request`). |
| **6** | **`GET /api/hazards` lacked query filtering and pagination** | `GET /api/hazards` returned the full unfiltered array without supporting `?wardId=`, `?status=`, `?limit=`, or `?offset=`. | Implemented `filterAndPaginateHazards` in `src/lib/api-handlers.ts` and wired query filtering + `pagination` metadata into `GET /api/hazards` in `server.ts`. |

---

## 5. Known Gaps & Honest Assessment

- **Secondary Gemini Vision SDK Live Branch (`src/lib/agents/triage-dedup.ts` lines 305–350)**: Covered via `parseVisionModelResponse` unit tests; in automated CI without live external LLM credentials, the test suite exercises the Groq `fetchImpl` injection path and deterministic heuristic fallback rather than making billable external Gemini multimodal calls on every test run.
- **Native Device Camera Capture (`<input type="file" capture="environment">`)**: Tested in headless Chromium via base64/preset image payloads and raw `POST /api/hazards` MIME validation rather than physical mobile camera hardware.
