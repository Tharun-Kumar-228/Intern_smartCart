import time
import sys
import select
import requests
import socketio
import json
import os

# Hardware Libraries (Conditional Import)
GPIO = None
MOCK_MODE = False
try:
    # Try gpiozero first (works with Pi 5)
    import gpiozero
    GPIO = "gpiozero"
    print("[GPIO] Using gpiozero library (Pi 5 compatible)")
except ImportError as e:
    try:
        # Try lgpio
        import lgpio as lgpio_module
        try:
            h = lgpio_module.gpiochip_open(0)
            lgpio_module.gpiochip_close(h)
            GPIO = lgpio_module
            print("[GPIO] Using lgpio library")
        except Exception as daemon_err:
            print(f"[GPIO] lgpio daemon not running: {daemon_err}")
            raise daemon_err
    except Exception as e:
        try:
            import RPi.GPIO as GPIO_lib
            GPIO = GPIO_lib
            print("[GPIO] Using RPi.GPIO library")
        except ImportError:
            print(f"[GPIO] No GPIO library available: {e}")
            GPIO = None

try:
    from hx711 import HX711
    import evdev
    from evdev import InputDevice, categorize, ecodes
except ImportError:
    print("Warning: Hardware libraries (hx711, evdev) not found.")
    
if GPIO is None:
    print("Running in MOCK hardware mode (Keyboard Input only).")
    MOCK_MODE = True

# --- Configuration ---
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:5000")
CART_ID = os.getenv("CART_ID", "9780201379624") 
PASSCODE = os.getenv("PASSCODE", "9780201379624")
WEIGHT_TOLERANCE = 10 # Only send weight updates if change > 10g
WEIGHT_CALIBRATION_FACTOR = 1000

# GPIO Pin Mapping (BCM)
PINS = {
    'UP': 17,
    'DOWN': 27,
    'PLUS': 22,
    'MINUS': 23,
    'VERIFY': 24,
    'PAY': 25,
    'HX711_DT': 20,
    'HX711_SCK': 21
}

# --- Global State ---
sio = socketio.Client()
app_state = {}
session_key = None

def api_post(endpoint, payload):
    """Authenticated POST request helper."""
    global session_key
    headers = {'Content-Type': 'application/json'}
    if session_key:
        headers["Authorization"] = f"Bearer {session_key}"
    
    try:
        url = f"{SERVER_URL}{endpoint}"
        res = requests.post(url, json=payload, headers=headers, timeout=5)
        if res.status_code == 401:
            session_key = None
            print("[AUTH] Session expired or unauthorized.")
        return res
    except Exception as e:
        print(f"[API ERROR] {endpoint}: {e}")
        return None

@sio.event
def connect():
    print(f"[SOCKET] Connected to {SERVER_URL}. Joining room: {CART_ID}")
    sio.emit('joinCart', CART_ID)

@sio.event
def disconnect():
    print("[SOCKET] Disconnected from server.")

@sio.event
def stateUpdate(data):
    global app_state
    app_state = data

def button_callback(channel):
    """Handles GPIO button presses."""
    action_map = {
        PINS['UP']: ("/api/cart/up", {"cart_id": CART_ID}),
        PINS['DOWN']: ("/api/cart/down", {"cart_id": CART_ID}),
        PINS['PLUS']: ("/api/cart/increase", {"cart_id": CART_ID}),
        PINS['MINUS']: ("/api/cart/decrease", {"cart_id": CART_ID}),
        PINS['VERIFY']: ("/api/cart/navigate", {"cart_id": CART_ID, "target": "verify"}),
        PINS['PAY']: ("/api/cart/navigate", {"cart_id": CART_ID, "target": "payment"}),
    }
    
    if channel in action_map:
        endpoint, payload = action_map[channel]
        print(f"[BUTTON] Pin {channel} pressed -> {endpoint}")
        api_post(endpoint, payload)

def setup_hardware():
    """Initializes GPIO and HX711."""
    global MOCK_MODE
    if MOCK_MODE: return None
    
    try:
        if GPIO == "gpiozero":
            # gpiozero uses Button class for input pins
            buttons = {}
            for name, pin in PINS.items():
                if not name.startswith('HX711'):
                    # Create a callback function for each button
                    def make_callback(pin=pin):
                        return lambda: button_callback(pin)
                    buttons[name] = gpiozero.Button(pin, pull_up=True, bounce_time=0.3)
                    buttons[name].when_pressed = make_callback(pin)
            # Store buttons for cleanup
            return buttons
        else:
            # Legacy RPi.GPIO or lgpio
            GPIO.setmode(GPIO.BCM)
            for name, pin in PINS.items():
                if not name.startswith('HX711'):
                    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                    GPIO.add_event_detect(pin, GPIO.FALLING, callback=button_callback, bouncetime=300)
        
        try:
            hx = HX711(dout_pin=PINS['HX711_DT'], pd_sck_pin=PINS['HX711_SCK'])
            hx.set_reading_format("MSB", "MSB")
            hx.set_reference_unit(WEIGHT_CALIBRATION_FACTOR)
            hx.reset()
            hx.tare()
            return hx
        except Exception as e:
            print(f"[HX711] Init failed: {e}")
            return None
    except (RuntimeError, FileNotFoundError) as e:
        print(f"[GPIO] Hardware not available: {e}")
        print("Falling back to MOCK hardware mode.")
        MOCK_MODE = True
        return None

def find_scanner():
    """Finds the barcode scanner device via evdev."""
    if MOCK_MODE: return None
    try:
        devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
        for device in devices:
            # Most scanners identify as 'Keyboard' or have 'Barcode' in name
            if "Barcode" in device.name or "Keyboard" in device.name:
                print(f"[SCANNER] Found scanner: {device.name} at {device.path}")
                return device
    except Exception:
        pass
    return None

def main():
    global session_key
    hardware = setup_hardware()
    scanner = find_scanner()

    try:
        sio.connect(SERVER_URL)
    except Exception as e:
        print(f"[SOCKET] Connection failed: {e}")

    print(f"--- Smart Cart System Initialized (ID: {CART_ID}) ---")
    
    last_weight = 0
    barcode_buffer = ""
    
    # Define scanner key mapping
    scancodes = {
        0: None, 1: u'ESC', 2: u'1', 3: u'2', 4: u'3', 5: u'4', 6: u'5', 7: u'6', 8: u'7', 9: u'8',
        10: u'9', 11: u'0', 12: u'-', 13: u'=', 14: u'BKSP', 15: u'TAB', 16: u'q', 17: u'w', 18: u'e', 19: u'r',
        20: u't', 21: u'y', 22: u'u', 23: u'i', 24: u'o', 25: u'p', 26: u'[', 27: u']', 28: u'CRLF', 29: u'LCTRL',
        30: u'a', 31: u's', 32: u'd', 33: u'f', 34: u'g', 35: u'h', 36: u'j', 37: u'k', 38: u'l', 39: u';',
        40: u'"', 41: u'`', 42: u'LSHFT', 43: u'\\', 44: u'z', 45: u'x', 46: u'c', 47: u'v', 48: u'b', 49: u'n',
        50: u'm', 51: u',', 52: u'.', 53: u'/', 54: u'RSHFT', 56: u'LALT', 57: u' ', 100: u'RALT'
    }

    try:
        while True:
            # 1. Ensure we have an active session key
            if not session_key:
                try:
                    # Hardware attempts to login using Cart ID and Passcode
                    payload = {"cartId": CART_ID, "passcode": PASSCODE}
                    res = requests.post(f"{SERVER_URL}/api/auth/cart-login", json=payload, timeout=2)
                    if res.status_code == 200:
                        session_key = res.json().get('sessionKey')
                        print(f"[AUTH] Successfully logged in hardware for {CART_ID}")
                    else:
                        print(f"[AUTH] Login failed: {res.text}")
                        time.sleep(5) # Wait before retrying
                except Exception as e:
                    print(f"[AUTH ERROR] Could not reach server: {e}")
                    time.sleep(5)

            # 2. Weight Sensor Polling
            if hardware and isinstance(hardware, HX711):
                try:
                    current_weight = hardware.get_weight(5)
                    if abs(current_weight - last_weight) > WEIGHT_TOLERANCE:
                        print(f"[WEIGHT] Change detected: {current_weight}g")
                        last_weight = current_weight
                        api_post("/api/verify/weight", {"actual_weight": current_weight, "cart_id": CART_ID})
                    hardware.power_down()
                    hardware.power_up()
                except Exception as e:
                    print(f"[WEIGHT ERROR] {e}")

            # 3. Barcode Scanner Handling
            # Option A: Real Scanner via evdev (Works without terminal focus)
            if scanner:
                try:
                    event = scanner.read_one()
                    if event and event.type == ecodes.EV_KEY:
                        data = categorize(event)
                        if data.keystate == 1: # Key Down
                            if data.scancode == 28: # Enter key
                                print(f"[SCAN] Processing: {barcode_buffer}")
                                is_verification = app_state.get('randomRescanItems') and len(app_state['randomRescanItems']) > 0
                                endpoint = "/api/verify/random/scan" if is_verification else "/api/cart/scan"
                                api_post(endpoint, {"barcode": barcode_buffer, "cart_id": CART_ID})
                                barcode_buffer = ""
                            else:
                                key = scancodes.get(data.scancode, "")
                                barcode_buffer += key
                except Exception:
                    pass

            # Option B: Fallback to Stdin (Mock or Manual terminal testing)
            elif sys.stdin in select.select([sys.stdin], [], [], 0.05)[0]:
                line = sys.stdin.readline().strip()
                if line:
                    print(f"[SCAN] Processing (stdin): {line}")
                    is_verification = app_state.get('randomRescanItems') and len(app_state['randomRescanItems']) > 0
                    endpoint = "/api/verify/random/scan" if is_verification else "/api/cart/scan"
                    api_post(endpoint, {"barcode": line, "cart_id": CART_ID})

            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n[SYSTEM] Shutting down...")
    finally:
        if not MOCK_MODE:
            if GPIO == "gpiozero" and hardware:
                # Close gpiozero buttons
                for button in hardware.values():
                    button.close()
            elif GPIO:
                GPIO.cleanup()
        sio.disconnect()

if __name__ == "__main__":
    main()
