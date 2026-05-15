# 🤖 FarmEase — IoT Rover Firmware
### SIH 2025 | Team ByteBrawlers | PS-25015

---

## Overview

The FarmEase rover is a two-wheeled autonomous vehicle that traverses crop rows,
captures plant images, runs AI disease detection, and triggers precise pesticide
spraying — all without human intervention.

**Brains:** Raspberry Pi 4 (AI + orchestration)
**Motor/IO controller:** ESP32 (motors, solenoid, GPS, sensors)
**Communication:** UART between RPi ↔ ESP32, WiFi to cloud backend

---

## Hardware Bill of Materials

| Component | Model | Qty | Purpose |
|-----------|-------|-----|---------|
| Single-board computer | Raspberry Pi 4 (4GB) | 1 | AI inference + orchestration |
| Microcontroller | ESP32-WROOM-32 | 1 | Motor control + sensors + WiFi |
| Camera | RPi Camera Module v2 | 1 | Plant image capture |
| Motor driver | L298N | 1 | Drive 2× DC motors |
| DC Motors | 12V, 100RPM with encoder | 2 | Wheel drive |
| Solenoid valve | 12V, NC, 1/4" | 1 | Pesticide nozzle |
| MOSFET | IRLZ44N | 1 | Solenoid gate driver |
| GPS module | NEO-6M | 1 | Field position tracking |
| Temp/humidity | DHT11 | 1 | Environment sensing |
| Soil moisture | Capacitive v1.2 | 1 | Soil monitoring |
| Battery | 3S LiPo 5000mAh | 1 | Power supply |
| Voltage regulator | Buck converter 12V→5V/3A | 1 | Power RPi + ESP32 |

---

## Wiring Diagram

```
                    ┌─────────────────────┐
                    │   Raspberry Pi 4    │
                    │                     │
  RPi Camera ──────►│ CSI Port            │
  GPIO14 (TX) ─────►│──────────────────── │──► ESP32 GPIO3 (RX)
  GPIO15 (RX) ◄─────│──────────────────── │◄── ESP32 GPIO1 (TX)
  GND ───────────── │──────────────────── │─── ESP32 GND
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │       ESP32         │
                    │                     │
  GPIO25,26,27 ────►│──► L298N ──► Motor A (Left)
  GPIO14,12,13 ────►│──► L298N ──► Motor B (Right)
  GPIO33 ──────────►│──► MOSFET ──► Solenoid Valve
  GPIO4 ◄───────── │◄── DHT11
  GPIO34 ◄───────── │◄── Soil Moisture (ADC)
  GPIO16,17 ◄──────►│◄──► NEO-6M GPS (UART2)
  GPIO35 ◄───────── │◄── Battery voltage divider (ADC)
                    └─────────────────────┘

Power:
  LiPo 12V ──► Buck converter ──► 5V ──► RPi (USB-C)
  LiPo 12V ──────────────────────────► L298N VIN + Solenoid
  L298N 5V out ──────────────────────► ESP32 VIN
```

---

## Project Structure

```
farmease_rover/
├── esp32/
│   ├── main.ino              # Arduino sketch (upload to ESP32)
│   └── platformio.ini        # PlatformIO config (alternative to Arduino IDE)
│
└── raspberry_pi/
    ├── main.py               # Main orchestrator (run this on RPi)
    ├── requirements_rpi.txt  # Python dependencies
    ├── camera/
    │   └── capture.py        # RPi Camera Module v2 + OpenCV fallback
    ├── inference/
    │   └── client.py         # Local (TF) or HTTP inference
    ├── sprayer/
    │   └── valve.py          # Spray dose calculations
    └── navigation/
        ├── serial_comm.py    # RPi ↔ ESP32 UART commands
        └── row_navigator.py  # Boustrophedon row-traversal algorithm
```

---

## Setup

### ESP32

**Using Arduino IDE:**
1. Install ESP32 board support: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2. Install libraries: ArduinoJson, DHT sensor library, TinyGPS++
3. Open `esp32/main.ino`
4. Set `WIFI_SSID`, `WIFI_PASS`, `BACKEND_URL`, `ROVER_API_KEY` at top of file
5. Select board: `ESP32 Dev Module` → Upload

**Using PlatformIO (recommended):**
```bash
cd esp32
pio run --target upload
pio device monitor    # Serial monitor
```

### Raspberry Pi

```bash
# 1. Enable camera & serial
sudo raspi-config
#   → Interface Options → Camera → Enable
#   → Interface Options → Serial → Disable login shell, Enable hardware port

# 2. Install Python deps
pip install -r raspberry_pi/requirements_rpi.txt --break-system-packages

# 3. Configure (edit main.py CONFIG dict):
#    - Set WIFI credentials on ESP32
#    - Set backend URL
#    - Set inference mode ("local" or "http")

# 4. Run
cd raspberry_pi
python3 main.py

# 5. Run as service (auto-start on boot)
sudo cp farmease.service /etc/systemd/system/
sudo systemctl enable farmease
sudo systemctl start farmease
```

---

## Communication Protocol

### RPi → ESP32 (UART JSON commands)
```json
{ "cmd": "move",  "dir": "forward",  "speed": 160 }
{ "cmd": "move",  "dir": "stop" }
{ "cmd": "spray", "dose_ml": 30 }
{ "cmd": "scan" }
{ "cmd": "estop" }
```

### ESP32 → Node.js Backend (HTTP)
```
POST /api/rover/telemetry     → GPS + sensor data every 5s
POST /api/rover/spray-complete → After each spray event
GET  /api/rover/command/:id   → Poll for next command
```

### Spray Dose Map
| Severity | Label     | Dose    | Solenoid Open |
|----------|-----------|---------|----------------|
| 0        | Healthy   | 0 mL    | No spray       |
| 1        | Mild      | 5 mL    | ~5 seconds     |
| 2        | Moderate  | 15 mL   | ~15 seconds    |
| 3        | Severe    | 30 mL   | ~30 seconds    |

---

## Scan Cycle (Per Plant)

```
Rover moving along row
        ↓
[Every 3 seconds]
        ↓
RPi Camera captures 224×224 JPEG
        ↓
AI Model (MobileNetV2) → disease class + severity
        ↓
severity == 0?  ─── YES ──► No action, continue moving
        │
       NO
        ↓
ESP32: STOP motors
        ↓
ESP32: OPEN solenoid valve (dose_ml seconds)
        ↓
Backend: POST /api/predict (scan saved to DB)
        ↓
Socket.IO: alert pushed to farmer dashboard
        ↓
ESP32: RESUME motors → next plant
```

---

*Team ByteBrawlers | SIH 2025 | Problem Statement 25015*
