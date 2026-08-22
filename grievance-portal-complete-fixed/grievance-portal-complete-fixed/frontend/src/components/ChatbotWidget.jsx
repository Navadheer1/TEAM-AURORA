import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, Send, Bot, User, RotateCcw, Copy, Check, Square, 
  Sparkles, AlertCircle, RefreshCw, MessageSquare, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from '../utils/i18n';

const SUGGESTED_PROMPTS = [
  'How do I report a pothole or damaged road?',
  'What should I do during an emergency fire or flood?',
  'How can I track my complaint status?',
  'What details and photos should I include in a report?',
];

const sanitizeContent = (text) => {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '').trim();
};

export default function ChatbotWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: 'Hello! I am the **CivicResilience AI Assistant** for Jan Shakti. How can I assist you with civic issues, emergency guidance, or tracking your complaints today?',
      timestamp: new Date(),
    },
  ]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
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
  }, [messages, isStreaming, scrollToBottom]);

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

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        scrollToBottom(false);
      }, 150);
    }
  }, [isOpen, scrollToBottom]);

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

  // Stop Generation
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  };

  // Send Message using Groq API (Streaming)
  const sendMessage = async (overridePrompt = null) => {
    const messageText = (overridePrompt || input).trim();
    if (!messageText || isLoading || isStreaming) return;

    setInput('');
    setError(null);
    setIsLoading(true);
    setIsStreaming(true);

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    // Add user message
    const updatedMessages = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      },
    ];

    // Placeholder assistant message
    setMessages([
      ...updatedMessages,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Prepare conversational history (convert internal structure to standard role/content)
    const historyPayload = updatedMessages
      .filter((m) => m.id !== 'welcome-1')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    try {
      const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const cleanBase = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
      const chatUrl = `${cleanBase}/chat`;

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          message: messageText,
          history: historyPayload,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.message || `Server responded with ${response.status}: ${response.statusText}`);
      }

      setIsLoading(false); // First byte arrived, transition from loading indicator to streaming content

      // Check if server returned SSE or standard JSON
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedContent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Retain unfinished line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed === 'data: [DONE]') {
              continue;
            }

            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.error) {
                  throw new Error(data.error);
                }
                if (data.chunk) {
                  accumulatedContent += data.chunk;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: accumulatedContent }
                        : msg
                    )
                  );
                }
              } catch (parseErr) {
                // Ignore chunk parse glitches
              }
            }
          }
        }
      } else {
        // Fallback standard JSON
        const data = await response.json();
        const replyText = data.reply || data.data?.assistantResponse || 'No response returned.';
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: replyText } : msg
          )
        );
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('🛑 Request aborted by user');
        return;
      }
      console.error('❌ Chatbot communication failure:', err);
      const errorMsg = err.message || 'Failed to communicate with the Groq AI service. Please try again.';
      setError(errorMsg);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `⚠️ **AI Service Notice:** ${errorMsg}\n\n*Please ensure your network connection and Groq API key are valid, then click Retry below.*`,
                isError: true,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Retry last message
  const handleRetry = () => {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      // Remove last assistant error message
      setMessages((prev) => prev.slice(0, -1));
      sendMessage(lastUserMsg.content);
    }
  };

  // Handle Key Down
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Chat Trigger Button (Flat Enterprise FAB) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 p-3.5 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md flex items-center gap-2 font-sans transition-colors group"
            aria-label="Open AI Civic Assistant"
          >
            <div className="relative">
              <Bot size={22} className="text-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-blue-600" />
            </div>
            <span className="text-xs font-semibold tracking-wide pr-1 hidden sm:inline-block">AI Assistant</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[420px] md:w-[460px] h-[580px] max-h-[calc(100vh-80px)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col overflow-hidden font-sans"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center border border-blue-500">
                  <Bot size={18} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-sm tracking-tight leading-tight">CivicResilience AI</h3>
                    <span className="px-1.5 py-0.2 rounded bg-blue-700 border border-blue-500 text-[9px] font-semibold text-blue-100 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Groq LLM
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-100 leading-tight mt-0.5">Jan Shakti Grievance & Safety Intelligence</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors"
                  title="Close Assistant"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scroll-smooth bg-slate-50/50 dark:bg-slate-950/50">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
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
                    <div className={`flex flex-col max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm relative group ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : msg.isError
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 rounded-tl-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-sm'
                        }`}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        ) : sanitizeContent(msg.content) ? (
                          <div className="markdown-chat prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm break-words">
                            <ReactMarkdown>{sanitizeContent(msg.content)}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 py-1 text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                      </div>

                      {/* Message Actions */}
                      {!isUser && msg.content && (
                        <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-400">
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

              {/* Initial Loading Pulse */}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 pl-10 animate-pulse">
                  <Bot size={13} className="text-indigo-500" />
                  <span>AI is thinking...</span>
                </div>
              )}

              {/* Error & Retry Banner */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>Failed to complete generation.</span>
                  </div>
                  <button
                    onClick={handleRetry}
                    className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw size={11} /> Retry
                  </button>
                </div>
              )}

              {/* Suggested Questions */}
              {messages.length === 1 && (
                <div className="pt-2 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    Suggested Topics
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {SUGGESTED_PROMPTS.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(prompt)}
                        className="text-left p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 text-xs text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-150 shadow-sm"
                      >
                        💡 {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
              {/* Stop Generation Button */}
              {isStreaming && (
                <div className="flex justify-center mb-2">
                  <button
                    onClick={stopGeneration}
                    className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Square size={10} className="fill-current text-red-500" />
                    <span>Stop Generation</span>
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500 transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything or report an issue... (Enter to send)"
                  rows={1}
                  disabled={isLoading || isStreaming}
                  className="flex-1 bg-transparent resize-none outline-none text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 max-h-28 py-1.5 px-1.5"
                  style={{ minHeight: '24px' }}
                />

                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading || isStreaming}
                  className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm flex-shrink-0"
                  aria-label="Send message"
                >
                  <Send size={15} />
                </button>
              </div>

              <div className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-1.5">
                Powered by Groq LLM • Press Shift + Enter for new line
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
