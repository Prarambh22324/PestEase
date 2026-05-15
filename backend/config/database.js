/**
 * PestEase — Database Configuration
 * ORM: Sequelize | DB: PostgreSQL
 */

const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME || "pestease",
  process.env.DB_USER || "postgres",
  process.env.DB_PASS || "password",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  }
);

// ── Models ──────────────────────────────────────────────

const User = sequelize.define("User", {
  id:       { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:     { type: DataTypes.STRING, allowNull: false },
  email:    { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role:     {
    type: DataTypes.ENUM("farmer", "pathologist", "beekeeper", "admin"),
    defaultValue: "farmer",
  },
  phone:               { type: DataTypes.STRING },
  reset_token:         { type: DataTypes.STRING },        // sha256-hashed
  reset_token_expires: { type: DataTypes.DATE },
}, { tableName: "users", timestamps: true });


const Farm = sequelize.define("Farm", {
  id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:      { type: DataTypes.STRING, allowNull: false },
  location:  { type: DataTypes.JSONB },
  area_ha:   { type: DataTypes.FLOAT },
  crop_type: { type: DataTypes.STRING },
  owner_id:  { type: DataTypes.UUID, references: { model: "users", key: "id" } },
}, { tableName: "farms", timestamps: true });


const Scan = sequelize.define("Scan", {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  farm_id:         { type: DataTypes.UUID, references: { model: "farms", key: "id" } },
  rover_id:        { type: DataTypes.STRING },
  image_url:       { type: DataTypes.STRING },
  location:        { type: DataTypes.JSONB },
  disease_class:   { type: DataTypes.STRING },
  disease_label:   { type: DataTypes.STRING },
  crop_type:       { type: DataTypes.STRING },
  confidence:      { type: DataTypes.FLOAT },
  severity_level:  { type: DataTypes.INTEGER },
  severity_label:  { type: DataTypes.STRING },
  spray_dose_ml:   { type: DataTypes.INTEGER },
  spray_triggered: { type: DataTypes.BOOLEAN, defaultValue: false },
  expert_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  expert_notes:    { type: DataTypes.TEXT },
}, { tableName: "scans", timestamps: true });


const Alert = sequelize.define("Alert", {
  id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  farm_id:   { type: DataTypes.UUID, references: { model: "farms", key: "id" } },
  scan_id:   { type: DataTypes.UUID, references: { model: "scans", key: "id" } },
  type:      { type: DataTypes.ENUM("disease", "spray", "system", "bee_warning") },
  severity:  { type: DataTypes.INTEGER },
  message:   { type: DataTypes.TEXT },
  read:      { type: DataTypes.BOOLEAN, defaultValue: false },
  sent_to:   { type: DataTypes.ARRAY(DataTypes.UUID) },
}, { tableName: "alerts", timestamps: true });


const RoverLog = sequelize.define("RoverLog", {
  id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  rover_id:  { type: DataTypes.STRING, allowNull: false },
  farm_id:   { type: DataTypes.UUID },
  event:     { type: DataTypes.STRING },
  payload:   { type: DataTypes.JSONB },
  location:  { type: DataTypes.JSONB },
}, { tableName: "rover_logs", timestamps: true });


// ── Associations ────────────────────────────────────────
User.hasMany(Farm, { foreignKey: "owner_id" });
Farm.belongsTo(User, { foreignKey: "owner_id" });

Farm.hasMany(Scan,  { foreignKey: "farm_id" });
Scan.belongsTo(Farm, { foreignKey: "farm_id" });

Farm.hasMany(Alert, { foreignKey: "farm_id" });
Alert.belongsTo(Farm, { foreignKey: "farm_id" });

Scan.hasOne(Alert,  { foreignKey: "scan_id" });
Alert.belongsTo(Scan, { foreignKey: "scan_id" });

module.exports = { sequelize, User, Farm, Scan, Alert, RoverLog };
