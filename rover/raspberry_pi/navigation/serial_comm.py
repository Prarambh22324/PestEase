"""
PestEase — ESP32 Serial Communication
Sends JSON commands to ESP32 over UART.
Receives telemetry/status JSON from ESP32.

Wiring:
  RPi TX (GPIO14 / pin 8)  →  ESP32 RX (GPIO3)
  RPi RX (GPIO15 / pin 10) →  ESP32 TX (GPIO1)
  GND ↔ GND

Note: Enable serial on RPi via raspi-config → Interface Options → Serial
      Disable login shell, enable hardware serial port.
"""

import json
import time
import logging
import threading
from typing import Optional

logger = logging.getLogger("ESP32Comm")

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    logger.warning("pyserial not installed — serial comms disabled (run: pip install pyserial)")


class ESP32Comm:
    def __init__(self, port: str = "/dev/ttyS0", baud: int = 115200):
        self.port = port
        self.baud = baud
        self._ser = None
        self._lock = threading.Lock()
        self._connect()

    def _connect(self):
        if not SERIAL_AVAILABLE:
            logger.warning("pyserial unavailable — ESP32 commands will be logged only")
            return

        try:
            self._ser = serial.Serial(self.port, self.baud, timeout=1.0)
            time.sleep(0.5)   # Let ESP32 boot
            logger.info(f"ESP32 serial connected: {self.port} @ {self.baud}")
        except serial.SerialException as e:
            logger.error(f"Serial open failed ({self.port}): {e}")
            logger.warning("Running in mock mode — commands logged only")
            self._ser = None

    def send_command(self, command: dict) -> bool:
        """
        Send a JSON command to ESP32.
        ESP32 reads newline-delimited JSON from Serial.

        Examples:
          {"cmd": "move", "dir": "forward", "speed": 160}
          {"cmd": "spray", "dose_ml": 30}
          {"cmd": "stop"}
          {"cmd": "estop"}
        """
        payload = json.dumps(command) + "\n"
        logger.info(f"→ ESP32: {payload.strip()}")

        if self._ser is None:
            return False   # Mock mode

        with self._lock:
            try:
                self._ser.write(payload.encode("utf-8"))
                self._ser.flush()
                return True
            except Exception as e:
                logger.error(f"Serial write error: {e}")
                self._reconnect()
                return False

    def read_line(self) -> Optional[dict]:
        """
        Read one line of JSON from ESP32 (non-blocking).
        Returns parsed dict or None.
        """
        if self._ser is None or not self._ser.in_waiting:
            return None
        try:
            line = self._ser.readline().decode("utf-8").strip()
            if line:
                return json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.debug(f"Serial read parse error: {e}")
        except Exception as e:
            logger.error(f"Serial read error: {e}")
        return None

    def _reconnect(self):
        logger.warning("Attempting serial reconnect…")
        try:
            if self._ser:
                self._ser.close()
            time.sleep(1)
            self._connect()
        except Exception as e:
            logger.error(f"Reconnect failed: {e}")

    def close(self):
        if self._ser and self._ser.is_open:
            self._ser.close()
            logger.info("Serial port closed.")
