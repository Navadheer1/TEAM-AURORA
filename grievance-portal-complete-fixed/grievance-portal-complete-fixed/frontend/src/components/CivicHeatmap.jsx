import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Map as MapIcon, Filter, RefreshCw, Layers, ShieldAlert, Activity,
  AlertTriangle, Crosshair, Navigation, Radio, CheckCircle, Flame,
  Droplets, Zap, Shield, AlertOctagon, RotateCcw, Search, Eye
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { identifyHotspots } from '../utils/geoVisionHelpers';

// Dynamically load Leaflet and Leaflet Heat plugin
let L = null;

async function loadLeafletWithHeat() {
  if (L && L.heatLayer) return L;
  
  // 1. Import base Leaflet
  L = await import('leaflet');
  
  // Fix standard default icon
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  // 2. Inject Leaflet Heat plugin script from CDN dynamically
  if (!L.heatLayer) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
      script.onload = () => {
        console.log('✅ Leaflet.heat plugin loaded successfully.');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load Leaflet.heat script.');
        reject(new Error('Leaflet Heat plugin failed to load'));
      };
      document.head.appendChild(script);
    });
  }

  // 3. Inject Leaflet MarkerCluster plugin dynamically with 3s timeout fallback
  if (!L.markerClusterGroup) {
    try {
      await Promise.race([
        new Promise((resolve, reject) => {
          const link1 = document.createElement('link');
          link1.rel = 'stylesheet';
          link1.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
          document.head.appendChild(link1);

          const link2 = document.createElement('link');
          link2.rel = 'stylesheet';
          link2.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
          document.head.appendChild(link2);

          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
          script.onload = () => {
            console.log('✅ Leaflet.markercluster plugin loaded successfully.');
            resolve();
          };
          script.onerror = () => reject(new Error('MarkerCluster failed to load'));
          document.head.appendChild(script);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MarkerCluster timeout')), 3000))
      ]);
    } catch (err) {
      console.warn('⚠️ Falling back to standard markers:', err.message);
    }
  }

  return L;
}

// Category tabs
const HEATMAP_TABS = [
  { id: 'all', label: 'All Issues', icon: Layers },
  { id: 'roads', label: 'Roads', icon: Navigation },
  { id: 'sanitation', label: 'Sanitation', icon: Activity },
  { id: 'water', label: 'Water', icon: Droplets },
  { id: 'electricity', label: 'Electricity', icon: Zap },
  { id: 'safety', label: 'Safety', icon: Shield },
  { id: 'emergency', label: 'Emergency', icon: AlertOctagon },
];

const SEVERITY_COLORS = {
  Low: '#22c55e',       // Green
  Medium: '#0ea5e9',    // Sky Blue
  High: '#f59e0b',      // Amber
  Critical: '#ef4444',  // Red
  Emergency: '#e11d48'  // Deep Rose
};

// Safe Category Normalization Matcher
function matchesCategoryFilter(point, tabId) {
  if (!point || tabId === 'all') return true;
  
  const cat = String(point.category || '').toLowerCase();
  const subcat = String(point.subcategory || '').toLowerCase();
  const desc = String(point.description || '').toLowerCase();
  const combined = `${cat} ${subcat} ${desc}`;

  switch (tabId) {
    case 'roads':
      return (
        combined.includes('road') ||
        combined.includes('pothole') ||
        combined.includes('footpath') ||
        combined.includes('sidewalk') ||
        combined.includes('asphalt') ||
        combined.includes('traffic')
      );
    case 'sanitation':
      return (
        combined.includes('garbage') ||
        combined.includes('waste') ||
        combined.includes('dump') ||
        combined.includes('trash') ||
        combined.includes('sanitation') ||
        combined.includes('debris') ||
        combined.includes('litter')
      );
    case 'water':
      return (
        combined.includes('water') ||
        combined.includes('sewage') ||
        combined.includes('drain') ||
        combined.includes('flood') ||
        combined.includes('pipe') ||
        combined.includes('leak')
      );
    case 'electricity':
      return (
        combined.includes('light') ||
        combined.includes('lamp') ||
        combined.includes('electric') ||
        combined.includes('power') ||
        combined.includes('street_light') ||
        combined.includes('streetlight') ||
        combined.includes('wire')
      );
    case 'safety':
      return (
        cat.includes('crime') ||
        cat.includes('corruption') ||
        combined.includes('safety') ||
        combined.includes('police') ||
        combined.includes('bribe') ||
        combined.includes('theft') ||
        combined.includes('hazard')
      );
    case 'emergency':
      return (
        point.isEmergency === true ||
        ['emergency', 'critical'].includes(String(point.severity || '').toLowerCase()) ||
        cat.includes('fire') ||
        combined.includes('disaster') ||
        combined.includes('gas_leak') ||
        combined.includes('flood')
      );
    default:
      return true;
  }
}

// Safe Severity Normalization Matcher
function matchesSeverityFilter(point, selectedSev) {
  if (!point || selectedSev === 'all') return true;
  const pSev = String(point.severity || 'Medium').toLowerCase().trim();
  const target = String(selectedSev).toLowerCase().trim();
  
  if (target === 'emergency' || target === 'critical') {
    return pSev === 'emergency' || pSev === 'critical' || point.isEmergency === true;
  }
  return pSev === target;
}

// Safe Status Normalization Matcher
function matchesStatusFilter(point, selectedStat) {
  if (!point || selectedStat === 'all') return true;
  const pStat = String(point.status || 'pending').toLowerCase().trim();
  const target = String(selectedStat).toLowerCase().trim();

  if (target === 'closed' || target === 'resolved') {
    return pStat === 'closed' || pStat === 'resolved';
  }
  if (target === 'in_progress') {
    return ['investigating', 'action_taken', 'in_progress', 'assigned'].includes(pStat);
  }
  if (target === 'pending') {
    return ['pending', 'reported'].includes(pStat);
  }
  if (target === 'under_review') {
    return pStat === 'under_review';
  }
  return pStat === target;
}

export default function CivicHeatmap({ height = '420px' }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);
  const markersGroupRef = useRef(null);
  const hotspotsGroupRef = useRef(null);
  const osmTileRef = useRef(null);
  const satTileRef = useRef(null);

  const [activeTab, setActiveTab] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [mapMode, setMapMode] = useState('map'); // 'map' | 'satellite'
  const [renderError, setRenderError] = useState(null);

  // Query complaint coordinates
  const { data: heatmapData, isLoading, refetch, isFetching, isError } = useQuery({
    queryKey: ['complaintsHeatmap'],
    queryFn: () => api.get('/complaints/heatmap').then(res => res.data.data),
    staleTime: 60000 // Cache for 1 min
  });

  const rawPoints = Array.isArray(heatmapData) ? heatmapData : [];

  // Filter complaints coordinates safely in memory
  const filteredPoints = useMemo(() => {
    try {
      return rawPoints.filter(p => {
        if (!p || typeof p !== 'object') return false;
        const validLat = p.lat != null && !isNaN(Number(p.lat));
        const validLng = p.lng != null && !isNaN(Number(p.lng));
        if (!validLat || !validLng) return false;

        const catMatch = matchesCategoryFilter(p, activeTab);
        const sevMatch = matchesSeverityFilter(p, filterSeverity);
        const statMatch = matchesStatusFilter(p, filterStatus);

        return catMatch && sevMatch && statMatch;
      });
    } catch (err) {
      console.error('⚠️ [Heatmap] Error filtering points:', err);
      return [];
    }
  }, [rawPoints, activeTab, filterSeverity, filterStatus]);

  // Calculate GeoVision Analytics safely
  const hotspots = useMemo(() => {
    try {
      return identifyHotspots(filteredPoints);
    } catch (err) {
      console.warn('⚠️ [Heatmap] Hotspots calculation fallback:', err);
      return [];
    }
  }, [filteredPoints]);

  const hasActiveFilters = activeTab !== 'all' || filterSeverity !== 'all' || filterStatus !== 'all';

  const resetAllFilters = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setActiveTab('all');
    setFilterSeverity('all');
    setFilterStatus('all');
  }, []);

  // Initialize Map once
  useEffect(() => {
    let mounted = true;
    let map = null;

    const initMap = async () => {
      try {
        const Leaflet = await loadLeafletWithHeat();
        if (!mounted || !mapContainerRef.current || mapInstanceRef.current) return;

        // Default center in Andhra Pradesh (Guntur)
        const defaultCenter = [16.3067, 80.4365];

        map = Leaflet.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: 12,
          zoomControl: true,
          scrollWheelZoom: true
        });

        // Base tile layers
        osmTileRef.current = Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        satTileRef.current = Leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: '© Esri, Maxar, Earthstar Geographics',
          maxZoom: 19,
        });

        mapInstanceRef.current = map;

        // Marker groups
        markersGroupRef.current = Leaflet.markerClusterGroup 
          ? Leaflet.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false, disableClusteringAtZoom: 15 })
          : Leaflet.layerGroup();
        markersGroupRef.current.addTo(map);

        hotspotsGroupRef.current = Leaflet.layerGroup().addTo(map);

        // Center map to initial points if available
        if (rawPoints.length > 0) {
          const latSum = rawPoints.reduce((sum, p) => sum + Number(p.lat || 16.3067), 0);
          const lngSum = rawPoints.reduce((sum, p) => sum + Number(p.lng || 80.4365), 0);
          map.setView([latSum / rawPoints.length, lngSum / rawPoints.length], 12);
        }
      } catch (err) {
        console.error('Failed to initialize Leaflet Heatmap:', err);
        setRenderError('Unable to load map tiles.');
      }
    };

    initMap();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        heatLayerRef.current = null;
        markersGroupRef.current = null;
        hotspotsGroupRef.current = null;
      }
    };
  }, []);

  // Update Base Layer (Map vs Satellite) without recreating map
  useEffect(() => {
    if (!mapInstanceRef.current || !osmTileRef.current || !satTileRef.current) return;
    try {
      if (mapMode === 'satellite') {
        if (mapInstanceRef.current.hasLayer(osmTileRef.current)) {
          mapInstanceRef.current.removeLayer(osmTileRef.current);
        }
        if (!mapInstanceRef.current.hasLayer(satTileRef.current)) {
          mapInstanceRef.current.addLayer(satTileRef.current);
        }
      } else {
        if (mapInstanceRef.current.hasLayer(satTileRef.current)) {
          mapInstanceRef.current.removeLayer(satTileRef.current);
        }
        if (!mapInstanceRef.current.hasLayer(osmTileRef.current)) {
          mapInstanceRef.current.addLayer(osmTileRef.current);
        }
      }
    } catch (err) {
      console.warn('⚠️ [Heatmap] Layer toggle error:', err);
    }
  }, [mapMode]);

  // Update Markers & Heatmap Layer in-place when filters change
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    try {
      // 1. Update Heat Layer
      if (heatLayerRef.current) {
        mapInstanceRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }

      if (showHeat && filteredPoints.length > 0) {
        const heatPoints = filteredPoints.map(p => {
          let intensity = 0.5;
          const sev = String(p.severity || '').toLowerCase();
          if (sev === 'emergency' || sev === 'critical' || p.isEmergency) intensity = 1.0;
          else if (sev === 'high') intensity = 0.8;
          else if (sev === 'medium') intensity = 0.5;
          else intensity = 0.3;
          return [Number(p.lat), Number(p.lng), intensity];
        });

        heatLayerRef.current = L.heatLayer(heatPoints, {
          radius: 28,
          blur: 20,
          maxZoom: 16,
          gradient: {
            0.2: '#22c55e',
            0.4: '#0ea5e9',
            0.6: '#f59e0b',
            0.8: '#f43f5e',
            1.0: '#e11d48'
          }
        }).addTo(mapInstanceRef.current);
      }

      // 2. Update Markers
      if (markersGroupRef.current) {
        markersGroupRef.current.clearLayers();

        if (showMarkers && filteredPoints.length > 0) {
          filteredPoints.forEach(p => {
            const sevKey = p.severity || 'Medium';
            const color = SEVERITY_COLORS[sevKey] || SEVERITY_COLORS.Medium;
            
            const markerHtml = `
              <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
                <div style="position: absolute; width: 22px; height: 22px; background-color: ${color}; border-radius: 50%; opacity: 0.3; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                <div style="width: 14px; height: 14px; background-color: ${color}; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
              </div>
            `;

            const customIcon = L.divIcon({
              html: markerHtml,
              className: 'custom-civic-pin',
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            });

            const marker = L.marker([Number(p.lat), Number(p.lng)], { icon: customIcon });

            const popupContent = `
              <div style="font-family: inherit; font-size: 12px; min-width: 190px; padding: 4px 0;">
                <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 2px;">
                  ${p.subcategory ? p.subcategory.replace(/_/g, ' ').toUpperCase() : (p.category || 'CIVIC ISSUE').toUpperCase()}
                </div>
                <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
                  📍 ${p.address && p.address !== 'N/A' ? p.address : `${p.district || ''}, ${p.state || ''}`}
                </div>
                <div style="display: flex; gap: 4px; margin-bottom: 6px;">
                  <span style="background: #f1f5f9; color: #334155; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">
                    ID: #${p.complaintId || p.id?.substring(0, 8)}
                  </span>
                  <span style="background: ${color}20; color: ${color}; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">
                    ${p.severity || 'Medium'}
                  </span>
                </div>
                ${p.description ? `<p style="color: #475569; font-size: 11px; margin: 0 0 6px 0; line-height: 1.3;">${p.description.substring(0, 80)}${p.description.length > 80 ? '...' : ''}</p>` : ''}
                <a href="/track?id=${p.complaintId || p.id}" style="display: inline-block; color: #2563eb; font-weight: 700; font-size: 11px; text-decoration: none;">
                  Track Incident →
                </a>
              </div>
            `;

            marker.bindPopup(popupContent);
            markersGroupRef.current.addLayer(marker);
          });
        }
      }

      // 3. Update Hotspots Circles
      if (hotspotsGroupRef.current) {
        hotspotsGroupRef.current.clearLayers();

        if (showHotspots && hotspots.length > 0) {
          hotspots.forEach(h => {
            const circleColor = h.riskLevel === 'High' ? '#ef4444' : '#f59e0b';
            const circle = L.circle([Number(h.lat), Number(h.lng)], {
              color: circleColor,
              fillColor: circleColor,
              fillOpacity: 0.15,
              radius: h.radius || 350,
              weight: 1.5,
              dashArray: '4, 4'
            });

            circle.bindTooltip(`<b>${h.riskLevel} Intensity Civic Zone</b><br/>${h.count} incidents clustered`, {
              permanent: false,
              direction: 'top',
              className: 'hotspot-tooltip'
            });

            hotspotsGroupRef.current.addLayer(circle);
          });
        }
      }
    } catch (err) {
      console.error('⚠️ [Heatmap] Error updating map layers:', err);
    }
  }, [filteredPoints, showHeat, showMarkers, showHotspots, hotspots]);

  const handleRefetch = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      await refetch();
      toast.success('Live civic telemetry refreshed');
    } catch (err) {
      toast.error('Failed to refresh telemetry feed');
    }
  };

  return (
    <div className="card p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden flex flex-col space-y-4">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
              Live Civic Heatmap
            </h3>
            {/* Live Indicator */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time view of reported civic issues and incidents in your area • <span className="text-slate-400">Updated just now</span>
          </p>
        </div>

        {/* Reload & Base map toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Map / Satellite */}
          <div className="flex items-center h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setMapMode('map'); }}
              className={`px-2.5 py-1 rounded-md transition-all ${
                mapMode === 'map'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setMapMode('satellite'); }}
              className={`px-2.5 py-1 rounded-md transition-all ${
                mapMode === 'satellite'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Satellite
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefetch}
            disabled={isLoading || isFetching}
            className="btn-secondary h-8 py-0 px-2.5 text-xs font-semibold flex items-center gap-1.5 active:scale-95"
            title="Refresh Map Telemetry"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {HEATMAP_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab(tab.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-95 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-100 dark:ring-blue-900/40 font-bold'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Icon size={13} className={isActive ? 'text-white' : 'text-slate-400'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Secondary Controls Toolbar (Severity, Status, Layers & Reset) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Severity filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Severity:</span>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium"
            >
              <option value="all">All Severities</option>
              <option value="emergency">Emergency / Critical</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium</option>
              <option value="low">Low / Routine</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending / Reported</option>
              <option value="under_review">Under Review</option>
              <option value="in_progress">In Progress / Assigned</option>
              <option value="closed">Resolved / Closed</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="py-1 px-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={11} />
              <span>Clear Filters</span>
            </button>
          )}
        </div>

        {/* Layer Toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={showHeat}
              onChange={e => setShowHeat(e.target.checked)}
              className="rounded accent-blue-600"
            />
            <span>Heat Density</span>
          </label>
          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={e => setShowMarkers(e.target.checked)}
              className="rounded accent-blue-600"
            />
            <span>Incident Pins</span>
          </label>
        </div>
      </div>

      {/* Map Canvas with Overlays */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800" style={{ height }}>
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-xs font-semibold text-blue-600 animate-pulse">Loading live telemetry coordinates...</span>
          </div>
        )}

        {/* Error Overlay */}
        {renderError && (
          <div className="absolute inset-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle size={24} className="text-amber-500" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Unable to update map</h4>
            <p className="text-xs text-slate-500 max-w-xs">{renderError}</p>
            <button
              type="button"
              onClick={handleRefetch}
              className="btn-primary text-xs py-1.5 px-3 uppercase font-bold mt-1"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty Filter State Overlay (Never blank page) */}
        {!isLoading && !renderError && filteredPoints.length === 0 && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-11 h-11 rounded-2xl bg-white/10 text-white flex items-center justify-center mb-2.5 border border-white/20">
              <Search size={20} />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">No incidents found</h4>
            <p className="text-xs text-slate-200/80 max-w-xs mb-3">
              There are no reported civic incidents matching the selected filters.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5"
            >
              <RotateCcw size={12} />
              <span>Clear Filters</span>
            </button>
          </div>
        )}

        {/* Leaflet Map DOM Element */}
        <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-10 bg-white/95 dark:bg-slate-900/95 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-lg text-[10px] space-y-1 font-semibold text-slate-700 dark:text-slate-300 backdrop-blur-sm">
          <div className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Incident Severity
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            <span>Emergency / Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>High Risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Low / Routine</span>
          </div>
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[9px] text-slate-400 font-normal">
            {filteredPoints.length > 0 
              ? `Displaying ${filteredPoints.length} of ${rawPoints.length} incidents`
              : `No incidents match selected filters (${rawPoints.length} total)`}
          </div>
        </div>
      </div>

    </div>
  );
}
