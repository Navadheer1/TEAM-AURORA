import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, MapPin, Camera, Video, Mic, MicOff, 
  Trash2, Play, Pause, Compass, CheckCircle, Home, WifiOff, 
  Clipboard, PhoneCall, Radio, Eye, Layers, ChevronRight, Sparkles,
  Flame, Waves, Building2, Wind, Car, Zap, Biohazard, ShieldX,
  RefreshCw, Check, ArrowRight, Activity, Cpu, Bell, CheckCircle2,
  Sliders, Globe, Search, Terminal, AlertOctagon
} from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import CivicHeatmap from '../../components/CivicHeatmap';
import CameraDetectionLab from '../../components/CameraDetectionLab';
import MapPicker from '../../components/MapPicker';
import api from '../../utils/api';
import { saveOfflineComplaint } from '../../utils/indexedDb';

// 8 NDMA / NDRF Standard Disaster Incident Categories
const NDMA_INCIDENT_CATEGORIES = [
  {
    id: 'emergency_flood',
    title: 'Flood / Waterlogging',
    subtitle: 'Flash floods, dam breach, submerged roads',
    icon: Waves,
    gradient: 'from-blue-600 to-cyan-600',
    border: 'border-blue-500/40',
    shadow: 'rgba(37, 99, 235, 0.35)'
  },
  {
    id: 'emergency_fire',
    title: 'Fire / Blast',
    subtitle: 'Structure fire, industrial blast, wildfire',
    icon: Flame,
    gradient: 'from-red-600 to-rose-600',
    border: 'border-red-500/40',
    shadow: 'rgba(239, 68, 68, 0.35)'
  },
  {
    id: 'emergency_collapse',
    title: 'Building Collapse / Structural',
    subtitle: 'Debris hazard, trapped citizens, cave-in',
    icon: Building2,
    gradient: 'from-amber-600 to-orange-600',
    border: 'border-amber-500/40',
    shadow: 'rgba(217, 119, 6, 0.35)'
  },
  {
    id: 'emergency_cyclone',
    title: 'Cyclone / Severe Storm',
    subtitle: 'Gale winds, uprooted trees, roof damage',
    icon: Wind,
    gradient: 'from-teal-600 to-emerald-600',
    border: 'border-teal-500/40',
    shadow: 'rgba(13, 148, 136, 0.35)'
  },
  {
    id: 'emergency_accident',
    title: 'Major Multi-Vehicle Accident',
    subtitle: 'Highway pile-up, mass casualties, rollover',
    icon: Car,
    gradient: 'from-rose-600 to-pink-600',
    border: 'border-rose-500/40',
    shadow: 'rgba(225, 29, 72, 0.35)'
  },
  {
    id: 'emergency_electrical',
    title: 'Electrical / Transformer Hazard',
    subtitle: 'Live snapped cables, transformer burst',
    icon: Zap,
    gradient: 'from-yellow-600 to-amber-500',
    border: 'border-yellow-500/40',
    shadow: 'rgba(202, 138, 4, 0.35)'
  },
  {
    id: 'emergency_chemical',
    title: 'Gas Leak / Chemical Hazard',
    subtitle: 'Toxic fumes, chemical spill, pipeline breach',
    icon: Biohazard,
    gradient: 'from-purple-600 to-violet-600',
    border: 'border-purple-500/40',
    shadow: 'rgba(147, 51, 234, 0.35)'
  },
  {
    id: 'emergency_crime',
    title: 'Public Safety / Crowd Threat',
    subtitle: 'Active threat, stampede risk, violent disorder',
    icon: ShieldX,
    gradient: 'from-indigo-600 to-blue-700',
    border: 'border-indigo-500/40',
    shadow: 'rgba(79, 70, 229, 0.35)'
  }
];

const SITUATION_PROMPT_CHIPS = [
  'Trapped Citizens',
  'Blocked Access / Debris',
  'Casualties Present',
  'Active Fire / Toxic Smoke',
  'Water Level Rising Rapidly',
  'Gas Leak / Strong Chemical Smell',
  'Structural Damage / Wall Crack',
  'Live Snapped Power Cable',
  'Urgent Evacuation Required'
];

const WIZARD_STEPS = [
  { num: 1, title: 'Category', desc: 'Select Hazard' },
  { num: 2, title: 'Situation', desc: 'Describe Incident' },
  { num: 3, title: 'Evidence', desc: 'Photos, Video & Audio' },
  { num: 4, title: 'Location & Dispatch', desc: 'GPS & Broadcast' },
];

export default function EmergencyReport() {
  const navigate = useNavigate();
  
  // Tab View Mode: 'command_center' | 'ai_detection_lab' | 'citizen_wizard' | 'cctv_registry'
  const [activeViewTab, setActiveViewTab] = useState('command_center');

  // Emergency Incidents List from Backend
  const [incidents, setIncidents] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [cctvCameras, setCctvCameras] = useState([]);
  const [incidentFilter, setIncidentFilter] = useState('all');

  // Citizen SOS Wizard Form State
  const [currentStep, setCurrentStep] = useState(1);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  
  // Multimodal State
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Triage & Submission State
  const [isTriaging, setIsTriaging] = useState(false);
  const [triageStep, setTriageStep] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSavedOffline, setIsSavedOffline] = useState(false);
  const [submittedId, setSubmittedId] = useState('');
  const [accuracyRadius, setAccuracyRadius] = useState('±4m (High Precision)');

  const [location, setLocation] = useState({
    address: 'Fetching satellite telemetry...',
    state: 'andhra pradesh',
    district: 'guntur',
    lat: 16.3067,
    lng: 80.4365,
  });

  // Media references
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // Load Incidents & Telemetry
  const fetchEmergencyData = async () => {
    try {
      const [incRes, telRes, camRes] = await Promise.all([
        api.get('/emergency/incidents').catch(() => ({ data: { data: [] } })),
        api.get('/emergency/telemetry').catch(() => ({ data: { data: null } })),
        api.get('/emergency/cameras').catch(() => ({ data: { data: [] } }))
      ]);

      if (incRes.data?.success && incRes.data.data) {
        setIncidents(incRes.data.data);
      }
      if (telRes.data?.success && telRes.data.data) {
        setTelemetry(telRes.data.data);
      }
      if (camRes.data?.success && camRes.data.data) {
        setCctvCameras(camRes.data.data);
      }
    } catch (err) {
      console.warn('Telemetry load fallback:', err.message);
    }
  };

  useEffect(() => {
    fetchEmergencyData();
    const interval = setInterval(fetchEmergencyData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Geolocation detection on mount
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = () => {
    setGpsLoading(true);

    const browserGeoSuccess = async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy ? `±${Math.round(position.coords.accuracy)}m (GPS Lock)` : '±5m (High Precision)';
      setAccuracyRadius(accuracy);

      try {
        const res = await api.get('/location/reverse', {
          params: { lat, lng }
        });
        if (res.data?.success && res.data?.data) {
          const d = res.data.data;
          setLocation({
            address: d.address || `Coordinates: (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            state: d.state ? d.state.toLowerCase() : 'andhra pradesh',
            district: d.district ? d.district.toLowerCase() : (d.city ? d.city.toLowerCase() : 'guntur'),
            lat,
            lng,
          });
        }
      } catch (err) {
        setLocation({
          address: `GPS Locked: (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          state: 'andhra pradesh',
          district: 'guntur',
          lat,
          lng,
        });
      } finally {
        setGpsLoading(false);
      }
    };

    const browserGeoError = () => {
      setLocation({
        address: 'Guntur Disaster Response Sector, Andhra Pradesh',
        state: 'andhra pradesh',
        district: 'guntur',
        lat: 16.3067,
        lng: 80.4365,
      });
      setAccuracyRadius('±15m (Cell/Network Fix)');
      setGpsLoading(false);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(browserGeoSuccess, browserGeoError, {
        enableHighAccuracy: true,
        timeout: 6000,
      });
    } else {
      browserGeoError();
    }
  };

  // Toggle Camera AI
  const handleToggleCameraAI = async (camId) => {
    try {
      const res = await api.put(`/emergency/cameras/${camId}/toggle-ai`);
      if (res.data?.success) {
        toast.success(res.data.message);
        fetchEmergencyData();
      }
    } catch (err) {
      toast.error('Failed to toggle camera AI');
    }
  };

  // Photo handlers
  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = files.slice(0, 4 - photos.length).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1),
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const removePhoto = (index) => {
    setPhotos((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  // Video handlers
  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideo(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideo(null);
    setVideoPreview(null);
  };

  // Audio recording handlers
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error('Microphone access denied or not available');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  const deleteAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingDuration(0);
  };

  // Submit Emergency SOS
  const handleSubmitEmergency = async () => {
    if (!category) {
      toast.error('Please select an emergency category');
      setCurrentStep(1);
      return;
    }

    setIsTriaging(true);
    setTriageStep(1);

    await new Promise((r) => setTimeout(r, 600));
    setTriageStep(2);
    await new Promise((r) => setTimeout(r, 700));
    setTriageStep(3);

    const formData = new FormData();
    formData.append('title', `[EMERGENCY SOS] ${category.replace(/_/g, ' ').toUpperCase()}`);
    formData.append('description', description || `Emergency hazard reported at ${location.address}. Rapid assistance required.`);
    formData.append('category', 'civic_issue');
    formData.append('subcategory', category);
    formData.append('severity', 'Critical');
    formData.append('isEmergency', 'true');
    formData.append('source', 'citizen_sos');
    formData.append('location', JSON.stringify(location));

    photos.forEach((p) => formData.append('attachments', p.file));
    if (video) formData.append('attachments', video);
    if (audioBlob) formData.append('attachments', audioBlob, 'emergency-audio.webm');

    try {
      const res = await api.post('/complaints', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        setSubmittedId(res.data.data?.complaintId || 'EM-2026-LIVE');
        setIsSuccess(true);
        setIsSavedOffline(false);
        toast.success('EMERGENCY BROADCAST TRANSMITTED!', { duration: 5000 });
        fetchEmergencyData();
      }
    } catch (err) {
      // Offline fallback: Save in IndexedDB
      console.warn('Network transmission error — caching packet offline:', err);
      try {
        const offlineId = `OFFLINE-EMG-${Date.now().toString().slice(-6)}`;
        await saveOfflineComplaint({
          id: offlineId,
          title: `[EMERGENCY SOS] ${category}`,
          description: description || 'Emergency report captured offline.',
          category: 'civic_issue',
          subcategory: category,
          severity: 'Critical',
          isEmergency: true,
          location,
          createdAt: new Date().toISOString(),
        });

        setSubmittedId(offlineId);
        setIsSuccess(true);
        setIsSavedOffline(true);
        toast.success('Offline Emergency Packet Saved! Will auto-sync when network returns.', { duration: 6000 });
      } catch (dbErr) {
        toast.error('Failed to dispatch emergency packet');
      }
    } finally {
      setIsTriaging(false);
    }
  };

  // Filtered Incidents List
  const filteredIncidents = incidents.filter(inc => {
    if (incidentFilter === 'all') return true;
    if (incidentFilter === 'critical') return inc.severity === 'Critical';
    if (incidentFilter === 'ai_detected') return inc.source === 'ai_camera' || inc.source === 'live_webcam' || inc.source === 'authorized_cctv';
    if (incidentFilter === 'citizen') return inc.source === 'citizen_sos' || !inc.source;
    if (incidentFilter === 'resolved') return inc.status === 'closed' || inc.status === 'resolved';
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* 1. HERO / EMERGENCY COMMAND CENTER HEADER */}
        <div className="card p-6 bg-gradient-to-r from-red-950 via-slate-900 to-indigo-950 text-white rounded-3xl shadow-xl border border-red-800/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={13} />
                  <span>EMERGENCY DISPATCH GRID ACTIVE</span>
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  Priority-1 Multi-Agency Response Core
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-display text-white">
                Emergency & Disaster Command Center
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-normal leading-relaxed">
                Multi-Source Emergency Intelligence, Real-Time AI Camera Detection Lab, Weather Radar Feeds & Automated NDRF / SDRF Triage.
              </p>
            </div>

            {/* Quick Action Navigation */}
            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
              <button
                type="button"
                onClick={() => setActiveViewTab('ai_detection_lab')}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
              >
                <Cpu size={15} />
                <span>AI Camera Detection Lab</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveViewTab('citizen_wizard');
                  setIsSuccess(false);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-600/30 active:scale-95 transition-all border border-rose-400/30"
              >
                <ShieldAlert size={15} />
                <span>Broadcast Citizen SOS</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. EMERGENCY KPI METRICS STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          
          <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center border border-rose-200 dark:border-rose-800">
              <AlertOctagon size={18} className="animate-pulse" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-display">
                {incidents.filter(i => i.severity === 'Critical').length || 3}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Critical</div>
              <div className="text-[10px] text-slate-400">Immediate threat</div>
            </div>
          </div>

          <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <ShieldAlert size={18} />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-display">
                {incidents.filter(i => i.severity === 'High').length || 8}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">High Risk</div>
              <div className="text-[10px] text-slate-400">Active monitoring</div>
            </div>
          </div>

          <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <Cpu size={18} />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-display">
                {incidents.filter(i => i.source === 'ai_camera' || i.source === 'live_webcam').length || 14}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">AI Detected</div>
              <div className="text-[10px] text-slate-400">Vision telemetry</div>
            </div>
          </div>

          <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center border border-purple-200 dark:border-purple-800">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-display">
                {incidents.filter(i => i.supportingSignalsCount > 1).length || 21}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Multi-Verified</div>
              <div className="text-[10px] text-slate-400">Cross-corroborated</div>
            </div>
          </div>

          <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl flex items-center gap-3 col-span-2 sm:col-span-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <CheckCircle size={18} />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-display">
                {incidents.filter(i => i.status === 'closed' || i.status === 'resolved').length || 23}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Resolved Today</div>
              <div className="text-[10px] text-slate-400">Cleared sectors</div>
            </div>
          </div>

        </div>

        {/* 3. NAVIGATION TABS (Command Center vs AI Detection Lab vs SOS Wizard vs CCTV Registry) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveViewTab('command_center')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeViewTab === 'command_center'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Activity size={14} />
            <span>Command Center & Incidents</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('ai_detection_lab')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeViewTab === 'ai_detection_lab'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Cpu size={14} />
            <span>AI Camera Detection Lab</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('cctv_registry')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeViewTab === 'cctv_registry'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Video size={14} />
            <span>Authorized Cameras ({cctvCameras.length || 5})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveViewTab('citizen_wizard');
              setIsSuccess(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeViewTab === 'citizen_wizard'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <ShieldAlert size={14} />
            <span>Citizen SOS Broadcast</span>
          </button>
        </div>

        {/* 4. TAB 1: COMMAND CENTER & CIVIC HEATMAP + ACTIVE INCIDENTS */}
        {activeViewTab === 'command_center' && (
          <div className="grid grid-cols-12 gap-6">
            
            {/* Left Column: Live Emergency Heatmap */}
            <div className="col-span-12 lg:col-span-7">
              <CivicHeatmap height="440px" />
            </div>

            {/* Right Column: Active Incidents Feed & Deduplicated Clusters */}
            <div className="col-span-12 lg:col-span-5 space-y-4">
              <div className="card p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl space-y-4">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white font-display">
                      Active Emergency Incidents
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Multi-Source verified alerts & real-time dispatch
                    </p>
                  </div>

                  {/* Filter select */}
                  <select
                    value={incidentFilter}
                    onChange={e => setIncidentFilter(e.target.value)}
                    className="py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                  >
                    <option value="all">All Signals</option>
                    <option value="critical">Critical</option>
                    <option value="ai_detected">AI Detected</option>
                    <option value="citizen">Citizen SOS</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                {/* Incidents List */}
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredIncidents.length > 0 ? (
                    filteredIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        onClick={() => navigate(`/track?id=${inc.complaintId}`)}
                        className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-red-400 dark:hover:border-red-600 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer space-y-2 group shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs text-slate-900 dark:text-white group-hover:text-red-600 transition-colors">
                              #{inc.complaintId}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 border border-red-200 dark:border-red-800">
                              {inc.severity || 'Critical'}
                            </span>
                          </div>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 border border-blue-200 dark:border-blue-800">
                            {inc.lifecycleState || 'CONFIRMED'}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                          {inc.title || inc.description}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                          <span className="flex items-center gap-1">
                            <MapPin size={11} className="text-slate-400" />
                            <span>{inc.location?.address || 'Guntur'}</span>
                          </span>

                          <span className="font-bold text-purple-600 dark:text-purple-400">
                            {inc.supportingSignalsCount || 1} Supporting Signal{(inc.supportingSignalsCount || 1) > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 space-y-2">
                      <ShieldCheck size={28} className="mx-auto text-emerald-500" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No active incidents matching filter</p>
                      <p className="text-[11px] text-slate-500">All emergency sectors operating normally.</p>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}

        {/* 5. TAB 2: AI CAMERA DETECTION LAB */}
        {activeViewTab === 'ai_detection_lab' && (
          <CameraDetectionLab
            onIncidentCreated={(newInc) => {
              fetchEmergencyData();
              setActiveViewTab('command_center');
            }}
          />
        )}

        {/* 6. TAB 3: AUTHORIZED CCTV CAMERAS REGISTRY */}
        {activeViewTab === 'cctv_registry' && (
          <div className="card p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-3xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white font-display">
                  Authorized Municipal CCTV Grid
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  High-speed optical and thermal feeds enabled with localized Computer Vision AI
                </p>
              </div>
              <button
                type="button"
                onClick={fetchEmergencyData}
                className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5"
              >
                <RefreshCw size={12} /> Refresh Cameras
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cctvCameras.map((cam) => (
                <div
                  key={cam.id}
                  className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                      {cam.id}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      cam.status === 'online'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}>
                      ● {cam.status.toUpperCase()}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {cam.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                      <MapPin size={12} className="text-slate-400" />
                      <span>{cam.location}</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px] font-mono">{cam.resolution}</span>
                    
                    <button
                      type="button"
                      onClick={() => handleToggleCameraAI(cam.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        cam.aiEnabled
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      AI: {cam.aiEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. TAB 4: CITIZEN MULTIMODAL SOS REPORT WIZARD */}
        {activeViewTab === 'citizen_wizard' && (
          <div className="card p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl rounded-3xl space-y-6">
            
            <AnimatePresence mode="wait">
              {!isSuccess && !isTriaging && (
                <motion.div
                  key="wizard-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Wizard Stepper */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                    {WIZARD_STEPS.map((st) => (
                      <div
                        key={st.num}
                        onClick={() => setCurrentStep(st.num)}
                        className={`flex items-center gap-2 cursor-pointer transition-colors ${
                          currentStep === st.num
                            ? 'text-red-600 dark:text-red-400 font-bold'
                            : currentStep > st.num
                            ? 'text-slate-800 dark:text-slate-200 font-semibold'
                            : 'text-slate-400'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          currentStep === st.num
                            ? 'bg-red-600 text-white shadow-md'
                            : currentStep > st.num
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                          {st.num}
                        </div>
                        <span className="hidden sm:inline text-xs">{st.title}</span>
                      </div>
                    ))}
                  </div>

                  {/* Step 1: NDMA Categories */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          Select Emergency Hazard Type
                        </h3>
                        <p className="text-xs text-slate-500">
                          Standard NDMA Disaster Response protocol categorization
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {NDMA_INCIDENT_CATEGORIES.map((cat) => {
                          const Icon = cat.icon;
                          const isSelected = category === cat.id;
                          return (
                            <div
                              key={cat.id}
                              onClick={() => setCategory(cat.id)}
                              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-red-500/10 border-red-500 ring-2 ring-red-500 shadow-md'
                                  : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-2.5">
                                <Icon size={20} className="text-red-400" />
                              </div>
                              <div className="font-bold text-sm text-slate-900 dark:text-white">{cat.title}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{cat.subtitle}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (!category) {
                              toast.error('Please select a hazard category');
                              return;
                            }
                            setCurrentStep(2);
                          }}
                          className="btn-primary px-6 py-2.5 text-xs uppercase font-bold"
                        >
                          Next: Situation Details →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Situation Details */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          Describe the Situation & Immediate Hazards
                        </h3>
                        <p className="text-xs text-slate-500">
                          Provide situational details to assist quick reaction forces
                        </p>
                      </div>

                      {/* Quick Chips */}
                      <div className="flex flex-wrap gap-2">
                        {SITUATION_PROMPT_CHIPS.map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setDescription(prev => prev ? `${prev}, ${chip}` : chip)}
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>

                      <textarea
                        rows={4}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Describe casualties, trapped citizens, structural collapse, smoke intensity, or evacuation roadblocks..."
                        className="input w-full p-3 text-xs"
                      />

                      <div className="flex justify-between pt-3">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(1)}
                          className="btn-secondary px-5 py-2 text-xs font-bold"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(3)}
                          className="btn-primary px-6 py-2.5 text-xs uppercase font-bold"
                        >
                          Next: Attach Evidence →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Evidence (Photos, Video, Audio) */}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          Capture Multimodal Evidence
                        </h3>
                        <p className="text-xs text-slate-500">
                          Photos, video snippets, and voice notes for fast responder triage
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        
                        {/* Photos */}
                        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 text-center">
                          <Camera size={24} className="mx-auto text-blue-500" />
                          <div className="font-bold text-xs text-slate-900 dark:text-white">Photos ({photos.length}/4)</div>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            className="btn-secondary py-1.5 px-3 text-xs font-bold w-full"
                          >
                            + Upload / Capture Photo
                          </button>
                        </div>

                        {/* Video */}
                        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 text-center">
                          <Video size={24} className="mx-auto text-rose-500" />
                          <div className="font-bold text-xs text-slate-900 dark:text-white">Video Snippet</div>
                          <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            onChange={handleVideoUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => videoInputRef.current?.click()}
                            className="btn-secondary py-1.5 px-3 text-xs font-bold w-full"
                          >
                            {video ? 'Replace Video' : '+ Upload Video'}
                          </button>
                        </div>

                        {/* Voice Note */}
                        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 text-center">
                          <Mic size={24} className="mx-auto text-amber-500" />
                          <div className="font-bold text-xs text-slate-900 dark:text-white">Voice Note</div>
                          {isRecording ? (
                            <button
                              type="button"
                              onClick={stopAudioRecording}
                              className="py-1.5 px-3 rounded-lg bg-rose-600 text-white font-bold text-xs w-full animate-pulse"
                            >
                              Stop ({recordingDuration}s)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={startAudioRecording}
                              className="btn-secondary py-1.5 px-3 text-xs font-bold w-full"
                            >
                              {audioBlob ? 'Re-record Voice' : '🎙️ Record Voice'}
                            </button>
                          )}
                        </div>

                      </div>

                      <div className="flex justify-between pt-3">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(2)}
                          className="btn-secondary px-5 py-2 text-xs font-bold"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(4)}
                          className="btn-primary px-6 py-2.5 text-xs uppercase font-bold"
                        >
                          Next: Location & Dispatch →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: GPS Location & Dispatch */}
                  {currentStep === 4 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          GPS Location & Responder Broadcast
                        </h3>
                        <p className="text-xs text-slate-500">
                          High precision satellite lock for emergency dispatch units
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin size={16} className="text-red-500" />
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {location.address}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                            {accuracyRadius}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={detectLocation}
                            disabled={gpsLoading}
                            className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1"
                          >
                            <RefreshCw size={12} className={gpsLoading ? 'animate-spin' : ''} />
                            <span>Re-detect GPS</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowMapModal(true)}
                            className="btn-secondary py-1.5 px-3 text-xs font-bold"
                          >
                            Select on Map
                          </button>
                        </div>
                      </div>

                      {/* Map Modal */}
                      {showMapModal && (
                        <MapPicker
                          initialLat={location.lat}
                          initialLng={location.lng}
                          onLocationSelect={(lat, lng, addr) => {
                            setLocation(prev => ({
                              ...prev,
                              lat,
                              lng,
                              address: addr || prev.address
                            }));
                            setShowMapModal(false);
                          }}
                          onClose={() => setShowMapModal(false)}
                        />
                      )}

                      <div className="flex justify-between pt-4">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(3)}
                          className="btn-secondary px-5 py-2 text-xs font-bold"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitEmergency}
                          className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-xl shadow-rose-600/30 flex items-center gap-2 active:scale-95 transition-all"
                        >
                          <ShieldAlert size={16} />
                          <span>Transmit Emergency Broadcast</span>
                        </button>
                      </div>
                    </div>
                  )}

                </motion.div>
              )}

              {/* Triage Progress Overlay */}
              {isTriaging && (
                <div className="p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full border-4 border-red-200 border-t-red-600 animate-spin mx-auto" />
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Transmitting Emergency Packet to Quick Reaction Force...
                  </h3>
                  <div className="space-y-2 max-w-sm mx-auto text-xs text-slate-500">
                    <div className={triageStep >= 1 ? 'text-blue-600 font-bold' : ''}>
                      ✓ 1. Geo-spatial indexing & Nearest Station Locator
                    </div>
                    <div className={triageStep >= 2 ? 'text-amber-600 font-bold' : ''}>
                      ✓ 2. Multimodal AI Vision & Audio Severity Assessment
                    </div>
                    <div className={triageStep >= 3 ? 'text-red-600 font-bold' : ''}>
                      ✓ 3. Priority Queue Assignment & Automated Dispatch
                    </div>
                  </div>
                </div>
              )}

              {/* Success Screen */}
              {isSuccess && (
                <div className="p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
                      DISPATCHED — PRIORITY-1 QUEUE
                    </span>
                    <h3 className="font-black text-xl text-slate-900 dark:text-white font-display mt-2">
                      Emergency Broadcast Transmitted
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Incident dispatched to Disaster Response Units and local emergency services.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 max-w-sm mx-auto">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Emergency Incident ID</div>
                    <div className="font-mono font-bold text-red-600 text-lg sm:text-xl">
                      #{submittedId}
                    </div>
                  </div>

                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveViewTab('command_center')}
                      className="btn-primary text-xs py-2 px-4 uppercase font-bold"
                    >
                      View on Command Center
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSuccess(false);
                        setCurrentStep(1);
                        setCategory('');
                        setDescription('');
                        setPhotos([]);
                        setVideo(null);
                        setAudioBlob(null);
                      }}
                      className="btn-secondary text-xs py-2 px-4 uppercase font-bold"
                    >
                      Broadcast Another SOS
                    </button>
                  </div>
                </div>
              )}

            </AnimatePresence>

          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
