import { BBMP_WARDS } from './data/bbmp-wards.ts';
import { runIntakeGeoAgent } from './agents/intake-geo.ts';
import {
  analyzeHazardPhotoAdvisory,
  ExistingHazardCandidate,
  findDuplicateOpenHazard,
} from './agents/triage-dedup.ts';
import { SAKSHI_ORCHESTRATE_SPEC } from './agents/orchestrate-spec.ts';

export function handleIntakePreviewRequest(body: {
  photoDataUrl: string;
  lat: number;
  lng: number;
  timestamp?: string;
}) {
  const result = runIntakeGeoAgent(
    {
      photoDataUrl: body.photoDataUrl || '',
      lat: Number(body.lat),
      lng: Number(body.lng),
      timestamp: body.timestamp || new Date().toISOString(),
    },
    BBMP_WARDS
  );

  if (!result.valid) {
    return {
      status: 400,
      body: result,
    };
  }

  return {
    status: 200,
    body: result,
  };
}

export async function handleTriageAdvisoryRequest<T extends ExistingHazardCandidate>(
  body: {
    photoDataUrl: string;
    description?: string;
    lat: number;
    lng: number;
    radiusMeters?: number;
  },
  existingHazards: T[]
) {
  if (!body.photoDataUrl) {
    return {
      status: 400,
      body: {
        error: 'photoDataUrl is required for advisory vision triage.',
      },
    };
  }

  const suggestion = await analyzeHazardPhotoAdvisory({
    photoDataUrl: body.photoDataUrl,
    description: body.description,
  });

  const potentialDuplicate =
    typeof body.lat === 'number' && typeof body.lng === 'number'
      ? findDuplicateOpenHazard(
          {
            lat: Number(body.lat),
            lng: Number(body.lng),
            category: suggestion.suggestedCategory,
          },
          existingHazards,
          body.radiusMeters ?? 50
        )
      : null;

  return {
    status: 200,
    body: {
      advisoryOnly: true,
      humanOverrideRequiredBeforeSave: true,
      suggestion,
      potentialDuplicate,
    },
  };
}

export function filterAndPaginateHazards<
  T extends { wardId: number; status: string; category?: string }
>(
  records: T[],
  query: {
    wardId?: string | number;
    status?: string;
    category?: string;
    limit?: string | number;
    offset?: string | number;
  }
): { hazards: T[]; total: number; limit: number | null; offset: number } {
  let filtered = records;

  if (query.wardId !== undefined && query.wardId !== '' && query.wardId !== 'all') {
    const targetWard = Number(query.wardId);
    if (!Number.isNaN(targetWard)) {
      filtered = filtered.filter((r) => r.wardId === targetWard);
    }
  }

  if (query.status && query.status !== 'all') {
    filtered = filtered.filter((r) => r.status === query.status);
  }

  if (query.category && query.category !== 'all') {
    filtered = filtered.filter((r) => r.category === query.category);
  }

  const total = filtered.length;
  const offset =
    query.offset !== undefined && !Number.isNaN(Number(query.offset))
      ? Math.max(0, Number(query.offset))
      : 0;

  const limit =
    query.limit !== undefined && !Number.isNaN(Number(query.limit))
      ? Math.max(1, Number(query.limit))
      : null;

  const sliced =
    limit !== null ? filtered.slice(offset, offset + limit) : filtered.slice(offset);

  return {
    hazards: sliced,
    total,
    limit,
    offset,
  };
}

export function handleOrchestrateSpecRequest() {
  return {
    status: 200,
    body: SAKSHI_ORCHESTRATE_SPEC,
  };
}
