import { BBMPWardData } from '../data/bbmp-wards.ts';
import { computeDaysUnresolved } from './evidence-packet.ts';

export interface HazardStatRow {
  id: number;
  wardId: number;
  category: string;
  severity: string;
  status: string;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  confirmationCount: number;
  isSeed: boolean;
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

export function computeWardDashboardStats(
  wards: BBMPWardData[],
  hazards: HazardStatRow[],
  referenceNow: Date = new Date()
): WardDashboardStats {
  const openHazards = hazards.filter((h) => h.status === 'open');
  const resolvedHazards = hazards.filter((h) => h.status === 'resolved');
  const disputedHazards = hazards.filter((h) => h.status === 'disputed');

  const totalOpenDays = openHazards.reduce(
    (sum, h) => sum + computeDaysUnresolved(h.createdAt, null, referenceNow),
    0
  );

  const avgUnresolvedDaysOpen =
    openHazards.length > 0 ? Number((totalOpenDays / openHazards.length).toFixed(1)) : 0;

  const duplicatesMergedCount = hazards.reduce(
    (sum, h) => sum + Math.max(0, (h.confirmationCount || 1) - 1),
    0
  );

  const wardBreakdown: WardAnalyticsEntry[] = wards.map((w) => {
    const wardHazards = hazards.filter((h) => h.wardId === w.wardId);
    const wardOpen = wardHazards.filter((h) => h.status === 'open');
    const wardResolved = wardHazards.filter((h) => h.status === 'resolved');
    const wardDisputed = wardHazards.filter((h) => h.status === 'disputed');

    const openDurations = wardOpen.map((h) =>
      computeDaysUnresolved(h.createdAt, null, referenceNow)
    );
    const wardOpenDaysSum = openDurations.reduce((a, b) => a + b, 0);
    const avgUnresolvedDays =
      wardOpen.length > 0 ? Number((wardOpenDaysSum / wardOpen.length).toFixed(1)) : 0;
    const maxUnresolvedDays = openDurations.length > 0 ? Math.max(...openDurations) : 0;

    const totalConfirmations = wardHazards.reduce(
      (sum, h) => sum + (h.confirmationCount || 1),
      0
    );
    const duplicatesMerged = wardHazards.reduce(
      (sum, h) => sum + Math.max(0, (h.confirmationCount || 1) - 1),
      0
    );

    return {
      wardId: w.wardId,
      wardName: w.wardName,
      zone: w.zone,
      officerName: w.officerName,
      officerPhone: w.officerPhone,
      officerEmail: w.officerEmail,
      officerContact: w.officerContact,
      openHazardsCount: wardOpen.length,
      resolvedHazardsCount: wardResolved.length,
      disputedHazardsCount: wardDisputed.length,
      totalHazardsCount: wardHazards.length,
      avgUnresolvedDays,
      maxUnresolvedDays,
      totalConfirmations,
      duplicatesMerged,
    };
  });

  // Sort wards by openHazardsCount descending, then avgUnresolvedDays descending
  wardBreakdown.sort((a, b) => {
    if (b.openHazardsCount !== a.openHazardsCount) {
      return b.openHazardsCount - a.openHazardsCount;
    }
    return b.avgUnresolvedDays - a.avgUnresolvedDays;
  });

  return {
    summary: {
      totalTrackedHazards: hazards.length,
      totalOpenHazards: openHazards.length,
      totalResolvedHazards: resolvedHazards.length,
      totalDisputedHazards: disputedHazards.length,
      avgUnresolvedDaysOpen,
      duplicatesMergedCount,
      seedRecordsCount: hazards.filter((h) => h.isSeed).length,
      citizenLiveRecordsCount: hazards.filter((h) => !h.isSeed).length,
    },
    wardBreakdown,
  };
}
