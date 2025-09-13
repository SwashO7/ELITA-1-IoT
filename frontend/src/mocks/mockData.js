// Mock telemetry snapshot for demo viewing without backend
export const mockBikeData = {
  engine_temp_c: 82.7,
  battery_voltage: 12.46,
  tire_pressure_kpa: 220, // ~31.9 PSI
  moving: false,
  gps_lat: 37.4219999,
  gps_lon: -122.0840575,
  immobilization_status: false,
  timestamp: Math.floor(Date.now() / 1000)
};
