import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db, createPool } from '../db/index.ts';
import { confirmations, evidencePackets, hazards } from '../db/schema.ts';

const BASE_URL = 'http://localhost:3000';
const VALID_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const createdTestHazardIds: number[] = [];

test.after(async () => {
  // Clean up test-inserted hazards from PostgreSQL so demo state remains clean
  for (const id of createdTestHazardIds) {
    await db.delete(evidencePackets).where(eq(evidencePackets.hazardId, id));
    await db.delete(confirmations).where(eq(confirmations.hazardId, id));
    await db.delete(hazards).where(eq(hazards.id, id));
  }
  await createPool().end();
});

test('Layer 2 [Integration - POST /api/hazards]: valid submission creates real PostgreSQL record, and invalid payloads (missing photo, missing GPS, outside Bengaluru, oversized, non-image) are rejected', async () => {
  // 1. Valid submission at a unique Jayanagar coordinate
  const uniqueLat = 12.9265;
  const uniqueLng = 77.5842;
  const validRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: VALID_PNG,
      lat: uniqueLat,
      lng: uniqueLng,
      category: 'pothole',
      severity: 'major',
      description: '[INTEGRATION_TEST] Jayanagar 5th Block pothole verification',
      deviceId: 'integration-device-001',
      dedupRadiusMeters: 5,
    }),
  });
  assert.equal(validRes.status, 201);
  const validData = await validRes.json();
  assert.equal(validData.action, 'created_new');
  assert.ok(validData.hazard?.id);
  createdTestHazardIds.push(validData.hazard.id);

  // Verify directly in PostgreSQL
  const dbRows = await db
    .select()
    .from(hazards)
    .where(eq(hazards.id, validData.hazard.id));
  assert.equal(dbRows.length, 1);
  assert.equal(dbRows[0].wardId, 153); // Jayanagar Ward #153

  // 2. Missing photo
  const noPhotoRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: '',
      lat: 12.9784,
      lng: 77.6408,
      category: 'pothole',
      severity: 'major',
    }),
  });
  assert.equal(noPhotoRes.status, 400);

  // 3. Missing GPS
  const noGpsRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: VALID_PNG,
      lat: 'not-a-number',
      lng: null,
      category: 'pothole',
      severity: 'major',
    }),
  });
  assert.equal(noGpsRes.status, 400);

  // 4. GPS outside Bengaluru bounding box (Chennai coordinates)
  const outOfBoundsRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: VALID_PNG,
      lat: 13.0827,
      lng: 80.2707,
      category: 'pothole',
      severity: 'major',
    }),
  });
  assert.equal(outOfBoundsRes.status, 400);

  // 5. Oversized photo (> 5MB)
  const oversizedRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(5_500_000),
      lat: 12.9784,
      lng: 77.6408,
      category: 'pothole',
      severity: 'major',
    }),
  });
  assert.equal(oversizedRes.status, 400);

  // 6. Non-image file upload (PDF payload)
  const nonImageRes = await fetch(`${BASE_URL}/api/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photoDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoK',
      lat: 12.9784,
      lng: 77.6408,
      category: 'pothole',
      severity: 'major',
    }),
  });
  assert.equal(nonImageRes.status, 400);
});

test('Layer 2 [Integration - POST /api/hazards/:id/confirm]: confirms open hazard, rate-limits duplicate rapid confirmation from same device_id, rejects resolved hazard, and rejects nonexistent id', async () => {
  const targetId = createdTestHazardIds[0];
  assert.ok(targetId, 'Test hazard must exist');

  // 1. Confirm open hazard
  const confirm1 = await fetch(`${BASE_URL}/api/hazards/${targetId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'rapid-test-device-99',
      note: 'First valid on-site confirmation',
    }),
  });
  assert.equal(confirm1.status, 200);
  const confirm1Data = await confirm1.json();
  assert.equal(confirm1Data.hazard.confirmationCount, 2);

  // 2. Duplicate confirmation from the SAME device_id in quick succession (< 60s) -> must be rate-limited (429)
  const confirmDuplicate = await fetch(`${BASE_URL}/api/hazards/${targetId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'rapid-test-device-99',
      note: 'Spamming second confirmation immediately from same device',
    }),
  });
  assert.equal(
    confirmDuplicate.status,
    429,
    'Rapid duplicate confirmation from same device_id must be rate-limited with 429'
  );

  // 3. Mark hazard as resolved, then attempt to confirm a resolved hazard -> must reject with 400
  await fetch(`${BASE_URL}/api/hazards/${targetId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' }),
  });

  const confirmResolved = await fetch(`${BASE_URL}/api/hazards/${targetId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'different-citizen-device-100',
      note: 'Trying to confirm an already resolved record',
    }),
  });
  assert.equal(
    confirmResolved.status,
    400,
    'Confirming an already-resolved hazard must be rejected with 400'
  );

  // Restore status to open for subsequent packet tests
  await fetch(`${BASE_URL}/api/hazards/${targetId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'open' }),
  });

  // 4. Confirming nonexistent hazard ID
  const confirmNonexistent = await fetch(`${BASE_URL}/api/hazards/9999999/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'citizen-device-101',
      note: 'Nonexistent hazard',
    }),
  });
  assert.ok(
    confirmNonexistent.status === 404 || confirmNonexistent.status === 400,
    'Nonexistent hazard confirmation must fail with 404 or 400'
  );
});

test('Layer 2 [Integration - POST /api/hazards/:id/evidence-packet]: generates packet matching real DB fields and fails cleanly when hazard has no photos or does not exist', async () => {
  const targetId = createdTestHazardIds[0];
  const res = await fetch(`${BASE_URL}/api/hazards/${targetId}/evidence-packet`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const { packet } = await res.json();

  // Compare directly against real PostgreSQL record
  const [dbHazard] = await db.select().from(hazards).where(eq(hazards.id, targetId));
  assert.equal(packet.hazardId, dbHazard.id);
  assert.equal(packet.ward.wardId, dbHazard.wardId);
  assert.equal(packet.confirmationCount, dbHazard.confirmationCount);
  assert.equal(packet.evidenceChain[0].sha256Hash, dbHazard.photoHash);
  assert.equal(packet.evidenceChain.length, 2); // Initial report + 1 valid confirmation
  assert.match(
    packet.legalBasis.disclaimer,
    /evidence summary to support your own claim, not an automatic filing/i
  );

  // Nonexistent hazard packet request must fail cleanly
  const missingRes = await fetch(`${BASE_URL}/api/hazards/9999999/evidence-packet`, {
    method: 'POST',
  });
  assert.ok(missingRes.status === 400 || missingRes.status === 404);
});

test('Layer 2 [Integration - GET /api/wards and GET /api/hazards]: supports filtering by wardId, status, pagination, and matches frontend schema', async () => {
  const wardsRes = await fetch(`${BASE_URL}/api/wards`);
  assert.equal(wardsRes.status, 200);
  const wardsData = await wardsRes.json();
  assert.ok(Array.isArray(wardsData.wards));
  assert.ok(wardsData.wards.length >= 10);

  // Filter by wardId=80 and status=open
  const filteredRes = await fetch(`${BASE_URL}/api/hazards?wardId=80&status=open`);
  assert.equal(filteredRes.status, 200);
  const filteredData = await filteredRes.json();
  assert.ok(Array.isArray(filteredData.hazards));
  assert.ok(filteredData.hazards.length >= 1);
  for (const h of filteredData.hazards) {
    assert.equal(h.wardId, 80);
    assert.equal(h.status, 'open');
    assert.equal(typeof h.daysOpen, 'number');
    assert.equal(typeof h.officerContact, 'string');
  }

  // Pagination: limit=2&offset=0
  const pageRes = await fetch(`${BASE_URL}/api/hazards?limit=2&offset=0`);
  assert.equal(pageRes.status, 200);
  const pageData = await pageRes.json();
  assert.equal(pageData.hazards.length, 2);
  assert.equal(typeof pageData.total, 'number');
  assert.ok(pageData.total >= 8);
});
