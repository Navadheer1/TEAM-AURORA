/**
 * VoiceAssistant.jsx
 * clean rebuild of global floating Voice Assistant Widget.
 * Sleek claymorphic UI containing floating mic button and a dynamic status pill beside it.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Loader2, Volume2, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../store/authStore';
import { speechService } from '../services/speechService';
import { voiceIntentService } from '../services/voiceIntentService';
import { voiceActionExecutor } from '../services/voiceActionExecutor';

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('IDLE'); // 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR'
  const [isContinuous, setIsContinuous] = useState(false);
  const [announcerText, setAnnouncerText] = useState('');

  const statusRef = useRef(status);
  const isContinuousRef = useRef(isContinuous);

  // Keep refs updated to prevent stale closures
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isContinuousRef.current = isContinuous;
  }, [isContinuous]);

  // Alt + V to toggle mic listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        toggleVoiceAssistant();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isContinuous]);

  // Clean shutdown on logout
  const handleSystemLogout = () => {
    console.log("🎙️ [VoiceAssistant] Intercepted logout sequence. Shutting down mic listener.");
    setIsContinuous(false);
    isContinuousRef.current = false;
    speechService.stopListening();
    window.speechSynthesis.cancel();
    setStatus('IDLE');
  };

  // Initialize Speech Services on Mount
  useEffect(() => {
    const success = speechService.initRecognition({
      onStart: () => {
        setStatus('LISTENING');
        setAnnouncerText('Voice assistant is listening...');
      },
      onResult: async ({ rawText, cleaned, confidence }) => {
        if (!cleaned || (confidence !== undefined && confidence > 0 && confidence < 0.35)) {
          console.warn(`🎙️ [VoiceAssistant] Low confidence (${confidence}) transcript rejected: "${rawText}"`);
          setStatus('ERROR');
          await speechService.speak("Sorry, please repeat once.");
          restartListeningLoop();
          return;
        }

        // Clean text checks
        if (cleaned.trim().length === 0) {
          restartListeningLoop();
          return;
        }

        // Trigger Thinking state
        setStatus('THINKING');
        setAnnouncerText('AI is processing voice command...');

        // Fetch user context
        const user = useAuthStore.getState().user;
        const userRole = user?.role || 'guest';
        const currentPath = window.location.pathname;

        // Fetch intent action
        const actionObj = await voiceIntentService.getActionFromSpeech(cleaned, currentPath, userRole);
        
        console.log("🎙️ [VoiceAssistant] Intent action returned:", actionObj);

        // Intercept logout intent early
        const isLogout = actionObj.action === 'LOGOUT' || 
                         (actionObj.target && (actionObj.target.toLowerCase().includes('logout') || actionObj.target.toLowerCase().includes('signout')));

        if (isLogout) {
          handleSystemLogout();
        }

        // Execute GUI action safely
        let executionFeedback = actionObj.reply || "Action completed.";
        try {
          if (actionObj.action && actionObj.action !== 'CHAT' && actionObj.action !== 'ASK_CLARIFICATION') {
            const execResult = await voiceActionExecutor.execute(actionObj, navigate);
            if (typeof execResult === 'string' && execResult.trim().length > 0) {
              executionFeedback = execResult;
            }
          }
        } catch (execErr) {
          console.error("🎙️ [VoiceAssistant] Executor error:", execErr.message);
          executionFeedback = actionObj.reply || `I had trouble completing that: ${execErr.message}`;
        }

        // Speak reply feedback
        setStatus('SPEAKING');
        setAnnouncerText(`AI speaking: ${executionFeedback}`);
        await speechService.speak(executionFeedback);

        // Resume listener or back to IDLE
        restartListeningLoop();
      },
      onError: (err) => {
        console.warn("🎙️ [VoiceAssistant] Mic error handler:", err);
        if (err === 'no-speech') {
          restartListeningLoop();
        } else {
          setStatus('ERROR');
          setAnnouncerText('Microphone error occurred.');
          // Auto fall back to IDLE in a few seconds on fatal mic blockages
          setTimeout(() => {
            if (statusRef.current === 'ERROR') {
              setStatus('IDLE');
            }
          }, 3000);
        }
      },
      onEnd: () => {
        // Speech ended
        if (statusRef.current === 'LISTENING') {
          restartListeningLoop();
        }
      }
    });

    if (!success) {
      console.warn("🎙️ [VoiceAssistant] Initial speech recognition setup failed.");
    }

    return () => {
      speechService.stopListening();
      window.speechSynthesis.cancel();
    };
  }, []);

  const restartListeningLoop = () => {
    if (isContinuousRef.current) {
      setStatus('LISTENING');
      setTimeout(() => {
        if (isContinuousRef.current && statusRef.current !== 'THINKING' && statusRef.current !== 'SPEAKING') {
          speechService.startListening();
        }
      }, 350);
    } else {
      setStatus('IDLE');
    }
  };

  const toggleVoiceAssistant = () => {
    if (status !== 'IDLE') {
      setIsContinuous(false);
      isContinuousRef.current = false;
      speechService.stopListening();
      window.speechSynthesis.cancel();
      setStatus('IDLE');
    } else {
      window.speechSynthesis.cancel();
      setIsContinuous(true);
      isContinuousRef.current = true;
      speechService.startListening();
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'LISTENING':
        return {
          title: 'Listening...',
          badgeBg: 'bg-red-600',
          pulse: 'ring-2 ring-red-400 ring-offset-2',
          icon: Mic,
        };
      case 'THINKING':
        return {
          title: 'Thinking...',
          badgeBg: 'bg-amber-600',
          pulse: 'ring-2 ring-amber-400 ring-offset-2',
          icon: Loader2,
        };
      case 'SPEAKING':
        return {
          title: 'Speaking...',
          badgeBg: 'bg-emerald-600',
          pulse: 'ring-2 ring-emerald-400 ring-offset-2',
          icon: Volume2,
        };
      case 'ERROR':
        return {
          title: 'Error',
          badgeBg: 'bg-rose-600',
          pulse: 'ring-2 ring-rose-400',
          icon: AlertCircle,
        };
      case 'IDLE':
      default:
        return {
          title: 'Voice Standby',
          badgeBg: 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700',
          pulse: '',
          icon: MicOff,
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <div className="hey-city-voice-assistant fixed bottom-6 left-6 z-50 flex items-center gap-3 font-sans">
      
      {/* Screen Reader Live Assistive Announcer */}
      <div className="sr-only" aria-live="assertive">
        {announcerText}
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={toggleVoiceAssistant}
          className={`w-12 h-12 rounded-full text-white flex items-center justify-center transition-colors shadow-md border border-slate-700/50 ${config.badgeBg} ${config.pulse}`}
          aria-label={`Voice Assistant. Status: ${config.title}. Alt+V to toggle.`}
        >
          <StatusIcon size={18} className={status === 'THINKING' ? 'animate-spin' : ''} />
        </button>

        {/* Minimalist Status Pill */}
        <AnimatePresence>
          {(status === 'LISTENING' || status === 'THINKING' || status === 'SPEAKING' || status === 'ERROR') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: -6 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: -6 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 flex items-center shadow-sm"
            >
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                {status === 'LISTENING' ? 'Listening...' : 
                 status === 'THINKING' ? 'Thinking...' : 
                 status === 'SPEAKING' ? 'Speaking...' : 
                 status === 'ERROR' ? 'Error' : ''}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
