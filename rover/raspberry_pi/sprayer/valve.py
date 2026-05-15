"""
PestEase — Spray Controller
Maps AI severity level → spray dose → ESP32 solenoid command.

Dose calibration:
  Assumes nozzle flow rate ≈ 1 mL/second at standard operating pressure.
  Adjust FLOW_RATE_ML_PER_SEC to match your actual nozzle.
"""

import logging

logger = logging.getLogger("Sprayer")

# Dose map: severity_level → mL/m²
DOSE_MAP = {
    0: 0,    # Healthy  — no spray
    1: 5,    # Mild     — light dose
    2: 15,   # Moderate — standard dose
    3: 30,   # Severe   — full dose
}

FLOW_RATE_ML_PER_SEC = 1.0   # Calibrate for your nozzle


class SprayController:
    def __init__(self, min_severity: int = 1):
        self.min_severity = min_severity
        self.total_ml_dispensed = 0.0
        self.spray_count = 0

    def should_spray(self, severity_level: int) -> bool:
        return severity_level >= self.min_severity

    def get_dose_ml(self, severity_level: int) -> int:
        return DOSE_MAP.get(severity_level, 0)

    def get_valve_duration_ms(self, dose_ml: int) -> int:
        """Convert dose in mL to solenoid open time in milliseconds."""
        return int((dose_ml / FLOW_RATE_ML_PER_SEC) * 1000)

    def record_spray(self, dose_ml: int):
        self.total_ml_dispensed += dose_ml
        self.spray_count += 1
        logger.info(
            f"Spray recorded: {dose_ml} mL | "
            f"Total today: {self.total_ml_dispensed:.0f} mL | "
            f"Count: {self.spray_count}"
        )

    def get_session_stats(self) -> dict:
        return {
            "total_ml_dispensed": self.total_ml_dispensed,
            "spray_count": self.spray_count,
        }
