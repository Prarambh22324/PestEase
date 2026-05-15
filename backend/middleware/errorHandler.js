/**
 * PestEase — Global Error Handler
 */

const logger = require("../config/logger");

function errorHandler(err, req, res, next) {
  logger.error(`[Error] ${req.method} ${req.path}: ${err.message}`);

  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, error: "File too large. Max 8MB." });
  }

  // Sequelize validation errors
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      success: false,
      error: err.errors.map((e) => e.message).join(", "),
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error." : err.message,
  });
}

module.exports = errorHandler;
