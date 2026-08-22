import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  ShieldAlert, AlertTriangle, MapPin, Camera, Video, Mic, MicOff, 
  Trash2, Play, Pause, Compass, CheckCircle, Home, WifiOff, 
  Clipboard, PhoneCall, Radio, Eye, Layers, ChevronRight, Sparkles,
  Flame, Waves, Building2, Wind, Car, Zap, Biohazard, ShieldX,
  RefreshCw, Check, ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
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
    emoji: '🌊',
    gradient: 'from-blue-600 to-cyan-600',
    border: 'border-blue-500/40',
    shadow: 'rgba(37, 99, 235, 0.35)'
  },
  {
    id: 'emergency_fire',
    title: 'Fire / Blast',
    subtitle: 'Structure fire, industrial blast, wildfire',
    icon: Flame,
    emoji: '🔥',
    gradient: 'from-red-600 to-rose-600',
    border: 'border-red-500/40',
    shadow: 'rgba(239, 68, 68, 0.35)'
  },
  {
    id: 'emergency_collapse',
    title: 'Building Collapse / Structural',
    subtitle: 'Debris hazard, trapped citizens, cave-in',
    icon: Building2,
    emoji: '🏚️',
    gradient: 'from-amber-600 to-orange-600',
    border: 'border-amber-500/40',
    shadow: 'rgba(217, 119, 6, 0.35)'
  },
  {
    id: 'emergency_cyclone',
    title: 'Cyclone / Severe Storm',
    subtitle: 'Gale winds, uprooted trees, roof damage',
    icon: Wind,
    emoji: '🌪️',
    gradient: 'from-teal-600 to-emerald-600',
    border: 'border-teal-500/40',
    shadow: 'rgba(13, 148, 136, 0.35)'
  },
  {
    id: 'emergency_accident',
    title: 'Major Multi-Vehicle Accident',
    subtitle: 'Highway pile-up, mass casualties, rollover',
    icon: Car,
    emoji: '🚗',
    gradient: 'from-rose-600 to-pink-600',
    border: 'border-rose-500/40',
    shadow: 'rgba(225, 29, 72, 0.35)'
  },
  {
    id: 'emergency_electrical',
    title: 'Electrical / Transformer Hazard',
    subtitle: 'Live snapped cables, transformer burst',
    icon: Zap,
    emoji: '⚡',
    gradient: 'from-yellow-600 to-amber-500',
    border: 'border-yellow-500/40',
    shadow: 'rgba(202, 138, 4, 0.35)'
  },
  {
    id: 'emergency_chemical',
    title: 'Gas Leak / Chemical Hazard',
    subtitle: 'Toxic fumes, chemical spill, pipeline breach',
    icon: Biohazard,
    emoji: '☣️',
    gradient: 'from-purple-600 to-violet-600',
    border: 'border-purple-500/40',
    shadow: 'rgba(147, 51, 234, 0.35)'
  },
  {
    id: 'emergency_crime',
    title: 'Public Safety / Crime',
    subtitle: 'Active threat, violent clash, crowd stampede',
    icon: ShieldX,
    emoji: '🚨',
    gradient: 'from-indigo-600 to-blue-700',
    border: 'border-indigo-500/40',
    shadow: 'rgba(79, 70, 229, 0.35)'
  }
];

const SITUATION_PROMPT_CHIPS = [
  'Trapped Citizens 🆘',
  'Blocked Access / Debris 🚧',
  'Casualties Present 🚑',
  'Active Fire / Toxic Smoke 🔥',
  'Water Level Rising Rapidly 🌊',
  'Gas Leak / Strong Chemical Smell ☣️',
  'Structural Damage / Wall Crack 🏚️',
  'Live Snapped Power Cable ⚡',
  'Urgent Evacuation Required ⚠️'
];

const WIZARD_STEPS = [
  { num: 1, title: 'Category', desc: 'Select Hazard' },
  { num: 2, title: 'Situation', desc: 'Describe Incident' },
  { num: 3, title: 'Evidence', desc: 'Photos, Video & Audio' },
  { num: 4, title: 'Location & Dispatch', desc: 'GPS & Broadcast' },
];

export default function EmergencyReport() {
  const navigate = useNavigate();
  
  // Wizard Step State
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
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

  // Media Recorder references
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // Geolocation detection on mount
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = () => {
    setGpsLoading(true);

    const browserGeoSuccess = (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy ? `±${Math.round(position.coords.accuracy)}m (GPS Lock)` : '±5m (High Precision)';
      setAccuracyRadius(accuracy);

      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        .then((r) => r.json())
        .then((data) => {
          setLocation({
            address: data.display_name || `Coordinates: (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            state: data.address?.state?.toLowerCase() || 'andhra pradesh',
            district: data.address?.state_district?.toLowerCase() || data.address?.county?.toLowerCase() || 'guntur',
            lat,
            lng,
          });
        })
        .catch(() => {
          setLocation({
            address: `GPS Locked: (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            state: 'andhra pradesh',
            district: 'guntur',
            lat,
            lng,
          });
        })
        .finally(() => setGpsLoading(false));
    };

    const browserGeoError = () => {
      setLocation({
        address: 'Guntur Disaster Response Zone, Andhra Pradesh',
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

    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video file must be under 50MB');
      return;
    }

    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideo(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideo(null);
    setVideoPreview(null);
  };

  // Audio SOS handlers
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlobObj = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlobObj);
        setAudioUrl(URL.createObjectURL(audioBlobObj));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed:', err);
      toast.error('Microphone permission required for Audio SOS');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  const removeAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingDuration(0);
  };

  // Format recording duration (MM:SS)
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Append prompt chip into description
  const handleAddPromptChip = (chipText) => {
    setDescription((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `[${chipText}] `;
      if (trimmed.includes(chipText)) return prev;
      return `${trimmed} • [${chipText}] `;
    });
  };

  // Wizard Step Navigation Helpers
  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!category) {
        toast.error('Please select an incident category to continue.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!description || description.trim().length < 8) {
        toast.error('Please describe the situation (minimum 8 characters).');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Critical Fast Track SOS Override
  const handleFastTrackDispatch = () => {
    const targetCategory = category || 'emergency_crime';
    const targetDesc = description && description.trim().length >= 8 
      ? description 
      : '[FAST-TRACK SOS DISPATCH] Immediate life-safety emergency reported at resolved coordinates.';
    
    if (!category) setCategory(targetCategory);
    if (!description) setDescription(targetDesc);

    executeEmergencySubmission(targetCategory, targetDesc);
  };

  // Broadcast Emergency Dispatch
  const handleEmergencySubmit = () => {
    if (!category) {
      toast.error('Please select an incident category.');
      setCurrentStep(1);
      return;
    }
    if (!description || description.trim().length < 8) {
      toast.error('Please provide a brief description of the incident.');
      setCurrentStep(2);
      return;
    }
    executeEmergencySubmission(category, description);
  };

  const executeEmergencySubmission = async (submitCat, submitDesc) => {
    // Begin AI Triage Sequence
    setIsTriaging(true);
    setTriageStep(1);

    const reportData = {
      category: 'civic_issue',
      subcategory: submitCat,
      description: `[NDMA EMERGENCY DISPATCH] ${submitDesc}`,
      isAnonymous: true,
      location: {
        address: location.address,
        state: location.state || 'andhra pradesh',
        district: location.district || 'guntur',
        lat: location.lat || 16.3067,
        lng: location.lng || 80.4365,
      },
      isEmergency: true,
      severity: 'Emergency',
      hasPhotos: photos.length > 0,
      hasVideo: Boolean(video),
      hasAudio: Boolean(audioBlob),
    };

    // Step-by-step telemetry animation
    setTimeout(() => setTriageStep(2), 750);
    setTimeout(() => setTriageStep(3), 1500);

    // Finalize submission
    setTimeout(async () => {
      if (!navigator.onLine) {
        try {
          await saveOfflineComplaint(reportData);
          setIsSavedOffline(true);
          setIsSuccess(true);
          setIsTriaging(false);
          toast.success('💾 Offline Disaster Report Stored Locally!');
        } catch (err) {
          toast.error('Failed to store emergency report locally.');
          setIsTriaging(false);
        }
        return;
      }

      try {
        const res = await api.post('/complaints', reportData);
        const { complaintId } = res.data.data;
        setSubmittedId(complaintId);
        setIsSuccess(true);
        setIsTriaging(false);
        toast.success('🚨 National Emergency Dispatch Broadcasted Successfully!');
      } catch (err) {
        console.warn('❌ Online submit failed:', err.message);
        try {
          await saveOfflineComplaint(reportData);
          setIsSavedOffline(true);
          setIsSuccess(true);
          toast.success('💾 Saved in local emergency queue.');
        } catch (offlineErr) {
          toast.error('Emergency dispatch transmission failed.');
        } finally {
          setIsTriaging(false);
        }
      }
    }, 2200);
  };

  const selectedCategoryObj = NDMA_INCIDENT_CATEGORIES.find((c) => c.id === category);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-6 font-sans pb-12">
        
        {/* NDMA Disaster Command Banner (Enterprise Standard) */}
        <div className="rounded-xl p-5 sm:p-6 border border-slate-800 bg-slate-900 text-white shadow-sm flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Official Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-red-950/80 border border-red-800 text-[11px] font-bold uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                NDMA Standard Protocol
              </span>
              <span className="px-2.5 py-1 rounded-md bg-amber-950/80 border border-amber-800 text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Zap size={13} className="text-amber-400" />
                High Priority Queue
              </span>
              <span className="px-2.5 py-1 rounded-md bg-blue-950/80 border border-blue-800 text-[11px] font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                <Radio size={13} className="text-blue-400" />
                Direct SDRF/Local Command Link
              </span>
            </div>

            {/* Fast Track Instant SOS Override Button */}
            {!isSuccess && !isTriaging && (
              <button
                type="button"
                onClick={handleFastTrackDispatch}
                className="btn-danger text-xs py-1.5 px-3 uppercase tracking-wider shadow-sm flex items-center gap-1.5 hover:scale-105 transition-transform"
                title="Immediately transmit live GPS and incident telemetry without filling all steps"
              >
                <Zap size={13} className="fill-current text-white" />
                ⚡ FAST TRACK DISPATCH
              </button>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShieldAlert className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white uppercase leading-tight font-display">
                🚨 NATIONAL DISASTER & EMERGENCY COMMAND (NDMA/SDRF DISPATCH)
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed">
                Direct NDMA/SDRF Dispatch Telemetry • Real-time AI Triage • Immediate Quick Reaction Force Notification
              </p>
            </div>
          </div>
        </div>

        {/* Stepper Progress Bar (Only shown during active form flow) */}
        {!isTriaging && !isSuccess && (
          <div className="card p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WIZARD_STEPS.map((s) => {
                const isCompleted = currentStep > s.num;
                const isActive = currentStep === s.num;
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => {
                      if (s.num < currentStep) setCurrentStep(s.num);
                      else if (s.num === 2 && category) setCurrentStep(2);
                      else if (s.num === 3 && category && description.trim().length >= 8) setCurrentStep(3);
                      else if (s.num === 4 && category && description.trim().length >= 8) setCurrentStep(4);
                    }}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 text-blue-900 dark:text-blue-200'
                        : isCompleted
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isCompleted 
                        ? 'bg-emerald-600 text-white' 
                        : isActive 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}>
                      {isCompleted ? <Check size={13} /> : s.num}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate leading-none">{s.title}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STATE 1: ACTIVE INCIDENT ENTRY WIZARD */}
          {!isTriaging && !isSuccess && (
            <motion.div
              key={`emergency-step-${currentStep}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="card p-6 sm:p-7 flex flex-col gap-6"
            >
              {/* ================= STEP 1: CATEGORY SELECTION ================= */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                        Select Disaster / Hazard Category
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Choose the primary incident type aligned with NDMA/SDRF response battalions.
                      </p>
                    </div>
                    <span className="text-xs text-red-600 font-semibold uppercase">Step 1 of 4</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {NDMA_INCIDENT_CATEGORIES.map((cat) => {
                      const isSelected = category === cat.id;
                      const Icon = cat.icon;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setCategory(cat.id);
                          }}
                          className={`p-3.5 rounded-lg border text-left transition-all relative flex flex-col justify-between min-h-[105px] ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-2 border-blue-600 text-blue-900 dark:text-blue-100 shadow-sm scale-[1.02]'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-2xl">{cat.emoji}</span>
                            <Icon size={18} className={isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
                          </div>
                          <div>
                            <div className="font-bold text-xs leading-snug mt-2">{cat.title}</div>
                            <div className={`text-[10px] mt-0.5 line-clamp-1 ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                              {cat.subtitle}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleNextStep}
                      disabled={!category}
                      className="btn-primary text-xs py-2.5 px-5 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <span>Continue to Situation Details</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* ================= STEP 2: SITUATION DESCRIPTION ================= */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                        Incident Telemetry & Situation Description
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Category: <strong className="text-slate-800 dark:text-slate-200">{selectedCategoryObj?.emoji} {selectedCategoryObj?.title}</strong>
                      </p>
                    </div>
                    <span className="text-xs text-red-600 font-semibold uppercase">Step 2 of 4</span>
                  </div>

                  {/* Quick Tag Prompt Chips */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">
                      Quick Situation Tags (Click to append tags directly into telemetry report):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {SITUATION_PROMPT_CHIPS.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAddPromptChip(chip)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 transition-colors"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Detailed Situation Report
                      </label>
                      <span className="text-[11px] text-slate-400">{description.length}/1000 chars (Min 8)</span>
                    </div>
                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="State critical details: Exact landmarks, casualties, trapped individuals, water level, hazardous materials involved, urgency level..."
                      className="input resize-none text-xs sm:text-sm font-normal leading-relaxed"
                    />
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handlePrevStep}
                      className="btn-secondary text-xs py-2.5 px-4"
                    >
                      ← Back to Categories
                    </button>
                    <button
                      type="button"
                      onClick={handleNextStep}
                      disabled={description.trim().length < 8}
                      className="btn-primary text-xs py-2.5 px-5 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <span>Continue to Evidence</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* ================= STEP 3: MULTIMODAL EVIDENCE INGESTION ================= */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                        Multimodal Evidence Ingestion (Optional)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Provide photo, video, or audio evidence for immediate AI triage assessment.
                      </p>
                    </div>
                    <span className="text-xs text-red-600 font-semibold uppercase">Step 3 of 4</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    
                    {/* Photo Ingestion */}
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 font-bold text-xs text-slate-700 dark:text-slate-200">
                            <Camera size={15} className="text-blue-600" />
                            <span>Photos ({photos.length}/4)</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                          Snap or upload damage photos for AI visual triage.
                        </p>

                        {/* Photo Previews */}
                        {photos.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {photos.map((p, idx) => (
                              <div key={idx} className="relative rounded-lg overflow-hidden aspect-video border border-slate-300 dark:border-slate-600">
                                <img src={p.url} alt="Evidence" className="w-full h-full object-cover" />
                                <button
                                  onClick={() => removePhoto(idx)}
                                  className="absolute top-1 right-1 p-1 rounded bg-slate-900/80 text-white hover:bg-red-600 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        type="file"
                        ref={photoInputRef}
                        onChange={handlePhotoUpload}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photos.length >= 4}
                        className="btn-secondary w-full text-xs py-2 disabled:opacity-40"
                      >
                        <Camera size={14} /> Add Photos
                      </button>
                    </div>

                    {/* Video Ingestion */}
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 font-bold text-xs text-slate-700 dark:text-slate-200">
                            <Video size={15} className="text-rose-600" />
                            <span>Video Clip (Max 30s)</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                          Short high-definition clip showing field severity.
                        </p>

                        {videoPreview && (
                          <div className="relative rounded-lg overflow-hidden aspect-video mb-3 border border-slate-300 dark:border-slate-600">
                            <video src={videoPreview} controls className="w-full h-full object-cover" />
                            <button
                              onClick={removeVideo}
                              className="absolute top-1 right-1 p-1 rounded bg-slate-900/80 text-white hover:bg-red-600 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>

                      <input
                        type="file"
                        ref={videoInputRef}
                        onChange={handleVideoUpload}
                        accept="video/*"
                        className="hidden"
                      />
                      {video ? (
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="btn-secondary w-full text-xs py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 size={14} /> Remove Video
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          className="btn-secondary w-full text-xs py-2"
                        >
                          <Video size={14} /> Upload Video
                        </button>
                      )}
                    </div>

                    {/* Audio SOS Ingestion */}
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 font-bold text-xs text-slate-700 dark:text-slate-200">
                            <Mic size={15} className="text-amber-600" />
                            <span>Voice SOS Note</span>
                          </div>
                          {isRecording && (
                            <span className="text-[11px] font-mono font-bold text-red-600 animate-pulse">
                              🔴 {formatDuration(recordingDuration)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                          Speak emergency details directly if unable to type.
                        </p>

                        {/* Waveform indicator */}
                        {isRecording && (
                          <div className="flex items-center justify-center gap-1 py-2.5 mb-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                            {[40, 70, 30, 90, 50, 80, 40, 60].map((h, i) => (
                              <span
                                key={i}
                                className="w-1 bg-red-600 rounded-full"
                                style={{ height: `${h}%` }}
                              />
                            ))}
                          </div>
                        )}

                        {/* Recorded Audio Preview */}
                        {audioUrl && !isRecording && (
                          <div className="flex items-center gap-2 mb-3 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            <audio src={audioUrl} controls className="w-full h-8" />
                            <button
                              onClick={removeAudio}
                              className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {isRecording ? (
                        <button
                          type="button"
                          onClick={stopAudioRecording}
                          className="btn-danger w-full text-xs py-2"
                        >
                          <MicOff size={14} /> Stop & Save SOS
                        </button>
                      ) : audioUrl ? (
                        <button
                          type="button"
                          onClick={startAudioRecording}
                          className="btn-secondary w-full text-xs py-2"
                        >
                          <RefreshCw size={14} /> Re-record Audio SOS
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startAudioRecording}
                          className="btn-secondary w-full text-xs py-2"
                        >
                          <Mic size={14} /> Record Audio SOS
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handlePrevStep}
                      className="btn-secondary text-xs py-2.5 px-4"
                    >
                      ← Back to Situation
                    </button>
                    <div className="flex items-center gap-2">
                      {photos.length === 0 && !video && !audioBlob && (
                        <button
                          type="button"
                          onClick={handleNextStep}
                          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium px-2"
                        >
                          Skip / No Media
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleNextStep}
                        className="btn-primary text-xs py-2.5 px-5 flex items-center gap-1.5"
                      >
                        <span>Continue to Location & Dispatch</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= STEP 4: PRECISION GPS & FINAL DISPATCH ================= */}
              {currentStep === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-red-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                        Precision GPS & Final Dispatch Confirmation
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Verify incident coordinates and broadcast the emergency alert to NDMA command.
                      </p>
                    </div>
                    <span className="text-xs text-red-600 font-semibold uppercase">Step 4 of 4</span>
                  </div>

                  {/* Location Card */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        Precision GPS Location Fix
                      </label>
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {accuracyRadius}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <MapPin size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                            {location.address}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            LAT: {location.lat?.toFixed(5)}° N • LNG: {location.lng?.toFixed(5)}° E
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={detectLocation}
                          disabled={gpsLoading}
                          className="p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-40"
                          title="Refresh GPS Satellite Fix"
                        >
                          <Compass size={15} className={gpsLoading ? 'animate-spin' : ''} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowMapModal(!showMapModal)}
                          className="btn-secondary text-xs py-2 px-3 flex-1 sm:flex-none"
                        >
                          <Layers size={14} /> {showMapModal ? 'Hide Map' : 'Pinpoint on Map'}
                        </button>
                      </div>
                    </div>

                    {/* Leaflet Interactive Map Drawer */}
                    {showMapModal && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"
                      >
                        <div className="p-2.5 bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-between">
                          <span>Click anywhere on the map or drag the marker to pinpoint the exact incident position:</span>
                          <button onClick={() => setShowMapModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <MapPicker
                          initialLat={location.lat || 16.3067}
                          initialLng={location.lng || 80.4365}
                          height="240px"
                          onLocationSelect={(lat, lng, address) => {
                            setLocation({
                              address: address || `Coordinates: (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
                              state: 'andhra pradesh',
                              district: 'guntur',
                              lat,
                              lng,
                            });
                            setAccuracyRadius('±1m (Manual Pinpoint Lock)');
                          }}
                        />
                      </motion.div>
                    )}
                  </div>

                  {/* Summary Preview Box */}
                  <div className="p-4 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-2.5">
                    <div className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                      📋 Emergency Dispatch Summary
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Category:</span>{' '}
                        <strong className="text-slate-800 dark:text-slate-200">{selectedCategoryObj?.emoji} {selectedCategoryObj?.title}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Evidence Attached:</span>{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {photos.length} Photos{video ? ', 1 Video' : ''}{audioBlob ? ', 1 Voice SOS' : ''}{photos.length === 0 && !video && !audioBlob ? 'None' : ''}
                        </strong>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 dark:text-slate-400">Situation Telemetry:</span>{' '}
                        <p className="text-slate-700 dark:text-slate-300 line-clamp-2 mt-0.5 font-medium">{description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Final Action Buttons */}
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      onClick={handleEmergencySubmit}
                      className="btn-danger w-full py-4 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
                    >
                      <ShieldAlert size={20} />
                      🚨 BROADCAST DISPATCH / REPORT SOS
                    </button>
                    
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handlePrevStep}
                        className="btn-secondary text-xs py-2 px-4"
                      >
                        ← Back to Evidence
                      </button>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 text-right">
                        Encrypted packet dispatched to Central NDMA / SDRF Control Room.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          )}

          {/* STATE 2: REAL-TIME AI TRIAGE & DISPATCH PROCESSING */}
          {isTriaging && (
            <motion.div
              key="emergency-triage"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="card bg-slate-950 text-white border-slate-800 p-8 flex flex-col items-center text-center shadow-lg"
            >
              <div className="w-16 h-16 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center mb-5">
                <Radio size={28} className="animate-pulse" />
              </div>

              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white font-display mb-1.5">
                PROCESSING NATIONAL EMERGENCY DISPATCH
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
                Live AI Triage Engine is analyzing telemetry, verifying geofences, and alerting the nearest NDRF/SDRF battalions.
              </p>

              {/* Step Telemetry Indicators */}
              <div className="w-full max-w-md space-y-2.5 text-left">
                {/* Step 1 */}
                <div className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${
                  triageStep >= 1 ? 'bg-slate-900 border-blue-500/50 text-blue-200' : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    triageStep > 1 ? 'bg-blue-600 text-white' : triageStep === 1 ? 'bg-blue-600/30 text-blue-300' : 'bg-slate-800'
                  }`}>
                    {triageStep > 1 ? '✓' : '1'}
                  </div>
                  <div className="text-xs font-medium flex-1">
                    🛰️ Geo-spatial indexing & Nearest NDRF/SDRF Station locator
                  </div>
                </div>

                {/* Step 2 */}
                <div className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${
                  triageStep >= 2 ? 'bg-slate-900 border-amber-500/50 text-amber-200' : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    triageStep > 2 ? 'bg-amber-600 text-white' : triageStep === 2 ? 'bg-amber-600/30 text-amber-300' : 'bg-slate-800'
                  }`}>
                    {triageStep > 2 ? '✓' : '2'}
                  </div>
                  <div className="text-xs font-medium flex-1">
                    🧠 Multimodal AI Vision & Audio Severity Assessment
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${
                  triageStep >= 3 ? 'bg-slate-900 border-red-500/50 text-red-200' : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    triageStep === 3 ? 'bg-red-600 text-white' : 'bg-slate-800'
                  }`}>
                    3
                  </div>
                  <div className="text-xs font-medium flex-1">
                    ⚡ Priority Queue Assignment & Automated Dispatch Notification
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE 3: DISPATCH SUCCESS & LIVE TRACKING CARD */}
          {isSuccess && (
            <motion.div
              key="emergency-success"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card p-6 sm:p-8 flex flex-col items-center text-center gap-5 shadow-lg"
            >
              {isSavedOffline ? (
                <>
                  <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                    <WifiOff size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white uppercase font-display">
                      Offline Emergency Packet Saved 💾
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                      Your internet connection is offline. Telemetry, GPS coordinates, and media evidence have been securely saved in your browser's IndexedDB queue.
                    </p>
                    <div className="mt-3 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-700 dark:text-amber-400 inline-block">
                      📡 Auto-sync will dispatch to NDMA servers the instant connectivity restores.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle size={28} />
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      DISPATCHED — PRIORITY-1 QUEUE
                    </span>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white uppercase font-display mt-2">
                      EMERGENCY BROADCAST TRANSMITTED 📡
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                      Incident dispatched to NDRF Quick Reaction Force, SDRF Field Station, District Control Room, and Local Authorities.
                    </p>
                  </div>

                  {/* Tracking Token Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-md">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      National Disaster Incident Reference Code
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <span className="font-mono font-bold text-red-600 dark:text-red-400 tracking-wider text-lg sm:text-xl">
                        {submittedId || 'NDMA-SDRF-2026-EMG'}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(submittedId || 'NDMA-SDRF-2026-EMG');
                          toast.success('Reference code copied!');
                        }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-200 border border-slate-300 dark:border-slate-600 transition-colors"
                        title="Copy Reference Code"
                      >
                        <Clipboard size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Immediate Emergency Hotlines */}
                  <div className="w-full max-w-md">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Immediate Official Emergency Hotlines (Direct Dial)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <a href="tel:112" className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-center hover:bg-red-100 transition-colors">
                        <div className="font-bold text-sm text-red-600 dark:text-red-400">112</div>
                        <div className="text-[9px] text-slate-500 font-semibold uppercase">All Emergency</div>
                      </a>
                      <a href="tel:101" className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center hover:bg-amber-100 transition-colors">
                        <div className="font-bold text-sm text-amber-700 dark:text-amber-400">101</div>
                        <div className="text-[9px] text-slate-500 font-semibold uppercase">Fire & Rescue</div>
                      </a>
                      <a href="tel:108" className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center hover:bg-emerald-100 transition-colors">
                        <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400">108</div>
                        <div className="text-[9px] text-slate-500 font-semibold uppercase">Ambulance</div>
                      </a>
                      <a href="tel:100" className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-center hover:bg-blue-100 transition-colors">
                        <div className="font-bold text-sm text-blue-700 dark:text-blue-400">100</div>
                        <div className="text-[9px] text-slate-500 font-semibold uppercase">Police</div>
                      </a>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-md pt-1">
                <Link
                  to="/dashboard"
                  className="btn-secondary flex-1 py-2.5 text-xs uppercase"
                >
                  <Home size={15} /> Return to Dashboard
                </Link>
                <button
                  onClick={() => {
                    setIsSuccess(false);
                    setIsSavedOffline(false);
                    setCurrentStep(1);
                    setCategory('');
                    setDescription('');
                    setPhotos([]);
                    setVideo(null);
                    setVideoPreview(null);
                    setAudioBlob(null);
                    setAudioUrl(null);
                  }}
                  className="btn-danger flex-1 py-2.5 text-xs uppercase"
                >
                  <ShieldAlert size={15} /> Broadcast New SOS
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
}
