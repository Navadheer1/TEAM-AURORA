const { detectIssueFromImage, ALLOWED_CATEGORIES } = require('../services/openaiVisionService');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

/**
 * Multimodal AI Image Analysis for Civic Grievances
 * POST /api/complaints/analyze-image
 * POST /api/complaints/detect-issue (alias)
 */
const detectComplaintIssue = asyncHandler(async (req, res) => {
  // 1. Verify file was uploaded
  if (!req.file) {
    throw new AppError('No photo uploaded. Please attach a valid image file (form field: "image").', 400);
  }

  // 2. Validate file type is image
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!allowedMimeTypes.includes(req.file.mimetype.toLowerCase()) && !req.file.mimetype.startsWith('image/')) {
    throw new AppError('Invalid file type. Only image files (JPEG, PNG, WEBP) are supported.', 400);
  }

  // 3. Validate file size (Max 15MB)
  if (req.file.size > 15 * 1024 * 1024) {
    throw new AppError('File is too large. Image must be under 15MB for AI analysis.', 400);
  }

  console.log(`📷 [AIController] Multimodal Vision request received: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);

  try {
    const result = await detectIssueFromImage(req.file.buffer, req.file.mimetype, req.file.originalname);

    const payload = {
      category: result.category,
      description: result.description,
      severity: result.severity,
      confidence: result.confidence,
      observations: result.observations || [],
      is_complaint: result.is_complaint,
      mappedCategory: result.mappedCategory,
      mappedSubcategory: result.mappedSubcategory,
      detectedCategory: result.category,
      reason: result.description,
      engine: result.engine
    };

    return res.status(200).json({
      success: true,
      message: 'AI Photo Analysis completed successfully.',
      analysis: payload,
      data: payload // Backward compatibility with previous clients
    });
  } catch (error) {
    console.error('❌ [AIController] Vision analysis failed:', error.message);
    throw new AppError(error.message || 'AI Vision analysis failed.', 500);
  }
});

module.exports = {
  detectComplaintIssue,
  ALLOWED_CATEGORIES
};
