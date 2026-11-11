import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleIntakePreviewRequest,
  handleTriageAdvisoryRequest,
  handleOrchestrateSpecRequest,
  filterAndPaginateHazards,
} from './api-handlers.ts';

test('Layer 1 [API Handler]: /api/agents/intake-preview validates GPS and returns SHA-256 hash + BBMP ward', () => {
  const validRes = handleIntakePreviewRequest({
    photoDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    lat: 12.9784,
    lng: 77.6408,
    timestamp: '2026-11-10T08:00:00.000Z',
  });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body.valid, true);
  assert.equal(validRes.body.ward?.wardId, 80);
  assert.equal(validRes.body.photoHash?.length, 64);

  const invalidRes = handleIntakePreviewRequest({
    photoDataUrl: '',
    lat: 12.9784,
    lng: 77.6408,
    timestamp: '2026-11-10T08:00:00.000Z',
  });
  assert.equal(invalidRes.status, 400);
  assert.equal(invalidRes.body.valid, false);
});

test('Layer 1 [API Handler]: /api/agents/triage returns advisory classification and nearest 50m duplicate candidate', async () => {
  const res = await handleTriageAdvisoryRequest(
    {
      photoDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      description: 'Deep pothole crater causing two-wheeler skids',
      lat: 12.97845,
      lng: 77.64085,
    },
    [
      {
        id: 501,
        lat: 12.9784,
        lng: 77.6408,
        category: 'pothole',
        status: 'open',
        confirmationCount: 4,
        createdAt: new Date('2026-10-15T08:00:00.000Z'),
      },
    ]
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.advisoryOnly, true);
  assert.equal(res.body.suggestion.suggestedCategory, 'pothole');
  assert.ok(res.body.potentialDuplicate);
  assert.equal(res.body.potentialDuplicate?.hazard.id, 501);

  const missingPhotoRes = await handleTriageAdvisoryRequest(
    {
      photoDataUrl: '',
      lat: 12.9784,
      lng: 77.6408,
    },
    []
  );
  assert.equal(missingPhotoRes.status, 400);
});

test('Layer 1 [API Handler]: filterAndPaginateHazards filters by wardId, status, category, and paginates accurately', () => {
  const sample = [
    { id: 1, wardId: 80, status: 'open', category: 'pothole' },
    { id: 2, wardId: 80, status: 'resolved', category: 'waterlogging' },
    { id: 3, wardId: 151, status: 'open', category: 'pothole' },
  ];

  const byWardAndStatus = filterAndPaginateHazards(sample, {
    wardId: '80',
    status: 'open',
  });
  assert.equal(byWardAndStatus.total, 1);
  assert.equal(byWardAndStatus.hazards[0].id, 1);

  const paginated = filterAndPaginateHazards(sample, {
    limit: '2',
    offset: '1',
  });
  assert.equal(paginated.total, 3);
  assert.equal(paginated.hazards.length, 2);
  assert.equal(paginated.hazards[0].id, 2);
});

test('Layer 1 [API Handler]: /api/agents/orchestrate-spec returns 3-agent SOP specification', () => {
  const res = handleOrchestrateSpecRequest();
  assert.equal(res.status, 200);
  assert.equal(res.body.agents.length, 3);
});
