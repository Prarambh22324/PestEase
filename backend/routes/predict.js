/**
 * PestEase — /api/predict
 * Accepts image upload → calls Python inference engine → returns disease prediction
 *
 * Two modes (set via env var INFERENCE_MODE):
 *   "subprocess" — spawns Python predict.py directly (good for single-server RPi setup)
 *   "http"       — calls a separate Python Flask/FastAPI inference microservice (good for AWS)
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { spawn } = require("child_process");
const axios = require("axios");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const { Scan, Alert, Farm } = require("../config/database");
const { authenticate } = require("../middleware/auth");
const logger = require("../config/logger");

// ── Multer (image upload) ──────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },   // 8 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG/PNG images are accepted."));
  },
});

// ── Inference helpers ──────────────────────────────────
async function runSubprocessInference(imageBuffer) {
  return new Promise((resolve, reject) => {
    const b64 = imageBuffer.toString("base64");

    // Call Python predict.py with base64 image via stdin
    const py = spawn("python3", [
      path.resolve(__dirname, "../../pestease_ml/predict.py"),
      "--stdin-b64",
    ]);

    let output = "";
    let errOutput = "";

    py.stdout.on("data", (d) => { output += d.toString(); });
    py.stderr.on("data", (d) => { errOutput += d.toString(); });

    py.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python inference failed: ${errOutput}`));
      }
      try {
        // predict.py prints JSON result to stdout when called with --stdin-b64
        const lines = output.trim().split("\n");
        const jsonLine = lines[lines.length - 1];
        resolve(JSON.parse(jsonLine));
      } catch (e) {
        reject(new Error("Failed to parse inference output: " + output));
      }
    });

    py.stdin.write(b64);
    py.stdin.end();
  });
}

async function runHttpInference(imageBuffer) {
  const b64 = imageBuffer.toString("base64");
  const response = await axios.post(
    process.env.INFERENCE_SERVICE_URL || "http://localhost:8000/predict",
    { image_base64: b64 },
    { timeout: 30000 }
  );
  return response.data;
}

async function runInference(imageBuffer) {
  const mode = process.env.INFERENCE_MODE || "http";
  if (mode === "subprocess") return runSubprocessInference(imageBuffer);
  return runHttpInference(imageBuffer);
}

// ── POST /api/predict ──────────────────────────────────
/**
 * @route   POST /api/predict
 * @desc    Upload a plant image → get disease + severity prediction
 * @access  Protected (JWT)
 * @body    multipart: image (file), farm_id (string), rover_id (string), lat, lng
 */
router.post("/", authenticate, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded." });
    }

    const { farm_id, rover_id, lat, lng } = req.body;

    // Resize to 224×224 before inference (saves bandwidth + speeds up Python)
    const resized = await sharp(req.file.buffer)
      .resize(224, 224)
      .jpeg({ quality: 90 })
      .toBuffer();

    logger.info(`[Predict] Running inference for farm=${farm_id} rover=${rover_id}`);
    const prediction = await runInference(resized);

    // ── Save scan to DB ──────────────────────────────
    let scan = null;
    if (farm_id) {
      scan = await Scan.create({
        farm_id,
        rover_id: rover_id || "manual",
        location: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null,
        disease_class:  prediction.disease_class,
        disease_label:  prediction.disease_label,
        crop_type:      prediction.crop_type,
        confidence:     prediction.confidence,
        severity_level: prediction.severity_level,
        severity_label: prediction.severity_label,
        spray_dose_ml:  prediction.spray_dose_ml_per_m2,
        spray_triggered: prediction.severity_level >= 1,
      });

      // ── Fire alert if severity ≥ 2 ───────────────
      if (prediction.severity_level >= 2) {
        const alert = await Alert.create({
          farm_id,
          scan_id:  scan.id,
          type:     "disease",
          severity: prediction.severity_level,
          message:  prediction.action,
        });

        // Push real-time alert via Socket.IO
        const io = req.app.get("io");
        io.to(`farm_${farm_id}`).emit("new_alert", {
          alert_id:      alert.id,
          severity:      prediction.severity_level,
          disease_label: prediction.disease_label,
          message:       prediction.action,
          location:      { lat, lng },
          timestamp:     new Date().toISOString(),
        });

        logger.warn(`[Alert] Severity ${prediction.severity_level} detected — farm ${farm_id}`);
      }
    }

    res.json({
      success: true,
      scan_id: scan?.id || null,
      ...prediction,
    });

  } catch (err) {
    logger.error("[Predict] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/predict/base64 ───────────────────────────
/**
 * @route   POST /api/predict/base64
 * @desc    Base64 image prediction (used by RPi when multipart not available)
 * @access  Protected (JWT)
 */
router.post("/base64", authenticate, async (req, res) => {
  try {
    const { image_base64, farm_id, rover_id, lat, lng } = req.body;

    if (!image_base64) {
      return res.status(400).json({ success: false, error: "Missing image_base64." });
    }

    const imageBuffer = Buffer.from(image_base64, "base64");
    const resized = await sharp(imageBuffer)
      .resize(224, 224)
      .jpeg({ quality: 90 })
      .toBuffer();

    const prediction = await runInference(resized);

    res.json({ success: true, ...prediction });
  } catch (err) {
    logger.error("[Predict/base64] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/predict/history/:farmId ──────────────────
/**
 * @route   GET /api/predict/history/:farmId
 * @desc    Get all scans for a farm (with pagination)
 * @access  Protected (JWT)
 */
router.get("/history/:farmId", authenticate, async (req, res) => {
  try {
    const { farmId } = req.params;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await Scan.findAndCountAll({
      where: { farm_id: farmId },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    res.json({
      success: true,
      total: count,
      page,
      pages: Math.ceil(count / limit),
      scans: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/predict/:id/verify
router.patch("/:id/verify", authenticate, async (req, res) => {
  try {
    const { expert_verified, expert_notes } = req.body;
    await Scan.update({ expert_verified, expert_notes }, { where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
