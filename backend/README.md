# 🌿 PestEase — Node.js Backend

---

## Stack
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL (via Sequelize ORM)
- **Real-time:** Socket.IO (rover telemetry + live alerts)
- **Auth:** JWT (users) + API key (rovers)
- **Image processing:** Sharp (resize before inference)

---

## Project Structure

```
backend/
├── server.js                   # Entry point — Express + Socket.IO
├── package.json
├── .env.example                # Copy to .env
├── config/
│   ├── database.js             # Sequelize models (User, Farm, Scan, Alert, RoverLog)
│   └── logger.js               # Winston logger
├── middleware/
│   ├── auth.js                 # JWT + rover API key auth
│   └── errorHandler.js         # Global error handler
└── routes/
    ├── auth.js                 # POST /api/auth/register, login, GET /me
    ├── predict.js              # POST /api/predict (image → disease JSON)
    ├── rover.js                # Rover telemetry, spray events, commands
    ├── alerts.js               # Farm alerts
    └── farm.js                 # Farm CRUD + stats
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 3. Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE pestease;"

# 4. Start server (dev mode with auto-reload)
npm run dev

# 5. Start server (production)
npm start
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register user (farmer/pathologist/beekeeper/admin) |
| POST | `/api/auth/login` | Login → returns JWT token |
| GET | `/api/auth/me` | Get current user info |

### Prediction
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/predict` | Upload image → disease + severity + spray dose |
| POST | `/api/predict/base64` | Same but accepts base64 (for RPi) |
| GET | `/api/predict/history/:farmId` | Paginated scan history |

### Rover
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rover/telemetry` | Rover posts GPS + sensor data every 5s |
| POST | `/api/rover/spray-complete` | Rover confirms spray finished |
| GET | `/api/rover/command/:roverId` | Rover polls for next command |
| POST | `/api/rover/manual-spray` | Farmer triggers manual spray from dashboard |
| GET | `/api/rover/logs/:farmId` | View rover event logs |

### Farm & Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/farm` | Create farm |
| GET | `/api/farm` | List my farms |
| GET | `/api/farm/:id/stats` | Dashboard stats (scan counts, infection rate) |
| GET | `/api/alerts/:farmId` | List alerts for a farm |
| PATCH | `/api/alerts/:alertId/read` | Mark alert as read |

---

## WebSocket Events (Socket.IO)

### Client → Server
```js
socket.emit("join_farm", farmId);   // Subscribe to a farm's real-time feed
```

### Server → Client
```js
socket.on("rover_telemetry", ({ rover_id, location, battery_pct, sensors }) => { ... });
socket.on("new_alert",       ({ alert_id, severity, disease_label, message, location }) => { ... });
socket.on("spray_complete",  ({ rover_id, scan_id, dose_dispensed_ml }) => { ... });
socket.on("manual_command",  ({ command, rover_id, payload }) => { ... });
```

---

## AI Inference Integration

The `/api/predict` route supports two modes (set `INFERENCE_MODE` in `.env`):

**`http` mode (recommended for production):**
- Runs a separate Python FastAPI server (`python pestease_ml/inference_server.py`)
- Node.js calls it via HTTP: `POST http://localhost:8000/predict`
- Better isolation, easier to scale independently on AWS

**`subprocess` mode (single-device / RPi):**
- Node.js spawns `python3 pestease_ml/predict.py --stdin-b64` directly
- Good for offline/embedded deployment on a single Raspberry Pi

---

## Database Models

| Model | Key Fields |
|-------|-----------|
| `User` | id, name, email, role (farmer/pathologist/beekeeper/admin) |
| `Farm` | id, name, location (GeoJSON), area_ha, crop_type, owner_id |
| `Scan` | id, farm_id, disease_class, severity_level (0-3), spray_dose_ml |
| `Alert` | id, farm_id, scan_id, type, severity, message, read |
| `RoverLog` | id, rover_id, event, location, payload (JSONB) |

---

*Next: React Dashboard → IoT Rover Firmware*  
*Team ByteBrawlers | SIH 2025*
