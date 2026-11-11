import React from 'react';
import { Download, Printer, ShieldAlert, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { EvidencePacketDocument } from '../types.ts';

interface EvidencePacketModalProps {
  packet: EvidencePacketDocument | null;
  onClose: () => void;
}

export const EvidencePacketModal: React.FC<EvidencePacketModalProps> = ({
  packet,
  onClose,
}) => {
  if (!packet) return null;

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(packet, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${packet.packetId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-dossier-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-xl my-auto max-h-[92vh] flex flex-col">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50 no-print shrink-0">
          <div>
            <h2 id="evidence-dossier-title" className="text-base font-bold text-slate-900 font-display">
              Sakshi Cryptographic Evidence Dossier
            </h2>
            <p className="text-xs font-mono text-slate-500">{packet.packetId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors min-h-[40px] whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download JSON Packet
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors min-h-[40px] whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close evidence packet"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Evidence Packet Content */}
        <div className="p-6 space-y-6 overflow-y-auto text-slate-900">
          {/* Mandatory Non-Filing Notice */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-800 shrink-0" />
              <span>
                EVIDENCE SUMMARY TO SUPPORT YOUR OWN CLAIM, NOT AN AUTOMATIC FILING
              </span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              {packet.legalBasis.disclaimer}
            </p>
          </div>

          {/* 2019 High Court Statutory Citation */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-xs font-semibold text-slate-900">
              Statutory Legal Basis — {packet.legalBasis.court} ({packet.legalBasis.rulingYear})
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {packet.legalBasis.citation}
            </p>
            <p className="text-[11px] font-mono text-slate-500">
              Provision: {packet.legalBasis.statutoryProvision}
            </p>
          </div>

          {/* Key Metrics & Ward Officer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h3 className="text-xs font-semibold text-slate-500">
                Hazard Chronology &amp; Duration
              </h3>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {packet.daysUnresolved} Days Unresolved
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  Hazard ID: <span className="font-mono font-semibold">#{packet.hazardId}</span> ·{' '}
                  <span>{packet.category.replace('_', ' ')}</span> ·{' '}
                  <span>Severity: {packet.severity}</span> ·{' '}
                  <span>Status: {packet.status}</span>
                </div>
                <div>
                  First Reported:{' '}
                  <span className="font-mono">{packet.timeline.firstReportedIso}</span>
                </div>
                <div>
                  Corroborating Reports:{' '}
                  <span className="font-mono font-semibold">{packet.confirmationCount}</span> independent citizen logs
                </div>
                <div>
                  Triage Audit: AI suggested{' '}
                  <span className="font-mono">
                    {packet.triageAudit.aiSuggestedCategory}/{packet.triageAudit.aiSuggestedSeverity}
                  </span>{' '}
                  · Human Override:{' '}
                  <span className="font-mono">
                    {packet.triageAudit.humanOverridden ? 'Yes' : 'No (Confirmed)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h3 className="text-xs font-semibold text-slate-500">
                Jurisdiction &amp; Accountable BBMP Ward Officer
              </h3>
              <div className="text-base font-bold text-slate-900">
                Ward #{packet.ward.wardId} — {packet.ward.wardName}
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>Zone: {packet.ward.zone}</div>
                <div>Officer: {packet.ward.officerName}</div>
                <div className="font-mono">
                  Phone: {packet.ward.officerPhone} · Email: {packet.ward.officerEmail}
                </div>
                <div className="font-mono pt-1">
                  GPS: {packet.location.lat.toFixed(5)} N, {packet.location.lng.toFixed(5)} E ({packet.location.crs})
                </div>
                <div className="pt-1 no-print">
                  <a
                    href={packet.location.osmVerifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-slate-900 underline hover:text-slate-600"
                  >
                    <span>Verify coordinates on OpenStreetMap</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Chronological Chain of Custody */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 font-display">
              Cryptographic Chain of Custody ({packet.evidenceChain.length} Verified Logs)
            </h3>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {packet.evidenceChain.map((entry) => (
                <div key={entry.sequenceNumber} className="p-4 bg-white space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      #{entry.sequenceNumber} · {entry.eventType.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-slate-500">{entry.timestampIso}</span>
                  </div>
                  <p className="text-slate-700">{entry.note}</p>
                  <div className="font-mono text-[11px] text-slate-500 break-all">
                    SHA-256: {entry.sha256Hash} · Session: {entry.deviceId}
                  </div>
                  {entry.photoUrl && (
                    <div className="pt-2">
                      <img
                        src={entry.photoUrl}
                        alt={`Evidence log ${entry.sequenceNumber}`}
                        referrerPolicy="no-referrer"
                        className="h-36 rounded-lg border border-slate-200 object-cover"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Packet Root Integrity Hash */}
          <div className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Packet Root SHA-256 Integrity Digest</span>
            </div>
            <div className="break-all text-slate-300">{packet.packetIntegrityHash}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
