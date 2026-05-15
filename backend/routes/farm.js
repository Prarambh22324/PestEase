/**
 * PestEase — /api/farm
 */

const express = require("express");
const router = express.Router();
const { Farm, Scan } = require("../config/database");
const { authenticate } = require("../middleware/auth");

// POST /api/farm — create farm
router.post("/", authenticate, async (req, res) => {
  try {
    const { name, location, area_ha, crop_type } = req.body;
    const farm = await Farm.create({ name, location, area_ha, crop_type, owner_id: req.user.id });
    res.status(201).json({ success: true, farm });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/farm — list my farms
router.get("/", authenticate, async (req, res) => {
  try {
    const farms = await Farm.findAll({ where: { owner_id: req.user.id } });
    res.json({ success: true, farms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/farm/:id/stats — dashboard summary
router.get("/:id/stats", authenticate, async (req, res) => {
  try {
    const scans = await Scan.findAll({ where: { farm_id: req.params.id } });
    const total    = scans.length;
    const infected = scans.filter((s) => s.severity_level > 0).length;
    const severe   = scans.filter((s) => s.severity_level >= 3).length;
    const totalDose = scans.reduce((acc, s) => acc + (s.spray_dose_ml || 0), 0);

    res.json({
      success: true,
      stats: {
        total_scans:        total,
        infected_count:     infected,
        healthy_count:      total - infected,
        severe_count:       severe,
        infection_rate_pct: total ? ((infected / total) * 100).toFixed(1) : 0,
        total_spray_ml:     totalDose,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
