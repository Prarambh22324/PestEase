/**
 * PestEase — /api/rover
 * Handles all communication with the physical rover (ESP32 + Raspberry Pi)
 *
 * Rover → Server:  POST telemetry, POST scan complete
 * Server → Rover:  GET next command (polling), WebSocket push
 */

const express = require("express");
const router = express.Router();
const { RoverLog, Farm, Scan } = require("../config/database");
const { authenticate, authenticateRover } = require("../middleware/auth");
const logger = require("../config/logger");

// ── POST /api/rover/telemetry ──────────────────────────
router.post("/telemetry", authenticateRover, async (req, res) => {
  try {
    const { rover_id, farm_id, lat, lng, battery_pct, temp_c, humidity_pct, soil_moisture } = req.body;

    const log = await RoverLog.create({
      rover_id,
      farm_id,
      event: "telemetry",
      location: { lat, lng },
      payload: { battery_pct, temp_c, humidity_pct, soil_moisture },
    });

    const io = req.app.get("io");
    io.to(`farm_${farm_id}`).emit("rover_telemetry", {
      rover_id,
      location: { lat, lng },
      battery_pct,
      sensors: { temp_c, humidity_pct, soil_moisture },
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, log_id: log.id });
  } catch (err) {
    logger.error("[Rover/telemetry]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/rover/spray-complete ────────────────────
router.post("/spray-complete", authenticateRover, async (req, res) => {
  try {
    const { rover_id, scan_id, dose_dispensed_ml, duration_sec } = req.body;

    if (scan_id) {
      await Scan.update({ spray_triggered: true }, { where: { id: scan_id } });
    }

    await RoverLog.create({
      rover_id,
      event: "spray_complete",
      payload: { scan_id, dose_dispensed_ml, duration_sec },
    });

    const io = req.app.get("io");
    const scan = scan_id ? await Scan.findByPk(scan_id) : null;
    if (scan?.farm_id) {
      io.to(`farm_${scan.farm_id}`).emit("spray_complete", {
        rover_id,
        scan_id,
        dose_dispensed_ml,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/rover/command/:roverId ───────────────────
router.get("/command/:roverId", authenticateRover, async (req, res) => {
  try {
    res.json({
      command: "scan",
      payload: { interval_m: 2, camera_mode: "auto" },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/rover/manual-spray ──────────────────────
/**
 * Farmer manually triggers spray from dashboard.
 * Body: { farm_id, dose_ml, disease, severity, location }
 * rover_id is optional — defaults to "ROVER-01"
 */
router.post("/manual-spray", authenticate, async (req, res) => {
  try {
    const {
      farm_id = "farm-001",
      rover_id = "ROVER-01",
      dose_ml,
      disease,
      severity,
      location: target_location,
      target_location: target_location_alt,  // accept both key names
    } = req.body;

    const resolvedLocation = target_location || target_location_alt || "Dashboard override";
    const resolvedDose = parseFloat(dose_ml) || 0;

    // Push command to rover via WebSocket
    const io = req.app.get("io");
    io.to(`farm_${farm_id}`).emit("manual_command", {
      command: "spray",
      rover_id,
      payload: {
        target_location: resolvedLocation,
        dose_ml: resolvedDose,
        disease,
        severity,
      },
      timestamp: new Date().toISOString(),
    });

    // Best-effort DB log — don't crash the response if this fails
    try {
      await RoverLog.create({
        rover_id,
        farm_id,
        event: "manual_spray_command",
        payload: {
          target_location: resolvedLocation,
          dose_ml: resolvedDose,
          disease,
          severity,
          issued_by: req.user.id,
        },
      });
    } catch (dbErr) {
      // Log the DB error but still return success — the WS command was already sent
      logger.warn("[Rover/manual-spray] DB log failed (non-fatal):", dbErr.message);
    }

    logger.info(`[Rover] Manual spray → rover ${rover_id}, farm ${farm_id}, dose ${resolvedDose} mL`);
    res.json({ success: true, message: "Spray command sent to rover." });
  } catch (err) {
    logger.error("[Rover/manual-spray]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/rover/logs/:farmId ────────────────────────
router.get("/logs/:farmId", authenticate, async (req, res) => {
  try {
    const logs = await RoverLog.findAll({
      where: { farm_id: req.params.farmId },
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
