/**
 * Multimodal AI Vision Service for Civic Complaint Analysis
 * 
 * Supports:
 * - Google Gemini Vision (gemini-3.6-flash, gemini-3.7-flash, gemini-3.5-flash, gemini-flash-latest, gemini-2.5-pro)
 * - Groq Vision (llama-3.2-11b-vision-preview, llama-3.2-90b-vision-preview)
 * - Structured JSON output containing category, factual description, severity, confidence, and visual observations.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Standard Allowed Categories
const ALLOWED_CATEGORIES = [
  'Road / Pothole',
  'Garbage / Waste Management',
  'Streetlight',
  'Drainage / Sewage',
  'Water Supply',
  'Traffic Signal',
  'Broken Footpath',
  'Public Infrastructure',
  'Illegal Dumping',
  'Flooding / Waterlogging',
  'Tree / Fallen Tree',
  'Public Safety',
  'Corruption / Bribery',
  'Fire Safety Hazard',
  'Other'
];

// Mapping to internal portal category and subcategory
const CATEGORY_MAP = {
  'Road / Pothole': { category: 'civic_issue', subcategory: 'road_damage' },
  'Garbage / Waste Management': { category: 'civic_issue', subcategory: 'garbage' },
  'Streetlight': { category: 'civic_issue', subcategory: 'street_light' },
  'Drainage / Sewage': { category: 'civic_issue', subcategory: 'sewage' },
  'Water Supply': { category: 'civic_issue', subcategory: 'water_supply' },
  'Traffic Signal': { category: 'civic_issue', subcategory: 'street_light' },
  'Broken Footpath': { category: 'civic_issue', subcategory: 'road_damage' },
  'Public Infrastructure': { category: 'civic_issue', subcategory: 'park_maintenance' },
  'Illegal Dumping': { category: 'civic_issue', subcategory: 'garbage' },
  'Flooding / Waterlogging': { category: 'civic_issue', subcategory: 'sewage' },
  'Tree / Fallen Tree': { category: 'civic_issue', subcategory: 'park_maintenance' },
  'Public Safety': { category: 'crime', subcategory: 'other_crime' },
  'Corruption / Bribery': { category: 'corruption', subcategory: 'bribery' },
  'Fire Safety Hazard': { category: 'fire', subcategory: 'safety_hazard' },
  'Other': { category: 'civic_issue', subcategory: 'other_civic' }
};

/**
 * System Prompt for Multimodal AI Vision
 */
const VISION_SYSTEM_PROMPT = `You are the AI Civic Complaint Vision Analyzer for the Jan Shakti Grievance Redressal Portal.
Your task is to analyze photos uploaded by citizens and extract structured, factual complaint metadata.

Allowed Categories (choose ONLY from this list):
- Road / Pothole
- Garbage / Waste Management
- Streetlight
- Drainage / Sewage
- Water Supply
- Traffic Signal
- Broken Footpath
- Public Infrastructure
- Illegal Dumping
- Flooding / Waterlogging
- Tree / Fallen Tree
- Public Safety
- Corruption / Bribery
- Fire Safety Hazard
- Other

Strict Rules:
1. Base your analysis and description ONLY on what is directly and clearly visible in the image.
2. DO NOT invent or assume:
   - Specific addresses or landmarks not shown in the image
   - Names or identities of people
   - Vehicle registration numbers
   - Imaginary causes (e.g., "damaged by heavy rain last Tuesday")
   - Fake dates, measurements, or monetary cost estimates
3. The description must be concise, objective, and appropriate for municipal/administrative authority review.
4. If the image is a person portrait, selfie, food, animal, random indoor object, scenery, or completely irrelevant to civic issues:
   - Set "is_complaint": false
   - Set "category": "Other"
   - Set "confidence": a low score (e.g. 0.20 - 0.40)
   - Explain in "observations" why it is not a valid civic complaint.
5. Provide a list of 2 to 4 bullet-point visual observations of specific elements seen.

Return ONLY a strictly valid JSON object with EXACTLY this structure (no markdown fences, no explanatory text outside JSON):
{
  "category": "One of the allowed categories listed above",
  "description": "Factual 1-3 sentence summary of the issue visible in the image",
  "severity": "Low | Medium | High | Critical",
  "confidence": 0.85,
  "observations": [
    "Observation 1",
    "Observation 2"
  ],
  "is_complaint": true
}`;

/**
 * Parse and validate JSON from AI model response
 */
function parseAndValidateResponse(rawText, engine = 'gemini') {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('❌ JSON parse error from AI model:', cleaned);
    throw new Error('AI returned invalid JSON formatting.');
  }

  // Normalize category
  let matchedCategory = 'Other';
  const rawCat = (parsed.category || '').toLowerCase();
  for (const cat of ALLOWED_CATEGORIES) {
    if (cat.toLowerCase() === rawCat || rawCat.includes(cat.toLowerCase())) {
      matchedCategory = cat;
      break;
    }
  }

  if (matchedCategory === 'Other' && parsed.category) {
    if (rawCat.includes('pothole') || rawCat.includes('road')) matchedCategory = 'Road / Pothole';
    else if (rawCat.includes('garbage') || rawCat.includes('waste') || rawCat.includes('trash')) matchedCategory = 'Garbage / Waste Management';
    else if (rawCat.includes('light') || rawCat.includes('lamp')) matchedCategory = 'Streetlight';
    else if (rawCat.includes('drain') || rawCat.includes('sewer') || rawCat.includes('sewage')) matchedCategory = 'Drainage / Sewage';
    else if (rawCat.includes('water') || rawCat.includes('pipe')) matchedCategory = 'Water Supply';
    else if (rawCat.includes('flood')) matchedCategory = 'Flooding / Waterlogging';
    else if (rawCat.includes('traffic') || rawCat.includes('signal')) matchedCategory = 'Traffic Signal';
    else if (rawCat.includes('footpath') || rawCat.includes('sidewalk')) matchedCategory = 'Broken Footpath';
    else if (rawCat.includes('tree')) matchedCategory = 'Tree / Fallen Tree';
    else if (rawCat.includes('fire')) matchedCategory = 'Fire Safety Hazard';
    else if (rawCat.includes('bribe') || rawCat.includes('corrupt')) matchedCategory = 'Corruption / Bribery';
  }

  const mapped = CATEGORY_MAP[matchedCategory] || { category: 'civic_issue', subcategory: 'other_civic' };

  let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;
  confidence = Math.max(0, Math.min(1, confidence));

  const isComplaint = parsed.is_complaint !== false && matchedCategory !== 'Other' || (matchedCategory === 'Other' && confidence > 0.6);

  let severity = 'Medium';
  const rawSev = (parsed.severity || '').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(rawSev)) {
    severity = rawSev.charAt(0).toUpperCase() + rawSev.slice(1);
  }

  const observations = Array.isArray(parsed.observations) ? parsed.observations.map(String) : [];

  return {
    success: true,
    engine,
    category: matchedCategory,
    description: parsed.description || `Observed ${matchedCategory.toLowerCase()} issue requiring attention.`,
    severity,
    confidence: Number(confidence.toFixed(2)),
    observations: observations.length > 0 ? observations : [`Visual evidence of ${matchedCategory.toLowerCase()}`],
    is_complaint: isComplaint,
    mappedCategory: mapped.category,
    mappedSubcategory: mapped.subcategory,
    detectedCategory: matchedCategory,
    analysis: parsed.description || '',
    reason: parsed.description || ''
  };
}

/**
 * Main Vision Analysis Entrypoint
 * Accepts image buffer and analyzes via multimodal models
 */
async function detectIssueFromImage(fileBuffer, mimeType = 'image/jpeg', originalName = '') {
  const base64Image = fileBuffer.toString('base64');
  const startTime = Date.now();
  console.log(`🖼️ [VisionService] Starting multimodal image analysis (${fileBuffer.length} bytes, ${mimeType})...`);

  // ================= TIER 1: GROQ VISION (If GROQ_API_KEY is available) =================
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groqVisionModels = ['llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview'];
    for (const modelName of groqVisionModels) {
      try {
        console.log(`🤖 [VisionService] [Groq Tier] Trying ${modelName}...`);
        const dataUri = `data:${mimeType};base64,${base64Image}`;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: VISION_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Analyze this photo for civic complaint submission and return strictly JSON.' },
                  { type: 'image_url', image_url: { url: dataUri } }
                ]
              }
            ],
            temperature: 0.1,
            max_tokens: 600,
            response_format: { type: 'json_object' }
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const replyText = resData.choices?.[0]?.message?.content;
          if (replyText) {
            console.log(`✅ [VisionService] [Groq Tier] Success in ${Date.now() - startTime}ms via ${modelName}`);
            return parseAndValidateResponse(replyText, `groq-${modelName}`);
          }
        } else {
          const errText = await response.text();
          console.warn(`⚠️ [VisionService] [Groq Tier] ${modelName} returned status ${response.status}:`, errText);
        }
      } catch (groqErr) {
        console.warn(`⚠️ [VisionService] [Groq Tier] ${modelName} error:`, groqErr.message);
      }
    }
  }

  // ================= TIER 2: GOOGLE GEMINI MULTIMODAL =================
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const candidateModels = [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite'
    ];
    const genAI = new GoogleGenerativeAI(geminiKey);
    const prompt = VISION_SYSTEM_PROMPT + "\n\nPlease analyze this image and output strictly the required JSON object without any Markdown formatting.";
    const imageParts = [
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ];

    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        console.log(`🤖 [VisionService] [Gemini Tier] Trying ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([prompt, ...imageParts]);
        const replyText = result.response.text();
        if (replyText) {
          console.log(`✅ [VisionService] [Gemini Tier] Success in ${Date.now() - startTime}ms via ${modelName}`);
          return parseAndValidateResponse(replyText, `gemini-${modelName}`);
        }
      } catch (geminiErr) {
        lastError = geminiErr;
        console.warn(`⚠️ [VisionService] [Gemini Tier] ${modelName} error:`, geminiErr.message);
      }
    }
  }

  // If both providers failed or keys not set
  throw new Error('Multimodal AI Vision analysis is currently unavailable. Please file your complaint details manually.');
}

module.exports = {
  detectIssueFromImage,
  ALLOWED_CATEGORIES,
  CATEGORY_MAP
};
