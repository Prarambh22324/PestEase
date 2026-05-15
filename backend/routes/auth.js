/**
 * PestEase — /api/auth
 * Routes: register, login, refresh, logout, me, change-password, forgot-password
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Joi = require("joi");

const { User } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const logger = require("../config/logger");

const JWT_SECRET         = process.env.JWT_SECRET;
const JWT_EXPIRES        = process.env.JWT_EXPIRES        || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + "_refresh";
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "30d";

if (!JWT_SECRET) throw new Error("JWT_SECRET is not set in environment.");

// In-memory refresh token store — swap for Redis in production
const refreshTokens = new Set();

// ── Validation schemas ─────────────────────────────────
const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(100).required(),
  email:    Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role:     Joi.string().valid("farmer", "pathologist", "beekeeper", "admin").default("farmer"),
  phone:    Joi.string().optional(),
});

const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password:     Joi.string().min(6).required(),
});

// ── Helpers ────────────────────────────────────────────
function signAccess(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES }
  );
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
}

// ── POST /api/auth/register ────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await User.findOne({ where: { email: value.email } });
    if (existing) return res.status(409).json({ success: false, error: "Email already registered." });

    const hashed = await bcrypt.hash(value.password, 12);
    const user = await User.create({ ...value, password: hashed });

    const token        = signAccess(user);
    const refreshToken = signRefresh(user);
    refreshTokens.add(refreshToken);

    logger.info(`[Auth] Registered: ${user.email} (${user.role})`);
    res.status(201).json({
      success: true,
      token,
      refresh_token: refreshToken,
      user: safeUser(user),
    });
  } catch (err) {
    logger.error("[Auth/register]", err);
    res.status(500).json({ success: false, error: "Registration failed." });
  }
});

// ── POST /api/auth/login ───────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const user = await User.findOne({ where: { email: value.email } });
    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials." });

    const match = await bcrypt.compare(value.password, user.password);
    if (!match) return res.status(401).json({ success: false, error: "Invalid credentials." });

    const token        = signAccess(user);
    const refreshToken = signRefresh(user);
    refreshTokens.add(refreshToken);

    logger.info(`[Auth] Login: ${user.email}`);
    res.json({
      success: true,
      token,
      refresh_token: refreshToken,
      user: safeUser(user),
    });
  } catch (err) {
    logger.error("[Auth/login]", err);
    res.status(500).json({ success: false, error: "Login failed." });
  }
});

// ── POST /api/auth/refresh ─────────────────────────────
// Body: { refresh_token }
// Returns a new access token (and rotates the refresh token)
router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(401).json({ success: false, error: "No refresh token provided." });
  }
  if (!refreshTokens.has(refresh_token)) {
    return res.status(401).json({ success: false, error: "Refresh token invalid or already used." });
  }

  try {
    const payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
    const user = await User.findByPk(payload.id);
    if (!user) return res.status(401).json({ success: false, error: "User not found." });

    // Rotate — invalidate old, issue new pair
    refreshTokens.delete(refresh_token);
    const newToken        = signAccess(user);
    const newRefreshToken = signRefresh(user);
    refreshTokens.add(newRefreshToken);

    res.json({
      success: true,
      token: newToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    refreshTokens.delete(refresh_token);
    return res.status(401).json({ success: false, error: "Refresh token expired. Please log in again." });
  }
});

// ── POST /api/auth/logout ──────────────────────────────
// Body: { refresh_token }
router.post("/logout", (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) refreshTokens.delete(refresh_token);
  res.json({ success: true, message: "Logged out." });
});

// ── GET /api/auth/me ───────────────────────────────────
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) return res.status(404).json({ success: false, error: "User not found." });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/change-password ────────────────────
router.post("/change-password", authenticate, async (req, res) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const user = await User.findByPk(req.user.id);
    const match = await bcrypt.compare(value.current_password, user.password);
    if (!match) return res.status(401).json({ success: false, error: "Current password is incorrect." });

    const hashed = await bcrypt.hash(value.new_password, 12);
    await user.update({ password: hashed });

    logger.info(`[Auth] Password changed: ${user.email}`);
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    logger.error("[Auth/change-password]", err);
    res.status(500).json({ success: false, error: "Failed to change password." });
  }
});

// ── POST /api/auth/forgot-password ────────────────────
// In production: send reset link via email. Here we return the token directly
// (safe for hackathon/demo — swap the response for an email send in prod).
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email is required." });

    const user = await User.findOne({ where: { email } });

    // Always respond the same way — don't leak whether email exists
    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const resetToken   = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store hashed token on the user record
    await user.update({
      reset_token:        crypto.createHash("sha256").update(resetToken).digest("hex"),
      reset_token_expires: resetExpires,
    });

    // TODO in production: send email with link like:
    // `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`
    // For now, return it directly so you can test the reset-password endpoint
    logger.info(`[Auth] Password reset token issued for: ${user.email}`);
    res.json({
      success: true,
      message: "If that email exists, a reset link has been sent.",
      // Remove this line in production:
      _dev_reset_token: resetToken,
    });
  } catch (err) {
    logger.error("[Auth/forgot-password]", err);
    res.status(500).json({ success: false, error: "Failed to process request." });
  }
});

// ── POST /api/auth/reset-password ─────────────────────
// Body: { token, new_password }
router.post("/reset-password", async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ success: false, error: "Token and new password are required." });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters." });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const { Op } = require("sequelize");

    const user = await User.findOne({
      where: {
        reset_token:         hashedToken,
        reset_token_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, error: "Reset token is invalid or has expired." });
    }

    const hashed = await bcrypt.hash(new_password, 12);
    await user.update({
      password:            hashed,
      reset_token:         null,
      reset_token_expires: null,
    });

    logger.info(`[Auth] Password reset completed: ${user.email}`);
    res.json({ success: true, message: "Password reset successfully. Please log in." });
  } catch (err) {
    logger.error("[Auth/reset-password]", err);
    res.status(500).json({ success: false, error: "Failed to reset password." });
  }
});

module.exports = router;
