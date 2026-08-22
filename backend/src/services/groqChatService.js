/**
 * groqChatService.js
 * Real Groq LLM integration with token streaming, multi-turn conversation memory,
 * robust error handling, and CivicResilience AI system prompt.
 */

const DEFAULT_MODELS = [
  process.env.GROQ_MODEL,
  'groq/compound-mini',
  'qwen/qwen3.6-27b',
  'groq/compound',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
].filter(Boolean);

const CIVIC_SYSTEM_PROMPT = `You are the CivicResilience AI Assistant for Jan Shakti — the official Grievance Redressal and Civic Incident Management Portal (Government of India).

Your Core Responsibilities:
1. Provide practical, accurate, and empathetic guidance on civic grievances (road damage, potholes, waste/garbage, drainage, water supply, streetlight outages, public transport, corruption, municipal works).
2. Assist with emergency and public safety distress (fire hazards, floods, road accidents, structural damage, hazardous leaks).
3. Guide users on portal workflows:
   - Filing complaints with GPS location selection and photo evidence
   - Tracking complaints via unique Complaint ID (e.g. JS-2026-XXXXX)
   - Emergency dispatch alerts for high-priority incidents
   - Role-specific features (Citizen, Police, ACB, Municipal, Fire, Hospital, Admin)
4. Rules & Safety Standards:
   - Never fabricate real emergency dispatch confirmations or fake official orders.
   - For life-threatening emergencies, remind citizens to ensure physical safety and dial 112 / 100 / 101 / 108 alongside portal submission.
   - Respond in concise, structured, helpful Markdown with bullet points where appropriate.
   - If the user communicates in Telugu, Hindi, or other Indian languages, respond politely in that language.`;

/**
 * Format conversation history into standard OpenAI/Groq message objects
 */
function buildMessages(userMessage, rawHistory = []) {
  const messages = [{ role: 'system', content: CIVIC_SYSTEM_PROMPT }];

  // Sanitize and include recent conversation history (up to last 12 messages)
  if (Array.isArray(rawHistory) && rawHistory.length > 0) {
    const recent = rawHistory.slice(-12);
    for (const item of recent) {
      if (item.role && item.content) {
        messages.push({
          role: item.role === 'assistant' || item.role === 'bot' ? 'assistant' : 'user',
          content: String(item.content || item.text || '').trim(),
        });
      } else if (item.userMessage && item.assistantResponse) {
        messages.push({ role: 'user', content: String(item.userMessage).trim() });
        messages.push({ role: 'assistant', content: String(item.assistantResponse).trim() });
      } else if (item.sender && item.text) {
        messages.push({
          role: item.sender === 'user' ? 'user' : 'assistant',
          content: String(item.text).trim(),
        });
      }
    }
  }

  // Append current user message
  if (userMessage && userMessage.trim()) {
    messages.push({ role: 'user', content: userMessage.trim() });
  }

  return messages;
}

/**
 * Generate a complete chat response from Groq (Non-Streaming)
 */
async function generateChatCompletion(userMessage, rawHistory = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('AI service configuration is unavailable. Please check the Groq API configuration.');
  }

  const messages = buildMessages(userMessage, rawHistory);
  let lastError = null;

  for (const model of DEFAULT_MODELS) {
    try {
      console.log(`🤖 [GroqChat] Requesting completion from model: ${model}`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.5,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        console.warn(`⚠️ [GroqChat] Model ${model} returned error: ${errMsg}`);
        lastError = new Error(errMsg);
        continue;
      }

      let content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response payload returned from Groq LLM.');
      }

      // Clean out internal reasoning tags if present
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      console.log(`✅ [GroqChat] Generated response successfully using ${model}`);
      return {
        reply: content,
        model,
        usage: data.usage,
      };
    } catch (err) {
      console.warn(`⚠️ [GroqChat] Failed with model ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to connect to Groq AI service. Please verify your API key and network.');
}

/**
 * Stream chat response tokens from Groq via Server-Sent Events (SSE)
 */
async function streamChatCompletion(userMessage, rawHistory = [], res, abortSignal) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    res.write(`data: ${JSON.stringify({ error: 'AI service configuration is unavailable. Please check the Groq API configuration.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const messages = buildMessages(userMessage, rawHistory);
  let streamStarted = false;
  let lastError = null;

  for (const model of DEFAULT_MODELS) {
    try {
      console.log(`🌊 [GroqChat Stream] Initiating stream with model: ${model}`);
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.5,
          max_tokens: 1024,
          stream: true,
        }),
        signal: abortSignal,
      });

      if (!groqRes.ok) {
        const errJson = await groqRes.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${groqRes.status}: ${groqRes.statusText}`;
        console.warn(`⚠️ [GroqChat Stream] Model ${model} failed: ${errMsg}`);
        lastError = new Error(errMsg);
        continue;
      }

      const reader = groqRes.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      streamStarted = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed === 'data: [DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const deltaContent = parsed.choices?.[0]?.delta?.content;
              if (deltaContent) {
                res.write(`data: ${JSON.stringify({ chunk: deltaContent, model })}\n\n`);
              }
            } catch (pErr) {}
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
      console.log(`✅ [GroqChat Stream] Stream completed successfully with ${model}`);
      return;
    } catch (err) {
      if (err.name === 'AbortError' || abortSignal?.aborted) {
        console.log('🛑 [GroqChat Stream] Client cancelled stream request.');
        res.end();
        return;
      }
      console.warn(`⚠️ [GroqChat Stream] Error during streaming with ${model}:`, err.message);
      lastError = err;
      if (streamStarted) {
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted: ' + err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
    }
  }

  res.write(`data: ${JSON.stringify({ error: lastError?.message || 'Failed to initialize Groq streaming.' })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = {
  generateChatCompletion,
  streamChatCompletion,
  CIVIC_SYSTEM_PROMPT,
  DEFAULT_MODELS,
};
