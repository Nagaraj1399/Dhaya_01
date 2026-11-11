import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDaysUnresolved,
  assembleEvidencePacket,
  KARNATAKA_HC_2019_CITATION,
  NON_FILING_DISCLAIMER,
} from './evidence-packet.ts';

test('Layer 1 [Evidence Packet Agent]: computes accurate unresolved days from real timestamps', () => {
  const created = new Date('2026-10-21T08:00:00.000Z');
  const now = new Date('2026-11-10T08:00:00.000Z');
  const days = computeDaysUnresolved(created, null, now);
  assert.equal(days, 20);
});

test('Layer 1 [Evidence Packet Agent]: assembles verifiable packet with SHA-256 hashes, 2019 HC ruling, and explicit non-filing disclaimer', () => {
  const packet = assembleEvidencePacket({
    hazard: {
      id: 42,
      lat: 12.9784,
      lng: 77.6408,
      wardId: 80,
      category: 'pothole',
      severity: 'hazardous',
      aiSuggestedCategory: 'pothole',
      aiSuggestedSeverity: 'major',
      humanOverridden: true,
      status: 'open',
      createdAt: new Date('2026-10-15T06:30:00.000Z'),
      resolvedAt: null,
      photoUrl: 'data:image/png;base64,ABC',
      photoHash: 'a'.repeat(64),
      description: '2-foot deep crater near 100 Feet Road junction causing two-wheeler skids',
      confirmationCount: 4,
      deviceId: 'dev-citizen-01',
      isSeed: false,
    },
    ward: {
      wardId: 80,
      wardName: 'Hoysala Nagar (Indiranagar)',
      zone: 'East Zone',
      officerName: 'Er. S. Vishwanath',
      officerPhone: '+91-80-22975803',
      officerEmail: 'aee.indiranagar@bbmp.gov.in',
      officerContact: 'Er. S. Vishwanath · +91-80-22975803',
    },
    confirmations: [
      {
        id: 1,
        hazardId: 42,
        createdAt: new Date('2026-10-18T09:15:00.000Z'),
        photoUrl: 'data:image/png;base64,DEF',
        photoHash: 'b'.repeat(64),
        note: 'Still open and filled with rainwater',
        deviceId: 'dev-citizen-02',
      },
    ],
    generatedAt: new Date('2026-11-10T08:00:00.000Z'),
  });

  assert.equal(packet.hazardId, 42);
  assert.equal(packet.daysUnresolved, 26);
  assert.equal(packet.ward.wardId, 80);
  assert.equal(packet.evidenceChain.length, 2); // Initial report + 1 corroboration
  assert.equal(packet.evidenceChain[0].sha256Hash, 'a'.repeat(64));
  assert.equal(packet.evidenceChain[1].sha256Hash, 'b'.repeat(64));
  assert.equal(packet.legalBasis.citation, KARNATAKA_HC_2019_CITATION);
  assert.equal(packet.legalBasis.disclaimer, NON_FILING_DISCLAIMER);
  assert.match(packet.legalBasis.disclaimer, /evidence summary to support your own claim, not an automatic filing/i);
  assert.equal(packet.packetIntegrityHash.length, 64);
});

test('Layer 1 [Evidence Packet Agent]: fails cleanly when hazard has no photos or missing SHA-256 hash', () => {
  assert.throws(
    () =>
      assembleEvidencePacket({
        hazard: {
          id: 99,
          lat: 12.9784,
          lng: 77.6408,
          wardId: 80,
          category: 'pothole',
          severity: 'major',
          aiSuggestedCategory: 'pothole',
          aiSuggestedSeverity: 'major',
          humanOverridden: false,
          status: 'open',
          createdAt: new Date(),
          resolvedAt: null,
          photoUrl: '',
          photoHash: '',
          description: 'Corrupted record without photo',
          confirmationCount: 1,
          deviceId: 'dev-01',
          isSeed: false,
        },
        ward: {
          wardId: 80,
          wardName: 'Hoysala Nagar (Indiranagar)',
          zone: 'East Zone',
          officerName: 'Er. S. Vishwanath',
          officerPhone: '+91-80-22975803',
          officerEmail: 'aee.indiranagar@bbmp.gov.in',
          officerContact: 'Er. S. Vishwanath · +91-80-22975803',
        },
        confirmations: [],
      }),
    /missing required photographic proof/i
  );
});
