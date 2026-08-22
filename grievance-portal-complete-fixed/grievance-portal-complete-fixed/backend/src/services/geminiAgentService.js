/**
 * geminiAgentService.js
 * Full AI Civic Agent for Jan Shakti / CivicResilience powered by Google Gemini API.
 * Handles intent detection, multi-turn conversational memory, complaint drafting & submission,
 * real database tracking, route navigation, and emergency protocols.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDb, COLLECTIONS, serverTimestamp } = require('../config/firebase');
const { generateComplaintId } = require('../utils/generateId');
const { routeComplaint } = require('../services/routingEngine');
const { analyzeComplaintSeverity } = require('../services/aiSeverityService');
const { awardReputation } = require('../services/reputationService');

// Preferred Gemini models in fallback order
const GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

// In-memory agent session state (holds draft complaints and recent history per session)
const agentSessions = new Map();

// Valid navigation routes allowlist
const ALLOWED_NAV_ROUTES = {
  '/submit-complaint': { name: 'File Complaint', description: 'Submit a new grievance or civic issue' },
  '/report': { name: 'File Complaint', description: 'Submit a new grievance or civic issue' },
  '/track': { name: 'Track Complaint', description: 'Search and track status of any complaint' },
  '/dashboard': { name: 'Citizen Dashboard', description: 'View your submitted complaints and activity' },
  '/emergency': { name: 'Emergency Portal', description: 'Urgent emergency reporting and dispatch' },
  '/profile': { name: 'Profile Settings', description: 'Manage your account settings and contact details' },
  '/login': { name: 'Login', description: 'Sign in to your account' },
  '/register': { name: 'Create Account', description: 'Register a new citizen account' },
};

const SYSTEM_INSTRUCTION = `You are the CivicResilience AI Agent for Jan Shakti — the official Grievance Redressal and Civic Incident Management Portal (Government of India).

You are an intelligent, proactive, and safe civic assistant. You understand natural language, engage in helpful conversations, and take structured actions on behalf of citizens.

Your Capabilities:
1. General Civic & Portal Guidance: Answer any general questions about the portal, how grievance redressal works, municipal departments, rights of citizens, and civic issues (roads, water, sewage, garbage, electricity, corruption, crime, public safety).
2. Navigation Assistance: If the user asks to go to a page or asks where to find something, provide friendly guidance and select an action to navigate to one of the approved routes:
   - /submit-complaint (for filing complaints)
   - /track (for tracking complaints)
   - /dashboard (for my complaints/dashboard)
   - /emergency (for emergencies)
   - /profile (for account/profile)
   - /login (for sign in)
   - /register (for sign up)
3. Complaint Drafting: If the user wants to report an issue (e.g. pothole, broken streetlight, garbage dump, water leak, corruption, crime), gather the required details conversationally:
   - Category: (civic_issue, crime, corruption, fire, hospital)
   - Subcategory: (road_damage, garbage, water_supply, sewage, street_light, electricity, theft, bribery, etc.)
   - Location: Specific location / landmark / street / area, state, district if mentioned
   - Description: Details of what the problem is
   When you have sufficient information (at minimum category, description, and some location detail), formulate a draft so the user can review and confirm.
   NEVER pretend a complaint is submitted until the user explicitly confirms and it is processed.
4. Complaint Tracking: If the user wants to track a complaint (e.g., provides an ID like JS-2026-XXXXX or asks how to track), recognize the tracking intent.
5. Emergency Handling: If the user mentions an active emergency (fire, severe flood, gas leak, building collapse, live wire, serious accident), prioritize physical safety first. Give emergency helpline numbers (112, 101, 108, 100) and guide them to the Emergency Portal (/emergency).

RESPONSE FORMAT REQUIREMENTS:
You must ALWAYS respond with a strictly valid JSON object matching this schema:
{
  "reply": "Your markdown-formatted natural conversational response to the citizen.",
  "intent": "GENERAL_CHAT" | "NAVIGATE" | "COMPLAINT_DRAFT" | "COMPLAINT_TRACK" | "EMERGENCY",
  "agentState": "Thinking..." | "Understanding your request..." | "Preparing complaint..." | "Checking complaint information..." | "Taking action..." | "Completed",
  "action": null | {
    "type": "NAVIGATE" | "DRAFT_COMPLAINT" | "TRACK_COMPLAINT" | "EMERGENCY_ALERT",
    "payload": { ... }
  }
}

Action Payload Details:
- If intent is "NAVIGATE":
  "action": {
    "type": "NAVIGATE",
    "payload": {
      "path": "/submit-complaint", // Must be one of the allowed routes
      "label": "Open File Complaint Page",
      "description": "Go to the complaint submission form"
    }
  }

- If intent is "COMPLAINT_DRAFT" and enough info is gathered to show confirmation card:
  "action": {
    "type": "DRAFT_COMPLAINT",
    "payload": {
      "isReady": true,
      "category": "civic_issue", // civic_issue | crime | corruption | fire | hospital
      "categoryLabel": "Road / Infrastructure",
      "subcategory": "road_damage",
      "subcategoryLabel": "Road Damage / Pothole",
      "location": {
        "address": "Near main gate, ABC College",
        "state": "Andhra Pradesh", // default or mentioned
        "district": "Guntur" // default or mentioned
      },
      "description": "Large pothole causing traffic congestion and danger to motorists",
      "isAnonymous": false
    }
  }
  (If more info is needed before draft is ready, set "action": null and ask the missing question in "reply").

- If intent is "COMPLAINT_TRACK" and the user gave a complaint ID:
  "action": {
    "type": "TRACK_COMPLAINT",
    "payload": {
      "complaintId": "JS-2026-..." // extracted ID if present
    }
  }

- If intent is "EMERGENCY":
  "action": {
    "type": "EMERGENCY_ALERT",
    "payload": {
      "emergencyType": "fire" | "flood" | "medical" | "police" | "hazard",
      "hotlines": [
        { "name": "National Emergency", "number": "112" },
        { "name": "Fire Service", "number": "101" },
        { "name": "Ambulance", "number": "108" },
        { "name": "Police", "number": "100" }
      ],
      "route": "/emergency"
    }
  }

Ensure the response is ONLY the JSON string. Do not wrap in extra commentary.`;

/**
 * Get or initialize session context
 */
function getSessionContext(sessionId = 'default') {
  if (!agentSessions.has(sessionId)) {
    agentSessions.set(sessionId, {
      messages: [],
      activeDraft: null,
      lastUpdated: Date.now(),
    });
  }
  return agentSessions.get(sessionId);
}

/**
 * Clean up old sessions (> 24 hours inactive)
 */
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, session] of agentSessions.entries()) {
    if (session.lastUpdated < cutoff) {
      agentSessions.delete(id);
    }
  }
}, 60 * 60 * 1000);

/**
 * Call Gemini API with automatic model fallback
 */
async function callGemini(prompt, systemInstruction = SYSTEM_INSTRUCTION) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Google Gemini API key is missing or not configured on server.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`🤖 [GeminiAgent] Requesting ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim().length > 0) {
        console.log(`✅ [GeminiAgent] Success with model: ${modelName}`);
        return { text: text.trim(), model: modelName };
      }
    } catch (err) {
      console.warn(`⚠️ [GeminiAgent] Model ${modelName} returned error:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed to respond.');
}

/**
 * Process a message through the Gemini Civic Agent
 */
async function processAgentMessage(userMessage, rawHistory = [], user = null, sessionId = 'default') {
  const session = getSessionContext(sessionId);
  session.lastUpdated = Date.now();

  // Build conversational context
  const historyText = rawHistory
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Citizen' : 'Agent'}: ${m.content}`)
    .join('\n');

  const userContextInfo = user
    ? `Current Logged-in User: ${user.name || 'Citizen'} (${user.email || ''}), State: ${user.state || 'Not specified'}, District: ${user.district || 'Not specified'}`
    : `Current User: Anonymous / Not Logged In`;

  const activeDraftInfo = session.activeDraft
    ? `Currently active draft in session: ${JSON.stringify(session.activeDraft)}`
    : `No active draft currently.`;

  const fullPrompt = `Context Information:
${userContextInfo}
${activeDraftInfo}

Recent Conversation History:
${historyText || 'No prior messages.'}

Citizen's New Message:
"${userMessage}"

Analyze the intent, reason about the next step, update any complaint draft if relevant, and produce the JSON response:`;

  const geminiResponse = await callGemini(fullPrompt);
  
  let parsed;
  try {
    let cleanJson = geminiResponse.text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.substring(7);
      if (cleanJson.endsWith('```')) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.substring(3);
      if (cleanJson.endsWith('```')) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    }
    parsed = JSON.parse(cleanJson.trim());
  } catch (parseErr) {
    console.error('⚠️ [GeminiAgent] Failed to parse JSON from Gemini response:', parseErr.message, 'Raw:', geminiResponse.text);
    parsed = {
      reply: geminiResponse.text,
      intent: 'GENERAL_CHAT',
      agentState: 'Completed',
      action: null,
    };
  }

  // Validate and sanitize actions
  if (parsed.action && parsed.action.type === 'NAVIGATE') {
    const requestedPath = parsed.action.payload?.path;
    const matchedRoute = ALLOWED_NAV_ROUTES[requestedPath];
    if (matchedRoute) {
      parsed.action.payload.label = parsed.action.payload.label || matchedRoute.name;
      parsed.action.payload.description = parsed.action.payload.description || matchedRoute.description;
    } else {
      console.warn(`⚠️ [GeminiAgent] Blocked non-allowlisted route: ${requestedPath}`);
      parsed.action = null; // Discard invalid route
    }
  }

  // Handle complaint draft updates in session
  if (parsed.action && parsed.action.type === 'DRAFT_COMPLAINT' && parsed.action.payload) {
    session.activeDraft = parsed.action.payload;
  }

  // If intent is TRACK_COMPLAINT and complaintId is provided, query the database directly
  if (parsed.action && parsed.action.type === 'TRACK_COMPLAINT' && parsed.action.payload?.complaintId) {
    const complaintId = parsed.action.payload.complaintId.trim();
    try {
      const trackingData = await getRealComplaintTracking(complaintId, user);
      if (trackingData) {
        parsed.action.payload = {
          ...parsed.action.payload,
          found: true,
          complaint: trackingData,
        };
      } else {
        parsed.action.payload = {
          ...parsed.action.payload,
          found: false,
          message: `Complaint with ID "${complaintId}" was not found in the database. Please verify the ID format.`,
        };
      }
    } catch (trackErr) {
      console.error('⚠️ [GeminiAgent] Tracking error during agent lookup:', trackErr.message);
      parsed.action.payload = {
        ...parsed.action.payload,
        found: false,
        message: 'Could not access complaint details at this time.',
      };
    }
  }

  return {
    reply: parsed.reply || 'How may I assist you with civic issues or portal navigation today?',
    intent: parsed.intent || 'GENERAL_CHAT',
    agentState: parsed.agentState || 'Completed',
    action: parsed.action || null,
    model: geminiResponse.model,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Direct real complaint tracking against database
 */
async function getRealComplaintTracking(complaintId, user = null) {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.COMPLAINTS)
    .where('complaintId', '==', complaintId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  // If user is a citizen, check if user is allowed (optional privacy check)
  if (user && user.role === 'citizen' && data.userId && data.userId !== user.id) {
    // Return sanitized public tracking info only
    return {
      complaintId: data.complaintId,
      category: data.category,
      subcategory: data.subcategory,
      status: data.status || 'Submitted',
      authorityType: data.routing?.authorityType || 'Municipal Corporation',
      department: data.routing?.departmentName || data.routing?.authorityType || 'Assigned Authority',
      location: {
        state: data.location?.state,
        district: data.location?.district,
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      isRestricted: true,
    };
  }

  return {
    id: doc.id,
    complaintId: data.complaintId,
    category: data.category,
    subcategory: data.subcategory,
    description: data.description,
    status: data.status || 'Submitted',
    authorityType: data.routing?.authorityType || 'Municipal Corporation',
    department: data.routing?.departmentName || data.routing?.authorityType || 'Assigned Authority',
    location: {
      address: data.location?.address,
      state: data.location?.state,
      district: data.location?.district,
    },
    statusHistory: data.statusHistory || [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    isRestricted: false,
  };
}

/**
 * Execute real complaint creation in database upon citizen confirmation
 */
async function executeConfirmedSubmission(draftData, user = null, sessionId = 'default') {
  if (!draftData || !draftData.category || !draftData.description) {
    throw new Error('Incomplete complaint data. Category and description are required.');
  }

  const db = getDb();
  const session = getSessionContext(sessionId);

  // Normalize location
  const location = {
    address: draftData.location?.address || 'Location provided via Civic Agent',
    state: draftData.location?.state || user?.state || 'Andhra Pradesh',
    district: draftData.location?.district || user?.district || 'Guntur',
    pincode: draftData.location?.pincode || '',
    lat: draftData.location?.lat || null,
    lng: draftData.location?.lng || null,
  };

  const category = draftData.category;
  const subcategory = draftData.subcategory || 'other_civic';
  const description = draftData.description;
  const isAnonymous = Boolean(draftData.isAnonymous && !user);

  // 1. Route complaint
  const routing = await routeComplaint(category, subcategory, location);
  
  // 2. Generate Real Unique ID
  const complaintId = generateComplaintId(category, location.state);

  // 3. Escalation deadline (72h)
  const escalationDueDate = new Date();
  escalationDueDate.setHours(escalationDueDate.getHours() + 72);

  // 4. Severity analysis
  let severityScore = 'Medium';
  let severityReason = 'Classified by Civic Agent';
  try {
    const analysis = await analyzeComplaintSeverity(category, subcategory, description);
    severityScore = analysis.severity || 'Medium';
    severityReason = analysis.reason || severityReason;
  } catch (e) {
    console.warn('⚠️ [GeminiAgent] Severity calculation fallback:', e.message);
  }

  // 5. Build complaint document
  const complaintData = {
    complaintId,
    userId: user ? user.id : 'anonymous_agent',
    userName: isAnonymous ? 'Anonymous Citizen' : (user?.name || 'Citizen User'),
    userEmail: isAnonymous ? null : (user?.email || null),
    userPhone: isAnonymous ? null : (user?.phone || null),
    isAnonymous,
    category,
    subcategory,
    description,
    location,
    attachments: [],
    status: 'Submitted',
    priority: severityScore === 'Critical' ? 'Critical' : (severityScore === 'High' ? 'High' : 'Normal'),
    severityScore,
    severityReason,
    routing: {
      authorityId: routing.authorityId || 'system_routing',
      authorityType: routing.authorityType || 'Municipal Corporation',
      departmentName: routing.departmentName || routing.authorityType || 'Municipal Corporation',
      routingReason: routing.reason || 'Auto-routed by Civic Agent',
      routedAt: new Date().toISOString(),
    },
    statusHistory: [
      {
        status: 'Submitted',
        updatedBy: user?.name || 'Citizen (via CivicResilience AI)',
        role: 'citizen',
        timestamp: new Date().toISOString(),
        remarks: 'Complaint lodged successfully through CivicResilience AI Agent.',
      },
    ],
    escalationDueDate: escalationDueDate.toISOString(),
    escalated: false,
    source: 'ai_agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 6. Save to database
  const docRef = await db.collection(COLLECTIONS.COMPLAINTS).add(complaintData);

  // 7. Award citizen reputation points if authenticated
  if (user && user.id) {
    try {
      await awardReputation(user.id, 'complaint_submitted', 10);
    } catch (repErr) {
      console.warn('⚠️ [GeminiAgent] Reputation points award error:', repErr.message);
    }
  }

  // Clear active draft from session upon successful submission
  session.activeDraft = null;

  console.log(`🎉 [GeminiAgent] Complaint created successfully! ID: ${complaintId}, DocID: ${docRef.id}`);

  return {
    success: true,
    complaintId,
    id: docRef.id,
    category,
    subcategory,
    location,
    department: routing.authorityType || 'Municipal Corporation',
    status: 'Submitted',
    createdAt: complaintData.createdAt,
  };
}

module.exports = {
  processAgentMessage,
  executeConfirmedSubmission,
  getRealComplaintTracking,
  callGemini,
  ALLOWED_NAV_ROUTES,
};
