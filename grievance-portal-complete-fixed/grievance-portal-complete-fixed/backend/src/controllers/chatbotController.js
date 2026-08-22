const crypto = require('crypto');
const {
  processAgentMessage,
  executeConfirmedSubmission,
  getRealComplaintTracking,
} = require('../services/geminiAgentService');

/**
 * Send a message to the CivicResilience AI Agent
 * POST /api/chatbot/message and POST /api/chat
 */
const sendChatMessage = async (req, res) => {
  const requestId = crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10);
  const receiveTime = Date.now();

  try {
    const userMessage = req.body.message || req.body.question || req.body.prompt;
    const history = req.body.history || [];
    const sessionId = req.body.sessionId || req.user?.id || req.ip || 'default_session';

    console.log(`[CHAT REQUEST] ${requestId} - User Message: "${userMessage ? userMessage.substring(0, 60) : ''}" (Session: ${sessionId})`);

    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return res.status(400).json({
        success: false,
        requestId,
        message: 'Message cannot be empty. Please enter your question or request.',
        reply: 'Please provide a message so I can assist you.',
      });
    }

    if (userMessage.length > 4000) {
      return res.status(400).json({
        success: false,
        requestId,
        message: 'Message is too long (maximum 4000 characters allowed).',
        reply: 'Your message is too long. Please summarize your query.',
      });
    }

    console.log(`[CHAT GEMINI] ${requestId} - Sending to Gemini Agent Engine...`);

    const agentResult = await processAgentMessage(
      userMessage.trim(),
      history,
      req.user || null,
      sessionId
    );

    console.log(`[CHAT RESPONSE] ${requestId} - Finished in ${Date.now() - receiveTime}ms via model ${agentResult.model}`);

    return res.status(200).json({
      success: true,
      requestId,
      reply: agentResult.reply,
      intent: agentResult.intent,
      agentState: agentResult.agentState,
      action: agentResult.action,
      data: {
        requestId,
        userMessage,
        assistantResponse: agentResult.reply,
        model: agentResult.model,
        timestamp: agentResult.timestamp,
      },
    });
  } catch (error) {
    console.error(`❌ [CHAT ERROR] ${requestId} -`, error.message);
    return res.status(200).json({
      success: false,
      requestId,
      reply: "Sorry, I'm having trouble connecting to the AI service right now. You can still use the portal normally.",
      intent: 'GENERAL_CHAT',
      agentState: 'Unable to complete',
      action: null,
      error: error.message,
    });
  }
};

/**
 * Confirm and lodge a draft complaint through the AI Agent
 * POST /api/chatbot/confirm-complaint
 */
const confirmComplaintSubmission = async (req, res) => {
  try {
    const draft = req.body.draft || req.body;
    const sessionId = req.body.sessionId || req.user?.id || req.ip || 'default_session';

    if (!draft || !draft.category || !draft.description) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint draft. Category and description are required.',
      });
    }

    const result = await executeConfirmedSubmission(draft, req.user || null, sessionId);

    return res.status(201).json({
      success: true,
      message: `Complaint lodged successfully with ID: ${result.complaintId}`,
      data: result,
    });
  } catch (error) {
    console.error('❌ [ChatbotController] Complaint submission error:', error.message);
    return res.status(500).json({
      success: false,
      message: `I couldn't submit the complaint because the portal service returned an error. Please try again.`,
      error: error.message,
    });
  }
};

/**
 * Direct complaint tracking lookup for agent
 * GET /api/chatbot/track/:complaintId
 */
const trackComplaintViaAgent = async (req, res) => {
  try {
    const { complaintId } = req.params;
    if (!complaintId) {
      return res.status(400).json({ success: false, message: 'Complaint ID is required' });
    }

    const trackingData = await getRealComplaintTracking(complaintId, req.user || null);
    if (!trackingData) {
      return res.status(404).json({
        success: false,
        message: `I couldn't find a complaint matching ID "${complaintId}".`,
      });
    }

    return res.status(200).json({
      success: true,
      data: trackingData,
    });
  } catch (error) {
    console.error('❌ [ChatbotController] Tracking error:', error.message);
    return res.status(500).json({
      success: false,
      message: "I couldn't retrieve that complaint right now.",
    });
  }
};

/**
 * Get quick suggestions for citizens
 * GET /api/chatbot/suggest and POST /api/chatbot/suggest
 */
const getSuggestionForComplaint = (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      suggestions: [
        'How do I report a pothole or damaged road?',
        'I found a large pothole near my college.',
        'Track my complaint JS-2026',
        'There is an emergency fire / hazardous condition',
        'Take me to file a complaint',
        'What can you help me with?',
      ],
    },
  });
};

const {
  generateSpeech,
  getVoiceStatus,
} = require('../services/elevenLabsService');

/**
 * Text-to-Speech synthesis using ElevenLabs API
 * POST /api/chatbot/tts
 */
const synthesizeSpeech = async (req, res) => {
  try {
    const { text, gender = 'female' } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Text to synthesize is required.',
      });
    }

    if (text.length > 3000) {
      return res.status(400).json({
        success: false,
        message: 'Text exceeds maximum length limit of 3000 characters.',
      });
    }

    const audioBuffer = await generateSpeech(text, gender);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache',
    });

    return res.send(audioBuffer);
  } catch (error) {
    console.error('❌ [ChatbotController] TTS synthesis error:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Voice playback is temporarily unavailable.',
      error: error.message,
    });
  }
};

/**
 * Check Gemini & ElevenLabs Voice Chatbot Status
 * GET /api/chatbot/status
 */
const getChatbotStatus = (req, res) => {
  const isGeminiAvailable = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const isElevenLabsAvailable = Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim().length > 0);
  res.status(200).json({
    success: true,
    available: isGeminiAvailable,
    provider: 'Google Gemini',
    voiceAvailable: isElevenLabsAvailable,
    voiceProvider: 'ElevenLabs',
    models: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
  });
};

module.exports = {
  sendChatMessage,
  confirmComplaintSubmission,
  trackComplaintViaAgent,
  getSuggestionForComplaint,
  getChatbotStatus,
  synthesizeSpeech,
};

