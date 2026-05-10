"""
Smart Cart - Raspberry Pi 5 Main Controller
============================================
Target Hardware: Raspberry Pi 5
Backend:         https://internsmartcart-production.up.railway.app

Hardware components:
  - 6x Push buttons   (gpiozero.Button via BCM pins)
  - HX711 load cell   (GPIO 20 DT, GPIO 21 SCK)
  - USB barcode scanner (evdev – works without terminal focus)
  - Optional: SSD1306 OLED 128x64 via I2C (address 0x3C)

Pin mapping (BCM):
  UP=17  DOWN=27  PLUS=22  MINUS=23  VERIFY=24  PAY=25
  HX711_DT=20  HX711_SCK=21
"""

import time
import sys
import select
import threading
import os
import json
import requests

# ──────────────────────────────────────────────────────────────────────────────
# Configuration  (override with environment variables)
# ──────────────────────────────────────────────────────────────────────────────
SERVER_URL = os.getenv("SERVER_URL", "https://internsmartcart-production.up.railway.app")
CART_ID    = os.getenv("CART_ID",   "CART-PI-01")
PASSCODE   = os.getenv("PASSCODE",  "9780201379624")

WEIGHT_TOLERANCE        = float(os.getenv("WEIGHT_TOLERANCE", "15"))   # grams
WEIGHT_CALIBRATION_FACTOR = float(os.getenv("WEIGHT_CAL", "1000"))
WEIGHT_POLL_INTERVAL    = float(os.getenv("WEIGHT_POLL", "0.8"))        # seconds
RECONNECT_DELAY         = float(os.getenv("RECONNECT_DELAY", "5"))
SESSION_REFRESH_HOURS   = float(os.getenv("SESSION_HOURS", "16"))

# GPIO pin mapping (BCM numbers)
PINS = {
    'UP':     17,
    'DOWN':   27,
    'PLUS':   22,
    'MINUS':  23,
    'VERIFY': 24,
    'PAY':    25,
    'HX711_DT':  20,
    'HX711_SCK': 21,
}

# ──────────────────────────────────────────────────────────────────────────────
# Library imports (graceful fallback to MOCK mode)
# ──────────────────────────────────────────────────────────────────────────────
MOCK_MODE   = False
USE_GPIOZERO = False

try:
    from gpiozero import Button as GZButton, Device
    from gpiozero.pins.lgpio import LGPIOFactory
    # Raspberry Pi 5 uses lgpio backend for gpiozero
    try:
        Device.pin_factory = LGPIOFactory()
        print("[GPIO] gpiozero + LGPIOFactory (Pi 5 native)")
    except Exception as e:
        print(f"[GPIO] LGPIOFactory failed ({e}), using gpiozero default backend")
    USE_GPIOZERO = True
except ImportError:
    try:
        import lgpio as lgpio_module
        h = lgpio_module.gpiochip_open(0)
        lgpio_module.gpiochip_close(h)
        print("[GPIO] lgpio direct mode")
    except Exception as e:
        try:
            import RPi.GPIO as _RPiGPIO
            print("[GPIO] RPi.GPIO fallback")
        except ImportError:
            print("[GPIO] No GPIO library found – MOCK mode")
            MOCK_MODE = True

HX711_AVAILABLE = False
try:
    from hx711 import HX711
    HX711_AVAILABLE = True
except ImportError:
    print("[HX711] Library not found – weight sensor disabled")

EVDEV_AVAILABLE = False
try:
    import evdev
    from evdev import InputDevice, categorize, ecodes
    EVDEV_AVAILABLE = True
except ImportError:
    print("[EVDEV] Library not found – USB scanner disabled, using stdin")

OLED_AVAILABLE = False
try:
    from luma.core.interface.serial import i2c
    from luma.oled.device import ssd1306
    from luma.core.render import canvas
    from PIL import ImageFont
    OLED_AVAILABLE = True
    print("[OLED] luma.oled available")
except ImportError:
    pass

try:
    import socketio as socketio_lib
    SOCKETIO_AVAILABLE = True
except ImportError:
    print("[SOCKET] python-socketio not found – running HTTP-only mode")
    SOCKETIO_AVAILABLE = False

# ──────────────────────────────────────────────────────────────────────────────
# Global state
# ──────────────────────────────────────────────────────────────────────────────
session_key      = None
session_expires  = 0          # unix timestamp
app_state        = {}
last_weight      = 0.0
oled_device      = None
sio              = None

# Key scancode map for evdev barcode scanners
SCANCODES = {
    2:'1',3:'2',4:'3',5:'4',6:'5',7:'6',8:'7',9:'8',10:'9',11:'0',
    16:'q',17:'w',18:'e',19:'r',20:'t',21:'y',22:'u',23:'i',24:'o',25:'p',
    30:'a',31:'s',32:'d',33:'f',34:'g',35:'h',36:'j',37:'k',38:'l',
    44:'z',45:'x',46:'c',47:'v',48:'b',49:'n',50:'m',
    51:',',52:'.',53:'/',57:' ',
}

# ──────────────────────────────────────────────────────────────────────────────
# OLED helper
# ──────────────────────────────────────────────────────────────────────────────
def oled_init():
    global oled_device
    if not OLED_AVAILABLE:
        return
    try:
        serial = i2c(port=1, address=0x3C)
        oled_device = ssd1306(serial)
        oled_show("Smart Cart", "Initialising...")
        print("[OLED] SSD1306 display ready")
    except Exception as e:
        print(f"[OLED] Init failed: {e}")
        oled_device = None

def oled_show(line1="", line2="", line3=""):
    if not oled_device:
        return
    try:
        with canvas(oled_device) as draw:
            draw.text((0,  0), line1[:21], fill="white")
            draw.text((0, 22), line2[:21], fill="white")
            draw.text((0, 44), line3[:21], fill="white")
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────────────────────
# API helpers
# ──────────────────────────────────────────────────────────────────────────────
def _headers():
    h = {'Content-Type': 'application/json'}
    if session_key:
        h['Authorization'] = f'Bearer {session_key}'
    return h

def api_post(endpoint, payload, retries=2):
    """POST to backend with Bearer session token."""
    url = f"{SERVER_URL}{endpoint}"
    for attempt in range(retries + 1):
        try:
            res = requests.post(url, json=payload, headers=_headers(), timeout=6)
            if res.status_code == 401:
                print(f"[AUTH] 401 on {endpoint} – will re-login")
                invalidate_session()
            return res
        except requests.exceptions.ConnectionError:
            print(f"[API] Connection error on {endpoint} (attempt {attempt+1})")
            time.sleep(1)
        except requests.exceptions.Timeout:
            print(f"[API] Timeout on {endpoint} (attempt {attempt+1})")
        except Exception as e:
            print(f"[API] Error on {endpoint}: {e}")
            break
    return None

def invalidate_session():
    global session_key, session_expires
    session_key = None
    session_expires = 0

# ──────────────────────────────────────────────────────────────────────────────
# Authentication (cart hardware login)
# ──────────────────────────────────────────────────────────────────────────────
def ensure_session(force=False):
    """
    Obtain or renew the hardware session key from the backend.
    Returns True if a valid session exists after the call.
    """
    global session_key, session_expires
    if session_key and not force and time.time() < session_expires:
        return True

    payload = {"cartId": CART_ID, "passcode": PASSCODE}
    try:
        url = f"{SERVER_URL}/api/auth/cart-login"
        res = requests.post(url, json=payload,
                            headers={'Content-Type': 'application/json'}, timeout=8)
        if res.status_code == 200:
            data = res.json()
            session_key     = data.get('sessionKey')
            session_expires = time.time() + SESSION_REFRESH_HOURS * 3600
            print(f"[AUTH] Session obtained for cart '{CART_ID}'")
            oled_show("Smart Cart", f"Cart: {CART_ID}", "Logged in OK")
            return True
        else:
            print(f"[AUTH] Login failed ({res.status_code}): {res.text}")
            oled_show("Smart Cart", "Login FAILED", res.text[:21])
    except Exception as e:
        print(f"[AUTH] Cannot reach server: {e}")
        oled_show("Smart Cart", "No Server", str(e)[:21])
    return False

# ──────────────────────────────────────────────────────────────────────────────
# Socket.IO real-time updates
# ──────────────────────────────────────────────────────────────────────────────
def start_socketio():
    """Start socket.io client in a background thread (non-blocking)."""
    global sio
    if not SOCKETIO_AVAILABLE:
        return

    sio = socketio_lib.Client(reconnection=True, reconnection_delay=RECONNECT_DELAY)

    @sio.event
    def connect():
        print(f"[SOCKET] Connected → joining room '{CART_ID}'")
        sio.emit('joinCart', CART_ID)

    @sio.event
    def disconnect():
        print("[SOCKET] Disconnected")

    @sio.on('stateUpdate')
    def on_state(data):
        global app_state
        app_state = data
        rescan = data.get('randomRescanItems', [])
        if rescan:
            item_name = data.get('randomRescanItemName', 'unknown')
            print(f"[STATE] Rescan required: {item_name}")
            oled_show("RESCAN NEEDED", item_name[:21], "Scan the item now")
        else:
            billing = data.get('isBillingEnabled', False)
            wt_ok   = data.get('weightVerificationPassed', False)
            oled_show(
                f"Cart: {CART_ID}",
                f"Wt:{'OK' if wt_ok else 'FAIL'} Billing:{'ON' if billing else 'OFF'}",
                ""
            )

    @sio.on('navigate')
    def on_navigate(target):
        print(f"[SOCKET] Navigate → {target}")
        oled_show("Navigation", f"→ {target}", "")

    @sio.on('scanError')
    def on_scan_error(err):
        msg = err.get('message', 'Scan error') if isinstance(err, dict) else str(err)
        print(f"[SOCKET] Scan error: {msg}")
        oled_show("Scan Error", msg[:21], "")

    def _connect_loop():
        while True:
            try:
                sio.connect(SERVER_URL, transports=['websocket', 'polling'])
                sio.wait()
            except Exception as e:
                print(f"[SOCKET] Connection failed: {e}. Retrying in {RECONNECT_DELAY}s…")
                time.sleep(RECONNECT_DELAY)

    t = threading.Thread(target=_connect_loop, daemon=True)
    t.start()

# ──────────────────────────────────────────────────────────────────────────────
# Button actions (map pin → API endpoint)
# ──────────────────────────────────────────────────────────────────────────────
BUTTON_ACTIONS = {
    'UP':     ('/api/cart/up',       {}),
    'DOWN':   ('/api/cart/down',     {}),
    'PLUS':   ('/api/cart/increase', {}),
    'MINUS':  ('/api/cart/decrease', {}),
    'VERIFY': ('/api/cart/navigate', {'target': 'verify'}),
    'PAY':    ('/api/cart/navigate', {'target': 'payment'}),
}

def on_button(name):
    """Called from gpiozero when_pressed callback (runs in main thread via threading)."""
    if name not in BUTTON_ACTIONS:
        return
    endpoint, extra = BUTTON_ACTIONS[name]
    payload = {'cart_id': CART_ID, **extra}
    print(f"[BUTTON] '{name}' → {endpoint}")
    # Fire in a daemon thread so button callbacks never block
    threading.Thread(
        target=api_post, args=(endpoint, payload), daemon=True
    ).start()

# ──────────────────────────────────────────────────────────────────────────────
# GPIO setup (gpiozero – Pi 5 native, with lgpio backend)
# ──────────────────────────────────────────────────────────────────────────────
def setup_buttons_gpiozero():
    """Return dict of gpiozero Button objects with callbacks wired up."""
    buttons = {}
    for name in ['UP', 'DOWN', 'PLUS', 'MINUS', 'VERIFY', 'PAY']:
        pin = PINS[name]
        try:
            btn = GZButton(pin, pull_up=True, bounce_time=0.25)
            btn.when_pressed = lambda n=name: on_button(n)
            buttons[name] = btn
            print(f"[GPIO] Button '{name}' → BCM {pin}")
        except Exception as e:
            print(f"[GPIO] Could not set up '{name}' on BCM {pin}: {e}")
    return buttons

# ──────────────────────────────────────────────────────────────────────────────
# HX711 weight sensor
# ──────────────────────────────────────────────────────────────────────────────
def setup_hx711():
    if not HX711_AVAILABLE or MOCK_MODE:
        return None
    try:
        hx = HX711(dout_pin=PINS['HX711_DT'], pd_sck_pin=PINS['HX711_SCK'])
        hx.set_reading_format("MSB", "MSB")
        hx.set_reference_unit(WEIGHT_CALIBRATION_FACTOR)
        hx.reset()
        hx.tare()
        print("[HX711] Load cell ready (tared)")
        oled_show("HX711 Ready", "Tare complete", "")
        return hx
    except Exception as e:
        print(f"[HX711] Init failed: {e}")
        return None

def read_weight(hx711_sensor):
    """Read stable weight from HX711 (average of 5 readings)."""
    try:
        raw = hx711_sensor.get_weight(5)
        hx711_sensor.power_down()
        hx711_sensor.power_up()
        return max(0.0, float(raw))
    except Exception as e:
        print(f"[HX711] Read error: {e}")
        return None

# ──────────────────────────────────────────────────────────────────────────────
# Barcode scanner (evdev – USB HID, no terminal focus needed)
# ──────────────────────────────────────────────────────────────────────────────
def find_usb_scanner():
    if not EVDEV_AVAILABLE or MOCK_MODE:
        return None
    try:
        devices = [InputDevice(p) for p in evdev.list_devices()]
        for dev in devices:
            name_lower = dev.name.lower()
            caps = dev.capabilities()
            # A barcode scanner appears as keyboard; look for common identifiers
            if any(kw in name_lower for kw in ['barcode', 'scanner', 'usb scanner', 'hid']):
                print(f"[SCANNER] Found: '{dev.name}' @ {dev.path}")
                return dev
            # Fallback: any device that has EV_KEY with numeric keys
            if ecodes.EV_KEY in caps:
                keys = caps[ecodes.EV_KEY]
                if ecodes.KEY_1 in keys and ecodes.KEY_ENTER in keys:
                    print(f"[SCANNER] Using: '{dev.name}' @ {dev.path}")
                    return dev
    except Exception as e:
        print(f"[SCANNER] Detection error: {e}")
    print("[SCANNER] No USB scanner found – using stdin")
    return None

def process_barcode(barcode):
    """Decide the correct endpoint and POST the scan."""
    global app_state
    rescan_pending = app_state.get('randomRescanItems') and len(app_state['randomRescanItems']) > 0
    endpoint = '/api/verify/random/scan' if rescan_pending else '/api/cart/scan'
    print(f"[SCAN] {'[RESCAN] ' if rescan_pending else ''}Barcode: '{barcode}' → {endpoint}")
    api_post(endpoint, {'barcode': barcode, 'cart_id': CART_ID})

# ──────────────────────────────────────────────────────────────────────────────
# Weight polling loop (runs in background thread)
# ──────────────────────────────────────────────────────────────────────────────
def weight_polling_thread(hx711_sensor):
    global last_weight
    print("[WEIGHT] Polling thread started")
    while True:
        w = read_weight(hx711_sensor)
        if w is not None:
            delta = abs(w - last_weight)
            if delta > WEIGHT_TOLERANCE:
                print(f"[WEIGHT] {w:.1f}g (Δ{delta:.1f}g)")
                last_weight = w
                api_post('/api/verify/weight', {'actual_weight': w, 'cart_id': CART_ID})
                oled_show(f"Cart: {CART_ID}", f"Weight: {w:.0f}g", "")
        time.sleep(WEIGHT_POLL_INTERVAL)

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
def main():
    print("=" * 55)
    print(f"  Smart Cart Hardware Controller – Cart '{CART_ID}'")
    print(f"  Backend: {SERVER_URL}")
    print("=" * 55)

    # 1. OLED display
    oled_init()
    oled_show("Smart Cart", "Starting up...", CART_ID)

    # 2. Authenticate with backend (retry until success)
    oled_show("Smart Cart", "Connecting...", SERVER_URL[:21])
    while not ensure_session():
        print(f"[AUTH] Retrying in {RECONNECT_DELAY}s…")
        time.sleep(RECONNECT_DELAY)

    # 3. Real-time state via socket.io
    start_socketio()

    # 4. GPIO buttons (gpiozero, Pi 5 compatible)
    buttons = {}
    if not MOCK_MODE and USE_GPIOZERO:
        buttons = setup_buttons_gpiozero()
    elif MOCK_MODE:
        print("[BUTTONS] MOCK mode – buttons via keyboard (see stdin handler)")

    # 5. HX711 load cell
    hx711 = setup_hx711()
    if hx711:
        wt = threading.Thread(target=weight_polling_thread, args=(hx711,), daemon=True)
        wt.start()
    else:
        print("[WEIGHT] No load cell – weight simulation available via stdin 'w:<grams>'")

    # 6. USB barcode scanner
    scanner = find_usb_scanner()
    barcode_buffer = ""

    print("\n[SYSTEM] Smart Cart running. Press Ctrl+C to exit.\n")
    if MOCK_MODE or not scanner:
        print("[STDIN] Commands:")
        print("  <barcode>        – simulate scan (e.g. 9780201379624)")
        print("  w:<grams>        – simulate weight (e.g. w:500)")
        print("  up/down/+/-      – simulate buttons")
        print("  verify/pay       – navigate")
        print("  reset            – finish/reset cart")
        print("  rescan           – start random rescan flow")
        print()

    oled_show(f"Cart: {CART_ID}", "Ready", "Scan item to start")

    # ── Session refresh watchdog ──────────────────────────────────────────────
    def session_watchdog():
        while True:
            time.sleep(3600)  # check every hour
            if time.time() > session_expires - 3600:
                print("[AUTH] Refreshing session…")
                ensure_session(force=True)

    threading.Thread(target=session_watchdog, daemon=True).start()

    # ── Main event loop ───────────────────────────────────────────────────────
    try:
        while True:
            # Ensure we still have a valid session
            if not session_key:
                ensure_session()
                if not session_key:
                    time.sleep(RECONNECT_DELAY)
                    continue

            # ── A) Real USB scanner via evdev ─────────────────────────────────
            if scanner:
                try:
                    event = scanner.read_one()
                    if event and event.type == ecodes.EV_KEY:
                        data = categorize(event)
                        if data.keystate == 1:  # key-down only
                            if data.scancode == ecodes.KEY_ENTER:
                                if barcode_buffer:
                                    process_barcode(barcode_buffer)
                                    barcode_buffer = ""
                            else:
                                char = SCANCODES.get(data.scancode, '')
                                if char:
                                    barcode_buffer += char
                except BlockingIOError:
                    pass
                except Exception as e:
                    print(f"[SCANNER] Read error: {e}")
                    scanner = None  # stop trying if device disconnected

            # ── B) Stdin fallback (mock / manual testing) ─────────────────────
            else:
                if sys.stdin in select.select([sys.stdin], [], [], 0.05)[0]:
                    line = sys.stdin.readline().strip()
                    if not line:
                        pass
                    elif line.startswith('w:'):
                        try:
                            grams = float(line[2:])
                            last_weight = grams
                            print(f"[WEIGHT] Simulating {grams}g")
                            api_post('/api/verify/weight', {'actual_weight': grams, 'cart_id': CART_ID})
                        except ValueError:
                            print("[WEIGHT] Usage: w:<grams>")
                    elif line == 'up':
                        api_post('/api/cart/up', {'cart_id': CART_ID})
                    elif line == 'down':
                        api_post('/api/cart/down', {'cart_id': CART_ID})
                    elif line in ('+', 'plus'):
                        api_post('/api/cart/increase', {'cart_id': CART_ID})
                    elif line in ('-', 'minus'):
                        api_post('/api/cart/decrease', {'cart_id': CART_ID})
                    elif line == 'remove':
                        api_post('/api/cart/remove', {'cart_id': CART_ID})
                    elif line == 'verify':
                        api_post('/api/cart/navigate', {'cart_id': CART_ID, 'target': 'verify'})
                    elif line == 'pay':
                        api_post('/api/cart/navigate', {'cart_id': CART_ID, 'target': 'payment'})
                    elif line == 'reset':
                        api_post('/api/cart/finish', {'cart_id': CART_ID})
                    elif line == 'rescan':
                        api_post('/api/verify/random/start', {'cart_id': CART_ID})
                    elif line:
                        # Treat as barcode
                        process_barcode(line)

            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n[SYSTEM] Shutting down gracefully…")
    finally:
        # Cleanup GPIO
        if buttons:
            for btn in buttons.values():
                try:
                    btn.close()
                except Exception:
                    pass

        # Disconnect socket
        if sio:
            try:
                sio.disconnect()
            except Exception:
                pass

        # Clear OLED
        if oled_device:
            try:
                oled_device.cleanup()
            except Exception:
                pass

        print("[SYSTEM] Goodbye.")


if __name__ == "__main__":
    main()
