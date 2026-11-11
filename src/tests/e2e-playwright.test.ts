import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { eq, like } from 'drizzle-orm';
import { db, createPool } from '../db/index.ts';
import { confirmations, evidencePackets, hazards } from '../db/schema.ts';
import { computeWardDashboardStats } from '../lib/agents/ward-analytics.ts';
import { BBMP_WARDS } from '../lib/data/bbmp-wards.ts';

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
    // ignore if already closed
  }
  // Clean up E2E test records
  const e2eHazards = await db
    .select()
    .from(hazards)
    .where(like(hazards.description, '%[E2E_TEST]%'));

  for (const h of e2eHazards) {
    await db.delete(evidencePackets).where(eq(evidencePackets.hazardId, h.id));
    await db.delete(confirmations).where(eq(confirmations.hazardId, h.id));
    await db.delete(hazards).where(eq(hazards.id, h.id));
  }
  await createPool().end();
});

test('Layer 3 [Playwright E2E]: Full report flow, GPS out-of-bounds fallback, Confirm flow, Evidence Packet verification, and Dashboard SQL equivalence', async () => {
  // 1. Open app in headless Chromium
  runPw('playwright-cli open --browser=chromium http://localhost:3000');
  runPw('playwright-cli resize 1440 900');

  // Wait for initial data load
  await new Promise((r) => setTimeout(r, 2000));

  // 2. Click "Report Hazard" and verify GPS out-of-bounds / denied fallback path first
  runPw(`playwright-cli click "button:has-text('Report Hazard')"`);
  await new Promise((r) => setTimeout(r, 1000));

  runPw(`playwright-cli click "button:has-text('Test Out-of-Bengaluru Bounds')"`);
  await new Promise((r) => setTimeout(r, 800));

  const outOfBoundsText = runPw(
    `playwright-cli eval "document.body.innerText.includes('outside the Greater Bengaluru')"`
  );
  assert.match(outOfBoundsText, /true/, 'Out-of-bounds GPS fallback warning must appear in UI');

  const isSubmitDisabled = runPw(
    `playwright-cli eval "document.querySelector('button[type=submit]').disabled"`
  );
  assert.match(isSubmitDisabled, /true/, 'Submit button must be disabled when GPS is invalid');

  // 3. Select valid Jayanagar preset, fill custom E2E note, and submit -> new pin appears on map
  runPw(`playwright-cli click "button:has-text('Jayanagar 4th Block Broken Footpath Slab')"`);
  await new Promise((r) => setTimeout(r, 1000));

  runPw(
    `playwright-cli fill "#hazard-note-input" "[E2E_TEST] Broken drain slab verified via Playwright E2E"`
  );
  runPw(`playwright-cli click "button[type='submit']"`);
  await new Promise((r) => setTimeout(r, 1500));

  // Verify new record exists in PostgreSQL and is rendered in the UI
  const e2eRows = await db
    .select()
    .from(hazards)
    .where(like(hazards.description, '%[E2E_TEST]%'));
  assert.equal(e2eRows.length, 1, 'Submitted E2E hazard must be persisted in PostgreSQL');
  const createdHazard = e2eRows[0];

  const pageTextAfterSubmit = runPw(
    `playwright-cli eval "document.body.innerText.includes('[E2E_TEST] Broken drain slab')"`
  );
  assert.match(pageTextAfterSubmit, /true/, 'Newly submitted hazard must be visible in UI');

  // 4. Confirm Flow: add corroborating note and click Confirm -> confirmation count visibly increments
  runPw(
    `playwright-cli fill "#corroborate-note-input" "[E2E_TEST] Second citizen corroboration from Playwright"`
  );
  runPw(`playwright-cli click "button:has-text('Confirm Hazard (1)')"`);
  await new Promise((r) => setTimeout(r, 1500));

  const updatedConfirmBtn = runPw(
    `playwright-cli eval "document.body.innerText.includes('Confirm Hazard (2)')"`
  );
  assert.match(
    updatedConfirmBtn,
    /true/,
    'Confirmation count must visibly increment from 1 to 2 in the DOM'
  );

  // 5. Evidence Packet Flow: click Request Evidence Packet -> verify contents match stored DB record
  runPw(`playwright-cli click "button:has-text('Request Evidence Packet')"`);
  await new Promise((r) => setTimeout(r, 1500));

  const modalContainsHash = runPw(
    `playwright-cli eval "document.body.innerText.includes('${createdHazard.photoHash}')"`
  );
  assert.match(
    modalContainsHash,
    /true/,
    'Rendered Evidence Packet modal must contain the exact stored SHA-256 photoHash'
  );

  const modalContainsDisclaimer = runPw(
    `playwright-cli eval "document.body.innerText.includes('EVIDENCE SUMMARY TO SUPPORT YOUR OWN CLAIM, NOT AN AUTOMATIC FILING')"`
  );
  assert.match(modalContainsDisclaimer, /true/);

  runPw(`playwright-cli click "button[aria-label='Close evidence packet']"`);
  await new Promise((r) => setTimeout(r, 500));

  // 6. Dashboard Equivalence Check: numbers in DOM match direct SQL query against PostgreSQL
  runPw(`playwright-cli click "button:has-text('Ward Dashboard')"`);
  await new Promise((r) => setTimeout(r, 1000));

  const allDbHazardsNow = await db.select().from(hazards);
  const expectedStats = computeWardDashboardStats(BBMP_WARDS, allDbHazardsNow, new Date());

  const domOpenCount = runPw(
    `playwright-cli eval "document.querySelector('[data-testid=metric-open-hazards]').textContent.trim()"`
  );
  const domAvgDays = runPw(
    `playwright-cli eval "document.querySelector('[data-testid=metric-avg-days]').textContent.trim()"`
  );
  const domDupMerged = runPw(
    `playwright-cli eval "document.querySelector('[data-testid=metric-duplicates-merged]').textContent.trim()"`
  );

  assert.ok(
    domOpenCount.includes(String(expectedStats.summary.totalOpenHazards)),
    `DOM open hazards (${domOpenCount}) must match direct SQL query (${expectedStats.summary.totalOpenHazards})`
  );
  assert.ok(
    domAvgDays.includes(`${expectedStats.summary.avgUnresolvedDaysOpen} Days`),
    `DOM avg unresolved days (${domAvgDays}) must match direct SQL query (${expectedStats.summary.avgUnresolvedDaysOpen} Days)`
  );
  assert.ok(
    domDupMerged.includes(String(expectedStats.summary.duplicatesMergedCount)),
    `DOM duplicates merged (${domDupMerged}) must match direct SQL query (${expectedStats.summary.duplicatesMergedCount})`
  );

  runPw('playwright-cli close');
});
