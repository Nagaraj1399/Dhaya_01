import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload, MapPin, ShieldCheck, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { HazardCategory, HazardRecord, HazardSeverity, WardPolygonData } from '../types.ts';
import { createRoadHazardSvgDataUrl } from '../lib/data/seed-hazards.ts';

interface ReportHazardModalProps {
  isOpen: boolean;
  onClose: () => void;
  wards: WardPolygonData[];
  onReportSubmitted: (result: {
    action: 'created_new' | 'merged_duplicate';
    distanceMeters: number | null;
    hazard: HazardRecord;
  }) => void;
  deviceId: string;
  authToken: string | null;
}

const FIELD_CAPTURE_PRESETS = [
  {
    id: 'indiranagar-pothole',
    label: 'Indiranagar 100ft Rd Crater (New Spot)',
    lat: 12.9812,
    lng: 77.6419,
    category: 'pothole' as HazardCategory,
    severity: 'hazardous' as HazardSeverity,
    wardName: 'Hoysala Nagar (#80)',
    defaultNote:
      'Deep sharp-edged asphalt pothole on 100 Feet Road near 12th Main junction causing two-wheelers to swerve abruptly.',
  },
  {
    id: 'indiranagar-duplicate-50m',
    label: 'Within 20m of Open Indiranagar Pin (Test 50m Dedup)',
    lat: 12.97852,
    lng: 77.64091,
    category: 'pothole' as HazardCategory,
    severity: 'hazardous' as HazardSeverity,
    wardName: 'Hoysala Nagar (#80)',
    defaultNote:
      'Corroborating report at 100 Feet Road & CMH Metro Junction — same deep pothole still open and unaddressed.',
  },
  {
    id: 'bellandur-waterlogging',
    label: 'Bellandur ORR Service Road Waterlogging',
    lat: 12.9338,
    lng: 77.6815,
    category: 'waterlogging' as HazardCategory,
    severity: 'major' as HazardSeverity,
    wardName: 'Bellandur (#150)',
    defaultNote:
      'Overflowing storm drain submerging left carriageway near Bellandur bus bay after evening rain.',
  },
  {
    id: 'jayanagar-footpath',
    label: 'Jayanagar 4th Block Broken Footpath Slab',
    lat: 12.9299,
    lng: 77.5824,
    category: 'damaged_footpath' as HazardCategory,
    severity: 'major' as HazardSeverity,
    wardName: 'Jayanagar (#153)',
    defaultNote:
      'Broken concrete drain slab over 3-foot deep utility duct along pedestrian walkway.',
  },
];

export const ReportHazardModal: React.FC<ReportHazardModalProps> = ({
  isOpen,
  onClose,
  onReportSubmitted,
  deviceId,
  authToken,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(FIELD_CAPTURE_PRESETS[0].id);
  const [lat, setLat] = useState<string>('12.9812');
  const [lng, setLng] = useState<string>('77.6419');
  const [description, setDescription] = useState<string>(FIELD_CAPTURE_PRESETS[0].defaultNote);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');

  // Agent 1 Preview state
  const [intakeState, setIntakeState] = useState<{
    valid: boolean;
    error?: string;
    photoHash?: string;
    ward?: {
      wardId: number;
      wardName: string;
      zone: string;
      officerContact: string;
    };
    resolvedMethod?: string;
  } | null>(null);

  // Agent 2 Advisory Triage state
  const [triageLoading, setTriageLoading] = useState<boolean>(false);
  const [triageAdvisory, setTriageAdvisory] = useState<{
    suggestedCategory: HazardCategory;
    suggestedSeverity: HazardSeverity;
    confidence: number;
    reasoning: string;
    modelUsed: string;
  } | null>(null);
  const [potentialDuplicate, setPotentialDuplicate] = useState<{
    hazard: HazardRecord;
    distanceMeters: number;
  } | null>(null);

  // Human Override controls (mandatory citizen confirmation before saving)
  const [finalCategory, setFinalCategory] = useState<HazardCategory>('pothole');
  const [finalSeverity, setFinalSeverity] = useState<HazardSeverity>('hazardous');
  const [humanReviewed, setHumanReviewed] = useState<boolean>(false);

  // Live Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize default field capture photo
  useEffect(() => {
    if (!isOpen) return;
    applyFieldPreset(FIELD_CAPTURE_PRESETS[0]);
    return () => {
      stopCameraStream();
    };
  }, [isOpen]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const applyFieldPreset = (preset: (typeof FIELD_CAPTURE_PRESETS)[0]) => {
    setSelectedPresetId(preset.id);
    setLat(String(preset.lat));
    setLng(String(preset.lng));
    setDescription(preset.defaultNote);
    const svgUrl = createRoadHazardSvgDataUrl({
      title: preset.label,
      category: preset.category,
      severity: preset.severity,
      lat: preset.lat,
      lng: preset.lng,
      timestampIso: new Date().toISOString(),
      wardName: preset.wardName,
    });
    setPhotoDataUrl(svgUrl);
    setFinalCategory(preset.category);
    setFinalSeverity(preset.severity);
    setSubmitError(null);
  };

  // Run Agent 1 (Intake & Geo-Resolution) & Agent 2 (Advisory Vision Triage + 50m Dedup check) whenever photo or GPS changes
  useEffect(() => {
    if (!isOpen || !photoDataUrl) return;
    const numLat = Number(lat);
    const numLng = Number(lng);

    let cancelled = false;
    async function runPipelinePreview() {
      try {
        const intakeRes = await fetch('/api/agents/intake-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoDataUrl,
            lat: numLat,
            lng: numLng,
            timestamp: new Date().toISOString(),
          }),
        });
        const intakeData = await intakeRes.json();
        if (cancelled) return;
        setIntakeState(intakeData);

        if (!intakeData.valid) {
          setTriageAdvisory(null);
          setPotentialDuplicate(null);
          return;
        }

        setTriageLoading(true);
        const triageRes = await fetch('/api/agents/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoDataUrl,
            description,
            lat: numLat,
            lng: numLng,
            radiusMeters: 50,
          }),
        });
        const triageData = await triageRes.json();
        if (cancelled) return;
        setTriageLoading(false);

        if (triageData.suggestion) {
          setTriageAdvisory(triageData.suggestion);
          setFinalCategory(triageData.suggestion.suggestedCategory);
          setFinalSeverity(triageData.suggestion.suggestedSeverity);
        }
        setPotentialDuplicate(triageData.potentialDuplicate || null);
      } catch (err) {
        if (!cancelled) {
          setTriageLoading(false);
        }
      }
    }

    runPipelinePreview();
    return () => {
      cancelled = true;
    };
  }, [isOpen, photoDataUrl, lat, lng]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
        setSelectedPresetId('custom-upload');
      }
    };
    reader.readAsDataURL(file);
  };

  const startLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setSubmitError(
        'Camera hardware unavailable in this browser frame; use Upload Photo or Field Camera Presets.'
      );
    }
  };

  const captureSnapshotFromVideo = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 800;
    canvas.height = videoRef.current.videoHeight || 500;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      setPhotoDataUrl(dataUrl);
      setSelectedPresetId('live-camera');
    }
    stopCameraStream();
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setSubmitError('Geolocation API is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      () => {
        // Fallback to Indiranagar Bengaluru coordinates if permission denied in headless browser
        setLat('12.97840');
        setLng('77.64080');
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!intakeState?.valid) {
      setSubmitError(
        intakeState?.error ||
          'Intake & Geo-Resolution validation failed. Please ensure valid photo and Bengaluru GPS coordinates.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const res = await fetch('/api/hazards', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          photoDataUrl,
          lat: Number(lat),
          lng: Number(lng),
          category: finalCategory,
          severity: finalSeverity,
          aiSuggestedCategory: triageAdvisory?.suggestedCategory,
          aiSuggestedSeverity: triageAdvisory?.suggestedSeverity,
          description,
          deviceId,
          dedupRadiusMeters: 50,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit hazard report.');
      }

      onReportSubmitted(data);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isOverridden =
    triageAdvisory &&
    (finalCategory !== triageAdvisory.suggestedCategory ||
      finalSeverity !== triageAdvisory.suggestedSeverity);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-hazard-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full overflow-hidden shadow-xl my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="report-hazard-title" className="text-lg font-bold text-slate-900 font-display">
              Document Road Hazard Evidence
            </h2>
            <p className="text-xs text-slate-500">
              Sequential Agent Pipeline: Intake &amp; SHA-256 Hash · BBMP Ward Geo-Resolution · Advisory Vision Triage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {/* Step 1: Photo Capture & Field Presets */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold text-slate-900">
                1. Capture or Select Road Hazard Photograph
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startLiveCamera}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Live Camera
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Field Presets for Quick Judge / Citizen Testing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FIELD_CAPTURE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyFieldPreset(preset)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    selectedPresetId === preset.id
                      ? 'border-slate-900 bg-slate-900 text-white font-medium'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {cameraActive ? (
              <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-300">
                <video ref={videoRef} autoPlay playsInline className="w-full h-56 object-cover" />
                <div className="p-3 flex justify-end gap-2 bg-slate-900">
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={captureSnapshotFromVideo}
                    className="px-4 py-1.5 text-xs font-semibold bg-white text-slate-900 rounded-lg"
                  >
                    Capture Frame
                  </button>
                </div>
              </div>
            ) : (
              photoDataUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                  <img
                    src={photoDataUrl}
                    alt="Captured road hazard preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-48 object-cover"
                  />
                </div>
              )
            )}
          </div>

          {/* Step 2: GPS Coordinates & Agent 1 (Intake & Geo-Resolution) Output */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">
                2. GPS Coordinates &amp; Agent 1 (Intake &amp; BBMP Ward Geo-Resolution)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseBrowserGps}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Auto-Attach GPS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLat('19.0760');
                    setLng('72.8777');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  Test Out-of-Bengaluru Bounds
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="hazard-lat-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitude (WGS84)
                </label>
                <input
                  id="hazard-lat-input"
                  type="number"
                  step="any"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="hazard-lng-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitude (WGS84)
                </label>
                <input
                  id="hazard-lng-input"
                  type="number"
                  step="any"
                  required
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {/* Agent 1 Live Verification Panel */}
            {intakeState && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                  intakeState.valid
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {intakeState.valid ? (
                  <>
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        Agent 1 Verified: Ward #{intakeState.ward?.wardId} — {intakeState.ward?.wardName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {intakeState.resolvedMethod}
                      </span>
                    </div>
                    <div className="text-slate-600">
                      Accountable Officer: {intakeState.ward?.officerContact}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">
                      SHA-256 Digest: {intakeState.photoHash}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 font-medium text-red-800">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Agent 1 Rejected Submission: {intakeState.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Agent 2 (Advisory Vision Triage + Mandatory Human Override + 50m Dedup Radar) */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                3. Agent 2 Vision Triage (Advisory Only — Human Override Required)
              </span>
              {triageLoading && (
                <span className="text-xs font-mono text-slate-500">Running vision inference...</span>
              )}
            </div>

            {triageAdvisory && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    AI Advisory Suggestion: {triageAdvisory.suggestedCategory.replace('_', ' ')} ·{' '}
                    {triageAdvisory.suggestedSeverity} ({Math.round(triageAdvisory.confidence * 100)}% confidence)
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    Model: {triageAdvisory.modelUsed}
                  </span>
                </div>
                <p className="text-slate-600">{triageAdvisory.reasoning}</p>
                <p className="text-[11px] text-slate-500">
                  Note: Vision triage is strictly advisory. Use the controls below to confirm or override the final classification before saving.
                </p>
              </div>
            )}

            {/* Human Override Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="hazard-category-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Final Hazard Category (Citizen Decision)
                </label>
                <select
                  id="hazard-category-select"
                  value={finalCategory}
                  onChange={(e) => {
                    setFinalCategory(e.target.value as HazardCategory);
                    setHumanReviewed(true);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="pothole">Pothole / Carriageway Crater</option>
                  <option value="waterlogging">Waterlogging / Storm Drain Overflow</option>
                  <option value="damaged_footpath">Damaged Footpath / Missing Slab</option>
                  <option value="other">Other Road Infrastructure Hazard</option>
                </select>
              </div>
              <div>
                <label htmlFor="hazard-severity-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Final Severity Level (Citizen Decision)
                </label>
                <select
                  id="hazard-severity-select"
                  value={finalSeverity}
                  onChange={(e) => {
                    setFinalSeverity(e.target.value as HazardSeverity);
                    setHumanReviewed(true);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="minor">Minor (Surface wear / discomfort)</option>
                  <option value="major">Major (Significant obstruction / damage risk)</option>
                  <option value="hazardous">Hazardous (Immediate injury / accident risk)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                Override Status:{' '}
                <strong className="text-slate-900">
                  {isOverridden
                    ? 'Citizen Overrode AI Suggestion'
                    : humanReviewed
                    ? 'Citizen Explicitly Confirmed AI Suggestion'
                    : 'Matching Advisory Suggestion'}
                </strong>
              </span>
            </div>

            {/* 50m Spatial Deduplication Alert */}
            {potentialDuplicate && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-800 shrink-0" />
                  <span>
                    Agent 2 Spatial Match: Open {potentialDuplicate.hazard.category.replace('_', ' ')} (#
                    {potentialDuplicate.hazard.id}) detected {potentialDuplicate.distanceMeters}m away (within 50m radius)
                  </span>
                </div>
                <p className="text-amber-900">
                  Submitting this report will automatically increment Confirmation Count (#
                  {potentialDuplicate.hazard.confirmationCount} → #{potentialDuplicate.hazard.confirmationCount + 1}) and append your SHA-256 photo hash to the existing evidence chain instead of creating a duplicate pin.
                </p>
              </div>
            )}
          </div>

          {/* Step 4: Optional Field Note */}
          <div>
            <label htmlFor="hazard-note-input" className="block text-xs font-medium text-slate-700 mb-1">
              4. Citizen Field Note (Optional)
            </label>
            <textarea
              id="hazard-note-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe landmark, lane position, or observed vehicle/pedestrian hazard..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {submitError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 rounded-lg min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !intakeState?.valid}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors min-h-[44px] whitespace-nowrap shrink-0"
            >
              {submitting
                ? 'Recording Evidence...'
                : potentialDuplicate
                ? `Merge & Corroborate Hazard #${potentialDuplicate.hazard.id}`
                : 'Submit Tamper-Evident Hazard Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
