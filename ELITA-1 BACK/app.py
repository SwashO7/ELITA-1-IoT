"""
SmartBike IoT System Backend (Flask + MQTT + Hardware Interfaces)
-----------------------------------------------------------------
This script runs on a Raspberry Pi Zero 2 W and performs:
  * Concurrent sensor acquisition (GPS, DS18B20 temp, Battery voltage via MCP3008, Motion via MPU6050, Tire pressure via rtl_433)
  * Publishes aggregated telemetry JSON to an MQTT topic at a fixed interval.
  * Listens for remote commands (immobilize / resume) over a subscribed MQTT topic.
  * Exposes REST API endpoints for a React frontend to fetch latest status and issue commands.
  * Controls a relay (engine kill switch) with safety logic (only immobilize when bike not moving).
  * Implements CORS for cross-origin requests.

NOTE: This implementation uses placeholder values for credentials and some calibration constants.
      Adjust paths, thresholds, and scaling constants for your specific hardware.

Dependencies (assumed pre-installed):
  Flask, Flask-CORS, paho-mqtt, serial (pyserial), smbus2, spidev, RPi.GPIO
  plus system tool: rtl_433 for TPMS reception via RTL-SDR.
"""
from __future__ import annotations
import os
import json
import time
import threading
import logging
import queue
import subprocess
import signal
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, jsonify, request
from flask_cors import CORS
import paho.mqtt.client as mqtt

# Hardware-specific libraries (wrap in try/except for safer dev on non-Pi systems)
try:
    import RPi.GPIO as GPIO
except Exception:  # pragma: no cover - fallback stub for non-Pi development
    class GPIOMock:
        BCM = 'BCM'
        OUT = 'OUT'
        LOW = 0
        HIGH = 1
        def setmode(self, *_): pass
        def setwarnings(self, *_): pass
        def setup(self, *_): pass
        def output(self, *_, **__): pass
        def cleanup(self): pass
    GPIO = GPIOMock()  # type: ignore

try:
    import spidev
except Exception:  # pragma: no cover
    spidev = None

try:
    from smbus2 import SMBus
except Exception:  # pragma: no cover
    SMBus = None

try:
    import serial
except Exception:  # pragma: no cover
    serial = None

# ------------------------------------------------------------
# Configuration (Environment Driven)
# Optionally load a .env file if python-dotenv is available.
# ------------------------------------------------------------
try:  # Optional, non-fatal if library not installed
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

def _get_env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default

def _get_env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default

def _get_env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.lower() in ("1", "true", "yes", "on")

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "your_mqtt_broker_hostname")
MQTT_PORT = _get_env_int("MQTT_PORT", 8883)
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "your_username")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "your_password")
MQTT_PUBLISH_TOPIC = os.getenv("MQTT_PUBLISH_TOPIC", "bike/data/1")
MQTT_SUBSCRIBE_TOPIC = os.getenv("MQTT_SUBSCRIBE_TOPIC", "bike/commands/1")
TPMS_SENSOR_ID = os.getenv("TPMS_SENSOR_ID", "12345")
FLASK_PORT = _get_env_int("FLASK_PORT", 5000)
PUBLISH_INTERVAL_SEC = _get_env_int("PUBLISH_INTERVAL_SEC", 15)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
try:
    logging.getLogger().setLevel(LOG_LEVEL)
except Exception:
    pass

# GPIO pin assignments
RELAY_PIN = 21         # Engine kill relay
# DS18B20 uses 1-Wire on GPIO4; kernel overlay must be enabled (dtoverlay=w1-gpio)
# MCP3008 SPI (CE0) -> CS=GPIO8, MISO=GPIO9, MOSI=GPIO10, SCLK=GPIO11
# I2C: SDA=GPIO2, SCL=GPIO3 for MPU6050
# GPS Serial port (adjust if needed)
GPS_SERIAL_PORT = "/dev/ttyAMA1"  # Could vary; confirm with 'ls -l /dev/serial*'
GPS_BAUDRATE = 9600
# GSM module (SIM800L) typically /dev/ttyS0 for data breakout; PPP dialer handles connectivity

# Battery voltage measurement configuration (example placeholders)
ADC_BATTERY_CHANNEL = 0
ADC_MAX_VALUE = 1023.0  # 10-bit if using MCP3008
ADC_REF_VOLTAGE = 3.3
VOLTAGE_DIVIDER_RATIO = 2.0  # (R1+R2)/R2 => Adjust to your resistor network

# MPU6050 constants
MPU6050_I2C_ADDR = 0x68
MPU6050_PWR_MGMT_1 = 0x6B
MPU6050_ACCEL_XOUT_H = 0x3B
MOTION_THRESHOLD_G = 0.15  # Threshold for movement detection (tune empirically)

# Thread / concurrency controls
lock = threading.Lock()
latest_bike_data = {}
immobilization_status = False
stop_event = threading.Event()

# Optional queue for internal events (not strictly required but can be useful)
event_queue: "queue.Queue[str]" = queue.Queue()

# SPI + I2C handles (initialized later if available)
spi = None
smbus_bus = None

# GPS Serial handle
gps_serial = None

# MQTT client global
mqtt_client: mqtt.Client | None = None

# ------------------------------------------------------------
# Logging Setup
# ------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(threadName)s: %(message)s",
)
logger = logging.getLogger("SmartBikeBackend")

# ------------------------------------------------------------
# Hardware Initialization
# ------------------------------------------------------------
def init_gpio():
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(RELAY_PIN, GPIO.OUT)
        GPIO.output(RELAY_PIN, GPIO.LOW)  # Ensure relay inactive at start
        logger.info("GPIO initialized; relay set LOW (inactive)")
    except Exception as e:
        logger.exception(f"GPIO init failed: {e}")


def init_spi():
    global spi
    if spidev is None:
        logger.warning("spidev not available; MCP3008 functions disabled")
        return
    try:
        spi = spidev.SpiDev()
        spi.open(0, 0)  # Bus 0, CE0
        spi.max_speed_hz = 1350000
        logger.info("SPI (MCP3008) initialized")
    except Exception as e:
        logger.exception(f"SPI init failed: {e}")
        spi = None


def init_i2c():
    global smbus_bus
    if SMBus is None:
        logger.warning("smbus2 not available; MPU6050 disabled")
        return
    try:
        smbus_bus = SMBus(1)  # I2C bus 1
        # Wake up MPU6050 (clear sleep bit)
        smbus_bus.write_byte_data(MPU6050_I2C_ADDR, MPU6050_PWR_MGMT_1, 0)
        logger.info("I2C (MPU6050) initialized")
    except Exception as e:
        logger.exception(f"I2C init failed: {e}")
        smbus_bus = None


def init_gps_serial():
    global gps_serial
    if serial is None:
        logger.warning("pyserial not available; GPS disabled")
        return
    try:
        gps_serial = serial.Serial(GPS_SERIAL_PORT, GPS_BAUDRATE, timeout=1)
        logger.info(f"GPS serial opened on {GPS_SERIAL_PORT}")
    except Exception as e:
        logger.exception(f"GPS serial init failed: {e}")
        gps_serial = None

# ------------------------------------------------------------
# Sensor Reading Functions
# ------------------------------------------------------------
def read_ds18b20_device_file() -> str | None:
    base_path = "/sys/bus/w1/devices"
    try:
        for name in os.listdir(base_path):
            if name.startswith("28-"):
                return os.path.join(base_path, name, "w1_slave")
    except Exception:
        pass
    return None


_DS18B20_FILE = read_ds18b20_device_file()


def read_engine_temp() -> float | None:
    """Reads DS18B20 temperature in Celsius."""
    if not _DS18B20_FILE:
        return None
    try:
        with open(_DS18B20_FILE, 'r') as f:
            content = f.read().strip().splitlines()
        if len(content) >= 2 and content[0].endswith("YES"):
            pos = content[1].find("t=")
            if pos != -1:
                milli_c = int(content[1][pos+2:])
                return milli_c / 1000.0
    except Exception as e:
        logger.debug(f"DS18B20 read error: {e}")
    return None


def read_adc_channel(channel: int) -> int | None:
    if spi is None:
        return None
    try:
        # MCP3008 protocol: Start bit (1), Single/Diff (1), channel (3), 5 dummy bits
        cmd = 0b11 << 6 | (channel & 0x7) << 3
        resp = spi.xfer2([cmd, 0x0, 0x0])
        # Combine last 2 bytes + bottom bits
        value = ((resp[1] & 0x0F) << 8) | resp[2]
        return value
    except Exception as e:
        logger.debug(f"ADC read error: {e}")
        return None


def read_battery_voltage() -> float | None:
    raw = read_adc_channel(ADC_BATTERY_CHANNEL)
    if raw is None:
        return None
    try:
        volts = (raw / ADC_MAX_VALUE) * ADC_REF_VOLTAGE * VOLTAGE_DIVIDER_RATIO
        return round(volts, 2)
    except Exception:
        return None


def read_gps_data() -> dict:
    """Parse basic NMEA sentences for latitude/longitude. Returns dict with lat/lon or None values."""
    if gps_serial is None:
        return {"lat": None, "lon": None}
    try:
        # Attempt to read multiple lines to find a valid RMC/GGA
        for _ in range(5):
            line = gps_serial.readline().decode(errors='ignore').strip()
            if not line.startswith("$"):
                continue
            if "," not in line:
                continue
            if any(tag in line for tag in ("GPRMC", "GNRMC")):
                parts = line.split(',')
                if len(parts) > 6 and parts[3] and parts[5]:
                    lat_raw = parts[3]
                    lat_hem = parts[4]
                    lon_raw = parts[5]
                    lon_hem = parts[6]
                    lat = nmea_to_decimal(lat_raw, lat_hem)
                    lon = nmea_to_decimal(lon_raw, lon_hem)
                    return {"lat": lat, "lon": lon}
    except Exception as e:
        logger.debug(f"GPS read error: {e}")
    return {"lat": None, "lon": None}


def nmea_to_decimal(raw: str, hem: str) -> float | None:
    try:
        # Raw format: ddmm.mmmm or dddmm.mmmm
        if not raw or '.' not in raw:
            return None
        deg_len = 2 if len(raw.split('.')[0]) in (4, 5) else 2  # heuristic
        deg = int(raw[:deg_len])
        minutes = float(raw[deg_len:])
        decimal = deg + minutes / 60.0
        if hem in ('S', 'W'):
            decimal *= -1
        return round(decimal, 6)
    except Exception:
        return None


def is_bike_moving() -> bool:
    if smbus_bus is None:
        return False
    try:
        data = smbus_bus.read_i2c_block_data(MPU6050_I2C_ADDR, MPU6050_ACCEL_XOUT_H, 6)
        ax = twos_complement(data[0] << 8 | data[1], 16) / 16384.0
        ay = twos_complement(data[2] << 8 | data[3], 16) / 16384.0
        az = twos_complement(data[4] << 8 | data[5], 16) / 16384.0
        magnitude = (ax*ax + ay*ay + az*az) ** 0.5
        # Stationary ~1g; motion detection: deviation from 1g or raw acceleration > threshold
        moving = abs(magnitude - 1.0) > MOTION_THRESHOLD_G
        return moving
    except Exception as e:
        logger.debug(f"MPU6050 read error: {e}")
        return False


def twos_complement(val: int, bits: int) -> int:
    if val & (1 << (bits - 1)):
        val -= 1 << bits
    return val


def read_tire_pressure() -> float | None:
    """Invoke rtl_433 to capture TPMS JSON and find pressure for configured sensor ID.
       This is a synchronous, potentially slow call; consider optimizing or caching if needed."""
    try:
        # Short invocation; -T (stop after N seconds) -F json for JSON output
        proc = subprocess.run(
            ["rtl_433", "-F", "json", "-T", "5"],
            capture_output=True,
            text=True,
            timeout=8
        )
        if proc.returncode != 0:
            return None
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line.startswith('{'):
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Heuristic: look for keys that might identify sensor
            sid = str(obj.get('id') or obj.get('sensor_id') or obj.get('ID') or '')
            if sid == TPMS_SENSOR_ID:
                pressure = obj.get('pressure_kPa') or obj.get('kPa') or obj.get('pressure')
                if pressure is not None:
                    try:
                        return float(pressure)
                    except Exception:
                        return None
        return None
    except subprocess.TimeoutExpired:
        logger.debug("rtl_433 timed out")
    except FileNotFoundError:
        logger.warning("rtl_433 binary not found; install to enable tire pressure readings")
    except Exception as e:
        logger.debug(f"rtl_433 error: {e}")
    return None

# ------------------------------------------------------------
# Action & Logic Functions
# ------------------------------------------------------------
def execute_immobilize_sequence() -> bool:
    global immobilization_status
    with lock:
        if immobilization_status:
            logger.info("Immobilization already active")
            return True
    moving = is_bike_moving()
    if moving:
        logger.warning("SAFETY OVERRIDE: Attempted immobilize while bike moving")
        return False
    try:
        GPIO.output(RELAY_PIN, GPIO.HIGH)  # Activate relay (kill engine)
        with lock:
            immobilization_status = True
        logger.info("Engine immobilized (relay HIGH)")
        return True
    except Exception as e:
        logger.exception(f"Failed to activate immobilization: {e}")
        return False


def deactivate_immobilization() -> bool:
    global immobilization_status
    try:
        GPIO.output(RELAY_PIN, GPIO.LOW)
        with lock:
            immobilization_status = False
        logger.info("Engine immobilization deactivated (relay LOW)")
        return True
    except Exception as e:
        logger.exception(f"Failed to deactivate immobilization: {e}")
        return False

# ------------------------------------------------------------
# MQTT Setup & Callbacks
# ------------------------------------------------------------
def on_connect(client, userdata, flags, rc):  # rc: result code
    if rc == 0:
        logger.info("Connected to MQTT broker")
        try:
            client.subscribe(MQTT_SUBSCRIBE_TOPIC)
            logger.info(f"Subscribed to {MQTT_SUBSCRIBE_TOPIC}")
        except Exception as e:
            logger.exception(f"Subscription failed: {e}")
    else:
        logger.error(f"MQTT connection failed with code {rc}")


def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode('utf-8')
        data = json.loads(payload)
        logger.info(f"MQTT message on {msg.topic}: {data}")
        command = data.get('command')
        if command == 'immobilize':
            success = execute_immobilize_sequence()
            if not success:
                logger.info("Immobilize command ignored due to safety override or failure")
        elif command == 'resume':
            deactivate_immobilization()
        else:
            logger.warning(f"Unknown command received: {command}")
    except Exception as e:
        logger.exception(f"Error processing incoming MQTT message: {e}")


def init_mqtt_client():
    global mqtt_client
    client = mqtt.Client()
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    try:
        # Basic TLS setup; customize certificate validation as needed
        client.tls_set()  # Uses system CA store
    except Exception as e:
        logger.warning(f"TLS setup issue (continuing): {e}")
    client.on_connect = on_connect
    client.on_message = on_message
    mqtt_client = client
    try:
        client.connect(MQTT_BROKER_HOST, MQTT_PORT, keepalive=60)
        client.loop_start()
    except Exception as e:
        logger.exception(f"Failed to connect/start MQTT loop: {e}")

# ------------------------------------------------------------
# Main Sensor Read & Publish Loop
# ------------------------------------------------------------
def collect_sensor_snapshot() -> dict:
    """Collect all sensor data concurrently and return a dict."""
    tasks = {
        'engine_temp_c': read_engine_temp,
        'battery_voltage': read_battery_voltage,
        'tire_pressure_kpa': read_tire_pressure,
        'gps': read_gps_data,
        'moving': is_bike_moving,
    }
    results = {}
    # Use a thread pool so slow sensors (rtl_433 or GPS) don't block others
    with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        future_map = {executor.submit(func): key for key, func in tasks.items()}
        for future in as_completed(future_map):
            key = future_map[future]
            try:
                results[key] = future.result()
            except Exception as e:
                logger.debug(f"Sensor {key} error: {e}")
                results[key] = None
    # Flatten GPS if available
    gps = results.get('gps') or {}
    results['gps_lat'] = gps.get('lat') if isinstance(gps, dict) else None
    results['gps_lon'] = gps.get('lon') if isinstance(gps, dict) else None
    results.pop('gps', None)
    return results


def sensor_read_and_publish_loop():
    logger.info("Sensor read & publish loop started")
    while not stop_event.is_set():
        cycle_start = time.time()
        snapshot = collect_sensor_snapshot()
        with lock:
            snapshot['immobilization_status'] = immobilization_status
            snapshot['timestamp'] = int(time.time())
            latest_bike_data.update(snapshot)
            payload = json.dumps(latest_bike_data)
        # Publish
        if mqtt_client:
            try:
                mqtt_client.publish(MQTT_PUBLISH_TOPIC, payload, qos=1)
                logger.info(f"Published telemetry to {MQTT_PUBLISH_TOPIC}")
            except Exception as e:
                logger.exception(f"MQTT publish failed: {e}")
        # Sleep remaining interval
        elapsed = time.time() - cycle_start
        sleep_time = max(1.0, PUBLISH_INTERVAL_SEC - elapsed)
        stop_event.wait(sleep_time)
    logger.info("Sensor loop exiting")

# ------------------------------------------------------------
# Flask Application & Endpoints
# ------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes (adjust origins in production)

@app.route('/', methods=['GET'])
def index():
    """Root route to help users discover available endpoints instead of a 404."""
    return jsonify({
        'message': 'SmartBike API running',
        'endpoints': ['/api/status', '/api/command'],
        'note': 'Use /api/status to fetch telemetry.'
    })

@app.errorhandler(404)
def handle_404(e):  # noqa: D401, ANN001 (Flask signature)
    """Return JSON for unknown routes instead of the default HTML 404 page."""
    return jsonify({'status': 'error', 'message': 'Not Found', 'hint': 'Try /api/status'}), 404

@app.route('/api/status', methods=['GET'])
def api_status():
    try:
        with lock:
            data_copy = dict(latest_bike_data)
        return jsonify({
            'status': 'success',
            'data': data_copy
        })
    except Exception as e:
        logger.exception(f"/api/status error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500


@app.route('/api/command', methods=['POST'])
def api_command():
    try:
        body = request.get_json(force=True, silent=True) or {}
        action = body.get('action')
        if action == 'immobilize':
            success = execute_immobilize_sequence()
            if success:
                return jsonify({'status': 'success', 'message': 'Bike immobilized'})
            return jsonify({'status': 'error', 'message': 'Safety override or failure'}), 400
        elif action == 'resume':
            if deactivate_immobilization():
                return jsonify({'status': 'success', 'message': 'Bike resumed'})
            return jsonify({'status': 'error', 'message': 'Failed to resume'}), 500
        else:
            return jsonify({'status': 'error', 'message': 'Unknown action'}), 400
    except Exception as e:
        logger.exception(f"/api/command error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

# ------------------------------------------------------------
# Shutdown Handling
# ------------------------------------------------------------
def cleanup():
    logger.info("Cleaning up resources...")
    stop_event.set()
    if mqtt_client:
        try:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        except Exception:
            pass
    if spi:
        try:
            spi.close()
        except Exception:
            pass
    if smbus_bus:
        try:
            smbus_bus.close()
        except Exception:
            pass
    if gps_serial:
        try:
            gps_serial.close()
        except Exception:
            pass
    try:
        GPIO.cleanup()
    except Exception:
        pass
    logger.info("Cleanup complete")


def handle_signal(signum, frame):  # noqa: ARG001 (frame unused)
    logger.info(f"Signal {signum} received; shutting down...")
    cleanup()
    # For Flask dev server, raising SystemExit stops it. In production (gunicorn), workers handle differently.
    raise SystemExit(0)

# Register signal handlers
for sig in (signal.SIGINT, signal.SIGTERM):
    try:
        signal.signal(sig, handle_signal)
    except Exception:
        pass

# ------------------------------------------------------------
# Main Entry Point
# ------------------------------------------------------------
if __name__ == '__main__':
    logger.info("Starting SmartBike Backend...")
    init_gpio()
    init_spi()
    init_i2c()
    init_gps_serial()
    init_mqtt_client()

    # Start sensor thread
    sensor_thread = threading.Thread(
        target=sensor_read_and_publish_loop,
        name="SensorLoop",
        daemon=True
    )
    sensor_thread.start()

    try:
        app.run(host='0.0.0.0', port=FLASK_PORT, debug=False)
    finally:
        cleanup()
