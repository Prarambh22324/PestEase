/*
 * PestEase — ESP32 Rover Firmware
 * Manipal University Jaipur
 *
 * Responsibilities:
 *   - Drive DC motors (L298N motor driver)
 *   - Trigger solenoid valve (pesticide nozzle)
 *   - Read DHT11 (temp + humidity) + soil moisture sensor
 *   - Read GPS (NEO-6M via UART)
 *   - Communicate with Raspberry Pi over UART (Serial2)
 *   - Send telemetry to Node.js backend over WiFi (HTTP)
 *   - Receive spray commands from RPi
 *
 * Pin Map:
 *   Motor A (Left)   : IN1=25, IN2=26, ENA=27 (PWM)
 *   Motor B (Right)  : IN3=14, IN4=12, ENB=13 (PWM)
 *   Solenoid Valve   : GPIO 33 (via MOSFET)
 *   DHT11 Sensor     : GPIO 4
 *   Soil Moisture    : GPIO 34 (ADC)
 *   GPS (NEO-6M)     : RX2=16, TX2=17
 *   RPi UART         : RX0=3, TX0=1 (Serial)
 *   Status LED       : GPIO 2
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

// ── Config ─────────────────────────────────────────────
#define WIFI_SSID        "PestEase_AP"
#define WIFI_PASS        "pestease2025"
#define BACKEND_URL      "http://192.168.1.100:5000"
#define ROVER_API_KEY    "rover_secret_key_change_this"
#define ROVER_ID         "ROVER-01"
#define FARM_ID          "farm-001"
#define TELEMETRY_MS     5000    // Send telemetry every 5s
#define COMMAND_POLL_MS  2000    // Poll for commands every 2s

// ── Pin Definitions ────────────────────────────────────
// Motors
#define IN1  25
#define IN2  26
#define ENA  27
#define IN3  14
#define IN4  12
#define ENB  13

// Solenoid
#define SOLENOID_PIN  33

// Sensors
#define DHT_PIN       4
#define DHT_TYPE      DHT11
#define SOIL_PIN      34

// Status LED
#define LED_PIN       2

// ── Objects ────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);   // UART2 for GPS

// ── State ──────────────────────────────────────────────
struct RoverState {
  float   lat           = 0.0;
  float   lng           = 0.0;
  float   temp_c        = 0.0;
  float   humidity_pct  = 0.0;
  int     soil_moisture = 0;
  int     battery_pct   = 100;
  float   speed_ms      = 0.0;
  bool    spraying      = false;
  bool    moving        = false;
  String  command       = "idle";
};

RoverState state;
unsigned long lastTelemetry    = 0;
unsigned long lastCommandPoll  = 0;
unsigned long sprayEndTime     = 0;

// ── Motor control ──────────────────────────────────────
void motorsInit() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(ENA, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT); pinMode(ENB, OUTPUT);
  analogWriteResolution(8);
}

void setMotors(int leftSpeed, int rightSpeed) {
  // Left motor
  if (leftSpeed >= 0) {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    leftSpeed = -leftSpeed;
  }
  analogWrite(ENA, constrain(leftSpeed, 0, 255));

  // Right motor
  if (rightSpeed >= 0) {
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
    rightSpeed = -rightSpeed;
  }
  analogWrite(ENB, constrain(rightSpeed, 0, 255));

  state.moving = (leftSpeed > 0 || rightSpeed > 0);
  state.speed_ms = (leftSpeed + rightSpeed) / 2.0f / 255.0f * 0.8f;
}

void moveForward(int speed = 180) { setMotors(speed, speed); }
void turnLeft(int speed = 150)    { setMotors(-speed, speed); }
void turnRight(int speed = 150)   { setMotors(speed, -speed); }
void stopMotors()                  { setMotors(0, 0); }

// ── Solenoid valve ─────────────────────────────────────
void solenoidInit() {
  pinMode(SOLENOID_PIN, OUTPUT);
  digitalWrite(SOLENOID_PIN, LOW);
}

void activateSolenoid(int durationMs) {
  Serial.printf("[SPRAY] Activating solenoid for %d ms\n", durationMs);
  state.spraying = true;
  digitalWrite(SOLENOID_PIN, HIGH);
  sprayEndTime = millis() + durationMs;
}

void checkSolenoid() {
  if (state.spraying && millis() >= sprayEndTime) {
    digitalWrite(SOLENOID_PIN, LOW);
    state.spraying = false;
    Serial.println("[SPRAY] Solenoid OFF — spray complete");
    notifySprayComplete();
  }
}

// ── Sensors ────────────────────────────────────────────
void readSensors() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)) {
    state.humidity_pct = h;
    state.temp_c = t;
  }

  // Soil moisture: ADC 0-4095 → 0-100% (inverted: dry=high ADC)
  int raw = analogRead(SOIL_PIN);
  state.soil_moisture = map(raw, 4095, 0, 0, 100);
}

void readGPS() {
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        state.lat = gps.location.lat();
        state.lng = gps.location.lng();
      }
    }
  }
}

// ── Battery (ADC on GPIO35 via voltage divider) ────────
void readBattery() {
  int raw = analogRead(35);
  float voltage = raw * (3.3f / 4095.0f) * 3.0f;  // 3× divider
  state.battery_pct = constrain((int)((voltage - 6.0f) / 2.4f * 100.0f), 0, 100);
}

// ── WiFi ───────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(LED_PIN, HIGH);
  } else {
    Serial.println("\n[WiFi] Failed — running offline");
  }
}

// ── HTTP helpers ───────────────────────────────────────
bool httpPost(const String& path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(String(BACKEND_URL) + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-rover-api-key", ROVER_API_KEY);
  int code = http.POST(body);
  http.end();
  return code == 200 || code == 201;
}

String httpGet(const String& path) {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient http;
  http.begin(String(BACKEND_URL) + path);
  http.addHeader("x-rover-api-key", ROVER_API_KEY);
  int code = http.GET();
  String resp = (code == 200) ? http.getString() : "";
  http.end();
  return resp;
}

// ── Telemetry ──────────────────────────────────────────
void sendTelemetry() {
  StaticJsonDocument<256> doc;
  doc["rover_id"]      = ROVER_ID;
  doc["farm_id"]       = FARM_ID;
  doc["lat"]           = state.lat;
  doc["lng"]           = state.lng;
  doc["battery_pct"]   = state.battery_pct;
  doc["temp_c"]        = state.temp_c;
  doc["humidity_pct"]  = state.humidity_pct;
  doc["soil_moisture"] = state.soil_moisture;

  String body;
  serializeJson(doc, body);
  bool ok = httpPost("/api/rover/telemetry", body);
  Serial.printf("[Telemetry] Sent — %s (lat=%.4f, lng=%.4f, bat=%d%%)\n",
    ok ? "OK" : "FAILED", state.lat, state.lng, state.battery_pct);
}

// ── Spray complete notification ────────────────────────
void notifySprayComplete() {
  StaticJsonDocument<128> doc;
  doc["rover_id"]          = ROVER_ID;
  doc["dose_dispensed_ml"] = 15;  // TODO: calculate from valve open time
  doc["duration_sec"]      = sprayEndTime / 1000;
  String body;
  serializeJson(doc, body);
  httpPost("/api/rover/spray-complete", body);
}

// ── RPi UART communication ─────────────────────────────
// RPi sends JSON commands over UART when it finishes image analysis
// Format: {"cmd":"spray","dose_ml":30} or {"cmd":"move","dir":"forward"}
void handleRpiCommand() {
  if (!Serial.available()) return;

  String raw = Serial.readStringUntil('\n');
  raw.trim();
  if (raw.isEmpty()) return;

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    Serial.printf("[RPi] JSON parse error: %s\n", err.c_str());
    return;
  }

  const char* cmd = doc["cmd"];
  Serial.printf("[RPi] Command: %s\n", cmd);

  if (strcmp(cmd, "spray") == 0) {
    int dose_ml = doc["dose_ml"] | 15;
    // Map dose to valve open time (calibrate per your nozzle)
    // ~1 mL/s at standard pressure → dose_ml seconds
    activateSolenoid(dose_ml * 1000);

  } else if (strcmp(cmd, "move") == 0) {
    const char* dir = doc["dir"] | "forward";
    int speed = doc["speed"] | 180;
    if      (strcmp(dir, "forward") == 0) moveForward(speed);
    else if (strcmp(dir, "left")    == 0) turnLeft(speed);
    else if (strcmp(dir, "right")   == 0) turnRight(speed);
    else if (strcmp(dir, "stop")    == 0) stopMotors();

  } else if (strcmp(cmd, "stop") == 0) {
    stopMotors();

  } else if (strcmp(cmd, "estop") == 0) {
    stopMotors();
    digitalWrite(SOLENOID_PIN, LOW);
    state.spraying = false;
    Serial.println("[ESTOP] Emergency stop triggered!");
  }
}

// ── Poll backend for commands ──────────────────────────
void pollCommand() {
  String resp = httpGet(String("/api/rover/command/") + ROVER_ID);
  if (resp.isEmpty()) return;

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, resp)) return;

  const char* command = doc["command"] | "idle";
  state.command = String(command);

  // Forward to RPi so it can trigger camera scan
  if (strcmp(command, "scan") == 0) {
    Serial.println("{\"cmd\":\"scan\"}");
  }
}

// ── LED status blink ───────────────────────────────────
void blinkStatus() {
  static unsigned long lastBlink = 0;
  static bool ledOn = false;
  int interval = state.spraying ? 100 : state.moving ? 300 : 1000;
  if (millis() - lastBlink > interval) {
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn);
    lastBlink = millis();
  }
}

// ── Setup ──────────────────────────────────────────────
void setup() {
  Serial.begin(115200);       // USB + RPi UART
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);  // GPS

  Serial.println("\n=== PestEase Rover Firmware v1.0 ===");
  Serial.printf("Rover ID : %s\n", ROVER_ID);
  Serial.printf("Farm ID  : %s\n", FARM_ID);

  pinMode(LED_PIN, OUTPUT);
  motorsInit();
  solenoidInit();
  dht.begin();

  connectWiFi();

  Serial.println("[Init] Ready.\n");
}

// ── Loop ───────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Always running
  readGPS();
  checkSolenoid();
  handleRpiCommand();
  blinkStatus();

  // Periodic tasks
  if (now - lastTelemetry >= TELEMETRY_MS) {
    readSensors();
    readBattery();
    sendTelemetry();
    lastTelemetry = now;
  }

  if (now - lastCommandPoll >= COMMAND_POLL_MS) {
    pollCommand();
    lastCommandPoll = now;
  }

  delay(10);
}
