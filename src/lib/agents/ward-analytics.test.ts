import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWardDashboardStats } from './ward-analytics.ts';
import { BBMP_WARDS } from '../data/bbmp-wards.ts';

test('Ward Analytics: computes real open count, average unresolved days, and merged confirmations from stored records only', () => {
  const referenceNow = new Date('2026-11-10T08:00:00.000Z');
  const sampleHazards = [
    {
      id: 1,
      wardId: 80,
      category: 'pothole',
      severity: 'hazardous',
      status: 'open',
      createdAt: new Date('2026-10-21T08:00:00.000Z'), // 20 days open
      resolvedAt: null,
      confirmationCount: 4, // 3 merged duplicates
      isSeed: true,
    },
    {
      id: 2,
      wardId: 80,
      category: 'waterlogging',
      severity: 'major',
      status: 'open',
      createdAt: new Date('2026-10-31T08:00:00.000Z'), // 10 days open
      resolvedAt: null,
      confirmationCount: 2, // 1 merged duplicate
      isSeed: true,
    },
    {
      id: 3,
      wardId: 80,
      category: 'damaged_footpath',
      severity: 'minor',
      status: 'resolved',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      resolvedAt: new Date('2026-10-09T08:00:00.000Z'), // resolved in 8 days
      confirmationCount: 1,
      isSeed: true,
    },
  ];

  const stats = computeWardDashboardStats(BBMP_WARDS, sampleHazards, referenceNow);

  assert.equal(stats.summary.totalTrackedHazards, 3);
  assert.equal(stats.summary.totalOpenHazards, 2);
  assert.equal(stats.summary.totalResolvedHazards, 1);
  // Average unresolved duration across the 2 open hazards: (20 + 10) / 2 = 15 days
  assert.equal(stats.summary.avgUnresolvedDaysOpen, 15);
  // Duplicates merged instead of filed separately: (4 - 1) + (2 - 1) + (1 - 1) = 4
  assert.equal(stats.summary.duplicatesMergedCount, 4);

  const ward80 = stats.wardBreakdown.find((w) => w.wardId === 80);
  assert.ok(ward80);
  assert.equal(ward80.openHazardsCount, 2);
  assert.equal(ward80.resolvedHazardsCount, 1);
  assert.equal(ward80.avgUnresolvedDays, 15);
  assert.equal(ward80.totalConfirmations, 7);
});
