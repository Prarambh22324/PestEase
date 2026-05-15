"""
PestEase — Row Navigation
Implements a simple lawnmower (boustrophedon) row-following pattern.
The rover traverses field rows, reversing direction at each end.

In a production system, integrate with GPS waypoints for precise navigation.
This module generates motor commands for the ESP32.
"""

import logging
import time
from enum import Enum
from dataclasses import dataclass

logger = logging.getLogger("Navigation")


class Direction(Enum):
    FORWARD  = "forward"
    BACKWARD = "backward"
    LEFT     = "left"
    RIGHT    = "right"
    STOP     = "stop"


@dataclass
class FieldConfig:
    rows:         int   = 10     # Total crop rows
    row_length_m: float = 20.0   # Length of each row in metres
    row_spacing_m: float = 0.8   # Distance between rows
    speed_ms:     float = 0.4    # Rover speed in m/s
    turn_time_sec: float = 3.0   # Time to execute a 180° turn


class RowNavigator:
    """
    Drives the rover in a boustrophedon (back-and-forth) pattern.
    Yields motor commands that are sent to ESP32 via serial.
    """

    def __init__(self, field: FieldConfig, esp32_comm):
        self.field = field
        self.esp32 = esp32_comm
        self.current_row = 0
        self.direction = 1        # +1 = forward, -1 = backward
        self.running = False
        self._scan_callback = None   # Called every scan_interval metres

    def set_scan_callback(self, cb):
        """Register function to call periodically for plant scanning."""
        self._scan_callback = cb

    def _row_duration_sec(self) -> float:
        return self.field.row_length_m / self.field.speed_ms

    def _move(self, direction: Direction, speed: int = 160):
        self.esp32.send_command({
            "cmd": "move",
            "dir": direction.value,
            "speed": speed,
        })

    def _stop(self):
        self.esp32.send_command({"cmd": "move", "dir": "stop"})

    def _turn_to_next_row(self):
        """Execute 90°-forward-90° to move to the adjacent row."""
        logger.info(f"  Turning to row {self.current_row + 1}…")
        self._stop()
        time.sleep(0.3)

        # Turn 90°
        self._move(Direction.RIGHT, 150)
        time.sleep(self.field.turn_time_sec / 2)

        # Move one row spacing
        row_shift_time = self.field.row_spacing_m / self.field.speed_ms
        self._move(Direction.FORWARD, 160)
        time.sleep(row_shift_time)

        # Turn 90° again to face the next row
        self._move(Direction.RIGHT, 150)
        time.sleep(self.field.turn_time_sec / 2)
        self._stop()

    def navigate(self):
        """
        Main navigation loop. Call in a background thread.
        Traverses all rows and stops when field is complete.
        """
        self.running = True
        row_duration = self._row_duration_sec()

        logger.info(
            f"Navigation start — {self.field.rows} rows × {self.field.row_length_m}m "
            f"@ {self.field.speed_ms} m/s"
        )

        for row in range(self.field.rows):
            if not self.running:
                break

            self.current_row = row
            logger.info(f"Row {row + 1}/{self.field.rows} — {'→' if self.direction > 0 else '←'}")

            # Start moving along the row
            self._move(Direction.FORWARD, 160)
            row_start = time.time()

            # Scan periodically while traversing the row
            scan_interval = 3.0   # seconds (matches CONFIG["scan_interval_sec"])
            last_scan = row_start

            while time.time() - row_start < row_duration and self.running:
                now = time.time()
                if self._scan_callback and now - last_scan >= scan_interval:
                    self._scan_callback()
                    last_scan = now
                time.sleep(0.1)

            if not self.running:
                break

            # End of row — turn to next (unless last row)
            if row < self.field.rows - 1:
                self._turn_to_next_row()
                self.direction *= -1    # Reverse direction

        self._stop()
        self.running = False
        logger.info("Field traversal complete.")

    def emergency_stop(self):
        self.running = False
        self.esp32.send_command({"cmd": "estop"})
        logger.warning("EMERGENCY STOP triggered!")
