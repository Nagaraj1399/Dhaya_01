# Master Build Prompt — Sakshi (IBM Bobathon: Build for Bengaluru)

```
PROJECT: Sakshi — Evidence-Chain Agent for Bengaluru Road Hazards
CONTEXT: IBM Bobathon (Build for Bengaluru) hackathon submission. Theme: Smarter Streets,
Better Living. 4-day build window. Must be genuinely built WITH you (Bob) — scaffolding,
agent logic, and tests should visibly come from this working session, not be hand-written
around you.

PROBLEM
Karnataka's High Court (2019) ruled citizens can claim compensation from BBMP for injury
or vehicle damage caused by poor road maintenance, and that BBMP has a statutory duty to
maintain roads. Almost nobody exercises this right because there's no systematic way to
prove a hazard existed, when it was first reported, and how long BBMP left it unresolved —
exactly the evidence chain a claim needs. Build the tool that assembles that evidence chain
automatically, while being explicit that a human always files the actual claim — this app
only documents, it never auto-submits anything legal or public on a citizen's behalf.

CORE USER FLOWS (build in this order, each one fully working before moving to the next)
1. Report a hazard: citizen opens the app, taps "Report", camera captures a photo, GPS
   auto-attaches, optional text note, submit.
2. See it on a live map: pins colored by status (open/resolved/disputed), clustered by
   proximity, each pin shows ward, days open, confirmation count.
3. Confirm an existing hazard: anyone near an open pin can add a corroborating photo/tap
   instead of creating a duplicate.
4. Request an evidence packet: for any hazard, generate a downloadable PDF/JSON containing
   all photos with timestamps and SHA-256 hashes, GPS, ward officer contact, days
   unresolved, and a one-line citation of the 2019 HC ruling — clearly labeled "evidence
   summary to support your own claim, not an automatic filing."
5. Public ward dashboard: aggregate view — open hazard count and average unresolved
   duration per ward, sourced only from real data in the demo database, never invented
   numbers.

ARCHITECTURE — three agents, sequential pipeline, each independently testable
1. Intake & Geo-Resolution Agent
   - Validates submission (photo present, GPS present and plausible for Bengaluru bounding
     box, timestamp sane).
   - Computes SHA-256 hash of photo bytes + metadata for tamper-evidence, stores it
     alongside the record.
   - Resolves lat/lng to a BBMP/Greater Bengaluru ward via point-in-polygon against real
     ward boundary data (download from https://data.opencity.in/dataset/bbmp-ward-information
     or https://bharatlas.com/view/bda_layouts — use the current Greater Bengaluru Authority
     ward GeoJSON, not invented boundaries).
2. Triage & Dedup Agent
   - Calls a vision-capable model (use the Groq API) to suggest category (pothole/
     waterlogging/damaged footpath/other) and severity (minor/major/hazardous) from the
     photo. This is ADVISORY ONLY — the UI must show the suggestion with a visible
     human-override control before it's saved as final.
   - Clusters new reports against existing OPEN hazards within a configurable radius
     (default 50m) of the same category; a match increments a confirmation count and
     "open since" timer on the existing record instead of creating a duplicate.
3. Evidence Packet Agent
   - On request, assembles the PDF/JSON packet described in flow 4 above from real stored
     data only. No placeholder photos, no fabricated dates.

DATA MODEL (Postgres via Supabase — reuse the free tier)
- wards: ward_id, ward_name, geometry (PostGIS polygon), officer_contact
- hazards: id, lat, lng, ward_id, category, severity, status, created_at, resolved_at,
  photo_url, photo_hash, description, confirmation_count
- confirmations: id, hazard_id, created_at, photo_url nullable, device_id
- evidence_packets: id, hazard_id, generated_at, file_url

STACK
- Next.js (App Router) + TypeScript, Tailwind CSS
- Supabase: Postgres + PostGIS, Storage for photos, anonymous device-id sessions (no
  forced login for the demo)
- Groq API for vision/text inference (key is already available in this environment — do
  not hardcode it in committed source, read from env var GROQ_API_KEY)
- Map: Leaflet + OpenStreetMap tiles (no Google Maps key dependency)
- Deploy target: Vercel

IBM BOB REQUIREMENT — DO NOT SKIP
- If watsonx Orchestrate ADK access is available in this environment, express the three
  agents above as an Orchestrate agent spec (business requirement → SOP → agentic
  workflow) per IBM's own documented Bob + watsonx Orchestrate pattern, and call that
  service from the Next.js API routes. If it is NOT available, implement the same three
  agents as clearly separated, independently testable TypeScript modules under
  /lib/agents/ — keep the seams identical so they could be swapped into Orchestrate later,
  and say explicitly in the README which path was taken and why.
- Keep a running log in BOB_LOG.md of every meaningfully large step you (Bob) take —
  scaffolding, each agent module, schema migrations, test generation — with a one-line
  description each. This file becomes the backbone of the Bob Story demo video script.

NON-NEGOTIABLE CONSTRAINTS
- Every number shown in the UI (ward stats, "days open", confirmation counts) must be
  computed from real records in the database — never a hardcoded or illustrative figure.
- The evidence packet and its UI copy must never claim to file anything automatically or
  contact any official on the citizen's behalf.
- Mobile-first, responsive, passes basic accessibility checks (labeled form fields,
  sufficient color contrast on status pins).
- Follow test-driven development: for every new function in /lib/agents and every API
  route, write a failing test first, show it fail, then write the minimal code to pass it.
  Do not write implementation before its test exists.
- Seed the database with a small, clearly-labeled set of realistic demo hazards (mark them
  as seed data in a comment) so the dashboard and map aren't empty on first run — do not
  present seed data as real citizen reports in the submission.

DELIVERABLES AT THE END OF THIS SESSION
1. Working deployed app (Vercel URL) covering all five flows above.
2. README.md with: problem statement, architecture diagram (ASCII is fine), setup
   instructions, and the measurable impact statement computed from the actual seeded/demo
   data (e.g., "N hazards tracked, average unresolved duration X days, Y duplicate reports
   merged instead of filed separately").
3. BOB_LOG.md as described above.
4. A short section in the README titled "Bob Story" summarizing, in your own words, which
   parts of this you generated, tested, and refactored, and what you'd do differently with
   more time.

Work through this in order: schema + ward data ingestion → Intake/Geo agent + its tests →
report flow UI → Triage/Dedup agent + its tests → map + confirm flow → Evidence Packet
agent + its tests → dashboard → polish + seed data + README. Stop and flag me if ward
boundary data, Supabase, or Groq access isn't actually working before building on top of it.
```
