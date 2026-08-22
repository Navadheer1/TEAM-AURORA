const { generateChatCompletion, CIVIC_SYSTEM_PROMPT } = require('./groqChatService');

// In-memory conversation history storage per user
const conversationHistory = new Map();

/**
 * Send a message using Groq LLM (proxy wrapper)
 */
async function sendMessage(userMessage, userId = 'anonymous', mode = 'chat') {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  const history = conversationHistory.get(userId);

  const result = await generateChatCompletion(userMessage, history);
  const replyText = result.reply;

  // Store in memory
  history.push({
    userMessage,
    assistantResponse: replyText,
    timestamp: new Date(),
  });

  if (history.length > 12) {
    history.shift();
  }

  return replyText;
}

function getConversationHistory(userId = 'anonymous') {
  return conversationHistory.get(userId) || [];
}

function clearConversationHistory(userId = 'anonymous') {
  conversationHistory.delete(userId);
}

function getSuggestions() {
  return [
    'How do I report a pothole or damaged road?',
    'What should I do in case of an emergency flood or fire?',
    'How can I track the status of my filed complaint?',
    'What evidence should I attach when filing a report?',
  ];
}

module.exports = {
  sendMessage,
  getConversationHistory,
  clearConversationHistory,
  getSuggestions,
  SYSTEM_INSTRUCTION: CIVIC_SYSTEM_PROMPT,
};
