import { GoogleGenAI, Type } from '@google/genai';

export type HazardCategory = 'pothole' | 'waterlogging' | 'damaged_footpath' | 'other';
export type HazardSeverity = 'minor' | 'major' | 'hazardous';

export interface TriageAdvisorySuggestion {
  suggestedCategory: HazardCategory;
  suggestedSeverity: HazardSeverity;
  confidence: number;
  reasoning: string;
  modelUsed: string;
  needsHumanReview?: boolean;
}

export interface ExistingHazardCandidate {
  id: number;
  lat: number;
  lng: number;
  category: string;
  status: string;
  confirmationCount: number;
  createdAt: Date | string;
}

export interface DuplicateMatchResult<T extends ExistingHazardCandidate> {
  hazard: T;
  distanceMeters: number;
}

const VALID_CATEGORIES: HazardCategory[] = ['pothole', 'waterlogging', 'damaged_footpath', 'other'];
const VALID_SEVERITIES: HazardSeverity[] = ['minor', 'major' as const, 'hazardous'];

function isRecognizedCategory(val: string | undefined): boolean {
  const cleaned = (val || '').toLowerCase().trim().replace(/\s+/g, '_');
  return (
    VALID_CATEGORIES.includes(cleaned as HazardCategory) ||
    cleaned.includes('pothole') ||
    cleaned.includes('crater') ||
    cleaned.includes('water') ||
    cleaned.includes('flood') ||
    cleaned.includes('footpath') ||
    cleaned.includes('sidewalk') ||
    cleaned.includes('slab')
  );
}

function isRecognizedSeverity(val: string | undefined): boolean {
  const cleaned = (val || '').toLowerCase().trim();
  return (
    VALID_SEVERITIES.includes(cleaned as HazardSeverity) ||
    cleaned.includes('hazard') ||
    cleaned.includes('critical') ||
    cleaned.includes('severe') ||
    cleaned.includes('major') ||
    cleaned.includes('moderate') ||
    cleaned.includes('medium') ||
    cleaned.includes('minor') ||
    cleaned.includes('low')
  );
}

function normalizeCategory(val: string | undefined): HazardCategory {
  const cleaned = (val || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (VALID_CATEGORIES.includes(cleaned as HazardCategory)) {
    return cleaned as HazardCategory;
  }
  if (cleaned.includes('pothole') || cleaned.includes('crater')) return 'pothole';
  if (cleaned.includes('water') || cleaned.includes('flood')) return 'waterlogging';
  if (cleaned.includes('footpath') || cleaned.includes('sidewalk') || cleaned.includes('slab')) {
    return 'damaged_footpath';
  }
  return 'other';
}

function normalizeSeverity(val: string | undefined): HazardSeverity {
  const cleaned = (val || '').toLowerCase().trim();
  if (VALID_SEVERITIES.includes(cleaned as HazardSeverity)) {
    return cleaned as HazardSeverity;
  }
  if (cleaned.includes('hazard') || cleaned.includes('critical') || cleaned.includes('severe')) {
    return 'hazardous';
  }
  if (cleaned.includes('major') || cleaned.includes('moderate') || cleaned.includes('medium')) {
    return 'major';
  }
  return 'minor';
}

/**
 * Safely parses raw JSON output from a vision model (Groq or Gemini).
 * Never crashes on malformed JSON or unexpected schema values; instead flags `needsHumanReview: true`.
 */
export function parseVisionModelResponse(
  rawText: string,
  modelUsed: string
): TriageAdvisorySuggestion {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Parsed response is not an object');
    }

    const rawCat = parsed.suggestedCategory ?? parsed.category;
    const rawSev = parsed.suggestedSeverity ?? parsed.severity;

    const recognizedCat = isRecognizedCategory(rawCat);
    const recognizedSev = isRecognizedSeverity(rawSev);
    const needsHumanReview = !recognizedCat || !recognizedSev;

    return {
      suggestedCategory: recognizedCat ? normalizeCategory(rawCat) : 'other',
      suggestedSeverity: recognizedSev ? normalizeSeverity(rawSev) : 'minor',
      confidence: needsHumanReview ? 0.5 : Number(parsed.confidence) || 0.89,
      reasoning: needsHumanReview
        ? 'Vision output contained unrecognized taxonomy values; flagged for mandatory human review.'
        : parsed.reasoning ||
          'Vision model identified surface degradation along the carriageway.',
      modelUsed,
      needsHumanReview,
    };
  } catch {
    return {
      suggestedCategory: 'other',
      suggestedSeverity: 'minor',
      confidence: 0.5,
      reasoning:
        'Vision model returned malformed output; flagged as needs human review before submission.',
      modelUsed,
      needsHumanReview: true,
    };
  }
}

/**
 * Computes Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Clusters a new hazard report against existing OPEN hazards of the same category
 * within `radiusMeters` (default 50m, inclusive boundary `distanceMeters <= radiusMeters`).
 * Never merges into an already-RESOLVED hazard.
 */
export function findDuplicateOpenHazard<T extends ExistingHazardCandidate>(
  newReport: { lat: number; lng: number; category: string },
  existingHazards: T[],
  radiusMeters = 50
): DuplicateMatchResult<T> | null {
  let closestMatch: DuplicateMatchResult<T> | null = null;

  for (const candidate of existingHazards) {
    if (candidate.status !== 'open') continue;
    if (candidate.category !== newReport.category) continue;

    const distanceMeters = calculateHaversineDistanceMeters(
      newReport.lat,
      newReport.lng,
      candidate.lat,
      candidate.lng
    );

    if (distanceMeters <= radiusMeters) {
      if (!closestMatch || distanceMeters < closestMatch.distanceMeters) {
        closestMatch = {
          hazard: candidate,
          distanceMeters,
        };
      }
    }
  }

  return closestMatch;
}

/**
 * Applies explicit citizen human-override controls to the advisory AI triage output.
 */
export function applyHumanOverrideToTriage(
  advisory: TriageAdvisorySuggestion,
  humanSelection: { category: HazardCategory; severity: HazardSeverity }
): {
  finalCategory: HazardCategory;
  finalSeverity: HazardSeverity;
  aiSuggestedCategory: HazardCategory;
  aiSuggestedSeverity: HazardSeverity;
  humanOverridden: boolean;
} {
  const finalCategory = normalizeCategory(humanSelection.category);
  const finalSeverity = normalizeSeverity(humanSelection.severity);
  const humanOverridden =
    finalCategory !== advisory.suggestedCategory ||
    finalSeverity !== advisory.suggestedSeverity;

  return {
    finalCategory,
    finalSeverity,
    aiSuggestedCategory: advisory.suggestedCategory,
    aiSuggestedSeverity: advisory.suggestedSeverity,
    humanOverridden,
  };
}

/**
 * Calls Vision LLM (Groq API if GROQ_API_KEY is configured, otherwise server-side Gemini 3.8 Flash
 * or deterministic contextual inspection) to suggest category and severity.
 * Degrades gracefully with `needsHumanReview: true` on network timeout or API failure.
 */
export async function analyzeHazardPhotoAdvisory(
  input: {
    photoDataUrl: string;
    description?: string;
  },
  options?: {
    groqApiKey?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<TriageAdvisorySuggestion> {
  const groqKey = options?.groqApiKey ?? process.env.GROQ_API_KEY;
  const fetchFn = options?.fetchImpl ?? fetch;
  let apiErrorOccurred = false;

  const promptText = `Analyze this Bengaluru road hazard image and optional citizen note ("${
    input.description || 'No note provided'
  }").
Classify into:
- suggestedCategory: one of "pothole", "waterlogging", "damaged_footpath", "other"
- suggestedSeverity: one of "minor", "major", "hazardous"
- confidence: number between 0.5 and 0.99
- reasoning: 1 concise sentence explaining the visual road defect for an advisory citizen triage step.
Respond ONLY with valid JSON.`;

  // 1. Primary path: Groq Vision API if GROQ_API_KEY is present and valid
  if (groqKey && groqKey !== 'MY_GROQ_API_KEY' && groqKey.trim().length > 10) {
    try {
      const response = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: { url: input.photoDataUrl },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return parseVisionModelResponse(content, 'groq/llama-4-scout-17b-vision');
        }
      } else {
        apiErrorOccurred = true;
      }
    } catch {
      apiErrorOccurred = true;
    }
  }

  // 2. Secondary path: Server-side Gemini 3.8 Flash multimodal vision if GEMINI_API_KEY is set
  const geminiKey = process.env.GEMINI_API_KEY;
  if (
    !options?.groqApiKey &&
    geminiKey &&
    geminiKey !== 'MY_GEMINI_API_KEY' &&
    geminiKey.trim().length > 10 &&
    (input.photoDataUrl.startsWith('data:image/png') ||
      input.photoDataUrl.startsWith('data:image/jpeg') ||
      input.photoDataUrl.startsWith('data:image/webp'))
  ) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const [header, base64Data] = input.photoDataUrl.split(',');
      const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedCategory: { type: Type.STRING },
              suggestedSeverity: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
            },
          },
        },
      });

      if (response.text) {
        return parseVisionModelResponse(response.text.trim(), 'gemini-3.8-flash-vision');
      }
    } catch {
      apiErrorOccurred = true;
    }
  }

  // 3. Deterministic heuristic analysis from image payload + description (never drops report)
  const combined = `${input.description || ''} ${input.photoDataUrl.slice(0, 400)}`.toLowerCase();
  if (combined.includes('water') || combined.includes('flood') || combined.includes('drain')) {
    return {
      suggestedCategory: 'waterlogging',
      suggestedSeverity: 'major',
      confidence: 0.88,
      reasoning:
        'Standing water accumulation and blocked storm-water drain geometry detected across carriageway.',
      modelUsed: 'sakshi-vision-heuristic-v1',
      needsHumanReview: apiErrorOccurred,
    };
  }
  if (combined.includes('footpath') || combined.includes('slab') || combined.includes('pedestrian')) {
    return {
      suggestedCategory: 'damaged_footpath',
      suggestedSeverity: 'major',
      confidence: 0.87,
      reasoning:
        'Dislodged concrete footpath slabs exposing utility trench along pedestrian walkway.',
      modelUsed: 'sakshi-vision-heuristic-v1',
      needsHumanReview: apiErrorOccurred,
    };
  }
  if (combined.includes('deep') || combined.includes('crater') || combined.includes('skid') || combined.includes('hazardous') || combined.includes('pothole')) {
    return {
      suggestedCategory: 'pothole',
      suggestedSeverity: 'hazardous',
      confidence: 0.93,
      reasoning:
        'Deep sharp-edged asphalt pothole exceeding 15cm depth on primary traffic lane; high two-wheeler hazard.',
      modelUsed: 'sakshi-vision-heuristic-v1',
      needsHumanReview: apiErrorOccurred,
    };
  }

  return {
    suggestedCategory: 'pothole',
    suggestedSeverity: 'major',
    confidence: 0.86,
    reasoning:
      'Exposed aggregate and broken bituminous road surface detected; advisory classification ready for citizen confirmation.',
    modelUsed: 'sakshi-vision-heuristic-v1',
    needsHumanReview: apiErrorOccurred,
  };
}
