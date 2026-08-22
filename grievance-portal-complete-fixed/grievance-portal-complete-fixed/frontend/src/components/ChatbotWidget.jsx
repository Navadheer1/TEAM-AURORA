import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, Send, Bot, User, RotateCcw, Copy, Check, 
  Sparkles, AlertCircle, FileText, CheckCircle2,
  ExternalLink, PhoneCall, AlertTriangle, Clock, MapPin,
  Building2, ShieldAlert, ArrowRight, Compass, HelpCircle, Loader2,
  Mic, MicOff, Volume2, VolumeX, Square, Play, Pause, Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from '../utils/i18n';

const QUICK_ACTIONS = [
  { label: 'File a Complaint', prompt: 'I want to file a complaint' },
  { label: 'Track Complaint', prompt: 'Where can I track my complaint?' },
  { label: 'Report Emergency', prompt: 'I have an emergency situation' },
  { label: 'What Can You Do?', prompt: 'What can you help me with?' },
];

const generateUniqueId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'msg_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
};

const sanitizeContent = (text) => {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '').trim();
};

export default function ChatbotWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [isOpen, setIsOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [selectedVoiceGender, setSelectedVoiceGender] = useState('female'); // 'female' | 'male'
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState(null);

  // Audio Playback state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  
  const currentAudioUrlRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const audioCacheRef = useRef(new Map()); // messageId -> blobUrl cache
  const recognitionRef = useRef(null);
  const transcriptProcessedRef = useRef(false);

  // Synchronous submission lock to guarantee EXACTLY-ONCE execution
  const isSendingRef = useRef(false);

  const [sessionId] = useState(() => {
    let sid = sessionStorage.getItem('civic_agent_session_id');
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      sessionStorage.setItem('civic_agent_session_id', sid);
    }
    return sid;
  });

  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: 'Namaste! 🙏 I am the **CivicResilience AI Agent** for Jan Shakti.\n\nI can help you:\n- **Report a civic problem** (potholes, garbage, water leaks, streetlights)\n- **Track your existing complaint** with your ID\n- **Navigate portal services**\n- **Provide emergency assistance & hotline contacts**\n\nYou can talk to me via **voice** or type your question below.',
      intent: 'GENERAL_CHAT',
      action: null,
      timestamp: new Date(),
    },
  ]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentStateText, setAgentStateText] = useState('Thinking...');
  const [submittingComplaintId, setSubmittingComplaintId] = useState(null);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isLoading, agentStateText, isListening, isPlayingAudio, scrollToBottom]);

  // Voice Assistant event listener integration
  useEffect(() => {
    const handleVoiceToggleChatbot = (e) => {
      if (e.detail?.open !== undefined) {
        setIsOpen(e.detail.open);
      }
    };
    window.addEventListener('voice-toggle-chatbot', handleVoiceToggleChatbot);
    return () => window.removeEventListener('voice-toggle-chatbot', handleVoiceToggleChatbot);
  }, []);

  // Stop & Clean up Audio
  const stopAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    setIsPlayingAudio(false);
    setIsAudioPaused(false);
    setIsAudioLoading(false);
    setSpeakingMessageId(null);
  }, []);

  // Pause / Resume Audio
  const togglePauseAudio = useCallback(() => {
    if (!audioPlayerRef.current) return;
    if (isAudioPaused) {
      audioPlayerRef.current.play().catch(console.error);
      setIsAudioPaused(false);
      setIsPlayingAudio(true);
    } else {
      audioPlayerRef.current.pause();
      setIsAudioPaused(true);
      setIsPlayingAudio(false);
    }
  }, [isAudioPaused]);

  // Base API URL builder
  const getApiUrl = () => {
    const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
    return rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
  };

  // Synthesize and play audio with ElevenLabs (TTS ONLY - NEVER triggers Gemini)
  const playSpeech = async (text, messageId, autoPlay = true) => {
    if (!text || !text.trim()) return;

    // Stop any currently playing audio first
    stopAudio();
    setIsAudioLoading(true);
    setSpeakingMessageId(messageId);

    try {
      // Check cache first to avoid duplicate TTS network requests
      let audioUrl = audioCacheRef.current.get(messageId);

      if (!audioUrl) {
        const token = localStorage.getItem('token');
        const ttsUrl = `${getApiUrl()}/chatbot/tts`;

        const response = await fetch(ttsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            text,
            gender: selectedVoiceGender,
          }),
        });

        if (!response.ok) {
          throw new Error('TTS service failed');
        }

        const audioBlob = await response.blob();
        audioUrl = URL.createObjectURL(audioBlob);
        audioCacheRef.current.set(messageId, audioUrl);
      }

      currentAudioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;

      audio.onplay = () => {
        setIsPlayingAudio(true);
        setIsAudioPaused(false);
        setIsAudioLoading(false);
      };

      audio.onended = () => {
        stopAudio();
      };

      audio.onerror = (e) => {
        console.warn('⚠️ Audio playback error:', e);
        stopAudio();
      };

      if (autoPlay) {
        try {
          await audio.play();
        } catch (playErr) {
          console.warn('⚠️ Autoplay blocked by browser:', playErr);
          setIsPlayingAudio(false);
          setIsAudioLoading(false);
        }
      }
    } catch (err) {
      console.warn('⚠️ ElevenLabs TTS generation error:', err.message);
      setIsAudioLoading(false);
      setSpeakingMessageId(null);
    }
  };

  // Canonical message sender - EXACTLY-ONCE EXECUTION GUARD
  const sendUserMessage = async (overridePrompt = null) => {
    // 1. Synchronous mutex check: prevent concurrent/duplicate submissions
    if (isSendingRef.current) {
      console.log('🛑 [ChatbotWidget] Blocked duplicate sendUserMessage call');
      return;
    }

    const messageText = (overridePrompt !== null && overridePrompt !== undefined ? overridePrompt : input).trim();
    if (!messageText) return;

    // 2. Lock the mutex immediately
    isSendingRef.current = true;

    // 3. Stop active audio on barge-in
    stopAudio();

    // 4. Clear input & reset errors
    setInput('');
    setError(null);
    setIsLoading(true);
    setAgentStateText('Understanding your request...');

    // 5. Generate deterministic unique IDs
    const userMessageId = generateUniqueId();
    const assistantMessageId = generateUniqueId();

    const userMsg = {
      id: userMessageId,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    // 6. Append user message uniquely to state
    let historyForApi = [];
    setMessages((prev) => {
      // Deduplication guard
      if (prev.some((m) => m.id === userMessageId)) return prev;
      const nextMessages = [...prev, userMsg];
      historyForApi = nextMessages
        .filter((m) => m.id !== 'welcome-1')
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));
      return nextMessages;
    });

    // 7. Request with timeout guard (15s)
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 15000);

    try {
      const token = localStorage.getItem('token');
      const chatUrl = `${getApiUrl()}/chatbot/message`;

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message: messageText,
          history: historyForApi,
          sessionId,
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.message || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      const replyText = data.reply || data.data?.assistantResponse || 'I am ready to assist you.';
      const action = data.action || null;
      const intent = data.intent || 'GENERAL_CHAT';
      const agentState = data.agentState || 'Completed';

      const assistantMsg = {
        id: assistantMessageId,
        role: 'assistant',
        content: replyText,
        intent,
        agentState,
        action,
        timestamp: new Date(),
      };

      setMessages((prev) => {
        // Guard against duplicate assistant insertion
        if (prev.some((m) => m.id === assistantMessageId)) return prev;
        return [...prev, assistantMsg];
      });

      // 8. If Voice Mode is enabled, speak response using ElevenLabs
      if (voiceMode) {
        setAgentStateText('Generating voice response...');
        playSpeech(replyText, assistantMessageId, true);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.log('🛑 Request timed out or was aborted');
        const timeoutMsg = "Sorry, I'm having trouble connecting to the AI service right now. You can still use the portal normally.";
        setError(timeoutMsg);
        setMessages((prev) => {
          if (prev.some((m) => m.id === assistantMessageId)) return prev;
          return [
            ...prev,
            {
              id: assistantMessageId,
              role: 'assistant',
              content: timeoutMsg,
              isError: true,
              timestamp: new Date(),
            },
          ];
        });
        return;
      }
      
      console.error('❌ Chatbot communication error:', err);
      const errorMsg = "Sorry, I'm having trouble connecting to the AI service right now. You can still use the portal normally.";
      setError(errorMsg);
      setMessages((prev) => {
        if (prev.some((m) => m.id === assistantMessageId)) return prev;
        return [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: errorMsg,
            isError: true,
            timestamp: new Date(),
          },
        ];
      });
    } finally {
      // 9. ALWAYS reset mutex and loading state
      isSendingRef.current = false;
      setIsLoading(false);
      setAgentStateText('Completed');
      abortControllerRef.current = null;
    }
  };

  // Initialize and start Isolated Speech Recognition
  const startListening = () => {
    stopAudio();
    setSpeechError(null);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setSpeechError('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRecognition();
      rec.lang = 'en-IN';
      rec.continuous = false;
      rec.interimResults = false;

      transcriptProcessedRef.current = false;

      rec.onstart = () => {
        setIsListening(true);
        setAgentStateText('Listening...');
      };

      rec.onresult = (event) => {
        if (transcriptProcessedRef.current) return;
        const result = event.results[event.results.length - 1];
        if (result && result[0]) {
          const rawText = result[0].transcript.trim();
          if (rawText.length > 0) {
            transcriptProcessedRef.current = true;
            setIsListening(false);
            // Single-flight dispatch through canonical sender
            sendUserMessage(rawText);
          }
        }
      };

      rec.onerror = (e) => {
        console.warn('🎙️ Speech recognition error:', e.error);
        setIsListening(false);
        if (e.error === 'not-allowed') {
          setSpeechError('Microphone permission was denied. Please allow microphone access in browser settings.');
        } else if (e.error !== 'no-speech') {
          setSpeechError(`Voice input error: ${e.error}`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.warn('🎙️ Speech start error:', err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        scrollToBottom(false);
      }, 150);
    } else {
      stopAudio();
      stopListening();
    }
  }, [isOpen, scrollToBottom, stopAudio]);

  // Clean up all audio and recognition on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      for (const url of audioCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      audioCacheRef.current.clear();
    };
  }, [stopAudio]);

  // Handle Copy text
  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Submit Confirmed Complaint Draft
  const handleConfirmSubmission = async (draft, messageId) => {
    if (!draft || submittingComplaintId) return;

    setSubmittingComplaintId(messageId);
    setAgentStateText('Submitting complaint to portal...');

    try {
      const token = localStorage.getItem('token');
      const confirmUrl = `${getApiUrl()}/chatbot/confirm-complaint`;

      const response = await fetch(confirmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          draft,
          sessionId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Submission failed');
      }

      const resData = await response.json();
      const complaintInfo = resData.data;

      // Update the message action state to SUBMITTED
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                action: {
                  type: 'COMPLAINT_SUBMITTED',
                  payload: complaintInfo,
                },
              }
            : msg
        )
      );

      // If voice mode is on, speak confirmation with real ID
      if (voiceMode && complaintInfo?.complaintId) {
        const confirmationSpoken = `Your complaint has been successfully lodged with complaint ID ${complaintInfo.complaintId}.`;
        playSpeech(confirmationSpoken, messageId, true);
      }
    } catch (err) {
      console.error('❌ Complaint confirmation failed:', err);
      setError(err.message || 'Failed to submit complaint.');
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                action: {
                  ...msg.action,
                  payload: {
                    ...msg.action?.payload,
                    submissionError: "I couldn't submit the complaint because the portal service returned an error. Please try again.",
                  },
                },
              }
            : msg
        )
      );
    } finally {
      setSubmittingComplaintId(null);
      setAgentStateText('Completed');
    }
  };

  // Retry last user message
  const handleRetry = () => {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      // Remove last assistant error message
      setMessages((prev) => prev.slice(0, -1));
      sendUserMessage(lastUserMsg.content);
    }
  };

  // Handle Key Down
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage();
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 px-4 py-3.5 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xl flex items-center gap-2.5 font-sans transition-all group border border-blue-400/30"
            aria-label="Open CivicResilience AI Agent"
          >
            <div className="relative">
              <Bot size={22} className="text-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-blue-600 animate-pulse" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold tracking-wide">CivicResilience AI</span>
              <span className="text-[10px] text-blue-200 font-medium">● Voice & Gemini Agent</span>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Chatbot Agent Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[440px] md:w-[480px] h-[640px] max-h-[calc(100vh-80px)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden font-sans"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white flex items-center justify-between flex-shrink-0 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-inner">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm tracking-tight leading-tight">CivicResilience AI</h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-semibold text-emerald-200 flex items-center gap-1 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Gemini AI
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-100 font-medium leading-tight mt-0.5">Jan Shakti Civic Intelligence</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5">
                {/* Voice Mode Toggle */}
                <button
                  onClick={() => {
                    const nextMode = !voiceMode;
                    setVoiceMode(nextMode);
                    if (!nextMode) stopAudio();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all border ${
                    voiceMode
                      ? 'bg-emerald-500 text-white border-emerald-300 shadow-sm'
                      : 'bg-white/10 hover:bg-white/20 text-blue-100 border-white/20'
                  }`}
                  title={voiceMode ? 'Voice Mode Active' : 'Enable Voice Mode'}
                >
                  {voiceMode ? <Volume2 size={13} className="animate-pulse" /> : <VolumeX size={13} />}
                  <span>{voiceMode ? 'Voice On' : 'Voice Off'}</span>
                </button>

                {/* Close button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors"
                  title="Close Assistant"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Speaking / Audio Status Banner */}
            <AnimatePresence>
              {(isPlayingAudio || isAudioPaused || isAudioLoading) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-indigo-600 text-white px-4 py-2 text-xs flex items-center justify-between shadow-inner flex-shrink-0"
                >
                  <div className="flex items-center gap-2">
                    {isAudioLoading ? (
                      <Loader2 size={14} className="animate-spin text-indigo-200" />
                    ) : (
                      <Volume2 size={14} className="animate-bounce text-emerald-300" />
                    )}
                    <span className="font-medium">
                      {isAudioLoading ? 'Synthesizing voice with ElevenLabs...' : isAudioPaused ? 'Audio Paused' : '🔊 Speaking response...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isAudioLoading && (
                      <button
                        onClick={togglePauseAudio}
                        className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[11px] font-semibold transition-colors"
                      >
                        {isAudioPaused ? 'Resume' : 'Pause'}
                      </button>
                    )}
                    <button
                      onClick={stopAudio}
                      className="px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold transition-colors"
                    >
                      Stop
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick Action Pills */}
            <div className="px-3 py-2 bg-slate-100 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0">
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => sendUserMessage(action.prompt)}
                  disabled={isLoading || isListening}
                  className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap transition-all shadow-xs flex-shrink-0 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scroll-smooth bg-slate-50/50 dark:bg-slate-950/50">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isThisMessageSpeaking = speakingMessageId === msg.id && isPlayingAudio;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm text-xs font-bold ${
                        isUser
                          ? 'bg-blue-600 text-white'
                          : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                      }`}
                    >
                      {isUser ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    {/* Message Bubble */}
                    <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'} space-y-2`}>
                      <div
                        className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm relative group ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : msg.isError
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 rounded-tl-sm'
                            : isThisMessageSpeaking
                            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-2 border-indigo-400 dark:border-indigo-600 rounded-tl-sm shadow-md'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-sm'
                        }`}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        ) : sanitizeContent(msg.content) ? (
                          <div className="markdown-chat prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm break-words">
                            <ReactMarkdown>{sanitizeContent(msg.content)}</ReactMarkdown>
                          </div>
                        ) : null}
                      </div>

                      {/* ================= AGENT ACTION CARDS ================= */}
                      {!isUser && msg.action && (
                        <div className="w-full">
                          {/* 1. Complaint Draft Ready Card */}
                          {msg.action.type === 'DRAFT_COMPLAINT' && msg.action.payload && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 shadow-sm text-xs space-y-2.5"
                            >
                              <div className="flex items-center justify-between border-b border-blue-200/70 dark:border-blue-800/50 pb-2">
                                <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
                                  <FileText size={15} className="text-blue-600 dark:text-blue-400" />
                                  <span>Complaint Ready for Review</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-blue-200/60 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 text-[10px] font-semibold">
                                  Draft
                                </span>
                              </div>

                              <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                                <div className="flex items-start gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 min-w-[75px]">Category:</span>
                                  <span>{msg.action.payload.categoryLabel || msg.action.payload.category}</span>
                                </div>
                                {msg.action.payload.subcategory && (
                                  <div className="flex items-start gap-1.5">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100 min-w-[75px]">Subcategory:</span>
                                    <span>{msg.action.payload.subcategoryLabel || msg.action.payload.subcategory}</span>
                                  </div>
                                )}
                                <div className="flex items-start gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 min-w-[75px]">Location:</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin size={12} className="text-red-500 flex-shrink-0" />
                                    {msg.action.payload.location?.address || `${msg.action.payload.location?.district || ''}, ${msg.action.payload.location?.state || ''}` || 'Not specified'}
                                  </span>
                                </div>
                                <div className="flex items-start gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 min-w-[75px]">Description:</span>
                                  <span className="line-clamp-2">{msg.action.payload.description}</span>
                                </div>
                              </div>

                              {msg.action.payload.submissionError && (
                                <div className="p-2 rounded-lg bg-red-100/80 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[11px]">
                                  {msg.action.payload.submissionError}
                                </div>
                              )}

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => handleConfirmSubmission(msg.action.payload, msg.id)}
                                  disabled={submittingComplaintId === msg.id}
                                  className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                >
                                  {submittingComplaintId === msg.id ? (
                                    <>
                                      <Loader2 size={13} className="animate-spin" />
                                      <span>Submitting to Portal...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 size={14} />
                                      <span>Confirm & Submit</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    localStorage.setItem('voice_preselect_category', msg.action.payload.category);
                                    localStorage.setItem('voice_preselect_subcategory', msg.action.payload.subcategory);
                                    navigate('/submit-complaint');
                                  }}
                                  className="py-2 px-3 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold transition-colors"
                                >
                                  Edit Form
                                </button>
                              </div>
                            </motion.div>
                          )}

                          {/* 2. Complaint Submitted Success Card */}
                          {msg.action.type === 'COMPLAINT_SUBMITTED' && msg.action.payload && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 shadow-sm text-xs space-y-2"
                            >
                              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold border-b border-emerald-200 dark:border-emerald-800 pb-1.5">
                                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                                <span>Complaint Successfully Lodged!</span>
                              </div>
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/60 dark:border-emerald-900/60 space-y-1">
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                                  Official Complaint ID
                                </div>
                                <div className="flex items-center justify-between font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                                  <span>{msg.action.payload.complaintId}</span>
                                  <button
                                    onClick={() => handleCopy(msg.id, msg.action.payload.complaintId)}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500"
                                    title="Copy ID"
                                  >
                                    {copiedId === msg.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                                <span>Status: <strong className="text-blue-600">Submitted</strong></span>
                                <span>Dept: <strong>{msg.action.payload.department || 'Municipal'}</strong></span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => navigate(`/track/${msg.action.payload.complaintId}`)}
                                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-1 transition-colors"
                                >
                                  <span>Track Live Status</span>
                                  <ArrowRight size={12} />
                                </button>
                                <button
                                  onClick={() => navigate('/dashboard')}
                                  className="py-1.5 px-2.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300"
                                >
                                  Dashboard
                                </button>
                              </div>
                            </motion.div>
                          )}

                          {/* 3. Complaint Tracking Status Card */}
                          {msg.action.type === 'TRACK_COMPLAINT' && msg.action.payload && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 shadow-sm text-xs space-y-2.5"
                            >
                              <div className="flex items-center justify-between border-b border-indigo-200 dark:border-indigo-800 pb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200">
                                  <Clock size={15} className="text-indigo-600 dark:text-indigo-400" />
                                  <span>Complaint Tracking Status</span>
                                </div>
                                <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                  {msg.action.payload.complaintId}
                                </span>
                              </div>

                              {msg.action.payload.found && msg.action.payload.complaint ? (
                                <div className="space-y-2 text-slate-700 dark:text-slate-300">
                                  <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                                    <div>
                                      <div className="text-[10px] text-slate-400">Current Status</div>
                                      <div className="font-bold text-xs text-blue-600 dark:text-blue-400">
                                        {msg.action.payload.complaint.status}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-slate-400">Department</div>
                                      <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                                        {msg.action.payload.complaint.department || msg.action.payload.complaint.authorityType || 'Municipal'}
                                      </div>
                                    </div>
                                  </div>

                                  {msg.action.payload.complaint.location && (
                                    <div className="text-[11px] flex items-center gap-1 text-slate-500">
                                      <MapPin size={11} className="text-red-500" />
                                      <span>
                                        {msg.action.payload.complaint.location.district || ''}, {msg.action.payload.complaint.location.state || ''}
                                      </span>
                                    </div>
                                  )}

                                  <button
                                    onClick={() => navigate(`/track/${msg.action.payload.complaintId}`)}
                                    className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-1 transition-colors"
                                  >
                                    <span>View Full Resolution Details</span>
                                    <ExternalLink size={12} />
                                  </button>
                                </div>
                              ) : (
                                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] space-y-1">
                                  <p>{msg.action.payload.message || `No complaint found matching ID ${msg.action.payload.complaintId}.`}</p>
                                  <button
                                    onClick={() => navigate('/track')}
                                    className="text-blue-600 dark:text-blue-400 font-semibold underline"
                                  >
                                    Open Track Search Page
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          )}

                          {/* 4. Navigation Action Card */}
                          {msg.action.type === 'NAVIGATE' && msg.action.payload && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-xs flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                                  <Compass size={16} />
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-slate-100">
                                    {msg.action.payload.label || 'Navigate'}
                                  </div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {msg.action.payload.description || msg.action.payload.path}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => navigate(msg.action.payload.path)}
                                className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 transition-colors flex-shrink-0"
                              >
                                <span>Open</span>
                                <ArrowRight size={12} />
                              </button>
                            </motion.div>
                          )}

                          {/* 5. Emergency Alert Card */}
                          {msg.action.type === 'EMERGENCY_ALERT' && msg.action.payload && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border-2 border-red-300 dark:border-red-800 shadow-md text-xs space-y-2.5"
                            >
                              <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-800 pb-1.5">
                                <ShieldAlert size={16} className="text-red-600" />
                                <span>Immediate Emergency Assistance Hotlines</span>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5">
                                {msg.action.payload.hotlines?.map((hl, i) => (
                                  <a
                                    key={i}
                                    href={`tel:${hl.number}`}
                                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 hover:bg-red-100/50 flex items-center justify-between text-slate-800 dark:text-slate-200 transition-colors"
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-[10px] text-slate-400 font-medium">{hl.name}</span>
                                      <span className="font-bold text-sm text-red-600">{hl.number}</span>
                                    </div>
                                    <PhoneCall size={14} className="text-red-500" />
                                  </a>
                                ))}
                              </div>

                              <button
                                onClick={() => navigate(msg.action.payload.route || '/emergency')}
                                className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                              >
                                <span>Open Emergency Portal & Dispatch</span>
                                <ArrowRight size={13} />
                              </button>
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* Message Actions: Copy + Speak Voice */}
                      {!isUser && msg.content && (
                        <div className="flex items-center gap-3 mt-1 px-1 text-[10px] text-slate-400">
                          {/* Speak Button */}
                          <button
                            onClick={() => {
                              if (isThisMessageSpeaking) {
                                stopAudio();
                              } else {
                                playSpeech(msg.content, msg.id, true);
                              }
                            }}
                            className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                            title={isThisMessageSpeaking ? 'Stop speaking' : 'Read aloud with ElevenLabs'}
                          >
                            {isThisMessageSpeaking ? (
                              <>
                                <Square size={11} className="text-red-500" />
                                <span className="text-red-500 font-semibold">Stop Voice</span>
                              </>
                            ) : (
                              <>
                                <Volume2 size={11} />
                                <span>Play Voice</span>
                              </>
                            )}
                          </button>

                          {/* Copy Button */}
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={11} className="text-green-500" />
                                <span className="text-green-500 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={11} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Dynamic Agent State Indicator */}
              {(isLoading || isListening) && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 pl-10 animate-pulse font-medium">
                  {isListening ? (
                    <Mic size={14} className="text-red-500 animate-ping" />
                  ) : (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  <span>{isListening ? '🎙 Listening to your voice...' : agentStateText}</span>
                </div>
              )}

              {/* Speech Error Banner */}
              {speechError && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0" />
                    <span>{speechError}</span>
                  </div>
                  <button
                    onClick={() => setSpeechError(null)}
                    className="p-1 hover:bg-amber-200/50 rounded"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Error & Retry Banner */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>Connection issue encountered.</span>
                  </div>
                  <button
                    onClick={handleRetry}
                    className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw size={11} /> Retry
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input & Footer with Voice Controls */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2 flex-shrink-0">
              <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-2 border border-slate-200/80 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                {/* Microphone Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  disabled={isLoading}
                  className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-md ring-2 ring-red-400/50'
                      : 'bg-slate-200 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-200 hover:text-blue-600 disabled:opacity-50'
                  }`}
                  title={isListening ? 'Stop listening' : 'Click to speak'}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Listening to your voice..." : "Ask a question, speak issue, or track..."}
                  rows={1}
                  disabled={isLoading || isListening}
                  className="w-full resize-none bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none max-h-24 scrollbar-thin disabled:opacity-60"
                />

                {/* Send button */}
                <button
                  type="button"
                  onClick={() => sendUserMessage()}
                  disabled={!input.trim() || isLoading || isListening}
                  className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors flex-shrink-0 shadow-xs"
                  aria-label="Send message"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>

              {/* Footer status */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                <div className="flex items-center gap-1.5">
                  <span>Powered by <strong>Gemini AI</strong></span>
                  <span>•</span>
                  <span><strong>ElevenLabs</strong> Voice</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVoiceGender(g => g === 'female' ? 'male' : 'female')}
                    className="hover:text-blue-500 font-medium underline text-[10px]"
                    title="Switch between female and male voice"
                  >
                    Voice: {selectedVoiceGender === 'female' ? 'Female (Bella)' : 'Male (Antoni)'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
