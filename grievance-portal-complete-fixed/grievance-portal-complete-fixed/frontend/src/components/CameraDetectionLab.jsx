import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, Video, AlertTriangle, ShieldCheck, CheckCircle2, RotateCcw,
  Sparkles, Layers, Activity, Eye, Zap, Flame, Waves, Car,
  Sliders, Radio, AlertOctagon, RefreshCw, Send, Lock,
  ChevronDown, Globe, ShieldAlert, Cpu, Terminal, Compass, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';

// Demo Scenarios with simulated video overlays
const DEMO_SCENARIO_PRESETS = [
  {
    id: 'flood',
    title: 'Demo 01: Flash Flood & Submerged Vehicles',
    scenarioKey: 'flood',
    category: 'emergency_flood',
    severity: 'Critical',
    icon: Waves,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/30',
    defaultLocation: {
      address: 'Krishna Canal Spillway & Low-Lying Sector, Guntur',
      district: 'guntur',
      state: 'andhra pradesh',
      lat: 16.2950,
      lng: 80.4280
    }
  },
  {
    id: 'fire',
    title: 'Demo 02: Industrial Fire & Dense Smoke',
    scenarioKey: 'fire',
    category: 'emergency_fire',
    severity: 'Critical',
    icon: Flame,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10 border-rose-500/30',
    defaultLocation: {
      address: 'Autonagar Industrial Corridor, Block 4, Guntur',
      district: 'guntur',
      state: 'andhra pradesh',
      lat: 16.3280,
      lng: 80.4610
    }
  },
  {
    id: 'accident',
    title: 'Demo 03: Multi-Vehicle Arterial Crash',
    scenarioKey: 'accident',
    category: 'emergency_accident',
    severity: 'High',
    icon: Car,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/30',
    defaultLocation: {
      address: 'Brodipet Main Road High-Speed Corridor, Guntur',
      district: 'guntur',
      state: 'andhra pradesh',
      lat: 16.3067,
      lng: 80.4365
    }
  },
  {
    id: 'crowd',
    title: 'Demo 04: Public Transit Crowd Bottleneck',
    scenarioKey: 'crowd',
    category: 'emergency_crime',
    severity: 'High',
    icon: ShieldAlert,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10 border-purple-500/30',
    defaultLocation: {
      address: 'RTC Central Bus Terminal Complex, Guntur',
      district: 'guntur',
      state: 'andhra pradesh',
      lat: 16.3120,
      lng: 80.4420
    }
  }
];

export default function CameraDetectionLab({ onIncidentCreated }) {
  // Camera Source Mode: 'webcam' | 'authorized_cctv' | 'demo_scenario'
  const [cameraMode, setCameraMode] = useState('webcam');

  // Webcam States & Device Management
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [permissionState, setPermissionState] = useState('prompt'); // 'prompt' | 'granted' | 'denied'

  // Authorized CCTV State
  const [cctvList, setCctvList] = useState([]);
  const [selectedCctvId, setSelectedCctvId] = useState('CAM-001');

  // Demo Scenario State
  const [selectedScenario, setSelectedScenario] = useState('flood');

  // AI Detection Engine States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [detectionTimestamp, setDetectionTimestamp] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(90);
  const [locationMode, setLocationMode] = useState('configured'); // 'configured' | 'browser' | 'manual'

  // Location State for the Active Camera Source
  const [cameraLocation, setCameraLocation] = useState({
    address: 'Brodipet Arterial Sector, Guntur, AP',
    lat: 16.3067,
    lng: 80.4365,
    district: 'guntur',
    state: 'andhra pradesh'
  });

  // Video & Canvas DOM references
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const analysisIntervalRef = useRef(null);

  // Load Authorized CCTV list from backend on mount
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await api.get('/emergency/cameras');
        if (res.data?.success && res.data.data) {
          setCctvList(res.data.data);
        }
      } catch (err) {
        console.warn('Fallback CCTV list:', err.message);
      }
    };
    fetchCameras();
  }, []);

  // Enumerate Media Devices (Webcams)
  const enumerateCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        setCameraError('Camera access is not supported by your browser.');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      setAvailableCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating cameras:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    enumerateCameras();
  }, [enumerateCameras]);

  // Start Live Webcam Stream
  const startWebcam = async (deviceId) => {
    stopWebcam();
    setCameraError(null);

    try {
      const constraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
      setPermissionState('granted');
      toast.success('Live camera stream connected');

      // Re-enumerate to get friendly labels now that permission is granted
      await enumerateCameras();
    } catch (err) {
      console.error('Webcam start error:', err);
      setIsCameraActive(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setCameraError('Camera permission was denied. Please allow camera access in browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No video camera detected on your system.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is already in use by another application.');
      } else {
        setCameraError(`Camera connection failed: ${err.message}`);
      }
    }
  };

  // Stop Webcam Stream
  const stopWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    stopAiDetection();
  };

  // Switch Active Camera
  const handleDeviceChange = (e) => {
    const newDeviceId = e.target.value;
    setSelectedDeviceId(newDeviceId);
    if (isCameraActive) {
      startWebcam(newDeviceId);
    }
  };

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // Update camera location depending on selected source
  useEffect(() => {
    if (cameraMode === 'authorized_cctv') {
      const selectedCam = cctvList.find(c => c.id === selectedCctvId);
      if (selectedCam) {
        setCameraLocation({
          address: selectedCam.location,
          lat: selectedCam.lat,
          lng: selectedCam.lng,
          district: selectedCam.district,
          state: selectedCam.state
        });
      }
    } else if (cameraMode === 'demo_scenario') {
      const scenario = DEMO_SCENARIO_PRESETS.find(s => s.scenarioKey === selectedScenario);
      if (scenario && scenario.defaultLocation) {
        setCameraLocation(scenario.defaultLocation);
      }
    }
  }, [cameraMode, selectedCctvId, selectedScenario, cctvList]);

  // Capture current video frame as Blob
  const captureFrameBlob = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    });
  };

  // Execute AI Frame Analysis
  const performAiAnalysisStep = async () => {
    try {
      let payload = {
        cameraId: cameraMode === 'authorized_cctv' ? selectedCctvId : (cameraMode === 'webcam' ? 'WEBCAM-01' : 'DEMO-01'),
        mode: cameraMode,
        location: cameraLocation,
        isDemo: cameraMode === 'demo_scenario'
      };

      if (cameraMode === 'demo_scenario') {
        payload.scenario = selectedScenario;
        const res = await api.post('/emergency/detect-frame', payload);
        if (res.data?.success && res.data.data) {
          setAnalysisResult(res.data.data);
          setDetectionTimestamp(new Date().toLocaleTimeString());
        }
      } else if (cameraMode === 'webcam' && isCameraActive) {
        const frameBlob = await captureFrameBlob();
        const formData = new FormData();
        formData.append('cameraId', 'WEBCAM-01');
        formData.append('mode', 'webcam');
        formData.append('location', JSON.stringify(cameraLocation));
        if (frameBlob) {
          formData.append('image', frameBlob, 'frame.jpg');
        }

        const res = await api.post('/emergency/detect-frame', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (res.data?.success && res.data.data) {
          setAnalysisResult(res.data.data);
          setDetectionTimestamp(new Date().toLocaleTimeString());
        }
      } else {
        // CCTV mode simulation
        payload.scenario = 'accident';
        const res = await api.post('/emergency/detect-frame', payload);
        if (res.data?.success && res.data.data) {
          setAnalysisResult(res.data.data);
          setDetectionTimestamp(new Date().toLocaleTimeString());
        }
      }
    } catch (err) {
      console.error('Frame analysis failed:', err);
    }
  };

  // Start / Stop AI Detection Loop
  const startAiDetection = () => {
    if (cameraMode === 'webcam' && !isCameraActive) {
      toast.error('Please start the webcam first before running AI detection.');
      return;
    }

    setIsAnalyzing(true);
    toast.success('AI Computer Vision Engine active');
    performAiAnalysisStep();

    analysisIntervalRef.current = setInterval(() => {
      performAiAnalysisStep();
    }, 4500);
  };

  const stopAiDetection = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
    setIsAnalyzing(false);
  };

  // Dispatch / Ingest Incident into Backend
  const handleDispatchIncident = async () => {
    if (!analysisResult) return;
    setIsDispatching(true);

    try {
      const payload = {
        eventType: analysisResult.eventType,
        category: analysisResult.category || 'emergency_flood',
        subcategory: analysisResult.category || 'emergency_flood',
        severity: analysisResult.severity || 'Critical',
        confidence: analysisResult.confidence || 92,
        source: cameraMode === 'webcam' ? 'live_webcam' : (cameraMode === 'authorized_cctv' ? 'authorized_cctv' : 'demo_scenario'),
        cameraId: analysisResult.cameraId,
        location: cameraLocation,
        evidence: analysisResult.evidence,
        signals: analysisResult.signals,
        isDemo: cameraMode === 'demo_scenario'
      };

      const res = await api.post('/emergency/incidents', payload);
      if (res.data?.success) {
        if (res.data.clustered) {
          toast.success(res.data.message, { duration: 5000 });
        } else {
          toast.success(`Emergency Incident #${res.data.data.complaintId} created & dispatched!`, { duration: 5000 });
        }

        if (onIncidentCreated) {
          onIncidentCreated(res.data.data || { complaintId: res.data.complaintId });
        }
      }
    } catch (err) {
      toast.error(`Dispatch failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="card p-5 sm:p-7 bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl space-y-6 overflow-hidden relative">
      
      {/* Background Glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Cpu size={18} className="animate-pulse" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide font-display">
              AI Camera Detection Lab
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 uppercase">
              Vision Engine v2.4
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            Select an authorized camera source, webcam, or simulation feed and let AI analyze the live stream for potential hazards and disasters in real time.
          </p>
        </div>

        {/* Status Chip */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
            isAnalyzing 
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
              : (isCameraActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700')
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              isAnalyzing ? 'bg-rose-500' : (isCameraActive ? 'bg-emerald-500' : 'bg-slate-500')
            }`} />
            <span>{isAnalyzing ? 'ANALYZING STREAM' : (isCameraActive ? 'STREAM ACTIVE' : 'STANDBY')}</span>
          </div>
        </div>
      </div>

      {/* Source Selector Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* Option 1: Live Webcam */}
        <button
          type="button"
          onClick={() => {
            setCameraMode('webcam');
            setAnalysisResult(null);
          }}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            cameraMode === 'webcam'
              ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-xs flex items-center gap-1.5">
              <Camera size={14} className={cameraMode === 'webcam' ? 'text-blue-400' : 'text-slate-400'} />
              Live Laptop / USB Webcam
            </span>
            {cameraMode === 'webcam' && <Check size={14} className="text-blue-400" />}
          </div>
          <p className="text-[10px] text-slate-400">
            Real device testing with browser permission & live capture
          </p>
        </button>

        {/* Option 2: Authorized CCTV */}
        <button
          type="button"
          onClick={() => {
            setCameraMode('authorized_cctv');
            setAnalysisResult(null);
            stopWebcam();
          }}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            cameraMode === 'authorized_cctv'
              ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-xs flex items-center gap-1.5">
              <Video size={14} className={cameraMode === 'authorized_cctv' ? 'text-blue-400' : 'text-slate-400'} />
              Authorized CCTV Cameras
            </span>
            {cameraMode === 'authorized_cctv' && <Check size={14} className="text-blue-400" />}
          </div>
          <p className="text-[10px] text-slate-400">
            5 Municipal traffic, bus station, and flood monitoring feeds
          </p>
        </button>

        {/* Option 3: Demo Scenarios */}
        <button
          type="button"
          onClick={() => {
            setCameraMode('demo_scenario');
            setAnalysisResult(null);
            stopWebcam();
          }}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            cameraMode === 'demo_scenario'
              ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-xs flex items-center gap-1.5">
              <Sparkles size={14} className={cameraMode === 'demo_scenario' ? 'text-blue-400' : 'text-slate-400'} />
              Demo Disaster Scenarios
            </span>
            {cameraMode === 'demo_scenario' && <Check size={14} className="text-blue-400" />}
          </div>
          <p className="text-[10px] text-slate-400">
            Flood, fire, multi-car collision, and crowd stampede tests
          </p>
        </button>

      </div>

      {/* Sub-selectors (Camera Devices / CCTV Pickers / Scenario Tabs) */}
      <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* 1. Webcam Device Selector */}
        {cameraMode === 'webcam' && (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <span className="text-slate-400 font-semibold">Available Camera:</span>
            <select
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              className="py-1.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableCameras.length > 0 ? (
                availableCameras.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    📷 {dev.label || `Camera ${idx + 1} (${dev.deviceId ? dev.deviceId.substring(0, 8) : 'Integrated'})`}
                  </option>
                ))
              ) : (
                <option value="">Default Integrated Webcam</option>
              )}
            </select>

            <button
              type="button"
              onClick={enumerateCameras}
              className="btn-secondary py-1.5 px-2.5 text-[11px] font-bold flex items-center gap-1"
              title="Refresh Camera Device List"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        )}

        {/* 2. Authorized CCTV Selector */}
        {cameraMode === 'authorized_cctv' && (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <span className="text-slate-400 font-semibold">CCTV Feed:</span>
            <select
              value={selectedCctvId}
              onChange={e => setSelectedCctvId(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {cctvList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — ({c.resolution})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 3. Demo Scenario Selector */}
        {cameraMode === 'demo_scenario' && (
          <div className="flex flex-wrap items-center gap-2 w-full">
            <span className="text-slate-400 font-semibold mr-1">Select Scenario:</span>
            {DEMO_SCENARIO_PRESETS.map(s => {
              const Icon = s.icon;
              const isSelected = selectedScenario === s.scenarioKey;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedScenario(s.scenarioKey);
                    setAnalysisResult(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                  }`}
                >
                  <Icon size={12} className={isSelected ? 'text-white' : s.color} />
                  <span>{s.title.split(':')[0]}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Location Display */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 ml-auto">
          <Compass size={13} className="text-blue-400" />
          <span>Location: <span className="text-slate-200 font-bold">{cameraLocation.address}</span></span>
        </div>

      </div>

      {/* Main Lab Screen (Video Stream + AI Analysis Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Video Canvas */}
        <div className="lg:col-span-7 space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center shadow-inner group">
            
            {/* Hidden canvas for capturing video frames */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Video element for Live Webcam */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraMode === 'webcam' && isCameraActive ? 'block' : 'hidden'}`}
            />

            {/* CCTV Stream Simulation Graphics */}
            {cameraMode !== 'webcam' && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/70 flex flex-col justify-between p-4">
                {/* Top Watermark */}
                <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 bg-black/60 px-3 py-1.5 rounded-lg border border-emerald-500/30 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span>REC ● {cameraMode === 'authorized_cctv' ? selectedCctvId : 'SCENARIO-FEED'}</span>
                  </div>
                  <span>1080p @ 30fps • 4.2 Mbps</span>
                </div>

                {/* Center Scenario Visualizer */}
                <div className="text-center space-y-2 py-8">
                  {cameraMode === 'demo_scenario' ? (
                    <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 max-w-sm mx-auto space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto border border-blue-400/30">
                        {selectedScenario === 'flood' && <Waves size={24} className="text-cyan-400 animate-bounce" />}
                        {selectedScenario === 'fire' && <Flame size={24} className="text-rose-400 animate-pulse" />}
                        {selectedScenario === 'accident' && <Car size={24} className="text-amber-400" />}
                        {selectedScenario === 'crowd' && <ShieldAlert size={24} className="text-purple-400" />}
                      </div>
                      <div className="font-bold text-sm text-white">
                        {DEMO_SCENARIO_PRESETS.find(s => s.scenarioKey === selectedScenario)?.title}
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Live AI frame-sampling simulation ready. Click "Start AI Detection" to run neural classification.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 max-w-sm mx-auto space-y-2">
                      <Video size={28} className="text-blue-400 mx-auto animate-pulse" />
                      <div className="font-bold text-sm text-white">
                        {cctvList.find(c => c.id === selectedCctvId)?.name || 'Authorized CCTV Stream'}
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Direct municipal telemetry connected. Optical frame feed active.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bottom HUD */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 bg-black/60 px-3 py-1 rounded-lg border border-slate-700">
                  <span>LAT: {cameraLocation.lat.toFixed(4)} N | LNG: {cameraLocation.lng.toFixed(4)} E</span>
                  <span>{new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC</span>
                </div>
              </div>
            )}

            {/* Webcam Inactive / Standby Overlay */}
            {cameraMode === 'webcam' && !isCameraActive && (
              <div className="p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto border border-slate-700">
                  <Camera size={26} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Webcam Disconnected</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                    Click "Start Camera" to grant browser permission and preview your laptop / USB camera feed.
                  </p>
                </div>
                {cameraError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs max-w-xs mx-auto">
                    {cameraError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => startWebcam(selectedDeviceId)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all inline-flex items-center gap-1.5"
                >
                  <Camera size={14} /> Start Camera
                </button>
              </div>
            )}

            {/* Live Camera Active Controls HUD */}
            {cameraMode === 'webcam' && isCameraActive && (
              <div className="absolute top-3 left-3 bg-black/60 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>LIVE WEBCAM STREAM</span>
              </div>
            )}

          </div>

          {/* Stream Control Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {cameraMode === 'webcam' && (
              <>
                {isCameraActive ? (
                  <button
                    type="button"
                    onClick={stopWebcam}
                    className="btn-secondary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700"
                  >
                    <RotateCcw size={13} /> Stop Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startWebcam(selectedDeviceId)}
                    className="btn-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Camera size={13} /> Start Camera
                  </button>
                )}
              </>
            )}

            {isAnalyzing ? (
              <button
                type="button"
                onClick={stopAiDetection}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-600/30 active:scale-95 transition-all"
              >
                <AlertOctagon size={14} /> Stop AI Detection
              </button>
            ) : (
              <button
                type="button"
                onClick={startAiDetection}
                className="py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-blue-500/30 active:scale-95 transition-all"
              >
                <Cpu size={14} /> Start AI Detection
              </button>
            )}

            <button
              type="button"
              onClick={performAiAnalysisStep}
              disabled={isAnalyzing}
              className="btn-secondary py-2 px-3 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              title="Perform single frame analysis"
            >
              <Eye size={13} /> Scan Frame
            </button>
          </div>
        </div>

        {/* Right Column: Live AI Analysis & Multi-Source Verification Panel */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 shadow-lg space-y-4">
            
            {/* Analysis Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <h3 className="font-bold text-sm text-white">Live AI Analysis</h3>
              </div>
              {detectionTimestamp && (
                <span className="text-[10px] font-mono text-slate-400">
                  Last updated: {detectionTimestamp}
                </span>
              )}
            </div>

            {/* Analysis Body */}
            {analysisResult ? (
              <div className="space-y-4">
                
                {/* Event Classification Card */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Detected Hazard
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      analysisResult.severity === 'Critical'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {analysisResult.severity}
                    </span>
                  </div>

                  <div className="font-black text-base text-white font-display">
                    {analysisResult.eventType}
                  </div>

                  {/* Confidence Progress Meter */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">AI Confidence:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {analysisResult.confidence}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          analysisResult.confidence >= 90
                            ? 'bg-emerald-500'
                            : analysisResult.confidence >= 70
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${analysisResult.confidence}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Evidence Trail List */}
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1">
                    <Terminal size={12} className="text-blue-400" />
                    Computer Vision Evidence:
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-300">
                    {analysisResult.evidence && analysisResult.evidence.map((ev, i) => (
                      <li key={i} className="flex items-start gap-1.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                        <span className="text-blue-400 font-bold">•</span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Multi-Source Verification Engine Breakdown */}
                {analysisResult.signals && (
                  <div className="space-y-2 p-3 rounded-xl bg-purple-950/20 border border-purple-800/40">
                    <div className="flex items-center justify-between text-[11px] font-bold text-purple-300">
                      <span>Multi-Source Verification Trail</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200">
                        {analysisResult.verificationStatus}
                      </span>
                    </div>

                    <div className="space-y-1 text-[10px]">
                      {analysisResult.signals.map((sig, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-300">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={11} className={sig.verified ? 'text-emerald-400' : 'text-slate-500'} />
                            <span>{sig.source}</span>
                          </span>
                          <span className="font-mono text-purple-300">+{sig.weight}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons: Auto Dispatch vs Manual Verification */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleDispatchIncident}
                    disabled={isDispatching}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <Send size={14} />
                    <span>{isDispatching ? 'Dispatching to Responders...' : '⚡ Confirm & Dispatch Incident'}</span>
                  </button>
                  <p className="text-[10px] text-center text-slate-400">
                    Creates an authorized emergency incident on the Civic Heatmap & alerts first responders.
                  </p>
                </div>

              </div>
            ) : (
              <div className="p-8 text-center space-y-2 text-slate-400">
                <Cpu size={32} className="mx-auto text-slate-600 animate-pulse" />
                <h4 className="font-bold text-sm text-slate-300">Waiting for Stream Telemetry</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Click "Start AI Detection" to capture frames, calculate confidence, and evaluate multi-source corroboration.
                </p>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
