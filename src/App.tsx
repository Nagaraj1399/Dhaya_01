import React, { useEffect, useState, useCallback } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import {
  PlusCircle,
  CheckCircle,
  FileText,
  Map as MapIcon,
  BarChart3,
  Cpu,
  ShieldAlert,
  LogIn,
  LogOut,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import {
  EvidencePacketDocument,
  HazardRecord,
  HazardStatus,
  WardDashboardStats,
  WardPolygonData,
} from './types.ts';
import { HazardMap } from './components/HazardMap.tsx';
import { ReportHazardModal } from './components/ReportHazardModal.tsx';
import { EvidencePacketModal } from './components/EvidencePacketModal.tsx';
import { WardDashboardView } from './components/WardDashboardView.tsx';
import { AgentPipelineView } from './components/AgentPipelineView.tsx';

type ActiveTab = 'map' | 'dashboard' | 'dossier' | 'agents';

function getOrCreateAnonymousDeviceId(): string {
  const key = 'sakshi_anon_device_id';
  try {
    let existing = sessionStorage.getItem(key);
    if (!existing) {
      existing = `blr-citizen-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, existing);
    }
    return existing;
  } catch {
    return 'blr-citizen-session';
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [hazards, setHazards] = useState<HazardRecord[]>([]);
  const [wards, setWards] = useState<WardPolygonData[]>([]);
  const [dashboardStats, setDashboardStats] = useState<WardDashboardStats | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | HazardStatus>('all');
  const [wardFilter, setWardFilter] = useState<number | 'all'>('all');
  const [showWardBoundaries, setShowWardBoundaries] = useState<boolean>(true);

  // Modals & Interactive States
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [activePacket, setActivePacket] = useState<EvidencePacketDocument | null>(null);
  const [packetLoading, setPacketLoading] = useState<boolean>(false);
  const [confirmNote, setConfirmNote] = useState<string>('');
  const [confirmSubmitting, setConfirmSubmitting] = useState<boolean>(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Auth State (supports anonymous device-id session by default + optional Google Sign-In)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [deviceId] = useState<string>(() => getOrCreateAnonymousDeviceId());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const token = await user.getIdToken();
        setAuthToken(token);
        fetch('/api/auth/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      } else {
        setAuthToken(null);
      }
    });
    return () => unsub();
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const [wardsRes, hazardsRes, dashRes] = await Promise.all([
        fetch('/api/wards'),
        fetch('/api/hazards'),
        fetch('/api/dashboard/wards'),
      ]);
      const wardsData = await wardsRes.json();
      const hazardsData = await hazardsRes.json();
      const dashData = await dashRes.json();

      if (wardsData.wards) setWards(wardsData.wards);
      if (hazardsData.hazards) {
        setHazards(hazardsData.hazards);
        setSelectedHazardId((prev) => prev ?? hazardsData.hazards[0]?.id ?? null);
      }
      if (dashData.summary) setDashboardStats(dashData);
    } catch (err) {
      console.error('Failed to load Sakshi data:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setBannerNotice(
        `Continuing with anonymous citizen session (${deviceId}). Google Sign-In optional.`
      );
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const filteredHazards = hazards.filter((h) => {
    const matchesStatus = statusFilter === 'all' || h.status === statusFilter;
    const matchesWard = wardFilter === 'all' || h.wardId === wardFilter;
    return matchesStatus && matchesWard;
  });

  const selectedHazard =
    hazards.find((h) => h.id === selectedHazardId) || filteredHazards[0] || null;

  const handleConfirmExistingHazard = async (hazardId: number) => {
    setConfirmSubmitting(true);
    setBannerNotice(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const res = await fetch(`/api/hazards/${hazardId}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: currentUser?.uid || deviceId,
          note:
            confirmNote.trim() ||
            'Corroborated on site: road hazard remains open and unresolved.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Confirmation failed');

      setConfirmNote('');
      await fetchAllData();
      setBannerNotice(
        `Corroboration recorded for Hazard #${hazardId}. Confirmation count incremented to ${data.hazard?.confirmationCount}.`
      );
    } catch (err: any) {
      setBannerNotice(err.message || 'Could not confirm hazard.');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleUpdateStatus = async (hazardId: number, status: HazardStatus) => {
    try {
      const res = await fetch(`/api/hazards/${hazardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchAllData();
        setBannerNotice(`Hazard #${hazardId} status updated to ${status.toUpperCase()}.`);
      }
    } catch {
      // ignore
    }
  };

  const handleGenerateEvidencePacket = async (hazardId: number) => {
    setPacketLoading(true);
    try {
      const res = await fetch(`/api/hazards/${hazardId}/evidence-packet`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.packet) {
        setActivePacket(data.packet);
      }
    } catch (err) {
      console.error('Error generating packet:', err);
    } finally {
      setPacketLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] pb-16 md:pb-0">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('map');
          }}
          className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          Sakshi
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'map'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Live Map
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'dashboard'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Ward Dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedHazard) {
                handleGenerateEvidencePacket(selectedHazard.id);
              } else {
                setActiveTab('dossier');
              }
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'dossier'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Evidence Dossier
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'agents'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Agent Pipeline
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            Report Hazard
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Civic Context Strip & Legal Guardrail */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-display text-balance">
              Bengaluru Road Hazard Evidence-Chain Agent
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Under the 2019 High Court of Karnataka ruling (<em>WP 42927/2015</em>), BBMP has a mandatory statutory duty to maintain safe roads and citizens may claim compensation for injury or vehicle damage. Sakshi builds the cryptographic evidence chain (timestamped photos, SHA-256 digests, ward geo-resolution, and corroboration logs) —{' '}
              <strong className="text-slate-900">
                evidence summary to support your own claim, never an automatic filing.
              </strong>
            </p>
          </div>

          {/* Real Database Metric Strip + Session Identity */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            {dashboardStats && (
              <div className="font-mono tabular-nums space-x-2">
                <span>
                  <strong className="text-slate-900">{dashboardStats.summary.totalOpenHazards}</strong> Open
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="text-slate-900">{dashboardStats.summary.avgUnresolvedDaysOpen}d</strong> Avg Unresolved
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="text-slate-900">{dashboardStats.summary.duplicatesMergedCount}</strong> Duplicates Merged
                </span>
              </div>
            )}

            {currentUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out ({currentUser.email?.split('@')[0]})
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                title={`Anonymous Device Session: ${deviceId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                Citizen Sign-In (Optional)
              </button>
            )}
          </div>
        </section>

        {/* Action Feedback Banner */}
        {bannerNotice && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between gap-4"
          >
            <span>{bannerNotice}</span>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="text-slate-300 hover:text-white font-mono text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* VIEW 1: LIVE MAP & SELECTED HAZARD INSPECTOR (Flows 1, 2, 3, 4) */}
        {activeTab === 'map' && (
          <div className="space-y-4">
            {/* Interactive Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
              {/* Functional Segmented Status Controls */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['all', 'open', 'resolved', 'disputed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'all'
                      ? `All (${hazards.length})`
                      : `${st.charAt(0).toUpperCase() + st.slice(1)} (${
                          hazards.filter((h) => h.status === st).length
                        })`}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Filter map by BBMP Ward"
                  value={wardFilter}
                  onChange={(e) =>
                    setWardFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Bengaluru Wards ({wards.length})</option>
                  {wards.map((w) => (
                    <option key={w.wardId} value={w.wardId}>
                      Ward #{w.wardId} — {w.wardName}
                    </option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWardBoundaries}
                    onChange={(e) => setShowWardBoundaries(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Show BBMP Ward Polygons</span>
                </label>
              </div>
            </div>

            {/* 2-Column Split: Map Canvas (Left 7 cols) + Hazard Evidence Inspector & Corroboration Panel (Right 5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 flex flex-col space-y-4">
                <div className="h-[440px] lg:h-[540px]">
                  <HazardMap
                    hazards={filteredHazards}
                    wards={wards}
                    selectedHazardId={selectedHazard?.id ?? null}
                    onSelectHazard={(h) => setSelectedHazardId(h.id)}
                    showWardBoundaries={showWardBoundaries}
                  />
                </div>

                {/* Horizontal Hazard Strip for Keyboard & Screen Reader Accessibility */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Tracked Hazard Pins ({filteredHazards.length}) — Select to Inspect or Confirm
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {filteredHazards.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setSelectedHazardId(h.id)}
                        className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                          selectedHazard?.id === h.id
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="font-semibold truncate">
                          #{h.id} · {h.category.replace('_', ' ')} · {h.wardName}
                        </div>
                        <div
                          className={`font-mono text-[11px] ${
                            selectedHazard?.id === h.id ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {h.status.toUpperCase()} · {h.daysOpen}d open · {h.confirmationCount} confirmations
                          {h.isSeed ? ' · Demo Seed' : ' · Live Citizen'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Selected Hazard Detail, Flow 3 (Confirm), and Flow 4 (Request Evidence Packet) */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
                {loadingData ? (
                  <div className="py-12 text-center text-sm text-slate-500">
                    Loading hazard records...
                  </div>
                ) : selectedHazard ? (
                  <>
                    <div className="space-y-4">
                      {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-500">
                        <span className="font-semibold text-slate-900">
                          Hazard #{selectedHazard.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            selectedHazard.status === 'open'
                              ? 'text-red-700 font-semibold'
                              : selectedHazard.status === 'resolved'
                              ? 'text-emerald-700 font-semibold'
                              : 'text-amber-700 font-semibold'
                          }
                        >
                          {selectedHazard.status.toUpperCase()}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedHazard.daysOpen} days open</span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedHazard.confirmationCount} confirmations</span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedHazard.isSeed ? 'Demo Seed Record' : 'Citizen Report'}</span>
                      </div>

                      <div>
                        <h2 className="text-lg font-bold text-slate-900 font-display capitalize">
                          {selectedHazard.category.replace('_', ' ')} ({selectedHazard.severity} severity)
                        </h2>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {selectedHazard.description}
                        </p>
                      </div>

                      {/* Forensic Image Preview */}
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                        <img
                          src={selectedHazard.photoUrl}
                          alt={`Hazard ${selectedHazard.id} in ${selectedHazard.wardName}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-44 object-cover"
                        />
                      </div>

                      {/* Ward & Cryptographic Metadata */}
                      <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-200">
                        <div>
                          <strong className="text-slate-900">BBMP Ward:</strong> #{selectedHazard.wardId}{' '}
                          {selectedHazard.wardName} ({selectedHazard.zone})
                        </div>
                        <div>
                          <strong className="text-slate-900">Ward Officer:</strong>{' '}
                          {selectedHazard.officerContact}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          GPS: {selectedHazard.lat.toFixed(5)} N, {selectedHazard.lng.toFixed(5)} E
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 truncate">
                          SHA-256: {selectedHazard.photoHash}
                        </div>
                      </div>

                      {/* Flow 3: Confirm an Existing Hazard (Corroborate instead of duplicate) */}
                      <div className="pt-3 border-t border-slate-200 space-y-2.5">
                        <label
                          htmlFor="corroborate-note-input"
                          className="block text-xs font-semibold text-slate-900"
                        >
                          Near this hazard? Confirm &amp; Corroborate (Prevents Duplicates)
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="corroborate-note-input"
                            type="text"
                            value={confirmNote}
                            onChange={(e) => setConfirmNote(e.target.value)}
                            placeholder="Add corroborating observation (e.g. still open today)..."
                            className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                          />
                          <button
                            type="button"
                            disabled={confirmSubmitting}
                            onClick={() => handleConfirmExistingHazard(selectedHazard.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                            <span>
                              {confirmSubmitting
                                ? 'Saving...'
                                : `Confirm Hazard (${selectedHazard.confirmationCount})`}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Recent Corroborations List */}
                      {selectedHazard.confirmations.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200">
                          <div className="text-xs font-semibold text-slate-700">
                            Corroboration Chain ({selectedHazard.confirmations.length} additional logs):
                          </div>
                          <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                            {selectedHazard.confirmations.map((c) => (
                              <div key={c.id} className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                                <div>{c.note}</div>
                                <div className="font-mono text-[10px] text-slate-400">
                                  {new Date(c.createdAt).toLocaleDateString()} · {c.deviceId}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Flow 4: Request Evidence Packet CTA + Status Update Controls */}
                    <div className="pt-4 border-t border-slate-200 space-y-3">
                      <button
                        type="button"
                        disabled={packetLoading}
                        onClick={() => handleGenerateEvidencePacket(selectedHazard.id)}
                        className="w-full py-3 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[44px]"
                      >
                        <FileText className="w-4 h-4" />
                        <span>
                          {packetLoading
                            ? 'Assembling Cryptographic Packet...'
                            : `Request Evidence Packet (PDF / JSON) for Hazard #${selectedHazard.id}`}
                        </span>
                      </button>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Update verification state:</span>
                        <div className="flex items-center gap-2">
                          {(['open', 'resolved', 'disputed'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleUpdateStatus(selectedHazard.id, st)}
                              className={`underline hover:text-slate-900 ${
                                selectedHazard.status === st ? 'font-bold text-slate-900' : ''
                              }`}
                            >
                              Mark {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      No road hazards match the current filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setWardFilter('all');
                      }}
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                    >
                      Reset Map Filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: PUBLIC WARD ACCOUNTABILITY DASHBOARD (Flow 5) */}
        {activeTab === 'dashboard' && (
          <WardDashboardView
            stats={dashboardStats}
            onSelectWardFilter={(wardId) => {
              setWardFilter(wardId);
              setActiveTab('map');
            }}
          />
        )}

        {/* VIEW 3: EVIDENCE DOSSIER OVERVIEW */}
        {activeTab === 'dossier' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <ShieldAlert className="w-4 h-4" />
              <span>EVIDENCE SUMMARY TO SUPPORT YOUR OWN CLAIM, NOT AN AUTOMATIC FILING</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Generate a 2019 High Court Road Maintenance Evidence Packet
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Select any documented road hazard below to assemble a downloadable JSON + printable PDF dossier containing all timestamped photographs, SHA-256 digests, BBMP Ward Officer contacts, unresolved duration, and the 2019 Karnataka High Court statutory maintenance citation.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {hazards.map((h) => (
                <div
                  key={h.id}
                  className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-slate-900">
                      Hazard #{h.id} · {h.category.replace('_', ' ')} ({h.wardName})
                    </div>
                    <div className="font-mono text-slate-500">
                      {h.daysOpen} days open · {h.confirmationCount} confirmations · {h.status.toUpperCase()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateEvidencePacket(h.id)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 min-h-[40px]"
                  >
                    Open Packet
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: AGENT PIPELINE & ORCHESTRATE ADK SPEC */}
        {activeTab === 'agents' && <AgentPipelineView />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Sakshi — Civic Evidence-Chain Agent for Bengaluru Road Hazards (IBM Bobathon: Smarter Streets, Better Living)
          </span>
          <span>
            Evidence summary only; citizens independently file any legal or municipal claim.
          </span>
        </div>
      </footer>

      {/* Mobile Ergonomic Bottom Navigation Bar (<15% viewport height, >=44px touch targets) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center h-14 no-print"
      >
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[11px] font-medium ${
            activeTab === 'map' ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <MapIcon className="w-4 h-4" />
          <span>Map</span>
        </button>
        <button
          type="button"
          onClick={() => setIsReportModalOpen(true)}
          className="min-h-[44px] flex flex-col items-center justify-center text-[11px] font-medium text-slate-500"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Report</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[11px] font-medium ${
            activeTab === 'dashboard' ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Wards</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('agents')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[11px] font-medium ${
            activeTab === 'agents' ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Agents</span>
        </button>
      </nav>

      {/* Modals */}
      <ReportHazardModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        wards={wards}
        deviceId={currentUser?.uid || deviceId}
        authToken={authToken}
        onReportSubmitted={(result) => {
          fetchAllData();
          if (result.hazard) {
            setSelectedHazardId(result.hazard.id);
          }
          if (result.action === 'merged_duplicate') {
            setBannerNotice(
              `Agent 2 Deduplication: Matched open hazard #${result.hazard?.id} (${result.distanceMeters}m away). Incremented confirmation count to ${result.hazard?.confirmationCount} instead of creating a duplicate pin.`
            );
          } else {
            setBannerNotice(
              `New hazard #${result.hazard?.id} recorded in ${result.hazard?.wardName} with SHA-256 tamper-evident digest.`
            );
          }
        }}
      />

      <EvidencePacketModal
        packet={activePacket}
        onClose={() => setActivePacket(null)}
      />
    </div>
  );
}
