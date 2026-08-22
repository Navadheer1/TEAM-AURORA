import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  MapPin, Upload, X, AlertCircle, CheckCircle, Navigation,
  FileImage, FileVideo, Eye, EyeOff, ChevronRight, Info, Clipboard,
  Sparkles, Loader2, WifiOff, Camera, RefreshCw, Trash2, Edit3, Check, CheckCircle2
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../utils/api';
import { CATEGORIES, INDIAN_STATES, DISTRICTS_MAP, AI_VISION_CATEGORIES } from '../../utils/constants';
import { saveOfflineComplaint } from '../../utils/indexedDb';
import { useTranslation } from '../../utils/i18n';

const STEPS = ['Category', 'Description', 'Location', 'Attachments', 'Review', 'Success'];

export default function SubmitComplaint() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [submittedComplaintId, setSubmittedComplaintId] = useState(null);
  const [submittedAuthorityType, setSubmittedAuthorityType] = useState(null);
  const [form, setForm] = useState({
    category: '',
    subcategory: '',
    description: '',
    isAnonymous: false,
    location: { address: '', state: '', district: '', pincode: '', lat: null, lng: null },
  });

  const [aiFile, setAiFile] = useState(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateData, setDuplicateData] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isOfflineSuccess, setIsOfflineSuccess] = useState(false);

  useEffect(() => {
    const preCategory = localStorage.getItem('voice_preselect_category');
    const preSubcategory = localStorage.getItem('voice_preselect_subcategory');
    if (preCategory) {
      setForm(f => ({ ...f, category: preCategory, subcategory: preSubcategory || '' }));
      localStorage.removeItem('voice_preselect_category');
      localStorage.removeItem('voice_preselect_subcategory');
      toast.success(`Voice pre-filled: ${preCategory} / ${preSubcategory}`);
    }
  }, []);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setLoc = (field, val) => setForm(f => ({ ...f, location: { ...f.location, [field]: val } }));

  const processImageWithAI = async (file) => {
    if (!file) return;

    // 1. Validate file format and size
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase()) && !file.type.startsWith('image/')) {
      toast.error('Please upload a valid JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('File size too large. Max 15MB allowed for AI photo analysis.');
      return;
    }
    if (file.size === 0) {
      toast.error('Uploaded file is empty or corrupted.');
      return;
    }

    // Set preview
    const previewUrl = URL.createObjectURL(file);
    setAiFile(file);
    setAiPreviewUrl(previewUrl);
    setAiLoading(true);
    setAiResult(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.post('/complaints/analyze-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const analysis = res.data.analysis || res.data.data;
      setAiResult(analysis);

      // Automatically attach this file to files evidence list
      const withPreview = Object.assign(file, { preview: previewUrl });
      setFiles(prev => {
        if (prev.some(f => f.name === file.name && f.size === file.size)) return prev;
        if (prev.length >= 5) return prev;
        return [...prev, withPreview];
      });

      if (analysis.is_complaint && analysis.category !== 'Other') {
        // Auto-fill category, subcategory and description
        setForm(f => ({
          ...f,
          category: analysis.mappedCategory || f.category || 'civic_issue',
          subcategory: analysis.mappedSubcategory || f.subcategory || 'road_damage',
          description: analysis.description || f.description,
        }));

        if (analysis.confidence >= 0.80) {
          toast.success(`✨ AI detected: ${analysis.category} (${Math.round(analysis.confidence * 100)}%)`);
        } else {
          toast(`🔍 AI suggestion: ${analysis.category} (${Math.round(analysis.confidence * 100)}%). Please verify details.`, { icon: 'ℹ️' });
        }
      } else {
        toast('⚠️ We couldn\'t confidently identify a civic complaint from this photo. You can still select category and enter description manually.', { duration: 6000, icon: '⚠️' });
      }
    } catch (err) {
      console.error('AI vision analysis error:', err);
      toast.error(err.response?.data?.message || 'AI analysis is temporarily unavailable. You can still submit your complaint manually.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiPhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageWithAI(file);
  };

  const clearAiPhoto = () => {
    if (aiPreviewUrl) URL.revokeObjectURL(aiPreviewUrl);
    setAiFile(null);
    setAiPreviewUrl(null);
    setAiResult(null);
    setAiLoading(false);
  };

  const handleAiCategoryChange = (e) => {
    const selectedVal = e.target.value;
    const item = AI_VISION_CATEGORIES.find(c => c.value === selectedVal);
    if (item) {
      setForm(f => ({ ...f, category: item.category, subcategory: item.subcategory }));
      if (aiResult) {
        setAiResult(prev => ({
          ...prev,
          category: item.value,
          mappedCategory: item.category,
          mappedSubcategory: item.subcategory,
          detectedCategory: item.value
        }));
      }
      toast.success(`Category updated to: ${item.label}`);
    }
  };

  const onDrop = useCallback((accepted) => {
    if (files.length + accepted.length > 5) { toast.error('Max 5 files allowed'); return; }
    const withPreview = accepted.map(f => Object.assign(f, { preview: URL.createObjectURL(f) }));
    setFiles(prev => [...prev, ...withPreview]);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, maxFiles: 5, maxSize: 50 * 1024 * 1024,
    accept: { 'image/*': [], 'video/*': [], 'application/pdf': [] }
  });

  const matchStateAndDistrict = (detectedState, detectedDistrict, rawAddressData) => {
    const cleanStr = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str.toLowerCase()
        .replace(/\b(state|district|division|city|corporation|union territory|ut|sub-district|taluk|tehsil|zone)\b/gi, '')
        .trim();
    };

    const cleanState = cleanStr(detectedState);
    const cleanDistrict = cleanStr(detectedDistrict);

    let matchedState = '';
    for (const s of INDIAN_STATES) {
      const sLower = s.toLowerCase();
      const sClean = cleanStr(s);
      if (sLower === cleanState || sClean === cleanState || sLower.includes(cleanState) || (cleanState && cleanState.includes(sClean))) {
        matchedState = sLower;
        break;
      }
    }

    if (!matchedState && rawAddressData) {
      const addressValues = Object.values(rawAddressData).map(v => typeof v === 'string' ? cleanStr(v) : '');
      for (const s of INDIAN_STATES) {
        const sClean = cleanStr(s);
        if (addressValues.includes(sClean) || addressValues.some(v => v && (v.includes(sClean) || sClean.includes(v)))) {
          matchedState = s.toLowerCase();
          break;
        }
      }
    }

    let matchedDistrict = '';
    if (matchedState && DISTRICTS_MAP[matchedState]) {
      const validDistricts = DISTRICTS_MAP[matchedState];
      for (const d of validDistricts) {
        const dLower = d.toLowerCase();
        const dClean = cleanStr(d);
        if (dLower === cleanDistrict || dClean === cleanDistrict || dLower.includes(cleanDistrict) || (cleanDistrict && cleanDistrict.includes(dClean))) {
          matchedDistrict = dLower;
          break;
        }
      }

      if (!matchedDistrict && rawAddressData) {
        const searchKeys = ['district', 'county', 'state_district', 'city', 'suburb', 'town', 'village', 'municipality', 'locality', 'residential'];
        for (const key of searchKeys) {
          const value = cleanStr(rawAddressData[key]);
          if (value) {
            for (const d of validDistricts) {
              const dLower = d.toLowerCase();
              const dClean = cleanStr(d);
              if (dLower === value || dClean === value || dLower.includes(value) || value.includes(dClean)) {
                matchedDistrict = dLower;
                break;
              }
            }
          }
          if (matchedDistrict) break;
        }
      }
    }

    if (!matchedDistrict && cleanDistrict) {
      matchedDistrict = cleanDistrict;
    }

    return { matchedState, matchedDistrict };
  };

  const reverseGeocode = async (lat, lng) => {
    console.log(`📡 [GPS] Initiating reverse geocoding via backend for coordinates: lat=${lat}, lng=${lng}`);
    try {
      const res = await api.get('/location/reverse', {
        params: { lat, lng }
      });

      const responseData = res.data;
      if (responseData && responseData.success && responseData.data) {
        const data = responseData.data;
        const detectedState = data.state || '';
        const detectedDistrict = data.district || data.city || '';
        const pincode = data.pincode || '';
        const address = data.address || `GPS Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        console.log(`📡 [GPS] Geocoding API response received: state=${detectedState}, district=${detectedDistrict}, pincode=${pincode}`);
        const { matchedState, matchedDistrict } = matchStateAndDistrict(detectedState, detectedDistrict, data.raw || data);
        console.log(`📡 [GPS] Mapping complete. Resolved State: ${matchedState}, Resolved District: ${matchedDistrict}`);

        const finalState = matchedState || (detectedState ? detectedState.toLowerCase() : '');
        const finalDistrict = matchedDistrict || (detectedDistrict ? detectedDistrict.toLowerCase() : '');

        setForm(f => ({
          ...f,
          location: {
            ...f.location,
            lat,
            lng,
            address: address || f.location.address,
            state: finalState || f.location.state,
            district: finalDistrict || f.location.district,
            pincode: pincode || f.location.pincode
          }
        }));

        if (finalDistrict && finalState) {
          toast.success(`Location auto-detected: ${finalDistrict.toUpperCase()}, ${finalState.toUpperCase()}!`);
        } else if (address) {
          toast.success('Address auto-detected! Please confirm state and district.');
        }
        return true;
      }
    } catch (err) {
      console.error('❌ [GPS] Reverse geocoding failed:', err);
    }
    
    // Fallback if lookup failed or returned no address, but we have lat/lng
    console.log('⚠️ [GPS] Reverse geocoding failed. Auto-filling raw coordinates as address fallback.');
    setForm(f => ({
      ...f,
      location: {
        ...f.location,
        lat,
        lng,
        address: f.location.address || `GPS Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
      }
    }));
    toast.error('Location coordinates captured, but address lookup failed. Please enter address details manually.', { duration: 6000 });
    return false;
  };

  const detectGPS = () => {
    // 1. Secure context / Production check
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      console.warn('❌ [GPS] Geolocation rejected: Not in a secure context.');
      toast.error('GPS Geolocation requires a secure (HTTPS) connection in production.');
      return;
    }

    console.log('📡 [GPS] Geolocation requested. Requesting browser telemetry (30s timeout)...');
    setGpsLoading(true);
    
    const browserGeoSuccess = async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      console.log(`✅ [GPS] Browser geolocation succeeded. Lat: ${lat}, Lng: ${lng}, Accuracy: ${accuracy}m`);
      await reverseGeocode(lat, lng);
      setGpsLoading(false);
    };

    const browserGeoError = async (err) => {
      console.warn('⚠️ [GPS] Browser Geolocation failed/denied. Code:', err.code, 'Message:', err.message);
      
      let geoErrorMessage = 'Unable to detect location.';
      if (err.code === 1) {
        geoErrorMessage = 'Location access denied. Please allow location permission and try again.';
      } else if (err.code === 2) {
        geoErrorMessage = 'Position unavailable. Please allow location or enter manually.';
      } else if (err.code === 3) {
        geoErrorMessage = 'Location request timed out. Trying fast network IP fallback...';
      }
      
      toast.error(geoErrorMessage);
      console.log('📡 [GPS] Launching secure backend IP geolocation proxy fallback...');

      try {
        // Secure call to backend proxy endpoint instead of calling ipapi.co directly
        const res = await api.get('/complaints/ip-geolocation');
        const proxyData = res.data;
        
        if (proxyData.success && proxyData.data) {
          const { latitude, longitude, city, region, pincode } = proxyData.data;
          console.log(`✅ [GPS] Backend proxy geolocation succeeded using ${proxyData.source}. Coords: ${latitude}, ${longitude}`);
          
          await reverseGeocode(latitude, longitude);
          
          // Auto-fill postal/pincode if resolved
          if (pincode) {
            setLoc('pincode', pincode);
          }
          
          setGpsLoading(false);
          return;
        }
      } catch (proxyErr) {
        console.error('❌ [GPS] Backend proxy geolocation fallback failed:', proxyErr.message);
      }
      
      setGpsLoading(false);
      // Specific error messages
      if (err.code === 1) {
        toast.error('Please allow location permission and try again.');
      } else if (err.code === 3) {
        toast.error('Location request timed out. Please enter location manually.');
      } else {
        toast.error('Could not detect location automatically. Please enter manually.');
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        browserGeoSuccess,
        browserGeoError,
        { timeout: 30000, enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      console.error('❌ [GPS] browser navigator.geolocation is not available');
      setGpsLoading(false);
      toast.error('Geolocation is not supported by your browser.');
    }
  };

  const canNext = () => {
    if (step === 0) {
      return Boolean(form.category && form.subcategory);
    }
    if (step === 1) return Boolean(form.description && form.description.trim().length >= 10);
    if (step === 2) return Boolean(form.location.address && form.location.state);
    return true;
  };

  const handleSubmit = async (duplicateMetadata = null) => {
    setSubmitting(true);

    // 1. Offline Mode Check
    if (!navigator.onLine) {
      try {
        const offlineReport = {
          category: form.category,
          subcategory: form.subcategory,
          description: form.description,
          isAnonymous: form.isAnonymous,
          location: form.location,
          isEmergency: false,
          severity: 'Medium',
          offlineFiles: files.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            blob: f
          }))
        };
        
        await saveOfflineComplaint(offlineReport);
        
        setSubmittedComplaintId('OFFLINE-QUEUE');
        setSubmittedAuthorityType('Local DB Sync pending');
        setIsOfflineSuccess(true);
        setStep(STEPS.length - 1); // Success step
        toast.dismiss();
        toast.success('💾 Saved offline! Complaint stored locally.');
      } catch (err) {
        toast.dismiss();
        toast.error('Failed to store report locally.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
        const formData = new FormData();
      formData.append('category', form.category);
      formData.append('subcategory', form.subcategory);
      formData.append('description', form.description);
      formData.append('isAnonymous', form.isAnonymous);
      formData.append('location', JSON.stringify(form.location));
      files.forEach(f => formData.append('attachments', f));

      if (duplicateMetadata) {
        formData.append('duplicateMetadata', JSON.stringify(duplicateMetadata));
      }

      if (aiResult) {
        // Send the complete structured AI result
        const visionData = {
          provider: aiResult.engine?.includes('gemini') ? 'gemini' : 'other',
          model: aiResult.engine || 'unknown',
          detectedIssue: aiResult.detectedCategory || aiResult.category,
          category: aiResult.mappedCategory || aiResult.category,
          subcategory: aiResult.mappedSubcategory || 'other_civic',
          confidence: aiResult.confidence,
          severity: aiResult.severity,
          isRelevant: aiResult.is_complaint,
          analysis: aiResult.analysis || '',
          reason: aiResult.reason || ''
        };
        formData.append('aiVisionResult', JSON.stringify(visionData));
      }

      const res = await api.post('/complaints', formData);
      const { complaintId, authorityType } = res.data.data;

      queryClient.invalidateQueries(['myComplaints']);
      setSubmittedComplaintId(complaintId);
      setSubmittedAuthorityType(authorityType);
      setStep(STEPS.length - 1); // Move to the last step (Success)
      toast.dismiss();
      toast.success(`Complaint ${complaintId} filed successfully!`, { duration: 5000 });
    } catch (err) {
      if (err.message === 'Network Error' || !navigator.onLine) {
        try {
          const offlineReport = {
            category: form.category,
            subcategory: form.subcategory,
            description: form.description,
            isAnonymous: form.isAnonymous,
            location: form.location,
            isEmergency: false,
            severity: 'Medium',
            offlineFiles: files.map(f => ({
              name: f.name,
              type: f.type,
              size: f.size,
              blob: f
            }))
          };
          await saveOfflineComplaint(offlineReport);
          setSubmittedComplaintId('OFFLINE-QUEUE');
          setSubmittedAuthorityType('Local DB Sync pending');
          setIsOfflineSuccess(true);
          setStep(STEPS.length - 1);
          toast.dismiss();
          toast.success('💾 Saved offline! Network connection timed out.');
          return;
        } catch (offlineErr) {
          console.error('Failed to save offline:', offlineErr);
        }
      }
      toast.dismiss();
      toast.error(err.response?.data?.message || 'Submission failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const preSubmitCheck = async () => {
    setDuplicateLoading(true);
    try {
      const res = await api.post('/complaints/check-duplicate', {
        category: form.category,
        subcategory: form.subcategory,
        location: form.location,
        description: form.description,
        summary: aiResult?.analysis || ''
      });
      
      const duplicateResult = res.data.data;
      if (duplicateResult.status === 'duplicate' || duplicateResult.status === 'possible_duplicate') {
        setDuplicateData(duplicateResult);
        setShowDuplicateModal(true);
      } else {
        await handleSubmit(duplicateResult);
      }
    } catch (err) {
      console.warn('⚠️ Duplicate check failed, bypassing:', err.message);
      await handleSubmit({
        status: 'unknown',
        isDuplicate: false,
        confidence: 0,
        reason: 'Duplicate detection temporarily unavailable.'
      });
    } finally {
      setDuplicateLoading(false);
    }
  };

  const selectedCategory = CATEGORIES[form.category];
  const districts = DISTRICTS_MAP[form.location.state.toLowerCase()] || [];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">File a Complaint</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Your complaint will be automatically routed to the appropriate authority.</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0 transition-all duration-300
                ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                {i < step ? <CheckCircle size={14} /> : i + 1}
              </div>
              <div className={`text-xs ml-1.5 font-medium hidden sm:block ${i === step ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>{s}</div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded transition-all duration-300 ${i < step ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

            {/* Step 0: Category */}
            {step === 0 && (
              <div className="space-y-4">
                {/* AI Multimodal Image Analyzer Card */}
                <div className="card p-5 sm:p-6 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-purple-50/50 dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-indigo-100 dark:border-indigo-900/40 shadow-xl mb-6 relative overflow-hidden rounded-3xl">
                  {/* Background glow */}
                  <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

                  {/* Header */}
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
                        <Sparkles size={20} className={aiLoading ? 'animate-spin' : 'animate-pulse'} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                          AI Multimodal Photo Analyzer
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                            Vision AI
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Upload or snap a photo. AI will identify the issue, classify the category, and draft a factual description.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Upload / Capture Action Buttons (if no photo yet) */}
                  {!aiPreviewUrl && (
                    <div className="grid sm:grid-cols-2 gap-3 mt-4 relative z-10">
                      <label className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 hover:border-indigo-500 bg-white/70 dark:bg-slate-800/60 cursor-pointer transition-all hover:bg-white dark:hover:bg-slate-800 group shadow-sm">
                        <Upload size={22} className="text-indigo-600 dark:text-indigo-400 mb-1.5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">Upload Photo from Device</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP up to 15MB</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/jpg"
                          onChange={handleAiPhotoUpload}
                          disabled={aiLoading}
                          className="sr-only"
                        />
                      </label>

                      <label className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 hover:border-indigo-500 bg-white/70 dark:bg-slate-800/60 cursor-pointer transition-all hover:bg-white dark:hover:bg-slate-800 group shadow-sm">
                        <Camera size={22} className="text-indigo-600 dark:text-indigo-400 mb-1.5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">Capture with Camera</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Snap live incident photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleAiPhotoUpload}
                          disabled={aiLoading}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  )}

                  {/* Photo Preview & Analysis Result Area */}
                  {aiPreviewUrl && (
                    <div className="mt-4 space-y-4 relative z-10">
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 aspect-video max-h-60 flex items-center justify-center shadow-inner">
                        <img src={aiPreviewUrl} alt="Incident Evidence" className="w-full h-full object-contain" />
                        
                        {/* Overlay Actions */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-2">
                          <label className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold hover:bg-black/90 cursor-pointer flex items-center gap-1.5 transition-colors shadow-md">
                            <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />
                            Change Photo
                            <input type="file" accept="image/*" onChange={handleAiPhotoUpload} disabled={aiLoading} className="sr-only" />
                          </label>
                          <button
                            onClick={clearAiPhoto}
                            disabled={aiLoading}
                            className="p-1.5 rounded-lg bg-red-600/80 backdrop-blur-md text-white hover:bg-red-600 transition-colors shadow-md"
                            title="Remove Photo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Loading State Overlay */}
                        {aiLoading && (
                          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4 text-center">
                            <div className="w-9 h-9 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mb-2" />
                            <div className="font-bold text-sm">✨ AI Analyzing Image...</div>
                            <div className="text-xs text-indigo-200 mt-0.5">Detecting complaint type & drafting factual description</div>
                          </div>
                        )}
                      </div>

                      {/* AI Structured Results Card */}
                      {aiResult && !aiLoading && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-3.5"
                        >
                          {/* Classification & Confidence Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">AI Classification:</span>
                              <span className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                <CheckCircle2 size={16} className="text-green-500" />
                                {aiResult.category}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Confidence Pill */}
                              <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                                aiResult.confidence >= 0.8
                                  ? 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                                  : aiResult.confidence >= 0.5
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}>
                                <span>{Math.round(aiResult.confidence * 100)}% Confidence</span>
                              </div>

                              {/* Severity Pill */}
                              {aiResult.severity && (
                                <div className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {aiResult.severity}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Visual Observations Bullet Points */}
                          {aiResult.observations && aiResult.observations.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Visual Observations:</span>
                              <ul className="grid sm:grid-cols-2 gap-1 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                {aiResult.observations.map((obs, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                                    <span className="text-indigo-500 font-bold">•</span>
                                    <span>{obs}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* AI-Generated Description with Edit Box */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Edit3 size={12} /> AI Drafted Description (Editable):
                              </span>
                              <span className="text-[10px] text-slate-400">You can edit before proceeding</span>
                            </div>
                            <textarea
                              rows={3}
                              value={form.description}
                              onChange={e => set('description', e.target.value)}
                              className="input text-xs leading-relaxed resize-none bg-slate-50 dark:bg-slate-800/50 font-sans"
                              placeholder="Factual complaint description drafted by AI..."
                            />
                          </div>

                          {/* Quick Category Override Dropdown & Advance Button */}
                          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Change Category:</span>
                              <select
                                value={aiResult.category}
                                onChange={handleAiCategoryChange}
                                className="input py-1.5 text-xs flex-1 sm:flex-initial"
                              >
                                {AI_VISION_CATEGORIES.map(c => (
                                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                                ))}
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (!form.category) {
                                  const item = AI_VISION_CATEGORIES.find(c => c.value === aiResult.category) || AI_VISION_CATEGORIES[0];
                                  setForm(f => ({ ...f, category: item.category, subcategory: item.subcategory }));
                                }
                                setStep(2); // Advance directly to Location step
                              }}
                              className="btn-primary py-2 px-4 text-xs uppercase font-bold flex items-center gap-1.5 w-full sm:w-auto justify-center shadow-md active:scale-95 transition-all"
                            >
                              <Check size={14} /> Accept & Proceed to Location
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>

                {(!aiResult || aiResult.is_complaint !== false) && (
                  <>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Select Category</h2>
                    <div className="grid gap-3">
                      {Object.entries(CATEGORIES).map(([key, cat]) => (
                        <button key={key} onClick={() => { set('category', key); set('subcategory', ''); }}
                          className={`p-4 rounded-xl border-2 text-left transition-all duration-150 ${form.category === key
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50'
                            : 'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 bg-white dark:bg-slate-800'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{cat.icon}</span>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{cat.label}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {key === 'crime' && 'Routed to Police Station (PS)'}
                                {key === 'corruption' && 'Routed to Anti-Corruption Bureau (ACB)'}
                                {key === 'civic_issue' && 'Routed to Municipal Authority'}
                                {key === 'fire' && 'Routed to Fire Department'}
                                {key === 'hospital' && 'Routed to Healthcare & Hospital Authority'}
                              </div>
                              {form.category === key && aiResult?.is_complaint && aiResult.mappedCategory === key && (
                                <div className="text-[10px] font-bold text-green-600 dark:text-green-400 mt-1.5 flex items-center gap-1">
                                  <CheckCircle size={10} /> Automatically selected by AI
                                </div>
                              )}
                            </div>
                            {form.category === key && <CheckCircle size={18} className="ml-auto text-brand-500 flex-shrink-0" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {selectedCategory && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    <label className="label mt-4">Subcategory</label>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedCategory.subcategories.map(sub => (
                        <button key={sub.value} onClick={() => set('subcategory', sub.value)}
                          className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${form.subcategory === sub.value
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-400 font-medium'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-brand-300 dark:hover:border-brand-700 bg-white dark:bg-slate-800'}`}>
                          <div className="flex flex-col">
                            <span>{sub.label}</span>
                            {form.subcategory === sub.value && aiResult?.mappedSubcategory === sub.value && (
                              <span className="text-[9px] font-bold text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
                                <CheckCircle size={9} /> AI Selected
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Anonymous toggle */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mt-4">
                  <label className="relative inline-flex items-center cursor-pointer mt-0.5">
                    <input type="checkbox" checked={form.isAnonymous} onChange={e => set('isAnonymous', e.target.checked)} className="sr-only peer" />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-brand-300 dark:peer-focus:ring-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600" />
                  </label>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      {form.isAnonymous ? <EyeOff size={14} /> : <Eye size={14} />}
                      Submit Anonymously
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your identity will be hidden. You won't receive status notifications.</div>
                    {form.isAnonymous && (
                      <div className="p-2 mt-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex gap-2 text-xs text-red-700 dark:text-red-400">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        Anonymous complaints will NOT appear on your dashboard.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Description */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Describe Your Complaint</h2>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex gap-2 text-sm text-blue-700 dark:text-blue-400">
                  <Info size={16} className="flex-shrink-0 mt-0.5" />
                  Be specific. Include dates, names, locations, and any relevant details. Do NOT include your contact info in the description.
                </div>
                <div>
                  <label className="label">Detailed Description <span className="text-red-500">*</span></label>
                  <textarea rows={8} value={form.description} onChange={e => set('description', e.target.value)}
                    className="input resize-none" placeholder="Describe the incident in detail. What happened? When? Who was involved? What evidence do you have?" />
                  <div className={`text-right text-xs mt-1 ${form.description.length < 20 ? 'text-red-400' : 'text-slate-400'}`}>
                    {form.description.length}/5000 {form.description.length < 20 && '(min. 20 chars)'}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Location */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Location Details</h2>
                <div className="flex gap-2">
                  <button onClick={detectGPS} disabled={gpsLoading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-400 text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-950 transition-colors">
                    <Navigation size={15} className={gpsLoading ? 'animate-spin' : ''} />
                    {gpsLoading ? 'Detecting location...' : 'Auto-detect GPS'}
                  </button>
                  {form.location.lat && (
                    <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle size={13} /> GPS coordinates captured
                    </span>
                  )}
                </div>

                <div>
                  <label className="label">Incident Address <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <textarea rows={2} value={form.location.address} onChange={e => setLoc('address', e.target.value)}
                      className="input pl-10 resize-none" placeholder="House/Plot No., Street, Area, Landmark" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">State <span className="text-red-500">*</span></label>
                    <select value={form.location.state} onChange={e => { setLoc('state', e.target.value); setLoc('district', ''); }}
                      className="input">
                      <option value="">Select State</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">District <span className="text-red-500">*</span></label>
                    <select value={form.location.district} onChange={e => setLoc('district', e.target.value)} className="input" disabled={!form.location.state}>
                      <option value="">Select District</option>
                      {districts.map(d => <option key={d} value={d.toLowerCase()}>{d}</option>)}
                      {form.location.district && !districts.some(d => d.toLowerCase() === form.location.district.toLowerCase()) && (
                        <option value={form.location.district.toLowerCase()}>
                          {form.location.district.charAt(0).toUpperCase() + form.location.district.slice(1)}
                        </option>
                      )}
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Pincode</label>
                  <input type="text" maxLength={6} pattern="[0-9]{6}" value={form.location.pincode} onChange={e => setLoc('pincode', e.target.value)} className="input" placeholder="500001" />
                </div>
              </div>
            )}

            {/* Step 3: Attachments */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Attach Evidence <span className="text-slate-400 font-normal text-base">(Optional)</span></h2>
                <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                  ${isDragActive ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-600 bg-slate-50 dark:bg-slate-800/50'}`}>
                  <input {...getInputProps()} />
                  <Upload size={28} className="mx-auto mb-3 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{isDragActive ? 'Drop files here...' : 'Drag & drop files here, or click to select'}</p>
                  <p className="text-xs text-slate-400 mt-1.5">Images, Videos, PDFs • Max 5 files • 50MB each</p>
                </div>

                {files.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {files.map((file, i) => (
                      <div key={i} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        {file.type.startsWith('image/') ? (
                          <img src={file.preview} alt="" className="w-full h-24 object-cover" />
                        ) : (
                          <div className="w-full h-24 flex flex-col items-center justify-center gap-1 bg-slate-100 dark:bg-slate-700">
                            {file.type.startsWith('video/') ? <FileVideo size={24} className="text-slate-400" /> : <FileImage size={24} className="text-slate-400" />}
                            <span className="text-xs text-slate-500 truncate px-2 w-full text-center">{file.name}</span>
                          </div>
                        )}
                        <button onClick={() => setFiles(f => f.filter((_, j) => j !== i))}
                          className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                        <div className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">{file.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Review & Submit</h2>
                <div className="card divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                  {[
                    { label: 'Category', value: `${selectedCategory?.icon} ${selectedCategory?.label}` },
                    { label: 'Subcategory', value: form.subcategory.replace(/_/g, ' ') },
                    { label: 'Description', value: form.description.substring(0, 200) + (form.description.length > 200 ? '...' : '') },
                    { label: 'Location', value: `${form.location.address}, ${form.location.district}, ${form.location.state}` },
                    { label: 'Attachments', value: `${files.length} file(s)` },
                    { label: 'Anonymous', value: form.isAnonymous ? '✅ Yes - Identity hidden' : '❌ No - Linked to account' },
                    { label: 'Authority', value: form.category === 'crime' ? '🚔 Police Station (PS)' : form.category === 'corruption' ? '⚖️ Anti-Corruption Bureau' : form.category === 'fire' ? '🔥 Fire Department' : form.category === 'hospital' ? '🏥 Healthcare / Hospital' : '🏛️ Municipal Authority' },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-4 py-3 flex gap-4">
                      <span className="text-sm text-slate-500 dark:text-slate-400 w-28 flex-shrink-0">{label}</span>
                      <span className="text-sm text-slate-900 dark:text-white font-medium capitalize">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                  Your complaint will be automatically routed to the correct authority. You will receive a unique Complaint ID for tracking.
                </div>
                {form.isAnonymous && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex gap-2 text-sm text-red-700 dark:text-red-400">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    You have chosen to submit anonymously. This complaint will NOT appear on your personal dashboard.
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Success */}
            {step === STEPS.length - 1 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
                className="card p-8 text-center bg-white/70 dark:bg-[#121828]/60 border border-white dark:border-white/5 shadow-xl"
                style={{ borderRadius: '28px' }}
              >
                {isOfflineSuccess ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-6">
                      <WifiOff size={32} className="animate-pulse" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Offline Report Saved! 💾</h2>
                    <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-md mx-auto leading-relaxed text-xs">
                      Your internet connection is currently down. Your report has been saved locally on your device in our secure offline queue database.
                    </p>
                    <p className="text-xs text-brand-600 dark:text-brand-400 font-bold mb-6 animate-pulse">
                      📡 Auto-sync will submit this to city servers the moment internet connection returns.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
                      <Link to="/dashboard" className="btn-primary flex-1">Go to Dashboard</Link>
                      <button onClick={() => {
                        setIsOfflineSuccess(false);
                        setSubmittedComplaintId(null);
                        setSubmittedAuthorityType(null);
                        setFiles([]);
                        setForm({
                          category: '',
                          subcategory: '',
                          description: '',
                          isAnonymous: false,
                          location: { address: '', state: '', district: '', pincode: '', lat: null, lng: null },
                        });
                        setStep(0);
                      }} className="btn-secondary flex-1">File Another</button>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle size={64} className="text-green-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Complaint Filed Successfully!</h2>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                      Your complaint has been successfully submitted and routed to the appropriate authority.
                    </p>
                    
                    {submittedComplaintId && (
                      <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg mb-6">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Your Complaint ID:</p>
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-xl font-bold text-brand-600 dark:text-brand-400">{submittedComplaintId}</span>
                          <button onClick={() => { navigator.clipboard.writeText(submittedComplaintId); toast.success('Copied to clipboard!'); }}
                            className="btn-icon-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400">
                            <Clipboard size={18} />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          Please save this ID to track your complaint status.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link to="/dashboard" className="btn-primary">Go to Dashboard</Link>
                      <Link to={`/track?id=${submittedComplaintId}`} className="btn-outline">Track Complaint</Link>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        {step < STEPS.length - 1 && (
          <div className="flex justify-between mt-8">
            <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="btn-secondary">
              Previous
            </button>
            {step === STEPS.length - 2 ? (
                  <button onClick={preSubmitCheck} disabled={submitting || duplicateLoading || !canNext()} className="btn-primary">
                {submitting ? 'Finalizing AI analysis...' : duplicateLoading ? 'Checking...' : 'Confirm & Submit'}
              </button>
            ) : (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="btn-primary">
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Soft Warning Modal for Duplicate Complaints */}
      <AnimatePresence>
        {showDuplicateModal && duplicateData && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white/90 dark:bg-[#121828]/90 border border-white dark:border-white/5 shadow-2xl p-6 w-full max-w-lg flex flex-col gap-4 relative"
              style={{ borderRadius: '28px', boxShadow: 'var(--clay-shadow-md)' }}
            >
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <AlertCircle size={22} className="animate-bounce" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                    {duplicateData.status === 'duplicate' ? 'Possible Duplicate Complaint' : 'Similar Complaint Found'}
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                    {duplicateData.reason}
                  </p>
                </div>
              </div>

              {/* Duplicate info container */}
              <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1">
                  <div 
                    className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/40 flex flex-col gap-1.5 text-left"
                  >
                    <div className="flex items-center justify-between text-[10px] font-extrabold">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg">
                        {duplicateData.matchedComplaintId}
                      </span>
                      <span className="text-slate-400">
                        {duplicateData.distanceMeters !== null ? `📍 ${duplicateData.distanceMeters}m away` : '📍 Location Unknown'} • {Math.round((duplicateData.confidence || 0) * 100)}% Match
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 capitalize">
                      {duplicateData.matchedComplaint?.category?.replace(/_/g, ' ')} / {duplicateData.matchedComplaint?.subcategory?.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {duplicateData.matchedComplaint?.address}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                      Status: {duplicateData.matchedComplaint?.status}
                    </div>
                  </div>
              </div>

              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal text-center mt-1">
                You can still submit your complaint if you believe it is a new or separate issue.
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  onClick={() => setShowDuplicateModal(false)}
                  className="btn-secondary py-2.5 flex-1 order-2 sm:order-1"
                >
                  Cancel & Edit
                </button>
                <button 
                  onClick={async () => {
                    setShowDuplicateModal(false);
                    await handleSubmit();
                  }}
                  className="btn-primary py-2.5 flex-1 order-1 sm:order-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 border-0"
                >
                  Submit Anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}