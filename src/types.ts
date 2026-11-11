export type HazardCategory = 'pothole' | 'waterlogging' | 'damaged_footpath' | 'other';
export type HazardSeverity = 'minor' | 'major' | 'hazardous';
export type HazardStatus = 'open' | 'resolved' | 'disputed';

export interface ConfirmationItem {
  id: number;
  hazardId: number;
  createdAt: string;
  photoUrl: string | null;
  photoHash: string | null;
  note: string | null;
  deviceId: string;
}

export interface HazardRecord {
  id: number;
  lat: number;
  lng: number;
  wardId: number;
  wardName: string;
  zone: string;
  officerName: string;
  officerPhone: string;
  officerEmail: string;
  officerContact: string;
  category: HazardCategory;
  severity: HazardSeverity;
  aiSuggestedCategory: HazardCategory | null;
  aiSuggestedSeverity: HazardSeverity | null;
  humanOverridden: boolean;
  status: HazardStatus;
  createdAt: string;
  resolvedAt: string | null;
  daysOpen: number;
  photoUrl: string;
  photoHash: string;
  description: string;
  confirmationCount: number;
  deviceId: string;
  isSeed: boolean;
  confirmations: ConfirmationItem[];
}

export interface WardPolygonData {
  wardId: number;
  wardName: string;
  zone: string;
  center: { lat: number; lng: number };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  officerName: string;
  officerDesignation: string;
  officerPhone: string;
  officerEmail: string;
  officerContact: string;
}

export interface WardAnalyticsEntry {
  wardId: number;
  wardName: string;
  zone: string;
  officerName: string;
  officerPhone: string;
  officerEmail: string;
  officerContact: string;
  openHazardsCount: number;
  resolvedHazardsCount: number;
  disputedHazardsCount: number;
  totalHazardsCount: number;
  avgUnresolvedDays: number;
  maxUnresolvedDays: number;
  totalConfirmations: number;
  duplicatesMerged: number;
}

export interface WardDashboardStats {
  summary: {
    totalTrackedHazards: number;
    totalOpenHazards: number;
    totalResolvedHazards: number;
    totalDisputedHazards: number;
    avgUnresolvedDaysOpen: number;
    duplicatesMergedCount: number;
    seedRecordsCount: number;
    citizenLiveRecordsCount: number;
  };
  wardBreakdown: WardAnalyticsEntry[];
}

export interface EvidencePacketDocument {
  packetId: string;
  generatedAtIso: string;
  hazardId: number;
  status: string;
  category: string;
  severity: string;
  triageAudit: {
    aiSuggestedCategory: string | null;
    aiSuggestedSeverity: string | null;
    humanOverridden: boolean;
  };
  location: {
    lat: number;
    lng: number;
    crs: string;
    googleMapsVerifyUrl: string;
    osmVerifyUrl: string;
  };
  ward: {
    wardId: number;
    wardName: string;
    zone: string;
    officerName: string;
    officerPhone: string;
    officerEmail: string;
    officerContact: string;
  };
  timeline: {
    firstReportedIso: string;
    resolvedAtIso: string | null;
    asOfIso: string;
  };
  daysUnresolved: number;
  confirmationCount: number;
  isDemoSeedRecord: boolean;
  evidenceChain: {
    sequenceNumber: number;
    eventType: 'INITIAL_HAZARD_REPORT' | 'CITIZEN_CORROBORATION';
    timestampIso: string;
    deviceId: string;
    sha256Hash: string;
    photoIncluded: boolean;
    photoUrl: string | null;
    note: string;
  }[];
  legalBasis: {
    rulingYear: number;
    court: string;
    statutoryProvision: string;
    citation: string;
    disclaimer: string;
  };
  packetIntegrityHash: string;
}
