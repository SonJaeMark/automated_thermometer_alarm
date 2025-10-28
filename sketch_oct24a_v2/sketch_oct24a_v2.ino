/**
 * @file esp32_temp_websocket.ino
 * @brief ESP32 MAX6675 temperature WebSocket server with recording control.
 *
 * Features:
 * - Wi-Fi connection using WiFiManager (no hardcoded credentials)
 * - WebSocket server endpoint at `/ws` for real-time data
 * - Reads actual temperature from MAX6675 sensor
 * - Supports recording start/stop and retrieval commands
 *
 * Commands:
 *   - "test"          → replies { "status": "ok" }
 *   - "start_record"  → begins saving temperature readings
 *   - "end_record"    → stops recording
 *   - "get_record"    → sends recorded readings as JSON array
 *
 * @note Default static IP: 192.168.1.200
 * @author 
 * Mark Jayson Lanuzo
 * @date 2025-10-25
 */

#include <WiFiManager.h>           ///< Manages Wi-Fi configuration via captive portal
#include <ESPAsyncWebServer.h>     ///< Asynchronous HTTP & WebSocket server
#include <AsyncTCP.h>              ///< Required TCP library for ESPAsyncWebServer
#include <ArduinoJson.h>           ///< JSON creation and serialization
#include <vector>                  ///< Used for recording temperature data
#include <max6675.h>               ///< MAX6675 thermocouple library

// -------------------- GLOBAL OBJECTS --------------------
AsyncWebServer server(80);         ///< Web server running on port 80
AsyncWebSocket ws("/ws");          ///< WebSocket endpoint accessible at ws://<IP>/ws

unsigned long lastSendTime = 0;    ///< Timestamp to manage 1-second send interval
bool isRecording = false;          ///< True when recording is active
std::vector<float> recordedData;   ///< Stores recorded temperature readings

// MAX6675 SPI pin configuration
const int thermoSO = 19;   ///< MAX6675 MISO pin
const int thermoCS = 5;    ///< MAX6675 chip select pin
const int thermoSCK = 18;  ///< MAX6675 clock pin

MAX6675 thermocouple(thermoSCK, thermoCS, thermoSO); ///< MAX6675 sensor object

// -------------------- SENSOR READINGS --------------------
/**
 * @brief Reads temperature from the MAX6675 thermocouple sensor.
 * @return float Temperature in Celsius.
 */
float getTemperature() {
  return thermocouple.readCelsius(); // Direct reading from sensor
}

/**
 * @brief Generates mock temperature data for testing.
 * @return float Simulated temperature between 24°C and 30°C.
 */
float getMockTemperature() {
  return 24.0 + (random(0, 600) / 10.0); // Generates 24.0–30.0 °C
}

// -------------------- DATA SENDER --------------------
/**
 * @brief Sends a JSON message to all connected WebSocket clients.
 * @param key   JSON key.
 * @param value JSON string value.
 */
void broadcastMessage(const char* key, const char* value) {
  StaticJsonDocument<100> doc;
  doc[key] = value;                 // Assign key-value pair
  String json;
  serializeJson(doc, json);         // Convert JSON to string
  ws.textAll(json);                 // Broadcast to all clients
}

/**
 * @brief Sends current temperature reading to WebSocket clients.
 */
void sendTemperatureToClients() {
  float temp = getTemperature();    // Read sensor value

  if (isRecording) {                // Save data if recording
    recordedData.push_back(temp);
  }

  StaticJsonDocument<100> doc;
  doc["temperature"] = temp;        // Prepare JSON message
  String json;
  serializeJson(doc, json);
  ws.textAll(json);                 // Send to all clients

  Serial.printf("📤 Sent temperature: %.2f°C%s\n", temp, isRecording ? " (recording)" : "");
}

// -------------------- COMMAND HANDLER --------------------
/**
 * @brief Handles incoming WebSocket messages (frontend commands).
 * @param client Pointer to WebSocket client.
 * @param msg    Received message as C-string.
 *
 * Commands:
 * - test
 * - start_record
 * - end_record
 * - get_record
 */
void handleClientCommand(AsyncWebSocketClient *client, const char *msg) {
  String message = String(msg);

  if (message == "test") {
    StaticJsonDocument<50> doc;
    doc["status"] = "ok";
    String json;
    serializeJson(doc, json);
    client->text(json);
    Serial.println("✅ Test connection OK");
  } 
  else if (message == "start_record") {
    isRecording = true;
    recordedData.clear();
    client->text("{\"recording\":\"started\"}");
    Serial.println("🎬 Recording started...");
  } 
  else if (message == "end_record") {
    isRecording = false;
    client->text("{\"recording\":\"stopped\"}");
    Serial.println("⏹️ Recording stopped.");
  } 
  else if (message == "get_record") {
    StaticJsonDocument<1024> doc;
    JsonArray arr = doc.createNestedArray("data");
    for (float val : recordedData) arr.add(val); // Add all data points
    String json;
    serializeJson(doc, json);
    client->text(json);
    Serial.println("📤 Sent recorded data.");
  } 
  else {
    client->text("{\"error\":\"unknown command\"}");
    Serial.printf("⚠️ Unknown command: %s\n", msg);
  }
}

// -------------------- WEBSOCKET EVENTS --------------------
/**
 * @brief Handles WebSocket connect/disconnect/data events.
 */
void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
                      AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("🔗 Client connected: %u\n", client->id());
  } 
  else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("❌ Client disconnected: %u\n", client->id());
  } 
  else if (type == WS_EVT_DATA) {
    data[len] = 0;                  // Null-terminate data
    Serial.printf("📩 Received from client: %s\n", (char *)data);
    handleClientCommand(client, (char *)data);
  }
}

// -------------------- SETUP --------------------
/**
 * @brief Initializes Wi-Fi, WebSocket server, and sensor.
 */
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n🚀 Starting WiFiManager + WebSocket + MAX6675 test...");

  randomSeed(analogRead(0)); // For mock data variation

  WiFiManager wm;

  // Optional: clear saved credentials
  // wm.resetSettings();

  // Configure static IP for consistent dashboard access
  IPAddress staticIP(192, 168, 1, 200);
  IPAddress gateway(192, 168, 1, 1);
  IPAddress subnet(255, 255, 255, 0);
  IPAddress dns(8, 8, 8, 8);
  wm.setSTAStaticIPConfig(staticIP, gateway, subnet, dns);

  bool res = wm.autoConnect("ESP32-Setup", "12345678"); // Start portal if needed
  if (!res) {
    Serial.println("❌ Failed to connect or timeout occurred.");
    return;
  }

  Serial.println("✅ Connected!");
  Serial.print("📡 IP Address: ");
  Serial.println(WiFi.localIP());

  // Attach WebSocket handler
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);

  // Simple HTTP route for testing
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "ESP32 WebSocket active at /ws");
  });

  server.begin();
  Serial.println("🌐 WebSocket server started on port 80 at /ws");

  delay(5000); // Allow MAX6675 to stabilize
}

// -------------------- LOOP --------------------
/**
 * @brief Handles client cleanup and periodic data sending.
 */
void loop() {
  ws.cleanupClients();              // Remove disconnected clients

  if (millis() - lastSendTime > 1000) { // Every 1s
    sendTemperatureToClients();     // Send temperature to all clients
    lastSendTime = millis();        // Reset timer
  }
}
