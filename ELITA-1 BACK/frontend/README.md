# SmartBike Frontend

A React dashboard for the SmartBike IoT System. Polls a Flask backend for telemetry, displays sensor data, bike location, and allows immobilization control.

## Features
- Real-time polling (5s) of status endpoint.
- Engine temperature, battery voltage, rear tire pressure display.
- Movement indicator & last update timestamp.
- Immobilize / Resume engine commands.
- Map view (Leaflet) with current GPS location marker.
- Responsive layout (CSS grid + flex) with dark theme.

## Configuration
Edit `src/App.js` and set:
```js
const FLASK_API_BASE_URL = 'http://your_raspberry_pi_ip:5000/api';
```
Ensure CORS is enabled in the Flask backend.

## Install & Run
```bash
npm install
npm start
```
The app will open at http://localhost:3000

## Build
```bash
npm run build
```

## Notes
- GPS values of `null` show "No GPS fix yet".
- Tire pressure is converted from kPa (backend) to PSI (UI).
- Basic thresholds highlight abnormal values.

## License
MIT (adjust as needed)
