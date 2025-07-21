#include "BleMouse.h"
#include <esp_mac.h>

#define MAX_BLE_NAME_ADVERTISED 23  // 22 chars + 1 null terminator
// #define DEBUG
#define INTERVAL 20

BleMouse *bleMouse = NULL;
char nameBuffer[MAX_BLE_NAME_ADVERTISED];
uint8_t macaddr[6] = { 0x12, 0x34, 0x56, 0x78, 0xab, 0xcd };
uint8_t nameLen = 0;
bool readingName = false;

void setup() {
  #if ARDUINO_USB_CDC_ON_BOOT && !ARDUINO_USB_MODE //Serial used for USB CDC
    // https://github.com/espressif/arduino-esp32/blob/8ee5f0a11e5423a018e0f89146e05074466274db/cores/esp32/USBCDC.cpp#L449-L451
    // setTxTimeoutMs exists only for CDC usb serial communication. Otherwise it's hardware and no setTxTimeoutMs
    Serial.setTxTimeoutMs(0);
  #endif
  Serial.begin(115200);
#ifdef DEBUG
  esp_log_level_set("*", ESP_LOG_VERBOSE);  // "*" means all tags
#endif

  // esp_base_mac_addr_set(macaddr);
  delay(100);
  Serial.println("<R>");
}

void loop() {
  // Serial.println("loop");
  if (ESP.getFreeHeap() < 5000) {
    Serial.println("L");
    delay(50);
    ESP.restart();
  }

  while (Serial.available()) {
    char c = Serial.read();
#ifdef DEBUG
    Serial.write(c);
    if (bleMouse == NULL || !bleMouse->isConnected()) {
      Serial.println("Not connected!");
    }
#endif
    if (readingName) {
      if (c == '\n' || nameLen >= (MAX_BLE_NAME_ADVERTISED - 1)) {
        nameBuffer[nameLen] = '\0';  // Always null-terminate safely
        if (bleMouse != NULL) {
          bleMouse->end();
        }
        macaddr[5] = esp_random() & 0xFF;
        macaddr[4] = esp_random() & 0xFF;
        macaddr[3] = esp_random() & 0xFF;

        esp_base_mac_addr_set(macaddr);
#ifdef DEBUG
        Serial.print("Using name");
        Serial.println(nameBuffer);
#endif
        delay(200);
        delete bleMouse;
        delay(200);
        bleMouse = new BleMouse(nameBuffer, "Espressif", 100);
        bleMouse->begin();
        Serial.println("K");
        readingName = false;
        nameLen = 0;
      } else {
        nameBuffer[nameLen++] = c;
      }
    } else {
      handleCommand(c);
    }
  }
}

int padding = 14;

void handleCommand(char cmd) {
  bool areConnected = bleMouse != NULL && bleMouse->isConnected();
  switch (cmd) {
    case 'N':
      nameLen = 0;
      readingName = true;
      break;
    default:
      break;
    case 'U':
      if (areConnected) bleMouse->move(0, -1);
      break;
    case 'D':
      if (areConnected) bleMouse->move(0, 1);
      break;
    case 'L':
      if (areConnected) bleMouse->move(-1, 0);
      break;
    case 'R':
      if (areConnected) bleMouse->move(1, 0);
      break;

    case 'u':
      if (areConnected) bleMouse->move(0, -4);
      break;
    case 'd':
      if (areConnected) bleMouse->move(0, 4);
      break;
    case 'l':
      if (areConnected) bleMouse->move(-4, 0);
      break;
    case 'r':
      if (areConnected) bleMouse->move(4, 0);
      break;

    case 'j':
      if (areConnected) bleMouse->move(0, -8);
      break;
    case 'h':
      if (areConnected) bleMouse->move(0, 8);
      break;
    case 'g':
      if (areConnected) bleMouse->move(-8, 0);
      break;
    case 'k':
      if (areConnected) bleMouse->move(8, 0);
      break;

    case 'P':
      if (areConnected) bleMouse->press(MOUSE_LEFT);
      break;
    case 'O':
      if (areConnected) bleMouse->release(MOUSE_LEFT);
      break;
    case '0':
      if (areConnected) {
        bleMouse->move(-127, -127);  // move to the corner
        delay(INTERVAL);
        bleMouse->move(0, padding);  // go down a bit to position where there is no corner
        delay(INTERVAL);
        bleMouse->move(-127, 0);  // Go to the left
        delay(INTERVAL);
        for (int i = 0; i < padding; i++) {  // Go fixed to the right `padding` times
          bleMouse->move(1, 0);
          delay(INTERVAL);
        }
        bleMouse->move(0, -127);  // Go to the top
      }
      break;
    case '-':
      ESP.restart();
      break;
  }
  delay(INTERVAL);
}