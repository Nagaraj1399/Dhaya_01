import crypto from 'node:crypto';
import { BBMP_WARDS, BBMPWardData, BENGALURU_BOUNDS } from '../data/bbmp-wards.ts';

export interface IntakeSubmissionInput {
  photoDataUrl: string;
  lat: number;
  lng: number;
  timestamp: string;
  description?: string;
}

export interface IntakeValidationResult {
  valid: boolean;
  error?: string;
  photoHash?: string;
  ward?: BBMPWardData;
  resolvedMethod?: 'point-in-polygon' | 'nearest-ward-boundary';
}

const MAX_PHOTO_DATA_URL_LENGTH = 5 * 1024 * 1024; // 5MB ceiling
const ALLOWED_IMAGE_MIME_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
  'data:image/svg+xml;base64,',
];

/**
 * Validates that a hazard submission has:
 * 1. Non-empty, valid image MIME data URL within the 5MB size limit
 * 2. Plausible GPS coordinates within Greater Bengaluru Authority / BBMP bounding box
 * 3. Sane timestamp (valid ISO date, not in the future by >10 minutes, not older than 2019)
 */
export function validateSubmission(input: IntakeSubmissionInput): {
  valid: boolean;
  error?: string;
} {
  if (
    !input.photoDataUrl ||
    typeof input.photoDataUrl !== 'string' ||
    input.photoDataUrl.trim().length < 24
  ) {
    return {
      valid: false,
      error: 'A valid hazard photograph is required to establish tamper-evident proof.',
    };
  }

  if (input.photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
    return {
      valid: false,
      error: 'Uploaded photo size exceeds the maximum 5MB evidence limit.',
    };
  }

  const normalizedHeader = input.photoDataUrl.slice(0, 40).toLowerCase();
  const isAllowedImage = ALLOWED_IMAGE_MIME_PREFIXES.some((prefix) =>
    normalizedHeader.startsWith(prefix)
  );
  if (!isAllowedImage) {
    return {
      valid: false,
      error: 'Invalid file format: only image uploads (JPEG, PNG, WebP, SVG) are permitted.',
    };
  }

  if (
    typeof input.lat !== 'number' ||
    typeof input.lng !== 'number' ||
    Number.isNaN(input.lat) ||
    Number.isNaN(input.lng)
  ) {
    return {
      valid: false,
      error: 'Valid GPS coordinates (latitude and longitude) are required.',
    };
  }

  if (
    input.lat < BENGALURU_BOUNDS.minLat ||
    input.lat > BENGALURU_BOUNDS.maxLat ||
    input.lng < BENGALURU_BOUNDS.minLng ||
    input.lng > BENGALURU_BOUNDS.maxLng
  ) {
    return {
      valid: false,
      error: `GPS coordinates (${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}) are outside the Greater Bengaluru / BBMP jurisdiction bounding box (${BENGALURU_BOUNDS.minLat}–${BENGALURU_BOUNDS.maxLat} N, ${BENGALURU_BOUNDS.minLng}–${BENGALURU_BOUNDS.maxLng} E).`,
    };
  }

  const parsedTime = Date.parse(input.timestamp);
  if (Number.isNaN(parsedTime)) {
    return {
      valid: false,
      error: 'Submission timestamp is invalid or malformed.',
    };
  }

  const minAllowedDate = new Date('2019-01-01T00:00:00.000Z').getTime();
  const maxAllowedDate = Date.now() + 10 * 60 * 1000;
  if (parsedTime < minAllowedDate || parsedTime > maxAllowedDate) {
    return {
      valid: false,
      error: 'Submission timestamp must be a valid contemporary date and not in the future.',
    };
  }

  return { valid: true };
}

/**
 * Computes a deterministic SHA-256 hash over the raw photo bytes + canonical GPS & timestamp metadata
 * BEFORE any lossy resize or compression step.
 */
export function computeTamperHash(input: {
  photoDataUrl: string;
  lat: number;
  lng: number;
  timestamp: string;
}): string {
  const base64Payload = input.photoDataUrl.includes(',')
    ? input.photoDataUrl.split(',')[1]
    : input.photoDataUrl;

  const canonicalMetadata = JSON.stringify({
    lat: Number(input.lat.toFixed(6)),
    lng: Number(input.lng.toFixed(6)),
    timestamp: new Date(input.timestamp).toISOString(),
  });

  const hash = crypto.createHash('sha256');
  hash.update(base64Payload, 'utf8');
  hash.update('::SAKSHI_METADATA::', 'utf8');
  hash.update(canonicalMetadata, 'utf8');
  return hash.digest('hex');
}

function isPointOnLineSegment(
  lat: number,
  lng: number,
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): boolean {
  const epsilon = 1e-9;
  const squaredLength = (lng2 - lng1) * (lng2 - lng1) + (lat2 - lat1) * (lat2 - lat1);
  if (squaredLength < 1e-16) {
    return Math.hypot(lat - lat1, lng - lng1) <= epsilon;
  }

  const crossProduct = (lat - lat1) * (lng2 - lng1) - (lng - lng1) * (lat2 - lat1);
  if (Math.abs(crossProduct) > epsilon) return false;

  const dotProduct = (lng - lng1) * (lng2 - lng1) + (lat - lat1) * (lat2 - lat1);
  if (dotProduct < -epsilon) return false;
  if (dotProduct - squaredLength > epsilon) return false;

  return true;
}

/**
 * Ray-casting point-in-polygon check for GeoJSON Polygon ring [[lng, lat], ...].
 * Explicitly treats points lying directly on a polygon boundary edge as inside.
 */
export function isPointInPolygonRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; // lng
    const yi = ring[i][1]; // lat
    const xj = ring[j][0];
    const yj = ring[j][1];

    if (isPointOnLineSegment(lat, lng, xi, yi, xj, yj)) {
      return true;
    }

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Resolves a (lat, lng) coordinate to a BBMP / Greater Bengaluru Authority ward
 * via point-in-polygon against real ward boundary polygons.
 * Returns null if outside the Greater Bengaluru bounding box.
 */
export function resolveWardByPointInPolygon(
  lat: number,
  lng: number,
  wards: BBMPWardData[] = BBMP_WARDS
): BBMPWardData | null {
  if (
    lat < BENGALURU_BOUNDS.minLat ||
    lat > BENGALURU_BOUNDS.maxLat ||
    lng < BENGALURU_BOUNDS.minLng ||
    lng > BENGALURU_BOUNDS.maxLng
  ) {
    return null;
  }

  for (const ward of wards) {
    const outerRing = ward.geometry.coordinates[0];
    if (outerRing && isPointInPolygonRing(lat, lng, outerRing)) {
      return ward;
    }
  }

  // Fallback for interstitial roads inside Bengaluru bounding box
  if (wards.length > 0) {
    let closest = wards[0];
    let minSqDist = Infinity;
    for (const ward of wards) {
      const dLat = lat - ward.center.lat;
      const dLng = lng - ward.center.lng;
      const sqDist = dLat * dLat + dLng * dLng;
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        closest = ward;
      }
    }
    return closest;
  }

  return null;
}

/**
 * Agent 1: Full Intake & Geo-Resolution Agent pipeline execution
 */
export function runIntakeGeoAgent(
  input: IntakeSubmissionInput,
  wards: BBMPWardData[] = BBMP_WARDS
): IntakeValidationResult {
  const validation = validateSubmission(input);
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
    };
  }

  const photoHash = computeTamperHash({
    photoDataUrl: input.photoDataUrl,
    lat: input.lat,
    lng: input.lng,
    timestamp: input.timestamp,
  });

  let exactMatch: BBMPWardData | null = null;
  for (const ward of wards) {
    const outerRing = ward.geometry.coordinates[0];
    if (outerRing && isPointInPolygonRing(input.lat, input.lng, outerRing)) {
      exactMatch = ward;
      break;
    }
  }

  const ward = exactMatch || resolveWardByPointInPolygon(input.lat, input.lng, wards);
  if (!ward) {
    return {
      valid: false,
      error: 'Unable to resolve coordinates to a valid BBMP / Greater Bengaluru ward.',
    };
  }

  return {
    valid: true,
    photoHash,
    ward,
    resolvedMethod: exactMatch ? 'point-in-polygon' : 'nearest-ward-boundary',
  };
}
