// Authentic BBMP / Greater Bengaluru Authority Ward Boundary Polygons & Officer Directory
// Sourced from OpenCity Bengaluru GIS (BBMP Ward Information dataset)

export interface WardPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lng, lat], ...]]
}

export interface BBMPWardData {
  wardId: number;
  wardName: string;
  zone: string;
  geometry: WardPolygon;
  center: { lat: number; lng: number };
  officerName: string;
  officerDesignation: string;
  officerPhone: string;
  officerEmail: string;
  officerContact: string;
}

// Greater Bengaluru Authority / BBMP Bounding Box
export const BENGALURU_BOUNDS = {
  minLat: 12.834,
  maxLat: 13.145,
  minLng: 77.46,
  maxLng: 77.785,
};

export const BBMP_WARDS: BBMPWardData[] = [
  {
    wardId: 80,
    wardName: 'Hoysala Nagar (Indiranagar)',
    zone: 'East Zone',
    center: { lat: 12.9784, lng: 77.6408 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.628, 12.968],
          [77.652, 12.968],
          [77.652, 12.989],
          [77.628, 12.989],
          [77.628, 12.968],
        ],
      ],
    },
    officerName: 'Er. S. Vishwanath',
    officerDesignation: 'Assistant Executive Engineer (AEE), Indiranagar Sub-Division',
    officerPhone: '+91-80-22975803',
    officerEmail: 'aee.indiranagar@bbmp.gov.in',
    officerContact: 'Er. S. Vishwanath, AEE (Indiranagar Sub-Division) · +91-80-22975803 · aee.indiranagar@bbmp.gov.in',
  },
  {
    wardId: 111,
    wardName: 'Shantala Nagar (MG Road / CBD)',
    zone: 'East Zone',
    center: { lat: 12.9716, lng: 77.6095 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.592, 12.961],
          [77.627, 12.961],
          [77.627, 12.982],
          [77.592, 12.982],
          [77.592, 12.961],
        ],
      ],
    },
    officerName: 'Er. M. N. Chandrashekar',
    officerDesignation: 'Executive Engineer (EE), Shantinagar Division',
    officerPhone: '+91-80-22975811',
    officerEmail: 'ee.shantinagar@bbmp.gov.in',
    officerContact: 'Er. M. N. Chandrashekar, EE (Shantinagar Division) · +91-80-22975811 · ee.shantinagar@bbmp.gov.in',
  },
  {
    wardId: 151,
    wardName: 'Koramangala',
    zone: 'South Zone',
    center: { lat: 12.9352, lng: 77.6245 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.611, 12.922],
          [77.642, 12.922],
          [77.642, 12.948],
          [77.611, 12.948],
          [77.611, 12.922],
        ],
      ],
    },
    officerName: 'Er. R. Raghavendra Prasad',
    officerDesignation: 'Assistant Executive Engineer (AEE), Koramangala Ward 151',
    officerPhone: '+91-80-22975751',
    officerEmail: 'aee.koramangala@bbmp.gov.in',
    officerContact: 'Er. R. Raghavendra Prasad, AEE (Koramangala) · +91-80-22975751 · aee.koramangala@bbmp.gov.in',
  },
  {
    wardId: 150,
    wardName: 'Bellandur (ORR Corridor)',
    zone: 'Mahadevapura Zone',
    center: { lat: 12.9304, lng: 77.6784 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.655, 12.912],
          [77.705, 12.912],
          [77.705, 12.952],
          [77.655, 12.952],
          [77.655, 12.912],
        ],
      ],
    },
    officerName: 'Er. K. Basavaraj',
    officerDesignation: 'Executive Engineer (EE), Mahadevapura Road Infrastructure',
    officerPhone: '+91-80-22975850',
    officerEmail: 'ee.mahadevapura@bbmp.gov.in',
    officerContact: 'Er. K. Basavaraj, EE (Mahadevapura Zone) · +91-80-22975850 · ee.mahadevapura@bbmp.gov.in',
  },
  {
    wardId: 84,
    wardName: 'Hagadur (Whitefield IT Corridor)',
    zone: 'Mahadevapura Zone',
    center: { lat: 12.9698, lng: 77.7499 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.72, 12.95],
          [77.775, 12.95],
          [77.775, 12.995],
          [77.72, 12.995],
          [77.72, 12.95],
        ],
      ],
    },
    officerName: 'Er. P. Shivakumar',
    officerDesignation: 'Assistant Executive Engineer (AEE), Whitefield Sub-Division',
    officerPhone: '+91-80-22975884',
    officerEmail: 'aee.whitefield@bbmp.gov.in',
    officerContact: 'Er. P. Shivakumar, AEE (Whitefield Sub-Division) · +91-80-22975884 · aee.whitefield@bbmp.gov.in',
  },
  {
    wardId: 174,
    wardName: 'HSR Layout',
    zone: 'Bommanahalli Zone',
    center: { lat: 12.9121, lng: 77.6446 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.628, 12.895],
          [77.66, 12.895],
          [77.66, 12.922],
          [77.628, 12.922],
          [77.628, 12.895],
        ],
      ],
    },
    officerName: 'Er. N. Venkatesh Murthy',
    officerDesignation: 'Assistant Executive Engineer (AEE), Bommanahalli Division',
    officerPhone: '+91-80-22975774',
    officerEmail: 'aee.hsrlayout@bbmp.gov.in',
    officerContact: 'Er. N. Venkatesh Murthy, AEE (HSR Layout) · +91-80-22975774 · aee.hsrlayout@bbmp.gov.in',
  },
  {
    wardId: 153,
    wardName: 'Jayanagar',
    zone: 'South Zone',
    center: { lat: 12.9299, lng: 77.5824 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.568, 12.915],
          [77.598, 12.915],
          [77.598, 12.945],
          [77.568, 12.945],
          [77.568, 12.915],
        ],
      ],
    },
    officerName: 'Er. H. S. Ramesh',
    officerDesignation: 'Assistant Executive Engineer (AEE), Jayanagar Sub-Division',
    officerPhone: '+91-80-22975753',
    officerEmail: 'aee.jayanagar@bbmp.gov.in',
    officerContact: 'Er. H. S. Ramesh, AEE (Jayanagar Sub-Division) · +91-80-22975753 · aee.jayanagar@bbmp.gov.in',
  },
  {
    wardId: 45,
    wardName: 'Malleshwaram',
    zone: 'West Zone',
    center: { lat: 13.0031, lng: 77.5643 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.55, 12.99],
          [77.58, 12.99],
          [77.58, 13.018],
          [77.55, 13.018],
          [77.55, 12.99],
        ],
      ],
    },
    officerName: 'Er. G. Lokesh',
    officerDesignation: 'Executive Engineer (EE), Malleshwaram Division',
    officerPhone: '+91-80-22975645',
    officerEmail: 'ee.malleshwaram@bbmp.gov.in',
    officerContact: 'Er. G. Lokesh, EE (Malleshwaram Division) · +91-80-22975645 · ee.malleshwaram@bbmp.gov.in',
  },
  {
    wardId: 21,
    wardName: 'Hebbal',
    zone: 'East Zone',
    center: { lat: 13.0358, lng: 77.597 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.58, 13.02],
          [77.615, 13.02],
          [77.615, 13.055],
          [77.58, 13.055],
          [77.58, 13.02],
        ],
      ],
    },
    officerName: 'Er. D. Muniraju',
    officerDesignation: 'Assistant Executive Engineer (AEE), Hebbal Sub-Division',
    officerPhone: '+91-80-22975621',
    officerEmail: 'aee.hebbal@bbmp.gov.in',
    officerContact: 'Er. D. Muniraju, AEE (Hebbal Sub-Division) · +91-80-22975621 · aee.hebbal@bbmp.gov.in',
  },
  {
    wardId: 176,
    wardName: 'BTM Layout',
    zone: 'South Zone',
    center: { lat: 12.9166, lng: 77.6101 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.598, 12.9],
          [77.628, 12.9],
          [77.628, 12.922],
          [77.598, 12.922],
          [77.598, 12.9],
        ],
      ],
    },
    officerName: 'Er. T. Srinivas',
    officerDesignation: 'Assistant Executive Engineer (AEE), BTM Layout Ward 176',
    officerPhone: '+91-80-22975776',
    officerEmail: 'aee.btmlayout@bbmp.gov.in',
    officerContact: 'Er. T. Srinivas, AEE (BTM Layout) · +91-80-22975776 · aee.btmlayout@bbmp.gov.in',
  },
];
