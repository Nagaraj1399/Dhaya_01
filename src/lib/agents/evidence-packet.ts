import crypto from 'node:crypto';

export const KARNATAKA_HC_2019_CITATION =
  'Vijayanagara Bimba vs. State of Karnataka & BBMP (WP 42927/2015, Karnataka High Court 2019 Order): Holds that maintaining safe, motorable roads and footpaths is a mandatory statutory duty of BBMP under Section 58 of the Karnataka Municipal Corporations Act, 1976, and citizens are entitled to seek compensation for injury or vehicle damage caused by neglect of road maintenance.';

export const NON_FILING_DISCLAIMER =
  'Evidence summary to support your own claim, not an automatic filing. Sakshi documents verifiable cryptographic evidence; a human citizen must review and submit any legal claim, grievance, or Lokayukta representation independently.';

export interface HazardRecordForPacket {
  id: number;
  lat: number;
  lng: number;
  wardId: number;
  category: string;
  severity: string;
  aiSuggestedCategory: string | null;
  aiSuggestedSeverity: string | null;
  humanOverridden: boolean;
  status: string;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  photoUrl: string;
  photoHash: string;
  description: string;
  confirmationCount: number;
  deviceId: string;
  isSeed: boolean;
}

export interface WardRecordForPacket {
  wardId: number;
  wardName: string;
  zone: string;
  officerName: string;
  officerPhone: string;
  officerEmail: string;
  officerContact: string;
}

export interface ConfirmationRecordForPacket {
  id: number;
  hazardId: number;
  createdAt: Date | string;
  photoUrl: string | null;
  photoHash?: string | null;
  note?: string | null;
  deviceId: string;
}

export interface EvidenceChainEntry {
  sequenceNumber: number;
  eventType: 'INITIAL_HAZARD_REPORT' | 'CITIZEN_CORROBORATION';
  timestampIso: string;
  deviceId: string;
  sha256Hash: string;
  photoIncluded: boolean;
  photoUrl: string | null;
  note: string;
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
    crs: 'EPSG:4326 (WGS84)';
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
  evidenceChain: EvidenceChainEntry[];
  legalBasis: {
    rulingYear: 2019;
    court: 'High Court of Karnataka at Bengaluru';
    statutoryProvision: 'Section 58, Karnataka Municipal Corporations Act, 1976 & BBMP Act, 2020';
    citation: string;
    disclaimer: string;
  };
  packetIntegrityHash: string;
}

/**
 * Computes exact days unresolved from real database timestamps (`createdAt` to `resolvedAt` or `now`).
 */
export function computeDaysUnresolved(
  createdAt: Date | string,
  resolvedAt?: Date | string | null,
  referenceNow: Date = new Date()
): number {
  const startMs = new Date(createdAt).getTime();
  const endMs = resolvedAt ? new Date(resolvedAt).getTime() : referenceNow.getTime();
  const diffMs = Math.max(0, endMs - startMs);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Agent 3: Assembles a verifiable Evidence Packet from real stored hazard, ward, and confirmation records.
 */
export function assembleEvidencePacket(input: {
  hazard: HazardRecordForPacket;
  ward: WardRecordForPacket;
  confirmations: ConfirmationRecordForPacket[];
  generatedAt?: Date;
}): EvidencePacketDocument {
  if (
    !input.hazard.photoUrl ||
    typeof input.hazard.photoUrl !== 'string' ||
    input.hazard.photoUrl.trim().length === 0 ||
    !input.hazard.photoHash ||
    input.hazard.photoHash.trim().length === 0
  ) {
    throw new Error(
      'Cannot generate evidence packet: hazard is missing required photographic proof or SHA-256 digest.'
    );
  }

  const generatedAt = input.generatedAt || new Date();
  const daysUnresolved = computeDaysUnresolved(
    input.hazard.createdAt,
    input.hazard.resolvedAt,
    generatedAt
  );

  const evidenceChain: EvidenceChainEntry[] = [
    {
      sequenceNumber: 1,
      eventType: 'INITIAL_HAZARD_REPORT',
      timestampIso: new Date(input.hazard.createdAt).toISOString(),
      deviceId: input.hazard.deviceId,
      sha256Hash: input.hazard.photoHash,
      photoIncluded: Boolean(input.hazard.photoUrl),
      photoUrl: input.hazard.photoUrl,
      note: input.hazard.description,
    },
    ...input.confirmations.map((conf, idx) => {
      const fallbackHash = crypto
        .createHash('sha256')
        .update(`${conf.hazardId}::${conf.deviceId}::${new Date(conf.createdAt).toISOString()}`)
        .digest('hex');

      return {
        sequenceNumber: idx + 2,
        eventType: 'CITIZEN_CORROBORATION' as const,
        timestampIso: new Date(conf.createdAt).toISOString(),
        deviceId: conf.deviceId,
        sha256Hash: conf.photoHash || fallbackHash,
        photoIncluded: Boolean(conf.photoUrl),
        photoUrl: conf.photoUrl,
        note: conf.note || 'Corroborated hazard presence on site.',
      };
    }),
  ];

  const corePacketWithoutIntegrity = {
    packetId: `SAKSHI-BLR-${input.hazard.wardId}-${input.hazard.id}-${generatedAt.getTime()}`,
    generatedAtIso: generatedAt.toISOString(),
    hazardId: input.hazard.id,
    status: input.hazard.status,
    category: input.hazard.category,
    severity: input.hazard.severity,
    triageAudit: {
      aiSuggestedCategory: input.hazard.aiSuggestedCategory,
      aiSuggestedSeverity: input.hazard.aiSuggestedSeverity,
      humanOverridden: input.hazard.humanOverridden,
    },
    location: {
      lat: input.hazard.lat,
      lng: input.hazard.lng,
      crs: 'EPSG:4326 (WGS84)' as const,
      googleMapsVerifyUrl: `https://www.google.com/maps?q=${input.hazard.lat},${input.hazard.lng}`,
      osmVerifyUrl: `https://www.openstreetmap.org/?mlat=${input.hazard.lat}&mlon=${input.hazard.lng}#map=18/${input.hazard.lat}/${input.hazard.lng}`,
    },
    ward: {
      wardId: input.ward.wardId,
      wardName: input.ward.wardName,
      zone: input.ward.zone,
      officerName: input.ward.officerName,
      officerPhone: input.ward.officerPhone,
      officerEmail: input.ward.officerEmail,
      officerContact: input.ward.officerContact,
    },
    timeline: {
      firstReportedIso: new Date(input.hazard.createdAt).toISOString(),
      resolvedAtIso: input.hazard.resolvedAt
        ? new Date(input.hazard.resolvedAt).toISOString()
        : null,
      asOfIso: generatedAt.toISOString(),
    },
    daysUnresolved,
    confirmationCount: input.hazard.confirmationCount,
    isDemoSeedRecord: input.hazard.isSeed,
    evidenceChain,
    legalBasis: {
      rulingYear: 2019 as const,
      court: 'High Court of Karnataka at Bengaluru' as const,
      statutoryProvision:
        'Section 58, Karnataka Municipal Corporations Act, 1976 & BBMP Act, 2020' as const,
      citation: KARNATAKA_HC_2019_CITATION,
      disclaimer: NON_FILING_DISCLAIMER,
    },
  };

  const packetIntegrityHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(corePacketWithoutIntegrity))
    .digest('hex');

  return {
    ...corePacketWithoutIntegrity,
    packetIntegrityHash,
  };
}
