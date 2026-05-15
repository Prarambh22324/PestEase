/**
 * PestEase — Auth Middleware
 * Verifies JWT for users and API key for rovers.
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set in environment.");

// ── User JWT auth ──────────────────────────────────────
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "No token provided." });
  }
  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    // Tell the frontend specifically when a token has expired
    // so it can attempt a silent refresh instead of logging out
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired.",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      success: false,
      error: "Invalid token.",
      code: "TOKEN_INVALID",
    });
  }
}

// ── Rover API key auth ─────────────────────────────────
function authenticateRover(req, res, next) {
  const key = req.headers["x-rover-api-key"];
  if (!key || key !== process.env.ROVER_API_KEY) {
    return res.status(401).json({ success: false, error: "Invalid rover API key." });
  }
  next();
}

// ── Role guard ─────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(" or ")}.`,
      });
    }
    next();
  };
}

module.exports = { authenticate, authenticateRover, requireRole };
