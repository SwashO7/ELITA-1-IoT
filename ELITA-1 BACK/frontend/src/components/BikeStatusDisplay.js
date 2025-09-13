import React from 'react';
import './BikeStatusDisplay.css';

export const BikeStatusDisplay = ({ bikeData }) => {
  if (!bikeData) return null;

  const engineTemp = bikeData.engine_temp_c;
  const batteryVoltage = bikeData.battery_voltage;
  const tirePressureKpa = bikeData.tire_pressure_kpa;

  // Simple conversions / thresholds
  const tirePressurePsi = tirePressureKpa ? (tirePressureKpa * 0.1450377).toFixed(1) : null;
  const tempClass = engineTemp != null && engineTemp > 100 ? 'warn' : 'ok';
  const battClass = batteryVoltage != null && batteryVoltage < 11.5 ? 'warn' : 'ok';
  const tireClass = tirePressurePsi != null && (tirePressurePsi < 28 || tirePressurePsi > 40) ? 'warn' : 'ok';

  return (
    <div className="panel status-panel">
      <h2>Bike Status</h2>
      <ul className="status-list">
        <li className={tempClass}>Engine Temp: {engineTemp != null ? `${engineTemp.toFixed(1)}°C` : '—'}</li>
        <li className={battClass}>Battery: {batteryVoltage != null ? `${batteryVoltage.toFixed(2)}V` : '—'}</li>
        <li className={tireClass}>Rear Tire: {tirePressurePsi != null ? `${tirePressurePsi} PSI` : '—'}</li>
        <li>Moving: {bikeData.moving ? 'Yes' : 'No'}</li>
        <li>Last Update: {bikeData.timestamp ? new Date(bikeData.timestamp * 1000).toLocaleTimeString() : '—'}</li>
      </ul>
    </div>
  );
};
