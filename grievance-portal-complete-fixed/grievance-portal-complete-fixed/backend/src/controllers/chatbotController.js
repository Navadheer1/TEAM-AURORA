const {
  generateChatCompletion,
  streamChatCompletion,
} = require('../services/groqChatService');
const {
  getConversationHistory,
  clearConversationHistory,
  getSuggestions,
} = require('../services/geminiChatService');

/**
 * Send a message to the chatbot (Supports both streaming and JSON response)
 * POST /api/chatbot/message and POST /api/chat
 */
const sendChatMessage = async (req, res) => {
  const receiveTime = Date.now();
  console.log(`⏱️ [Chat Controller] Request received at: ${new Date(receiveTime).toISOString()}`);

  try {
    const userMessage = req.body.message || req.body.question || req.body.prompt;
    const history = req.body.history || [];
    const isStream = req.body.stream === true || req.headers['accept'] === 'text/event-stream';

    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty. Please provide a valid message.',
      });
    }

    if (userMessage.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message is too long (maximum 5000 characters allowed).',
      });
    }

    if (isStream) {
      // Setup Server-Sent Events headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      await streamChatCompletion(userMessage, history, res, abortController.signal);
      return;
    }

    // Non-streaming completion
    const result = await generateChatCompletion(userMessage, history);

    console.log(`⏱️ [Chat Controller] Finished in ${Date.now() - receiveTime}ms via model ${result.model}`);

    return res.status(200).json({
      success: true,
      reply: result.reply,
      data: {
        userMessage,
        assistantResponse: result.reply,
        model: result.model,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('❌ [Chat Controller] Error:', error.message);
    const statusCode = error.message.includes('not configured') || error.message.includes('unavailable') ? 503 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to process chat message.',
      reply: error.message || 'AI service is currently unavailable. Please try again in a moment.',
    });
  }
};

/**
 * Get conversation history for the user
 * GET /api/chatbot/history
 */
const getChatHistory = (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId || 'anonymous';
    const history = getConversationHistory(userId);

    res.status(200).json({
      success: true,
      message: 'Conversation history retrieved',
      data: {
        userId,
        history,
        totalMessages: history.length,
      },
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve conversation history',
    });
  }
};

/**
 * Clear conversation history
 * DELETE /api/chatbot/history
 */
const clearChatHistory = (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId || 'anonymous';
    clearConversationHistory(userId);

    res.status(200).json({
      success: true,
      message: 'Conversation history cleared',
    });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear conversation history',
    });
  }
};

/**
 * Get quick suggestions for citizens
 * POST /api/chatbot/suggest
 */
const getSuggestionForComplaint = (req, res) => {
  try {
    const suggestions = getSuggestions();
    res.status(200).json({
      success: true,
      data: { suggestions },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate suggestions',
    });
  }
};

/**
 * Check Groq Chatbot Status
 * GET /api/chatbot/status
 */
const getChatbotStatus = (req, res) => {
  const isAvailable = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0);
  res.status(200).json({
    success: true,
    available: isAvailable,
    provider: 'Groq',
    defaultModel: process.env.GROQ_MODEL || 'groq/compound-mini',
  });
};

module.exports = {
  sendChatMessage,
  getChatHistory,
  clearChatHistory,
  getSuggestionForComplaint,
  getChatbotStatus,
};
