/**
 * DEMO SEED DATA — CLEARLY LABELED AS SEED DATA (NOT REAL CITIZEN SUBMISSIONS)
 * Used to populate the BBMP wards, map pins, confirmations, and ward accountability
 * dashboard on initial database bootstrap so the demo is immediately interactive.
 */

export interface SeedHazardDefinition {
  lat: number;
  lng: number;
  wardId: number;
  category: 'pothole' | 'waterlogging' | 'damaged_footpath' | 'other';
  severity: 'minor' | 'major' | 'hazardous';
  aiSuggestedCategory: 'pothole' | 'waterlogging' | 'damaged_footpath' | 'other';
  aiSuggestedSeverity: 'minor' | 'major' | 'hazardous';
  humanOverridden: boolean;
  status: 'open' | 'resolved' | 'disputed';
  daysAgoCreated: number;
  daysAgoResolved: number | null;
  description: string;
  confirmationCount: number;
  deviceId: string;
  roadLocationLabel: string;
  confirmations: {
    daysAgo: number;
    deviceId: string;
    note: string;
  }[];
}

export function createRoadHazardSvgDataUrl(params: {
  title: string;
  category: string;
  severity: string;
  lat: number;
  lng: number;
  timestampIso: string;
  wardName: string;
}): string {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const safeTitle = escapeXml(params.title.slice(0, 68));
  const safeWard = escapeXml(params.wardName);
  const safeCategory = escapeXml(params.category.toUpperCase());
  const safeSeverity = escapeXml(params.severity.toUpperCase());

  const accentColor =
    params.severity === 'hazardous'
      ? '#DC2626'
      : params.severity === 'major'
      ? '#D97706'
      : '#2563EB';

  const visualGraphic =
    params.category === 'waterlogging'
      ? `<ellipse cx="400" cy="310" rx="230" ry="75" fill="#1E3A8A" fill-opacity="0.78" stroke="#60A5FA" stroke-width="2.5"/>
         <path d="M 220 305 Q 310 290 400 305 T 580 305" fill="none" stroke="#93C5FD" stroke-width="3" stroke-linecap="round"/>
         <path d="M 260 330 Q 350 315 440 330 T 550 330" fill="none" stroke="#BFDBFE" stroke-width="2" stroke-linecap="round"/>`
      : params.category === 'damaged_footpath'
      ? `<polygon points="180,260 340,240 370,350 160,365" fill="#64748B" stroke="#CBD5E1" stroke-width="2"/>
         <polygon points="355,255 540,275 515,370 375,355" fill="#475569" stroke="#94A3B8" stroke-width="2"/>
         <polygon points="335,280 415,295 395,355 320,340" fill="#0F172A" stroke="${accentColor}" stroke-width="2.5"/>`
      : `<polygon points="250,285 335,250 465,260 535,305 485,365 345,375 265,340" fill="#090D16" stroke="${accentColor}" stroke-width="3"/>
         <polygon points="285,300 350,272 445,280 490,312 450,350 355,355" fill="#1E293B"/>
         <path d="M 190 265 L 250 285 M 535 305 L 610 290 M 345 375 L 310 420" stroke="#475569" stroke-width="2.5"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="100%" stop-color="#1E293B"/>
      </linearGradient>
      <linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#334155"/>
        <stop offset="100%" stop-color="#0F172A"/>
      </linearGradient>
    </defs>
    <rect width="800" height="190" fill="url(#sky)"/>
    <rect y="190" width="800" height="310" fill="url(#asphalt)"/>
    <line x1="0" y1="190" x2="800" y2="190" stroke="#475569" stroke-width="2"/>
    <line x1="90" y1="500" x2="310" y2="190" stroke="#94A3B8" stroke-width="3" stroke-dasharray="18,14" stroke-opacity="0.45"/>
    <line x1="710" y1="500" x2="490" y2="190" stroke="#94A3B8" stroke-width="3" stroke-dasharray="18,14" stroke-opacity="0.45"/>
    ${visualGraphic}
    <!-- Forensic Measurement Reticle -->
    <rect x="210" y="225" width="380" height="175" fill="none" stroke="${accentColor}" stroke-width="2" stroke-dasharray="8,6"/>
    <line x1="400" y1="210" x2="400" y2="240" stroke="${accentColor}" stroke-width="2"/>
    <line x1="400" y1="385" x2="400" y2="415" stroke="${accentColor}" stroke-width="2"/>
    <!-- Top Forensic Stamp Bar -->
    <rect x="20" y="18" width="760" height="54" rx="6" fill="#090D16" fill-opacity="0.86" stroke="#334155" stroke-width="1"/>
    <text x="38" y="41" fill="#F8FAFC" font-family="monospace" font-size="14" font-weight="bold">SAKSHI FORENSIC ROAD RECORD // ${safeCategory} (${safeSeverity})</text>
    <text x="38" y="60" fill="#94A3B8" font-family="monospace" font-size="12">${safeTitle}</text>
    <!-- Bottom GPS & Timestamp Telemetry Bar -->
    <rect x="20" y="432" width="760" height="50" rx="6" fill="#090D16" fill-opacity="0.88" stroke="#334155" stroke-width="1"/>
    <text x="38" y="454" fill="#E2E8F0" font-family="monospace" font-size="12">GPS: ${params.lat.toFixed(5)} N, ${params.lng.toFixed(5)} E  |  WARD: ${safeWard}</text>
    <text x="38" y="472" fill="#38BDF8" font-family="monospace" font-size="11">CAPTURED UTC: ${params.timestampIso}  |  EVIDENCE CHAIN: VERIFIED</text>
  </svg>`;

  const base64 = btoa(
    encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g, (_match, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
  return `data:image/svg+xml;base64,${base64}`;
}

// Clearly marked DEMO SEED HAZARDS for initial database state
export const DEMO_SEED_HAZARDS: SeedHazardDefinition[] = [
  {
    lat: 12.9784,
    lng: 77.6408,
    wardId: 80,
    category: 'pothole',
    severity: 'hazardous',
    aiSuggestedCategory: 'pothole',
    aiSuggestedSeverity: 'hazardous',
    humanOverridden: false,
    status: 'open',
    daysAgoCreated: 34,
    daysAgoResolved: null,
    roadLocationLabel: '100 Feet Road & CMH Road Metro Junction, Indiranagar',
    description:
      '[DEMO SEED] Deep 18cm exposed-aggregate crater on 100 Feet Road approach lane causing two-wheeler skids during peak evening traffic.',
    confirmationCount: 6,
    deviceId: 'seed-device-indiranagar-01',
    confirmations: [
      {
        daysAgo: 28,
        deviceId: 'seed-citizen-blreast-11',
        note: 'Crater has widened after overnight rain; two delivery riders nearly lost balance.',
      },
      {
        daysAgo: 19,
        deviceId: 'seed-citizen-blreast-24',
        note: 'Still completely unattended by BBMP East Zone road maintenance crew.',
      },
      {
        daysAgo: 9,
        deviceId: 'seed-citizen-blreast-39',
        note: 'Measured 1.1m width across main left carriageway.',
      },
    ],
  },
  {
    lat: 12.9304,
    lng: 77.6784,
    wardId: 150,
    category: 'waterlogging',
    severity: 'hazardous',
    aiSuggestedCategory: 'waterlogging',
    aiSuggestedSeverity: 'major',
    humanOverridden: true,
    status: 'open',
    daysAgoCreated: 41,
    daysAgoResolved: null,
    roadLocationLabel: 'Outer Ring Road Service Lane near EcoSpace Flyover, Bellandur',
    description:
      '[DEMO SEED] Chronic storm-water drain backflow flooding 40m of ORR service lane, concealing submerged asphalt craters.',
    confirmationCount: 8,
    deviceId: 'seed-device-bellandur-01',
    confirmations: [
      {
        daysAgo: 32,
        deviceId: 'seed-citizen-orr-04',
        note: 'Stagnant water over 1 foot deep blocking bus bay and pedestrian crossing.',
      },
      {
        daysAgo: 14,
        deviceId: 'seed-citizen-orr-19',
        note: 'Silt trap remains clogged; hazard persists even 48 hours after rainfall.',
      },
    ],
  },
  {
    lat: 12.9352,
    lng: 77.6245,
    wardId: 151,
    category: 'damaged_footpath',
    severity: 'major',
    aiSuggestedCategory: 'damaged_footpath',
    aiSuggestedSeverity: 'major',
    humanOverridden: false,
    status: 'open',
    daysAgoCreated: 23,
    daysAgoResolved: null,
    roadLocationLabel: '80 Feet Road near Sony World Junction, Koramangala 4th Block',
    description:
      '[DEMO SEED] Collapsed concrete footpath slabs over open storm utility trench forcing pedestrians onto high-speed carriageway.',
    confirmationCount: 4,
    deviceId: 'seed-device-koramangala-01',
    confirmations: [
      {
        daysAgo: 15,
        deviceId: 'seed-citizen-south-08',
        note: 'Senior citizens forced to step into traffic lane around broken slab gap.',
      },
    ],
  },
  {
    lat: 12.9698,
    lng: 77.7499,
    wardId: 84,
    category: 'pothole',
    severity: 'hazardous',
    aiSuggestedCategory: 'pothole',
    aiSuggestedSeverity: 'hazardous',
    humanOverridden: false,
    status: 'open',
    daysAgoCreated: 29,
    daysAgoResolved: null,
    roadLocationLabel: 'ITPL Main Road near Hoodi Circle, Whitefield',
    description:
      '[DEMO SEED] Cluster of three sharp-edged potholes beside Metro pillar barricades damaging vehicle suspension and rims.',
    confirmationCount: 5,
    deviceId: 'seed-device-whitefield-01',
    confirmations: [
      {
        daysAgo: 18,
        deviceId: 'seed-citizen-wf-12',
        note: 'Loose gravel cold-mix washed away within 3 days; deep crater exposed again.',
      },
    ],
  },
  {
    lat: 12.9716,
    lng: 77.6095,
    wardId: 111,
    category: 'damaged_footpath',
    severity: 'minor',
    aiSuggestedCategory: 'damaged_footpath',
    aiSuggestedSeverity: 'minor',
    humanOverridden: false,
    status: 'resolved',
    daysAgoCreated: 38,
    daysAgoResolved: 11,
    roadLocationLabel: 'Church Street & Brigade Road Cross, Shantala Nagar',
    description:
      '[DEMO SEED] Dislodged granite cobble pavers and sunken utility chamber cover along pedestrian walkway.',
    confirmationCount: 3,
    deviceId: 'seed-device-cbd-01',
    confirmations: [
      {
        daysAgo: 25,
        deviceId: 'seed-citizen-cbd-02',
        note: 'Confirmed loose granite blocks creating tripping hazard.',
      },
    ],
  },
  {
    lat: 12.9121,
    lng: 77.6446,
    wardId: 174,
    category: 'pothole',
    severity: 'major',
    aiSuggestedCategory: 'pothole',
    aiSuggestedSeverity: 'minor',
    humanOverridden: true,
    status: 'disputed',
    daysAgoCreated: 27,
    daysAgoResolved: null,
    roadLocationLabel: '27th Main Road Sector 1, HSR Layout',
    description:
      '[DEMO SEED] Marked closed on municipal portal without hot-mix resurfacing; loose quarry dust already scoured out.',
    confirmationCount: 5,
    deviceId: 'seed-device-hsr-01',
    confirmations: [
      {
        daysAgo: 12,
        deviceId: 'seed-citizen-hsr-09',
        note: 'Disputing premature closure: crater is still 12cm deep on site.',
      },
    ],
  },
  {
    lat: 13.0031,
    lng: 77.5643,
    wardId: 45,
    category: 'waterlogging',
    severity: 'major',
    aiSuggestedCategory: 'waterlogging',
    aiSuggestedSeverity: 'major',
    humanOverridden: false,
    status: 'open',
    daysAgoCreated: 16,
    daysAgoResolved: null,
    roadLocationLabel: 'Sampige Road near 8th Cross, Malleshwaram',
    description:
      '[DEMO SEED] Choked shoulder drain grating causing knee-deep water accumulation across bus stop apron.',
    confirmationCount: 3,
    deviceId: 'seed-device-malleshwaram-01',
    confirmations: [],
  },
  {
    lat: 13.0358,
    lng: 77.597,
    wardId: 21,
    category: 'pothole',
    severity: 'hazardous',
    aiSuggestedCategory: 'pothole',
    aiSuggestedSeverity: 'hazardous',
    humanOverridden: false,
    status: 'open',
    daysAgoCreated: 45,
    daysAgoResolved: null,
    roadLocationLabel: 'Bellary Road Flyover Up-Ramp, Hebbal',
    description:
      '[DEMO SEED] Exposed steel reinforcement mesh and deep delaminated concrete pocket at flyover expansion joint.',
    confirmationCount: 7,
    deviceId: 'seed-device-hebbal-01',
    confirmations: [
      {
        daysAgo: 30,
        deviceId: 'seed-citizen-north-03',
        note: 'High-speed airport corridor hazard; rebar protruding 4cm.',
      },
    ],
  },
];
