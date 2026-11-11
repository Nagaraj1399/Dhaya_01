import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { HazardRecord, WardPolygonData } from '../types.ts';

interface HazardMapProps {
  hazards: HazardRecord[];
  wards: WardPolygonData[];
  selectedHazardId: number | null;
  onSelectHazard: (hazard: HazardRecord) => void;
  showWardBoundaries: boolean;
}

interface ProximityCluster {
  id: string;
  lat: number;
  lng: number;
  items: HazardRecord[];
}

function clusterHazardsByZoom(hazards: HazardRecord[], zoom: number): ProximityCluster[] {
  // At zoom >= 15, show individual pins unless within ~60m
  const thresholdDeg = zoom >= 15 ? 0.0005 : zoom >= 13 ? 0.004 : 0.015;
  const used = new Set<number>();
  const clusters: ProximityCluster[] = [];

  for (const h of hazards) {
    if (used.has(h.id)) continue;
    const group = [h];
    used.add(h.id);

    for (const other of hazards) {
      if (used.has(other.id)) continue;
      const dLat = Math.abs(h.lat - other.lat);
      const dLng = Math.abs(h.lng - other.lng);
      if (dLat <= thresholdDeg && dLng <= thresholdDeg) {
        group.push(other);
        used.add(other.id);
      }
    }

    const avgLat = group.reduce((s, item) => s + item.lat, 0) / group.length;
    const avgLng = group.reduce((s, item) => s + item.lng, 0) / group.length;
    clusters.push({
      id: group.map((g) => g.id).join('-'),
      lat: avgLat,
      lng: avgLng,
      items: group,
    });
  }

  return clusters;
}

export const HazardMap: React.FC<HazardMapProps> = ({
  hazards,
  wards,
  selectedHazardId,
  onSelectHazard,
  showWardBoundaries,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polygonsLayerRef = useRef<L.LayerGroup | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(12);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.9616, 77.6346],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors · BBMP OpenCity GIS',
      maxZoom: 19,
    }).addTo(map);

    const polygonsGroup = L.layerGroup().addTo(map);
    const markersGroup = L.layerGroup().addTo(map);

    polygonsLayerRef.current = polygonsGroup;
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render BBMP Ward Polygons
  useEffect(() => {
    const polyGroup = polygonsLayerRef.current;
    if (!polyGroup) return;
    polyGroup.clearLayers();

    if (!showWardBoundaries) return;

    for (const ward of wards) {
      const ring = ward.geometry.coordinates[0];
      if (!ring) continue;
      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      const latLngs: [number, number][] = ring.map((pt) => [pt[1], pt[0]]);
      const polygon = L.polygon(latLngs, {
        color: '#334155',
        weight: 1.5,
        dashArray: '4, 4',
        fillColor: '#0F172A',
        fillOpacity: 0.04,
      });

      polygon.bindTooltip(
        `<div style="font-family: 'Public Sans', sans-serif; font-size: 12px;">
          <strong>Ward #${ward.wardId}: ${ward.wardName}</strong><br/>
          <span>${ward.zone} · ${ward.officerName}</span>
        </div>`,
        { sticky: true }
      );
      polygon.addTo(polyGroup);
    }
  }, [wards, showWardBoundaries]);

  // Render Status-Colored Accessible Markers & Proximity Clusters
  useEffect(() => {
    const markersGroup = markersLayerRef.current;
    const map = mapInstanceRef.current;
    if (!markersGroup || !map) return;

    markersGroup.clearLayers();
    const clusters = clusterHazardsByZoom(hazards, currentZoom);

    for (const cluster of clusters) {
      if (cluster.items.length > 1) {
        const openCount = cluster.items.filter((i) => i.status === 'open').length;
        const primaryItem = cluster.items[0];
        const html = `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border-radius: 9999px;
            background: #0F172A;
            color: #FFFFFF;
            border: 3px solid ${openCount > 0 ? '#DC2626' : '#16A34A'};
            box-shadow: 0 4px 12px rgba(15,23,42,0.35);
            font-family: 'IBM Plex Mono', monospace;
            font-weight: 700;
            font-size: 13px;
          " title="${cluster.items.length} hazards clustered in ${primaryItem.wardName}">
            ${cluster.items.length}
          </div>
        `;
        const icon = L.divIcon({
          className: 'sakshi-marker-icon',
          html,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });

        const marker = L.marker([cluster.lat, cluster.lng], { icon });
        marker.on('click', () => {
          map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, 16));
          onSelectHazard(primaryItem);
        });
        marker.addTo(markersGroup);
      } else {
        const hazard = cluster.items[0];
        const isSelected = hazard.id === selectedHazardId;
        // WCAG AA accessible color + shape glyph encoding (not hue alone)
        const bgColor =
          hazard.status === 'open'
            ? '#DC2626' // High-contrast Crimson
            : hazard.status === 'resolved'
            ? '#15803D' // High-contrast Forest Green
            : '#B45309'; // High-contrast Amber

        const statusSymbol =
          hazard.status === 'open'
            ? '!'
            : hazard.status === 'resolved'
            ? '✓'
            : '?';

        const size = isSelected ? 40 : 34;
        const html = `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: ${size}px;
            height: ${size}px;
            border-radius: ${hazard.status === 'open' ? '10px' : hazard.status === 'resolved' ? '9999px' : '6px'};
            background: ${bgColor};
            color: #FFFFFF;
            border: ${isSelected ? '3px solid #0F172A' : '2px solid #FFFFFF'};
            box-shadow: 0 3px 10px rgba(15,23,42,0.35);
            font-family: 'IBM Plex Mono', monospace;
            font-weight: 700;
            font-size: 12px;
            transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
            transition: transform 150ms ease;
          " title="Hazard #${hazard.id} (${hazard.status.toUpperCase()}) · ${hazard.wardName} · ${hazard.daysOpen}d open · ${hazard.confirmationCount} confirmations">
            <span>${statusSymbol}${hazard.daysOpen}d</span>
          </div>
        `;

        const icon = L.divIcon({
          className: 'sakshi-marker-icon',
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker([hazard.lat, hazard.lng], { icon });
        marker.on('click', () => {
          onSelectHazard(hazard);
        });
        marker.addTo(markersGroup);
      }
    }
  }, [hazards, selectedHazardId, currentZoom, onSelectHazard]);

  // Pan smoothly when selected hazard changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedHazardId) return;
    const found = hazards.find((h) => h.id === selectedHazardId);
    if (found) {
      map.panTo([found.lat, found.lng], { animate: true });
    }
  }, [selectedHazardId, hazards]);

  return (
    <div className="relative isolate z-0 w-full h-full min-h-[380px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
      <div
        ref={mapContainerRef}
        data-testid="sakshi-leaflet-map"
        className="w-full h-full min-h-[380px] z-0"
      />
      {/* Accessible Map Legend (Color + Shape + Text Label) */}
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 shadow-sm flex flex-wrap items-center gap-4">
        <span className="font-semibold text-slate-900">Pin Key:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#DC2626] text-white font-mono text-[10px] font-bold">
            !
          </span>
          <span>Open Hazard</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#15803D] text-white font-mono text-[10px] font-bold">
            ✓
          </span>
          <span>Resolved</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-[#B45309] text-white font-mono text-[10px] font-bold">
            ?
          </span>
          <span>Disputed Closure</span>
        </span>
      </div>
    </div>
  );
};
