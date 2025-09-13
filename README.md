# SmartBike IoT System

Backend: Flask + MQTT + Raspberry Pi hardware interfaces.
Frontend: React dashboard (Leaflet map, telemetry, immobilization control).

## Backend (Flask) Local Run
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env  # edit values
python app.py
```
Visit: http://localhost:5000/

## Frontend Local Run
```bash
cd frontend
cp .env.example .env  # set REACT_APP_API_BASE_URL
npm install
npm start
```
Visit: http://localhost:3000/

## Docker (Development)
Build and start both services:
```bash
docker compose up --build
```
Backend: http://localhost:5000  |  Frontend: http://localhost:3000

### ARM Base Image (Raspberry Pi)
Override at build:
```bash
docker build --build-arg BASE_IMAGE=arm32v7/python:3.11-slim -t smartbike-backend .
```
Or with compose (edit docker-compose.yml args).

### Hardware Access in Containers
Uncomment devices in `docker-compose.yml` and run with `--privileged` if necessary (SPI/I2C). Example:
```yaml
    devices:
      - /dev/ttyAMA1:/dev/ttyAMA1
      - /dev/i2c-1:/dev/i2c-1
      - /dev/spidev0.0:/dev/spidev0.0
```
Ensure host has interfaces enabled (raspi-config) and that container user has permissions.

## Environment Variables
Backend `.env` controls MQTT broker, topics, intervals, etc. Frontend `.env` sets API base and mock mode.

## Mock Frontend Mode
Set `REACT_APP_MOCK_MODE=true` in `frontend/.env` to view UI without backend.

## Production Frontend Build (Optional)
```bash
cd frontend
npm run build
```
Serve `frontend/build` via nginx or similar; point it at backend API.

## Systemd Example (Non-Docker)
See earlier instructions or ask for a unit file customizing your paths.

## Security Notes
- Add proper MQTT TLS certificates (client certs) if required.
- Restrict CORS origins in `app.py` before production.
- Consider authentication (API keys/JWT) for `/api/command`.

## Next Steps / Enhancements
- Add historical data persistence (InfluxDB/TimescaleDB).
- Implement WebSocket or MQTT over WebSocket for real-time push.
- Add unit tests for sensor abstraction with mocks.
- Integrate OTA update mechanism.

---
MIT License (adjust as needed)
