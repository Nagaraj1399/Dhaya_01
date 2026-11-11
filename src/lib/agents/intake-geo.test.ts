import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSubmission,
  computeTamperHash,
  resolveWardByPointInPolygon,
  runIntakeGeoAgent,
} from './intake-geo.ts';
import { BBMP_WARDS } from '../data/bbmp-wards.ts';

const VALID_TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Layer 1 [Geo-Resolution]: point clearly inside a ward resolves via point-in-polygon', () => {
  const indiranagar = resolveWardByPointInPolygon(12.9784, 77.6408, BBMP_WARDS);
  assert.ok(indiranagar);
  assert.equal(indiranagar.wardId, 80);
  assert.match(indiranagar.wardName, /Indiranagar/i);

  const koramangala = resolveWardByPointInPolygon(12.9352, 77.6245, BBMP_WARDS);
  assert.ok(koramangala);
  assert.equal(koramangala.wardId, 151);
});

test('Layer 1 [Geo-Resolution]: point exactly on a ward polygon boundary edge resolves deterministically without failing', () => {
  // Exact southern edge of Ward #80 Hoysala Nagar: lat = 12.968, lng = 77.640
  const boundaryPoint = resolveWardByPointInPolygon(12.968, 77.64, BBMP_WARDS);
  assert.ok(boundaryPoint, 'Boundary edge point must resolve to a valid BBMP ward');
  assert.equal(boundaryPoint.wardId, 80);
});

test('Layer 1 [Geo-Resolution]: point outside Bengaluru entirely is rejected and never silently assigned a ward', () => {
  // Mumbai coordinates
  const mumbaiWard = resolveWardByPointInPolygon(19.076, 72.8777, BBMP_WARDS);
  assert.equal(mumbaiWard, null);

  // Mysuru coordinates
  const mysuruAgent = runIntakeGeoAgent(
    {
      photoDataUrl: VALID_TINY_PNG,
      lat: 12.2958,
      lng: 76.6394,
      timestamp: new Date().toISOString(),
    },
    BBMP_WARDS
  );
  assert.equal(mysuruAgent.valid, false);
  assert.equal(mysuruAgent.ward, undefined);
  assert.match(mysuruAgent.error || '', /outside the Greater Bengaluru/i);
});

test('Layer 1 [Intake Validation]: rejects missing photo, non-image MIME upload, and oversized (>5MB) photo payload', () => {
  const missingPhoto = validateSubmission({
    photoDataUrl: '',
    lat: 12.9784,
    lng: 77.6408,
    timestamp: new Date().toISOString(),
  });
  assert.equal(missingPhoto.valid, false);
  assert.match(missingPhoto.error || '', /photo/i);

  // Non-image file upload (e.g., PDF or HTML disguised as data URL)
  const pdfUpload = validateSubmission({
    photoDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoK',
    lat: 12.9784,
    lng: 77.6408,
    timestamp: new Date().toISOString(),
  });
  assert.equal(pdfUpload.valid, false);
  assert.match(pdfUpload.error || '', /image/i);

  // Oversized photo payload (> 5MB)
  const oversizedPayload = 'data:image/jpeg;base64,' + 'A'.repeat(7_000_000);
  const oversizedResult = validateSubmission({
    photoDataUrl: oversizedPayload,
    lat: 12.9784,
    lng: 77.6408,
    timestamp: new Date().toISOString(),
  });
  assert.equal(oversizedResult.valid, false);
  assert.match(oversizedResult.error || '', /size|5MB|exceeds/i);
});

test('Layer 1 [Photo Hashing]: identical bytes produce identical SHA-256 hash; 1-byte difference produces completely different hash', () => {
  const rawPhotoBytesA = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  // 1-byte difference at the end of the base64 payload ('A' -> 'B')
  const rawPhotoBytesB = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggB==';

  const hash1 = computeTamperHash({
    photoDataUrl: rawPhotoBytesA,
    lat: 12.9784,
    lng: 77.6408,
    timestamp: '2026-11-10T08:00:00.000Z',
  });
  const hash2 = computeTamperHash({
    photoDataUrl: rawPhotoBytesA,
    lat: 12.9784,
    lng: 77.6408,
    timestamp: '2026-11-10T08:00:00.000Z',
  });
  const hashOneByteDiff = computeTamperHash({
    photoDataUrl: rawPhotoBytesB,
    lat: 12.9784,
    lng: 77.6408,
    timestamp: '2026-11-10T08:00:00.000Z',
  });

  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashOneByteDiff);
});

test('Layer 1 [Full Intake Agent]: returns hash, ward, and resolution method on valid Bengaluru input', () => {
  const result = runIntakeGeoAgent(
    {
      photoDataUrl: VALID_TINY_PNG,
      lat: 12.9304,
      lng: 77.6784,
      timestamp: '2026-11-10T08:30:00.000Z',
    },
    BBMP_WARDS
  );
  assert.equal(result.valid, true);
  assert.equal(result.ward?.wardId, 150);
  assert.equal(result.photoHash?.length, 64);
  assert.equal(result.resolvedMethod, 'point-in-polygon');
});
