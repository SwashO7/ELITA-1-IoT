import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './BikeMap.css';

// Fix default marker icon path issue in many bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Override default icon (Leaflet expects images at runtime)
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export const BikeMap = ({ bikeData }) => {
  if (!bikeData) return null;
  const { gps_lat: lat, gps_lon: lon } = bikeData;
  const hasLocation = lat != null && lon != null;
  const position = hasLocation ? [lat, lon] : [0, 0];

  return (
    <div className="panel map-panel">
      <h2>Location</h2>
      {hasLocation ? (
        <MapContainer center={position} zoom={15} scrollWheelZoom={false} className="bike-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={position}>
            <Popup>
              Bike Location<br />
              Lat: {lat.toFixed(5)}, Lon: {lon.toFixed(5)}
            </Popup>
          </Marker>
        </MapContainer>
      ) : (
        <div className="no-location">No GPS fix yet</div>
      )}
    </div>
  );
};
