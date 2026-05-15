/**
 * PestEase — Express Server
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const { sequelize } = require("./config/database");
const logger = require("./config/logger");
const errorHandler = require("./middleware/errorHandler");

// Routes
const authRoutes = require("./routes/auth");
const predictRoutes = require("./routes/predict");
const roverRoutes = require("./routes/rover");
const alertRoutes = require("./routes/alerts");
const farmRoutes = require("./routes/farm");

const app = express();
const server = http.createServer(app);

// ── WebSocket (real-time rover + alerts) ──────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
app.set("io", io);                  // accessible in routes via req.app.get("io")

io.on("connection", (socket) => {
  logger.info(`WS client connected: ${socket.id}`);

  socket.on("join_farm", (farmId) => {
    socket.join(`farm_${farmId}`);
    logger.info(`Socket ${socket.id} joined farm room: farm_${farmId}`);
  });

  socket.on("disconnect", () => {
    logger.info(`WS client disconnected: ${socket.id}`);
  });
});

// ── Global Middleware ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,      // allow WS connections from dashboard
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));       // Allow base64 image payloads
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Rate Limiting ──────────────────────────────────────
// ── Rate Limiting ──────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Please try again later." },
  skip: (req) => req.path.startsWith("/auth"), // ← exclude auth routes from global limiter
});
app.use("/api/", limiter);

// Auth-specific limiter — generous for dev, tighten in prod
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 20 : 1000,
  message: { error: "Too many login attempts. Please try again later." },
});
app.use("/api/auth", authLimiter);

// Stricter limit on predict (AI inference is expensive)
const predictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Prediction rate limit exceeded. Max 20/min." },
});
app.use("/api/predict", predictLimiter);

// ── Routes ─────────────────────────────────────────────
app.use("/api/auth",    authRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/rover",   roverRoutes);
app.use("/api/alerts",  alertRoutes);
app.use("/api/farm",    farmRoutes);

// ── Health Check ───────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "PestEase Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ── 404 Handler ────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global Error Handler ───────────────────────────────
app.use(errorHandler);

// ── Start Server ───────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    logger.info("✓ PostgreSQL connected");

    await sequelize.sync({ alter: true });
    logger.info("✓ Database models synced");

    server.listen(PORT, () => {
      logger.info(`✓ PestEase backend running on port ${PORT}`);
      logger.info(`  Health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
