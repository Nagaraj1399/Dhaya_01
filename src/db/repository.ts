import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { confirmations, evidencePackets, hazards, wards } from './schema.ts';
import { BBMP_WARDS } from '../lib/data/bbmp-wards.ts';
import {
  DEMO_SEED_HAZARDS,
  createRoadHazardSvgDataUrl,
} from '../lib/data/seed-hazards.ts';
import { computeTamperHash, runIntakeGeoAgent } from '../lib/agents/intake-geo.ts';
import {
  findDuplicateOpenHazard,
  HazardCategory,
  HazardSeverity,
} from '../lib/agents/triage-dedup.ts';
import {
  assembleEvidencePacket,
  computeDaysUnresolved,
} from '../lib/agents/evidence-packet.ts';
import { computeWardDashboardStats } from '../lib/agents/ward-analytics.ts';

let seedPromise: Promise<void> | null = null;

/**
 * Ensures real BBMP ward polygons and clearly-labeled initial demo seed hazards
 * are present in PostgreSQL. Runs lazily on first API request (never at module load).
 */
export async function ensureDatabaseSeeded(): Promise<void> {
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = (async () => {
    try {
      const existingWards = await db.select().from(wards);
      if (existingWards.length === 0) {
        for (const w of BBMP_WARDS) {
          await db
            .insert(wards)
            .values({
              wardId: w.wardId,
              wardName: w.wardName,
              zone: w.zone,
              geometry: w.geometry,
              officerContact: w.officerContact,
              officerName: w.officerName,
              officerPhone: w.officerPhone,
              officerEmail: w.officerEmail,
            })
            .onConflictDoNothing();
        }
      }

      const existingHazards = await db.select().from(hazards);
      if (existingHazards.length === 0) {
        const now = Date.now();
        for (const seed of DEMO_SEED_HAZARDS) {
          const createdAt = new Date(now - seed.daysAgoCreated * 86400000);
          const resolvedAt =
            seed.daysAgoResolved !== null
              ? new Date(now - seed.daysAgoResolved * 86400000)
              : null;

          const wardInfo =
            BBMP_WARDS.find((w) => w.wardId === seed.wardId) || BBMP_WARDS[0];

          const photoUrl = createRoadHazardSvgDataUrl({
            title: seed.roadLocationLabel,
            category: seed.category,
            severity: seed.severity,
            lat: seed.lat,
            lng: seed.lng,
            timestampIso: createdAt.toISOString(),
            wardName: `${wardInfo.wardName} (#${wardInfo.wardId})`,
          });

          const photoHash = computeTamperHash({
            photoDataUrl: photoUrl,
            lat: seed.lat,
            lng: seed.lng,
            timestamp: createdAt.toISOString(),
          });

          const inserted = await db
            .insert(hazards)
            .values({
              lat: seed.lat,
              lng: seed.lng,
              wardId: seed.wardId,
              category: seed.category,
              severity: seed.severity,
              aiSuggestedCategory: seed.aiSuggestedCategory,
              aiSuggestedSeverity: seed.aiSuggestedSeverity,
              humanOverridden: seed.humanOverridden,
              status: seed.status,
              createdAt,
              resolvedAt,
              photoUrl,
              photoHash,
              description: seed.description,
              confirmationCount: seed.confirmationCount,
              deviceId: seed.deviceId,
              isSeed: true,
            })
            .returning();

          const insertedHazard = inserted[0];
          if (insertedHazard && seed.confirmations.length > 0) {
            for (const conf of seed.confirmations) {
              const confDate = new Date(now - conf.daysAgo * 86400000);
              const confHash = computeTamperHash({
                photoDataUrl: photoUrl,
                lat: seed.lat,
                lng: seed.lng,
                timestamp: confDate.toISOString(),
              });
              await db.insert(confirmations).values({
                hazardId: insertedHazard.id,
                createdAt: confDate,
                photoUrl: null,
                photoHash: confHash,
                note: conf.note,
                deviceId: conf.deviceId,
              });
            }
          }
        }
      }
    } catch (error) {
      seedPromise = null;
      console.error('Database seed initialization failed:', error);
      throw new Error('Failed to initialize BBMP ward and seed data.', {
        cause: error,
      });
    }
  })();

  return seedPromise;
}

export async function listAllHazardsWithWard() {
  try {
    await ensureDatabaseSeeded();
    const allHazards = await db
      .select()
      .from(hazards)
      .orderBy(desc(hazards.createdAt));
    const allWards = await db.select().from(wards);
    const allConfirmations = await db
      .select()
      .from(confirmations)
      .orderBy(desc(confirmations.createdAt));

    const wardMap = new Map(allWards.map((w) => [w.wardId, w]));
    const now = new Date();

    return allHazards.map((h) => {
      const ward = wardMap.get(h.wardId);
      const hazardConfs = allConfirmations.filter((c) => c.hazardId === h.id);
      return {
        ...h,
        daysOpen: computeDaysUnresolved(h.createdAt, h.resolvedAt, now),
        wardName: ward?.wardName || `Ward #${h.wardId}`,
        zone: ward?.zone || 'Bengaluru',
        officerName: ward?.officerName || 'BBMP Ward Engineer',
        officerPhone: ward?.officerPhone || '+91-80-22660000',
        officerEmail: ward?.officerEmail || 'comm@bbmp.gov.in',
        officerContact: ward?.officerContact || 'BBMP Control Room · +91-80-22660000',
        confirmations: hazardConfs,
      };
    });
  } catch (error) {
    console.error('Error listing hazards:', error);
    throw new Error('Database query failed while fetching road hazards.', {
      cause: error,
    });
  }
}

export async function submitOrMergeHazardReport(input: {
  photoDataUrl: string;
  lat: number;
  lng: number;
  category: HazardCategory;
  severity: HazardSeverity;
  aiSuggestedCategory?: HazardCategory;
  aiSuggestedSeverity?: HazardSeverity;
  description: string;
  deviceId: string;
  dedupRadiusMeters?: number;
}) {
  try {
    await ensureDatabaseSeeded();
    const nowIso = new Date().toISOString();

    // Agent 1: Intake & Geo-Resolution
    const intakeResult = runIntakeGeoAgent(
      {
        photoDataUrl: input.photoDataUrl,
        lat: input.lat,
        lng: input.lng,
        timestamp: nowIso,
        description: input.description,
      },
      BBMP_WARDS
    );

    if (!intakeResult.valid || !intakeResult.ward || !intakeResult.photoHash) {
      throw new Error(intakeResult.error || 'Invalid hazard submission.');
    }

    // Agent 2: Check for existing OPEN hazard of the same category within 50m radius
    const existingAll = await db.select().from(hazards);
    const duplicateMatch = findDuplicateOpenHazard(
      {
        lat: input.lat,
        lng: input.lng,
        category: input.category,
      },
      existingAll,
      input.dedupRadiusMeters ?? 50
    );

    if (duplicateMatch) {
      const target = duplicateMatch.hazard;
      const newCount = (target.confirmationCount || 1) + 1;

      await db
        .update(hazards)
        .set({
          confirmationCount: newCount,
        })
        .where(eq(hazards.id, target.id));

      await db.insert(confirmations).values({
        hazardId: target.id,
        createdAt: new Date(nowIso),
        photoUrl: input.photoDataUrl,
        photoHash: intakeResult.photoHash,
        note:
          input.description ||
          `Auto-clustered corroborating report (${duplicateMatch.distanceMeters}m from original pin).`,
        deviceId: input.deviceId,
      });

      const updatedList = await listAllHazardsWithWard();
      const updatedRecord = updatedList.find((h) => h.id === target.id);

      return {
        action: 'merged_duplicate' as const,
        distanceMeters: duplicateMatch.distanceMeters,
        hazard: updatedRecord,
        intakeAudit: {
          photoHash: intakeResult.photoHash,
          wardId: intakeResult.ward.wardId,
          wardName: intakeResult.ward.wardName,
          resolvedMethod: intakeResult.resolvedMethod,
        },
      };
    }

    const humanOverridden = Boolean(
      (input.aiSuggestedCategory && input.aiSuggestedCategory !== input.category) ||
        (input.aiSuggestedSeverity && input.aiSuggestedSeverity !== input.severity)
    );

    const inserted = await db
      .insert(hazards)
      .values({
        lat: input.lat,
        lng: input.lng,
        wardId: intakeResult.ward.wardId,
        category: input.category,
        severity: input.severity,
        aiSuggestedCategory: input.aiSuggestedCategory || input.category,
        aiSuggestedSeverity: input.aiSuggestedSeverity || input.severity,
        humanOverridden,
        status: 'open',
        createdAt: new Date(nowIso),
        resolvedAt: null,
        photoUrl: input.photoDataUrl,
        photoHash: intakeResult.photoHash,
        description:
          input.description.trim() ||
          `Citizen-documented ${input.category.replace('_', ' ')} in ${intakeResult.ward.wardName}`,
        confirmationCount: 1,
        deviceId: input.deviceId,
        isSeed: false,
      })
      .returning();

    const updatedList = await listAllHazardsWithWard();
    const createdRecord = updatedList.find((h) => h.id === inserted[0].id);

    return {
      action: 'created_new' as const,
      distanceMeters: null,
      hazard: createdRecord,
      intakeAudit: {
        photoHash: intakeResult.photoHash,
        wardId: intakeResult.ward.wardId,
        wardName: intakeResult.ward.wardName,
        resolvedMethod: intakeResult.resolvedMethod,
      },
    };
  } catch (error: any) {
    console.error('Error submitting hazard report:', error);
    throw new Error(error.message || 'Failed to submit hazard report.', {
      cause: error,
    });
  }
}

export async function confirmExistingHazardById(input: {
  hazardId: number;
  deviceId: string;
  note?: string;
  photoDataUrl?: string;
}) {
  try {
    await ensureDatabaseSeeded();
    const existingRows = await db
      .select()
      .from(hazards)
      .where(eq(hazards.id, input.hazardId));

    const target = existingRows[0];
    if (!target) {
      const notFoundErr = new Error(`Hazard #${input.hazardId} not found.`) as Error & {
        statusCode?: number;
      };
      notFoundErr.statusCode = 404;
      throw notFoundErr;
    }

    if (target.status === 'resolved') {
      const resolvedErr = new Error(
        `Cannot confirm Hazard #${input.hazardId} because it is already marked as resolved. Dispute closure or file a new report instead.`
      ) as Error & { statusCode?: number };
      resolvedErr.statusCode = 400;
      throw resolvedErr;
    }

    // Check for duplicate confirmation from the same device_id within the last 60 seconds
    const existingConfs = await db
      .select()
      .from(confirmations)
      .where(eq(confirmations.hazardId, target.id));

    const nowMs = Date.now();
    const recentDuplicateFromSameDevice = existingConfs.some(
      (c) =>
        c.deviceId === input.deviceId &&
        nowMs - new Date(c.createdAt).getTime() < 60_000
    );

    if (recentDuplicateFromSameDevice) {
      const rateLimitErr = new Error(
        'Duplicate confirmation rate-limited: this device already confirmed this hazard within the last 60 seconds.'
      ) as Error & { statusCode?: number };
      rateLimitErr.statusCode = 429;
      throw rateLimitErr;
    }

    const nowIso = new Date(nowMs).toISOString();
    const photoHash = computeTamperHash({
      photoDataUrl: input.photoDataUrl || target.photoUrl,
      lat: target.lat,
      lng: target.lng,
      timestamp: nowIso,
    });

    const newCount = (target.confirmationCount || 1) + 1;
    await db
      .update(hazards)
      .set({ confirmationCount: newCount })
      .where(eq(hazards.id, target.id));

    await db.insert(confirmations).values({
      hazardId: target.id,
      createdAt: new Date(nowIso),
      photoUrl: input.photoDataUrl || null,
      photoHash,
      note:
        input.note?.trim() ||
        'On-site citizen verification: hazard remains open and unresolved.',
      deviceId: input.deviceId,
    });

    const all = await listAllHazardsWithWard();
    return all.find((h) => h.id === target.id);
  } catch (error: any) {
    console.error('Error confirming hazard:', error);
    const wrapped = new Error(
      error.message || 'Failed to record hazard confirmation.',
      { cause: error }
    ) as Error & { statusCode?: number };
    wrapped.statusCode = error.statusCode || 400;
    throw wrapped;
  }
}

export async function updateHazardStatusById(input: {
  hazardId: number;
  status: 'open' | 'resolved' | 'disputed';
}) {
  try {
    await ensureDatabaseSeeded();
    const resolvedAt = input.status === 'resolved' ? new Date() : null;
    await db
      .update(hazards)
      .set({
        status: input.status,
        resolvedAt,
      })
      .where(eq(hazards.id, input.hazardId));

    const all = await listAllHazardsWithWard();
    return all.find((h) => h.id === input.hazardId);
  } catch (error: any) {
    console.error('Error updating hazard status:', error);
    throw new Error(error.message || 'Failed to update hazard status.', {
      cause: error,
    });
  }
}

export async function generateAndStoreEvidencePacket(hazardId: number) {
  try {
    await ensureDatabaseSeeded();
    const hazardRows = await db
      .select()
      .from(hazards)
      .where(eq(hazards.id, hazardId));
    const hazard = hazardRows[0];
    if (!hazard) {
      throw new Error(`Hazard #${hazardId} not found.`);
    }

    const wardRows = await db
      .select()
      .from(wards)
      .where(eq(wards.wardId, hazard.wardId));
    const ward = wardRows[0] || {
      wardId: hazard.wardId,
      wardName: `Ward #${hazard.wardId}`,
      zone: 'Bengaluru',
      officerName: 'BBMP Executive Engineer',
      officerPhone: '+91-80-22660000',
      officerEmail: 'comm@bbmp.gov.in',
      officerContact: 'BBMP Control Room · +91-80-22660000',
    };

    const confRows = await db
      .select()
      .from(confirmations)
      .where(eq(confirmations.hazardId, hazard.id));

    const packet = assembleEvidencePacket({
      hazard,
      ward,
      confirmations: confRows,
      generatedAt: new Date(),
    });

    const fileUrl = `/api/hazards/${hazard.id}/evidence-packet`;
    await db.insert(evidencePackets).values({
      hazardId: hazard.id,
      generatedAt: new Date(packet.generatedAtIso),
      fileUrl,
      packetHash: packet.packetIntegrityHash,
      packetJson: packet,
    });

    return packet;
  } catch (error: any) {
    console.error('Error generating evidence packet:', error);
    throw new Error(error.message || 'Failed to generate evidence packet.', {
      cause: error,
    });
  }
}

export async function getRealWardDashboardAnalytics() {
  try {
    await ensureDatabaseSeeded();
    const allHazards = await db.select().from(hazards);
    return computeWardDashboardStats(BBMP_WARDS, allHazards, new Date());
  } catch (error: any) {
    console.error('Error computing ward analytics:', error);
    throw new Error('Failed to compute ward accountability statistics.', {
      cause: error,
    });
  }
}
