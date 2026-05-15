/**
 * PestEase — /api/alerts
 */

const express = require("express");
const router = express.Router();
const { Alert, Scan } = require("../config/database");
const { authenticate } = require("../middleware/auth");

// GET /api/alerts/:farmId — list alerts
router.get("/:farmId", authenticate, async (req, res) => {
  try {
    const alerts = await Alert.findAll({
      where: { farm_id: req.params.farmId },
      include: [{ model: Scan, attributes: ["disease_label", "confidence", "location"] }],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/alerts/:alertId/read — mark as read
router.patch("/:alertId/read", authenticate, async (req, res) => {
  try {
    await Alert.update({ read: true }, { where: { id: req.params.alertId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
