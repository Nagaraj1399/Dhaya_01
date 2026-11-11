import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { WardDashboardStats } from '../types.ts';

interface WardDashboardViewProps {
  stats: WardDashboardStats | null;
  onSelectWardFilter: (wardId: number) => void;
}

export const WardDashboardView: React.FC<WardDashboardViewProps> = ({
  stats,
  onSelectWardFilter,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('all');

  if (!stats) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading real-time BBMP ward statistics from PostgreSQL...
      </div>
    );
  }

  const zones = Array.from(new Set(stats.wardBreakdown.map((w) => w.zone)));

  const filteredWards = stats.wardBreakdown.filter((w) => {
    const matchesZone = selectedZone === 'all' || w.zone === selectedZone;
    const matchesSearch =
      !searchQuery.trim() ||
      w.wardName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(w.wardId).includes(searchQuery.trim()) ||
      w.officerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesZone && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Aggregate Impact Summary Strip — Sourced 100% from real DB rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Total Open Hazards Tracked</div>
          <div
            data-testid="metric-open-hazards"
            className="text-3xl font-bold font-mono tabular-nums text-slate-900"
          >
            {stats.summary.totalOpenHazards}
          </div>
          <div className="text-xs text-slate-500">
            {stats.summary.totalTrackedHazards} total records · {stats.summary.totalResolvedHazards} resolved
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Avg. Unresolved Duration</div>
          <div
            data-testid="metric-avg-days"
            className="text-3xl font-bold font-mono tabular-nums text-slate-900"
          >
            {stats.summary.avgUnresolvedDaysOpen} Days
          </div>
          <div className="text-xs text-slate-500">
            Computed across active open hazards in Bengaluru
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Duplicate Reports Merged (50m Dedup)</div>
          <div
            data-testid="metric-duplicates-merged"
            className="text-3xl font-bold font-mono tabular-nums text-slate-900"
          >
            {stats.summary.duplicatesMergedCount}
          </div>
          <div className="text-xs text-slate-500">
            Converted into corroborating SHA-256 confirmations
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Data Provenance Transparency</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-slate-900">
            {stats.summary.citizenLiveRecordsCount} Live / {stats.summary.seedRecordsCount} Seed
          </div>
          <div className="text-xs text-slate-500">
            Demo seed records explicitly labeled in DB
          </div>
        </div>
      </div>

      {/* Ward Table Controls */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              BBMP / Greater Bengaluru Authority Ward Accountability Ledger
            </h2>
            <p className="text-xs text-slate-500">
              Every figure below is computed dynamically from stored hazard records in PostgreSQL. Click any ward to inspect its pins on the live map.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search wards or officers"
                placeholder="Search ward or AEE officer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <select
              aria-label="Filter by BBMP Zone"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All BBMP Zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* High-Density Tabular Data Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Ward</th>
                <th className="py-3 px-4">BBMP Zone</th>
                <th className="py-3 px-4 text-right">Open Hazards</th>
                <th className="py-3 px-4 text-right">Avg. Days Unresolved</th>
                <th className="py-3 px-4 text-right">Max Days Open</th>
                <th className="py-3 px-4 text-right">Resolved / Disputed</th>
                <th className="py-3 px-4 text-right">Confirmations</th>
                <th className="py-3 px-4">Accountable Ward Officer</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredWards.map((w) => (
                <tr key={w.wardId} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    Ward #{w.wardId} · {w.wardName}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">{w.zone}</td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                    {w.openHazardsCount}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                    {w.avgUnresolvedDays}d
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                    {w.maxUnresolvedDays}d
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                    {w.resolvedHazardsCount} / {w.disputedHazardsCount}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                    {w.totalConfirmations} ({w.duplicatesMerged} merged)
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <div className="font-medium text-slate-900">{w.officerName}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {w.officerPhone} · {w.officerEmail}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectWardFilter(w.wardId)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Inspect on Map
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
