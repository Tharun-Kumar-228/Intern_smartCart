# Smart Cart Hardware Connection Diagram

This document details the physical wiring connections between the Raspberry Pi, push buttons, the HX711 Load Cell Amplifier, and other peripherals based on the BCM pin mapping defined in `pi/main.py`.

## 🔘 Push Buttons (Navigation & Control)
*Note: All buttons are configured using internal pull-up resistors (`GPIO.PUD_UP`). Connect one terminal of the push button to the assigned GPIO pin, and the other terminal to any Ground (GND) pin on the Raspberry Pi.*

| Button Function      | Raspberry Pi Pin (BCM) | Physical Pin Number | Connect Other Side To |
|----------------------|------------------------|---------------------|-----------------------|
| **Scroll UP**        | GPIO 17                | Pin 11              | GND                   |
| **Scroll DOWN**      | GPIO 27                | Pin 13              | GND                   |
| **Increase (+)**     | GPIO 22                | Pin 15              | GND                   |
| **Decrease (-)**     | GPIO 23                | Pin 16              | GND                   |
| **Go to Verify**     | GPIO 24                | Pin 18              | GND                   |
| **Go to Pay**        | GPIO 25                | Pin 22              | GND                   |

---

## ⚖️ Load Cell / Weight Sensor (HX711 Amplifier)
*Note: The Raspberry Pi uses 3.3V logic. Powering the HX711 VCC from the 3.3V rail ensures the data signals (DT/SCK) do not exceed 3.3V, which could damage the Pi.*

| HX711 Module Pin | Raspberry Pi Pin (BCM) | Physical Pin Number |
|------------------|------------------------|---------------------|
| **VCC / VDD**    | 3.3V Power             | Pin 1 or Pin 17     |
| **GND**          | Ground                 | Pin 6, 9, 14, etc.  |
| **DT (Data)**    | GPIO 20                | Pin 38              |
| **SCK (Clock)**  | GPIO 21                | Pin 40              |

**Load Cell to HX711 Wiring (Standard 4-wire configuration):**
- Red Wire → E+
- Black Wire → E-
- White Wire → A-
- Green Wire → A+

---

## 🔌 Peripherals

| Device Type              | Connection Port                 | Notes                                                               |
|--------------------------|---------------------------------|---------------------------------------------------------------------|
| **Barcode Scanner**      | Any USB Port                    | Automatically detected via Linux `evdev` to prevent UI focus loss.  |
| **Kiosk Touch Display**  | HDMI + USB (or DSI Port)        | USB required for touch feedback. Run browser in Kiosk/Fullscreen.   |
| **Thermal Printer**      | Any USB Port                    | Ensure CUPS driver is installed and set as the default OS printer.  |
| **Internet Connection**  | Wi-Fi or Ethernet               | Required for API communication with the backend server.             |
