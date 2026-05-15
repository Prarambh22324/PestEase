#!/usr/bin/env python3
"""
PestEase — Raspberry Pi Rover Orchestrator
Manipal University Jaipur

Runs on Raspberry Pi 4 aboard the rover.
Orchestrates: camera capture → AI inference → spray decision → ESP32 command.

Hardware:
  - Raspberry Pi Camera Module v2 (CSI)
  - Connected to ESP32 via UART (/dev/ttyS0)
  - Internet via WiFi (or ESP32 hotspot)

Flow per scan cycle:
  1. ESP32 tells RPi "scan" via UART
  2. RPi captures image with camera
  3. RPi calls AI inference (local or HTTP)
  4. If infected → RPi sends spray dose to ESP32 via UART
  5. RPi POSTs prediction to Node.js backend
  6. Repeat
"""

import json
import time
import logging
import threading
import signal
import sys
from pathlib import Path

from camera.capture   import CameraCapture
from inference.client import InferenceClient
from sprayer.valve    import SprayController
from navigation.serial_comm import ESP32Comm

# ── Logging ────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s  %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/tmp/pestease_rover.log"),
    ]
)
logger = logging.getLogger("Orchestrator")

# ── Config ─────────────────────────────────────────────
CONFIG = {
    "scan_interval_sec":  3.0,       # Time between scans while rover is moving
    "spray_hold_sec":     2.0,       # Pause rover during spray
    "inference_mode":     "local",   # "local" = run predict.py directly | "http" = call backend
    "inference_url":      "http://localhost:5000/api/predict/base64",
    "model_path":         str(Path(__file__).parent / "../../pestease_ml/models/pestease_disease_detector.keras"),
    "class_names_path":   str(Path(__file__).parent / "../../pestease_ml/models/class_names.json"),
    "serial_port":        "/dev/ttyS0",
    "serial_baud":        115200,
    "min_severity_spray": 1,         # Only spray severity >= 1
    "image_save_dir":     "/tmp/pestease_scans",
    "rover_id":           "ROVER-01",
    "farm_id":            "farm-001",
}


class RoverOrchestrator:
    def __init__(self, config: dict):
        self.config = config
        self.running = False
        self.scan_count = 0
        self.spray_count = 0

        logger.info("Initialising subsystems…")

        # Camera
        self.camera = CameraCapture(
            resolution=(224, 224),
            save_dir=config["image_save_dir"],
        )

        # AI inference
        self.inference = InferenceClient(
            mode=config["inference_mode"],
            model_path=config["model_path"],
            class_names_path=config["class_names_path"],
            http_url=config["inference_url"],
            rover_id=config["rover_id"],
            farm_id=config["farm_id"],
        )

        # Solenoid spray controller
        self.sprayer = SprayController(
            min_severity=config["min_severity_spray"],
        )

        # ESP32 serial comm
        self.esp32 = ESP32Comm(
            port=config["serial_port"],
            baud=config["serial_baud"],
        )

        logger.info("All subsystems ready.")

    def scan_cycle(self):
        """
        One complete scan → infer → spray cycle.
        Called repeatedly while rover is moving through field.
        """
        self.scan_count += 1
        logger.info(f"─── Scan #{self.scan_count} ───────────────────")

        # 1. Capture image
        img_bytes = self.camera.capture()
        if img_bytes is None:
            logger.warning("Camera capture failed — skipping cycle")
            return

        # 2. Run inference
        result = self.inference.predict(img_bytes)
        if result is None:
            logger.warning("Inference failed — skipping cycle")
            return

        severity = result.get("severity_level", 0)
        dose     = result.get("spray_dose_ml_per_m2", 0)
        label    = result.get("disease_label", "Unknown")
        conf     = result.get("confidence", 0)

        logger.info(
            f"  Disease  : {label} ({conf:.1f}%)\n"
            f"  Severity : {severity} — {result.get('severity_label')}\n"
            f"  Dose     : {dose} mL/m²\n"
            f"  Action   : {result.get('action')}"
        )

        # 3. Spray if needed
        if severity >= self.config["min_severity_spray"] and dose > 0:
            logger.info(f"  → Sending spray command to ESP32: {dose} mL/m²")

            # Pause rover movement during spray
            self.esp32.send_command({"cmd": "move", "dir": "stop"})
            time.sleep(0.3)

            # Trigger solenoid via ESP32
            self.esp32.send_command({"cmd": "spray", "dose_ml": dose})
            self.spray_count += 1

            # Wait for spray to finish, then resume
            time.sleep(self.config["spray_hold_sec"] + dose * 0.5)
            self.esp32.send_command({"cmd": "move", "dir": "forward", "speed": 160})

        logger.info(f"  Scan #{self.scan_count} complete. "
                    f"Total sprays today: {self.spray_count}")

    def run(self):
        """Main loop — runs scan cycles continuously."""
        self.running = True
        logger.info(f"Rover started — scan interval: {self.config['scan_interval_sec']}s")

        # Tell ESP32 to start moving
        self.esp32.send_command({"cmd": "move", "dir": "forward", "speed": 160})

        while self.running:
            try:
                self.scan_cycle()
                time.sleep(self.config["scan_interval_sec"])
            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Scan cycle error: {e}", exc_info=True)
                time.sleep(2)

        self.shutdown()

    def shutdown(self):
        self.running = False
        logger.info("Shutting down…")
        self.esp32.send_command({"cmd": "estop"})
        self.camera.release()
        logger.info(f"Session summary — Scans: {self.scan_count}, Sprays: {self.spray_count}")


def main():
    rover = RoverOrchestrator(CONFIG)

    # Graceful shutdown on SIGINT/SIGTERM
    def handle_signal(sig, frame):
        logger.info(f"Signal {sig} received — stopping…")
        rover.running = False

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    rover.run()


if __name__ == "__main__":
    main()
