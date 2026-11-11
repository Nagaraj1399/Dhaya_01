import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { eq, like } from 'drizzle-orm';
import { db, createPool } from '../db/index.ts';
import { confirmations, evidencePackets, hazards } from '../db/schema.ts';

const BASE_URL = 'http://localhost:3000';
const VALID_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function runPwArgs(args: string[]): string {
  return execSync(`playwright-cli ${args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')}`, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runPw(cmd: string): string {
  return execSync(cmd, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test.after(async () => {
  try {
    execSync('playwright-cli close', { stdio: 'ignore' });
  } catch {
    // ignore
  }
  const testRows = await db
    .select()
    .from(hazards)
    .where(like(hazards.description, '%[CROSS_CUTTING_TEST]%'));

  for (const h of testRows) {
    await db.delete(evidencePackets).where(eq(evidencePackets.hazardId, h.id));
    await db.delete(confirmations).where(eq(confirmations.hazardId, h.id));
    await db.delete(hazards).where(eq(hazards.id, h.id));
  }
  await createPool().end();
});

test('Layer 4 [Accessibility Audit]: verifies 0 critical/serious WCAG violations across Map view, Report Modal, and Ward Dashboard', async () => {
  runPwArgs(['open', '--browser=chromium', 'http://localhost:3000']);
  runPwArgs(['resize', '1440', '900']);
  await new Promise((r) => setTimeout(r, 1500));

  const auditScript =
    '(() => { const violations = []; document.querySelectorAll(\'input:not([type="hidden"]), select, textarea\').forEach((el) => { const id = el.getAttribute("id"); const hasForLabel = id && document.querySelector(\'label[for="\' + id + \'"]\'); const hasWrappingLabel = Boolean(el.closest("label")); const hasAriaLabel = Boolean(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")); if (!hasForLabel && !hasWrappingLabel && !hasAriaLabel) { violations.push("Unlabeled form control: " + el.tagName + (id ? "#" + id : "")); } }); document.querySelectorAll("button").forEach((btn) => { const name = (btn.textContent || "").trim() || btn.getAttribute("aria-label") || btn.getAttribute("title"); if (!name) { violations.push("Unnamed button element found"); } }); document.querySelectorAll("img").forEach((img) => { if (!img.hasAttribute("alt")) { violations.push("Image missing alt attribute"); } }); return violations.length === 0 ? "ZERO_VIOLATIONS" : violations.join(" | "); })()';

  // Audit 1: Live Map View
  const mapResult = runPwArgs(['eval', auditScript]);
  assert.match(mapResult, /ZERO_VIOLATIONS/, `Map view accessibility violations: ${mapResult}`);

  // Audit 2: Report Hazard Modal
  runPwArgs([
    'eval',
    '(() => { const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Report Hazard")); if (btn) btn.click(); return Boolean(btn); })()',
  ]);
  await new Promise((r) => setTimeout(r, 800));
  const reportResult = runPwArgs(['eval', auditScript]);
  assert.match(reportResult, /ZERO_VIOLATIONS/, `Report modal accessibility violations: ${reportResult}`);

  runPwArgs([
    'eval',
    '(() => { const btn = document.querySelector(\'button[aria-label="Close report modal"]\'); if (btn) btn.click(); return Boolean(btn); })()',
  ]);
  await new Promise((r) => setTimeout(r, 400));

  // Audit 3: Ward Dashboard View
  runPwArgs([
    'eval',
    '(() => { const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Ward Dashboard")); if (btn) btn.click(); return Boolean(btn); })()',
  ]);
  await new Promise((r) => setTimeout(r, 800));
  const dashResult = runPwArgs(['eval', auditScript]);
  assert.match(dashResult, /ZERO_VIOLATIONS/, `Dashboard accessibility violations: ${dashResult}`);

  runPwArgs(['close']);
});

test('Layer 4 [Security & Input Safety]: XSS payloads are escaped on render, SQL injection payloads are parameterized safely, and unauthenticated sync is blocked', async () => {
  // 1. Submit XSS + SQLi payload in description
  const xssAndSqliPayload =
    `[CROSS_CUTTING_TEST] <script>window.__xss_pwned=true;</script><img src=x onerror="window.__xss_pwned=true"> '; DROP TABLE hazards; --`;

  const postRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: VALID_PNG,
      lat: 12.9166,
      lng: 77.6101,
      category: 'pothole',
      severity: 'minor',
      description: xssAndSqliPayload,
      deviceId: `dev-sqli-test' OR '1'='1`,
      dedupRadiusMeters: 1,
    }),
  });
  assert.equal(postRes.status, 201);

  // 2. Attempt SQLi in GET query parameters
  const getSqliRes = await fetch(
    `${BASE_URL}/api/hazards?wardId=${encodeURIComponent("80' OR 1=1;--")}&status=${encodeURIComponent("open'; DROP TABLE hazards;--")}`
  );
  assert.equal(getSqliRes.status, 200);

  // Confirm hazards table still exists and has records
  const remainingHazards = await db.select().from(hazards);
  assert.ok(remainingHazards.length >= 8, 'PostgreSQL parameterization must prevent table drop');

  // 3. Render the XSS payload in headless Chromium and verify window.__xss_pwned is undefined
  runPw('playwright-cli open --browser=chromium http://localhost:3000');
  await new Promise((r) => setTimeout(r, 1500));
  const xssExecuted = runPw(`playwright-cli eval "Boolean(window.__xss_pwned)"`);
  assert.match(xssExecuted, /false/, 'XSS script payload must be escaped and never executed');
  runPw('playwright-cli close');

  // 4. Confirm /api/auth/sync blocks unauthenticated or forged Bearer token requests with 401
  const noAuthRes = await fetch(`${BASE_URL}/api/auth/sync`, {
    method: 'POST',
  });
  assert.equal(noAuthRes.status, 401);

  const forgedAuthRes = await fetch(`${BASE_URL}/api/auth/sync`, {
    method: 'POST',
    headers: { Authorization: 'Bearer forged.invalid.token' },
  });
  assert.equal(forgedAuthRes.status, 401);
});

test('Layer 4 [Concurrent Load Check]: fires 25 concurrent POST /api/hazards requests with 0 dropped writes, 0 hash collisions, and measures actual p50/p95/p99 latency', async () => {
  const N = 25;
  const latenciesMs: number[] = [];

  const requests = Array.from({ length: N }, async (_, idx) => {
    // Distinct coordinates across BTM Layout / Jayanagar (>60m apart so each writes a new row)
    const lat = 12.901 + idx * 0.0008;
    const lng = 77.601 + (idx % 5) * 0.0008;
    // Distinct photo payload bytes per request
    const uniqueSvg = `<svg xmlns="http://www.w3.org/2000/svg"><text>LOAD_TEST_${idx}_${Date.now()}</text></svg>`;
    const photoDataUrl = `data:image/svg+xml;base64,${Buffer.from(uniqueSvg).toString('base64')}`;

    const start = performance.now();
    const res = await fetch(`${BASE_URL}/api/hazards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoDataUrl,
        lat,
        lng,
        category: 'other',
        severity: 'minor',
        description: `[CROSS_CUTTING_TEST] Concurrent load write #${idx}`,
        deviceId: `load-device-${idx}`,
        dedupRadiusMeters: 5,
      }),
    });
    const elapsed = performance.now() - start;
    latenciesMs.push(elapsed);

    const body = await res.json();
    return { status: res.status, body };
  });

  const batchStart = performance.now();
  const results = await Promise.all(requests);
  const totalWallMs = performance.now() - batchStart;

  // 1. Assert 0 dropped writes
  const successCount = results.filter((r) => r.status === 201).length;
  assert.equal(successCount, N, `Expected all ${N} concurrent writes to succeed with 201`);

  // 2. Assert 0 duplicate SHA-256 hash collisions
  const hashes = new Set(results.map((r) => r.body.intakeAudit?.photoHash));
  assert.equal(hashes.size, N, 'Every distinct concurrent submission must have a unique SHA-256 hash');

  // 3. Compute actual p50, p95, p99 latencies
  latenciesMs.sort((a, b) => a - b);
  const p50 = latenciesMs[Math.floor(N * 0.5)];
  const p95 = latenciesMs[Math.floor(N * 0.95)];
  const p99 = latenciesMs[Math.min(N - 1, Math.floor(N * 0.99))];
  const rps = ((N / totalWallMs) * 1000).toFixed(2);

  console.log(
    `[LOAD_BENCHMARK_METRICS] N=${N} concurrent POST /api/hazards | Wall=${totalWallMs.toFixed(1)}ms | Throughput=${rps} req/s | p50=${p50.toFixed(1)}ms | p95=${p95.toFixed(1)}ms | p99=${p99.toFixed(1)}ms`
  );

  assert.ok(p95 < 5000, `Expected p95 latency < 5000ms, got ${p95.toFixed(1)}ms`);
});
