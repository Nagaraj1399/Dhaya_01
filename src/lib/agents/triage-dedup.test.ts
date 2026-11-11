import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistanceMeters,
  findDuplicateOpenHazard,
  applyHumanOverrideToTriage,
  parseVisionModelResponse,
  analyzeHazardPhotoAdvisory,
} from './triage-dedup.ts';

test('Layer 1 [Dedup Clustering]: two reports 10m apart of the SAME category merge', () => {
  const existing = [
    {
      id: 101,
      lat: 12.9784,
      lng: 77.6408,
      category: 'pothole',
      status: 'open',
      confirmationCount: 3,
      createdAt: new Date('2026-10-20T08:00:00.000Z'),
    },
  ];
  // ~10m north (0.00009 deg lat is ~10.01m)
  const d = calculateHaversineDistanceMeters(12.9784, 77.6408, 12.97849, 77.6408);
  assert.ok(d >= 9.5 && d <= 10.5, `Expected ~10m, got ${d}m`);

  const match = findDuplicateOpenHazard(
    { lat: 12.97849, lng: 77.6408, category: 'pothole' },
    existing,
    50
  );
  assert.ok(match);
  assert.equal(match.hazard.id, 101);
});

test('Layer 1 [Dedup Clustering]: two reports 10m apart of DIFFERENT categories do NOT merge', () => {
  const existing = [
    {
      id: 101,
      lat: 12.9784,
      lng: 77.6408,
      category: 'pothole',
      status: 'open',
      confirmationCount: 3,
      createdAt: new Date('2026-10-20T08:00:00.000Z'),
    },
  ];

  const match = findDuplicateOpenHazard(
    { lat: 12.97849, lng: 77.6408, category: 'waterlogging' },
    existing,
    50
  );
  assert.equal(match, null);
});

test('Layer 1 [Dedup Clustering]: explicit 50m radius boundary behavior (<= 50.00m merges, > 50.00m does not merge)', () => {
  const baseLat = 12.9784;
  const baseLng = 77.6408;
  // 0.00044966 deg latitude is ~50.00m on Earth sphere (R = 6371000m)
  const latInside50m = baseLat + 0.0004495; // 49.98m
  const latOutside50m = baseLat + 0.0004505; // 50.09m

  const distInside = calculateHaversineDistanceMeters(baseLat, baseLng, latInside50m, baseLng);
  const distOutside = calculateHaversineDistanceMeters(baseLat, baseLng, latOutside50m, baseLng);

  assert.ok(distInside <= 50, `Expected <= 50m, got ${distInside}m`);
  assert.ok(distOutside > 50, `Expected > 50m, got ${distOutside}m`);

  const existing = [
    {
      id: 201,
      lat: baseLat,
      lng: baseLng,
      category: 'pothole',
      status: 'open',
      confirmationCount: 2,
      createdAt: new Date('2026-10-20T08:00:00.000Z'),
    },
  ];

  const matchAtBoundary = findDuplicateOpenHazard(
    { lat: latInside50m, lng: baseLng, category: 'pothole' },
    existing,
    50
  );
  assert.ok(matchAtBoundary, 'Report at <= 50.00m boundary must merge');
  assert.equal(matchAtBoundary.hazard.id, 201);

  const noMatchBeyondBoundary = findDuplicateOpenHazard(
    { lat: latOutside50m, lng: baseLng, category: 'pothole' },
    existing,
    50
  );
  assert.equal(noMatchBeyondBoundary, null, 'Report at > 50.00m boundary must not merge');
});

test('Layer 1 [Dedup Clustering]: report against an already-RESOLVED hazard must NEVER merge into a closed record', () => {
  const existing = [
    {
      id: 301,
      lat: 12.9784,
      lng: 77.6408,
      category: 'pothole',
      status: 'resolved',
      confirmationCount: 5,
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
    },
  ];

  // Even at identical coordinates (0m distance), resolved hazards must not merge
  const match = findDuplicateOpenHazard(
    { lat: 12.9784, lng: 77.6408, category: 'pothole' },
    existing,
    50
  );
  assert.equal(match, null);
});

test('Layer 1 [Vision Response Parsing]: handles valid JSON, malformed JSON, and unexpected schema by setting needsHumanReview', () => {
  const validParsed = parseVisionModelResponse(
    JSON.stringify({
      suggestedCategory: 'waterlogging',
      suggestedSeverity: 'hazardous',
      confidence: 0.94,
      reasoning: 'Submerged carriageway lane.',
    }),
    'groq/llama-4-scout-17b-vision'
  );
  assert.equal(validParsed.suggestedCategory, 'waterlogging');
  assert.equal(validParsed.suggestedSeverity, 'hazardous');
  assert.equal(validParsed.needsHumanReview, false);

  // Malformed non-JSON string from LLM
  const malformedParsed = parseVisionModelResponse(
    '<<<NOT_VALID_JSON_AT_ALL',
    'groq/llama-4-scout-17b-vision'
  );
  assert.equal(malformedParsed.needsHumanReview, true);
  assert.equal(malformedParsed.suggestedCategory, 'other');
  assert.match(malformedParsed.reasoning, /human review/i);

  // Unexpected category/severity values
  const unexpectedValues = parseVisionModelResponse(
    JSON.stringify({
      suggestedCategory: 'meteor_strike',
      suggestedSeverity: 'apocalyptic',
    }),
    'groq/llama-4-scout-17b-vision'
  );
  assert.equal(unexpectedValues.needsHumanReview, true);
  assert.equal(unexpectedValues.suggestedCategory, 'other');
});

test('Layer 1 [Vision API Timeout / Error]: degrades gracefully to needsHumanReview without dropping report when Groq API times out or errors', async () => {
  const failingFetch = async () => {
    throw new Error('Request timed out after 5000ms (AbortError)');
  };

  const result = await analyzeHazardPhotoAdvisory(
    {
      photoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      description: 'Deep pothole near metro pillar',
    },
    {
      groqApiKey: 'gsk_test_simulated_key_for_timeout_check',
      fetchImpl: failingFetch as unknown as typeof fetch,
    }
  );

  assert.ok(result, 'Must return a fallback advisory object and never throw');
  assert.equal(result.needsHumanReview, true);
  assert.equal(result.suggestedCategory, 'pothole');
});

test('Layer 1 [Human Override]: advisory AI suggestion respects explicit citizen override', () => {
  const aiSuggestion = {
    suggestedCategory: 'pothole' as const,
    suggestedSeverity: 'major' as const,
    confidence: 0.91,
    reasoning: 'Deep asphalt crater visible along carriageway edge.',
    modelUsed: 'llama-3.2-11b-vision-preview',
    needsHumanReview: false,
  };

  const overridden = applyHumanOverrideToTriage(aiSuggestion, {
    category: 'damaged_footpath',
    severity: 'hazardous',
  });
  assert.equal(overridden.finalCategory, 'damaged_footpath');
  assert.equal(overridden.finalSeverity, 'hazardous');
  assert.equal(overridden.humanOverridden, true);
});

test('Layer 1 [Vision API HTTP 200 & 503 + Heuristic Branches]: parses Groq 200 OK response and falls back across waterlogging, footpath, and default heuristics on 503', async () => {
  // 1. Groq HTTP 200 OK with synonym labels ("sidewalk", "critical")
  const okFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestedCategory: 'broken sidewalk slab',
              suggestedSeverity: 'critical severity',
              confidence: 0.92,
              reasoning: 'Broken pedestrian slab over drain.',
            }),
          },
        },
      ],
    }),
  });

  const groqOk = await analyzeHazardPhotoAdvisory(
    {
      photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      description: 'Footpath slab broken',
    },
    {
      groqApiKey: 'gsk_test_simulated_valid_key_12345',
      fetchImpl: okFetch as unknown as typeof fetch,
    }
  );
  assert.equal(groqOk.suggestedCategory, 'damaged_footpath');
  assert.equal(groqOk.suggestedSeverity, 'hazardous');
  assert.equal(groqOk.needsHumanReview, false);

  // 2. Groq HTTP 503 Service Unavailable -> falls back to waterlogging heuristic with needsHumanReview=true
  const http503Fetch = async () => ({
    ok: false,
    status: 503,
  });

  const waterFallback = await analyzeHazardPhotoAdvisory(
    {
      photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      description: 'Severe water drain overflow',
    },
    {
      groqApiKey: 'gsk_test_simulated_valid_key_12345',
      fetchImpl: http503Fetch as unknown as typeof fetch,
    }
  );
  assert.equal(waterFallback.suggestedCategory, 'waterlogging');
  assert.equal(waterFallback.needsHumanReview, true);

  // 3. Footpath heuristic branch
  const footpathFallback = await analyzeHazardPhotoAdvisory(
    {
      photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      description: 'Broken footpath pedestrian slab',
    },
    {
      groqApiKey: 'gsk_test_simulated_valid_key_12345',
      fetchImpl: http503Fetch as unknown as typeof fetch,
    }
  );
  assert.equal(footpathFallback.suggestedCategory, 'damaged_footpath');
  assert.equal(footpathFallback.needsHumanReview, true);

  // 4. Default heuristic branch (no keywords) + moderate synonym in parseVisionModelResponse
  const defaultFallback = await analyzeHazardPhotoAdvisory(
    {
      photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      description: 'Road issue near junction',
    },
    {
      groqApiKey: 'gsk_test_simulated_valid_key_12345',
      fetchImpl: http503Fetch as unknown as typeof fetch,
    }
  );
  assert.equal(defaultFallback.suggestedCategory, 'pothole');
  assert.equal(defaultFallback.suggestedSeverity, 'major');
  assert.equal(defaultFallback.needsHumanReview, true);

  const moderateParsed = parseVisionModelResponse(
    JSON.stringify({ category: 'pothole crater', severity: 'moderate' }),
    'test-model'
  );
  assert.equal(moderateParsed.suggestedCategory, 'pothole');
  assert.equal(moderateParsed.suggestedSeverity, 'major');

  const nullParsed = parseVisionModelResponse('null', 'test-model');
  assert.equal(nullParsed.needsHumanReview, true);
});

