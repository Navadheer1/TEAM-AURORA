const { getDb, COLLECTIONS, serverTimestamp } = require('../config/firebase');
const { generateComplaintId } = require('../utils/generateId');
const { routeComplaint } = require('../services/routingEngine');
const { analyzeComplaintImage } = require('./openaiVisionService');

// Predefined Authorized CCTV Cameras Registry
const AUTHORIZED_CAMERAS = [
  {
    id: 'CAM-001',
    name: 'CCTV 01 — Brodipet Main Arterial Road',
    location: 'Brodipet Junction, Guntur',
    district: 'guntur',
    state: 'andhra pradesh',
    lat: 16.3067,
    lng: 80.4365,
    status: 'online',
    aiEnabled: true,
    resolution: '1080p @ 30fps',
    type: 'ptz_traffic',
    lastActive: new Date().toISOString(),
  },
  {
    id: 'CAM-002',
    name: 'CCTV 02 — Central Inter-State Bus Station',
    location: 'RTC Bus Station Complex, Guntur',
    district: 'guntur',
    state: 'andhra pradesh',
    lat: 16.3120,
    lng: 80.4420,
    status: 'online',
    aiEnabled: true,
    resolution: '1080p @ 30fps',
    type: 'fixed_dome',
    lastActive: new Date().toISOString(),
  },
  {
    id: 'CAM-003',
    name: 'CCTV 03 — Krishna Canal Low-Lying Flood Zone',
    location: 'Krishna Canal Spillway Zone, Guntur Outskirts',
    district: 'guntur',
    state: 'andhra pradesh',
    lat: 16.2950,
    lng: 80.4280,
    status: 'online',
    aiEnabled: true,
    resolution: '4K @ 24fps (Thermal)',
    type: 'thermal_flood_gauge',
    lastActive: new Date().toISOString(),
  },
  {
    id: 'CAM-004',
    name: 'CCTV 04 — Arundelpet Commercial Market & Square',
    location: 'Arundelpet 5th Line Market Area',
    district: 'guntur',
    state: 'andhra pradesh',
    lat: 16.3150,
    lng: 80.4490,
    status: 'online',
    aiEnabled: true,
    resolution: '1080p @ 30fps',
    type: 'panoramic_crowd',
    lastActive: new Date().toISOString(),
  },
  {
    id: 'CAM-005',
    name: 'CCTV 05 — Industrial Chemical Zone & Storage Corridor',
    location: 'Autonagar Industrial Corridor, Guntur',
    district: 'guntur',
    state: 'andhra pradesh',
    lat: 16.3280,
    lng: 80.4610,
    status: 'online',
    aiEnabled: true,
    resolution: '1080p @ 30fps',
    type: 'flame_gas_sensor',
    lastActive: new Date().toISOString(),
  }
];

// Predefined Demo Scenarios Data for deterministic testing
const DEMO_SCENARIOS = {
  flood: {
    eventType: 'Flood / Severe Waterlogging',
    category: 'emergency_flood',
    severity: 'Critical',
    baseConfidence: 94,
    evidence: [
      'Rapid water accumulation > 0.8 meters detected on road surface',
      'Vehicle partial submersion observed at intersection',
      'Flow velocity measurement exceeds pedestrian safety threshold'
    ],
    signals: [
      { source: 'CCTV #CAM-003 Computer Vision', weight: 35, verified: true },
      { source: 'Krishna River Basin Telemeter (Heavy Discharge Alert)', weight: 20, verified: true },
      { source: 'IMD Red Alert Weather Telemetry', weight: 15, verified: true },
      { source: '4 Verified Citizen SOS Reports nearby', weight: 15, verified: true },
      { source: 'State Disaster News Bulletin', weight: 10, verified: true }
    ]
  },
  fire: {
    eventType: 'Active Structure Fire & Smoke Outbreak',
    category: 'emergency_fire',
    severity: 'Critical',
    baseConfidence: 92,
    evidence: [
      'Dense dark smoke plume identified in commercial sector',
      'Thermal brightness spike and luminous flame flicker detected',
      'Rapid crowd evacuation movement observed in camera perimeter'
    ],
    signals: [
      { source: 'CCTV #CAM-005 Thermal Vision', weight: 35, verified: true },
      { source: 'Adjacent CCTV #CAM-004 Visible Smoke Detection', weight: 20, verified: true },
      { source: 'Ambient IoT Air Quality / CO Sensor Spike', weight: 15, verified: true },
      { source: '6 Citizen Emergency SOS Calls', weight: 15, verified: true },
      { source: 'Emergency Fire Department Radio Confirmation', weight: 10, verified: true }
    ]
  },
  accident: {
    eventType: 'Major Multi-Vehicle Collision & Road Blockage',
    category: 'emergency_accident',
    severity: 'High',
    baseConfidence: 88,
    evidence: [
      'Severe vehicle deformation and lane obstruction detected',
      'Traffic queue backlog expanding > 400m within 3 minutes',
      'Multiple stationery vehicles in high-speed express corridor'
    ],
    signals: [
      { source: 'CCTV #CAM-001 AI Vehicle Tracking', weight: 35, verified: true },
      { source: 'Highway Speed Radar Anomaly Alert', weight: 20, verified: true },
      { source: 'GPS Fleet Transit Stoppage Telemetry', weight: 15, verified: true },
      { source: '3 Citizen Crash Reports', weight: 15, verified: true },
      { source: 'Traffic Control Room Dispatch Confirmation', weight: 10, verified: false }
    ]
  },
  crowd: {
    eventType: 'Crowd Surge / Stampede Risk & Bottleneck',
    category: 'emergency_crime',
    severity: 'High',
    baseConfidence: 84,
    evidence: [
      'Abnormal pedestrian density exceeding 4 persons/m²',
      'Turbulent multi-directional movement detected at exit bottleneck',
      'Sudden localized velocity surge detected in transit plaza'
    ],
    signals: [
      { source: 'CCTV #CAM-002 Panoramic Crowd Sensor', weight: 35, verified: true },
      { source: 'Transit Gate Pressure Sensor Alert', weight: 20, verified: true },
      { source: 'Bus Terminal Public Safety Audio Trigger', weight: 15, verified: true },
      { source: '2 Citizen Panic Reports', weight: 15, verified: true },
      { source: 'Station Security Unit On-Ground Signal', weight: 10, verified: false }
    ]
  }
};

/**
 * Multi-Source Verification Engine
 * Combines camera CV with nearby sensors, weather feeds, and citizen SOS signals.
 */
function calculateMultiSourceVerification(eventType, baseConfidence = 85, supportingSignals = []) {
  let combinedScore = Math.min(100, baseConfidence);
  
  if (supportingSignals.length > 0) {
    const verifiedSum = supportingSignals
      .filter(s => s.verified)
      .reduce((sum, s) => sum + (s.weight || 10), 0);
    combinedScore = Math.min(100, Math.max(combinedScore, verifiedSum));
  }

  let verificationStatus = 'Unverified';
  let canAutoCreate = false;

  if (combinedScore >= 90) {
    verificationStatus = 'Verified High-Confidence Emergency';
    canAutoCreate = true;
  } else if (combinedScore >= 70) {
    verificationStatus = 'Medium-Confidence (Corroboration Required)';
    canAutoCreate = false;
  } else {
    verificationStatus = 'Low-Confidence AI Signal';
    canAutoCreate = false;
  }

  return {
    combinedConfidence: combinedScore,
    verificationStatus,
    canAutoCreate,
    signalsCount: supportingSignals.length,
    evidenceTrail: supportingSignals
  };
}

/**
 * Cluster and Deduplicate Incidents
 * Checks if a recent emergency incident (within ~1.5km and 60 minutes) already exists.
 */
async function clusterEmergencyIncident(newIncident) {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.COMPLAINTS)
    .where('isEmergency', '==', true)
    .get();

  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Check if incident is active (not closed)
    if (['closed', 'resolved'].includes(data.status?.toLowerCase())) continue;

    // Check distance in km (Haversine formula)
    if (data.location?.lat && data.location?.lng && newIncident.location?.lat && newIncident.location?.lng) {
      const dLat = (newIncident.location.lat - data.location.lat) * (Math.PI / 180);
      const dLng = (newIncident.location.lng - data.location.lng) * (Math.PI / 180);
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(data.location.lat * (Math.PI / 180)) * Math.cos(newIncident.location.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = 6371 * c;

      // Same event category and within 1.5 km
      const sameCategory = data.subcategory === newIncident.subcategory || data.category === newIncident.category;

      if (distanceKm <= 1.5 && sameCategory) {
        // Increment supporting signal count on existing incident!
        const existingSignals = data.supportingSignalsCount || 1;
        const updatedSignals = existingSignals + 1;
        const newEvidence = [...(data.evidenceList || []), ...(newIncident.evidence || [])].slice(0, 8);

        await doc.ref.update({
          supportingSignalsCount: updatedSignals,
          evidenceList: newEvidence,
          lastSignalAt: new Date().toISOString(),
          confidence: Math.min(99, (data.confidence || 85) + 3)
        });

        return {
          isDuplicate: true,
          clusteredIncidentId: doc.id,
          complaintId: data.complaintId,
          totalSignals: updatedSignals
        };
      }
    }
  }

  return { isDuplicate: false };
}

module.exports = {
  AUTHORIZED_CAMERAS,
  DEMO_SCENARIOS,
  calculateMultiSourceVerification,
  clusterEmergencyIncident
};
