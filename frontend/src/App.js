// High-fidelity single-file prototype (Tailwind + lucide-react + recharts)
import React, { useState, useEffect, useCallback } from 'react';
import {
  Bike,
  Lock,
  Unlock,
  MapPin,
  Thermometer,
  Gauge,
  Droplets,
  Battery,
  CloudFog,
  Leaf,
  Power,
  PowerOff
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

// Updated mock data (with Smart Service Advisor)
const mockBikeDataObject = {
  liveStatus: {
    engineTemp: { value: 85, unit: '°C', status: 'Normal' },
    oilPressure: { value: 55, unit: 'PSI', status: 'Normal' },
    tirePressure: { front: 33, rear: 34, unit: 'PSI', status: 'Good' },
    batteryVoltage: { value: 12.4, unit: 'V', status: 'Good' },
    engineHumidity: { value: 45, unit: '%', status: 'Dry' },
    exhaustIndex: { value: 88, unit: 'AQI', status: 'Good' }
  },
  location: {
    lat: 12.9716,
    lon: 77.5946,
    lastUpdated: '2 mins ago'
  },
  security: {
    status: 'Locked',
    engine: 'Off'
  },
  // Smart Service Advisor object
  serviceAdvisor: {
    healthScore: 78,
    status: 'Good',
    predictionText: 'Next service due in ~1,250 km or 2 months',
    lastServiceDate: '2025-05-10',
    lastServiceDistance: 15300,
    contributingFactors: [
      { factor: 'Riding Style', impact: 'Moderate', description: 'Frequent hard braking events detected, accelerating wear.' },
      { factor: 'Usage Type', impact: 'High', description: 'Primarily short-distance city riding under heavy load.' },
      { factor: 'Distance Covered', impact: 'Moderate', description: '2,750 of 4,000 km covered.' },
      { factor: 'Time Elapsed', impact: 'Low', description: '4 of 6 months passed since last service.' }
    ]
  },
  predictiveMaintenance: [
    {
      part: 'Engine Oil',
      icon: 'Droplets',
      health: 45,
      prediction: 'Oil change recommended soon',
      trendData: [
        { name: 'Jul', health: 90 },
        { name: 'Aug', health: 80 },
        { name: 'Sep', health: 65 },
        { name: 'Oct', health: 55 },
        { name: 'Nov', health: 45 }
      ]
    },
    {
      part: 'Battery Health',
      icon: 'Battery',
      health: 92,
      prediction: 'Stable performance, ~1.5 years life remaining',
      trendData: [
        { name: 'Jul', health: 98 },
        { name: 'Aug', health: 97 },
        { name: 'Sep', health: 95 },
        { name: 'Oct', health: 93 },
        { name: 'Nov', health: 92 }
      ]
    }
  ]
};

const iconMap = { Droplets, Thermometer, Gauge, Battery, MapPin, Lock, Unlock, Bike, Power, PowerOff, CloudFog, Leaf };
const StatusIcon = ({ name, className = 'w-5 h-5' }) => { const C = iconMap[name] || Bike; return <C className={className} />; };

// Helpers
const barColor = v => (v >= 75 ? 'bg-green-500' : v >= 50 ? 'bg-yellow-400' : 'bg-red-500');
const ringColor = v => (v >= 75 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444');
const statusColor = s => ({
  Normal: 'text-emerald-400',
  Good: 'text-green-400',
  Dry: 'text-sky-300',
  Warning: 'text-amber-400',
  Critical: 'text-red-400',
  Poor: 'text-orange-400'
}[s] || 'text-zinc-400');

const CircularHealth = ({ value }) => (
  <div className="relative w-16 h-16">
    <div
      className="w-full h-full rounded-full flex items-center justify-center text-xs font-semibold text-zinc-100"
      style={{ background: `conic-gradient(${ringColor(value)} ${value}%, #272a30 ${value}%)` }}
    >
      <div className="w-12 h-12 rounded-full bg-[#121316] flex items-center justify-center shadow-inner">
        <span className="text-xs font-bold">{value}%</span>
      </div>
    </div>
  </div>
);

const BigCircularGauge = ({ value = 78, size = 170, label = 'Score' }) => (
  <div className="relative" style={{ width: size, height: size }}>
    <div
      className="rounded-full w-full h-full flex items-center justify-center"
      style={{ background: `conic-gradient(${ringColor(value)} ${value}%, #1e232a ${value}%)` }}
    >
      <div className="rounded-full flex flex-col items-center justify-center shadow-inner" style={{ width: size - 36, height: size - 36, background: '#0f1115' }}>
        <span className="text-3xl font-extrabold" style={{ color: ringColor(value) }}>{value}</span>
        <span className="text-[11px] text-zinc-400 mt-0.5">{label}</span>
      </div>
    </div>
  </div>
);

const Card = ({ title, icon, children, className = '' }) => (
  <div className={`relative rounded-xl bg-gradient-to-br from-[#1e1f24] to-[#18191d] border border-zinc-800/70 shadow-lg shadow-black/30 p-4 flex flex-col gap-3 overflow-hidden group ${className}`}>
    <div className="flex items-center gap-2">
      {icon && <StatusIcon name={icon} className="w-5 h-5 text-sky-400" />}
      <h3 className="text-sm font-semibold tracking-wide text-zinc-200">{title}</h3>
    </div>
    {children}
    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <div className="absolute -inset-24 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_60%)]" />
    </div>
  </div>
);

const Header = ({ securityStatus, clock }) => (
  <header className="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-4 py-5">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow shadow-sky-800/40">
        <Bike className="w-7 h-7 text-white" />
      </div>
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-wide bg-gradient-to-r from-sky-300 via-cyan-200 to-blue-300 bg-clip-text text-transparent">ELITA-1 Dashboard</h1>
        <p className="text-xs text-zinc-400">High-fidelity prototype (mock data)</p>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <div className="text-xs md:text-sm px-3 py-2 rounded-lg bg-[#1c1d21] border border-zinc-700/60 text-zinc-300">{clock}</div>
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1c1d21] border border-zinc-700/60">
        {securityStatus === 'Locked' ? <Lock className="w-4 h-4 text-green-400" /> : <Unlock className="w-4 h-4 text-amber-400" />}
        <span className="text-sm font-medium text-zinc-300">Status: <span className={securityStatus === 'Locked' ? 'text-green-400' : 'text-amber-300'}>{securityStatus}</span></span>
      </div>
    </div>
  </header>
);

const LiveStatusGrid = ({ liveStatus }) => {
  const cards = [
    { key: 'engineTemp', label: 'Engine Temp', value: `${liveStatus.engineTemp.value}${liveStatus.engineTemp.unit}`, sub: liveStatus.engineTemp.status, icon: 'Thermometer' },
    { key: 'oilPressure', label: 'Oil Pressure', value: `${liveStatus.oilPressure.value} ${liveStatus.oilPressure.unit}`, sub: liveStatus.oilPressure.status, icon: 'Gauge' },
    { key: 'tirePressure', label: 'Tire Pressure', value: `${liveStatus.tirePressure.front}/${liveStatus.tirePressure.rear} ${liveStatus.tirePressure.unit}`, sub: liveStatus.tirePressure.status, icon: 'Gauge' },
    { key: 'batteryVoltage', label: 'Battery', value: `${liveStatus.batteryVoltage.value} ${liveStatus.batteryVoltage.unit}`, sub: liveStatus.batteryVoltage.status, icon: 'Battery' },
    { key: 'engineHumidity', label: 'Engine Humidity', value: `${liveStatus.engineHumidity.value}${liveStatus.engineHumidity.unit}`, sub: liveStatus.engineHumidity.status, icon: 'CloudFog' },
    { key: 'exhaustIndex', label: 'Exhaust Emission Index', value: `${liveStatus.exhaustIndex.value} ${liveStatus.exhaustIndex.unit}`, sub: liveStatus.exhaustIndex.status, icon: 'Leaf' }
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map(c => (
        <Card key={c.key} title={c.label} icon={c.icon}>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">{c.value}</span>
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wide ${statusColor(c.sub)}`}>{c.sub}</span>
        </Card>
      ))}
    </div>
  );
};

const MapWidget = ({ location }) => {
  const { lat, lon, lastUpdated } = location;
  const staticUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=13&size=600x300&markers=${lat},${lon},lightblue1`;
  return (
    <Card title="Location" icon="MapPin" className="col-span-1 md:col-span-2 xl:col-span-2">
      <div className="w-full aspect-[2.3/1] rounded-lg overflow-hidden ring-1 ring-zinc-800 bg-[#16171a] relative">
        <img src={staticUrl} alt="Static Map" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" loading="lazy" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex justify-between items-end">
          <div className="text-xs text-zinc-300">Lat: {lat.toFixed(4)} | Lon: {lon.toFixed(4)}</div>
          <div className="text-[10px] text-zinc-400">Updated: {lastUpdated}</div>
        </div>
      </div>
    </Card>
  );
};

const SecurityWidget = ({ security, onLockToggle, onEngineToggle }) => {
  const isLocked = security.status === 'Locked';
  const engineOn = security.engine === 'On';
  return (
    <Card title="Security & Control" icon={isLocked ? 'Lock' : 'Unlock'} className="col-span-1">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Lock State:</span>
          <span className={`font-semibold ${isLocked ? 'text-green-400' : 'text-amber-300'}`}>{security.status}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Engine:</span>
          <span className={`font-semibold ${engineOn ? 'text-emerald-400' : 'text-zinc-300'}`}>{engineOn ? 'ON' : 'OFF'}</span>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onLockToggle} className={`w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition ${isLocked ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200' : 'bg-green-600 hover:bg-green-500 text-white'}`}>
            {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {isLocked ? 'Unlock Bike' : 'Lock Bike'}
          </button>
          <button onClick={onEngineToggle} className={`w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition ${engineOn ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
            {engineOn ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
            {engineOn ? 'Turn Engine OFF' : 'Turn Engine ON'}
          </button>
        </div>
        <div className="mt-2 text-[10px] text-zinc-500">Prototype only: actions update local state.</div>
      </div>
    </Card>
  );
};

const ServiceAdvisorWidget = ({ service }) => (
  <Card title="Smart Service Advisor" icon="Gauge" className="xl:col-span-3 md:col-span-2 col-span-1">
    <div className="flex items-center gap-6">
      <BigCircularGauge value={service.healthScore} label={service.status} />
      <div className="flex flex-col gap-2">
        <div className="text-sm text-zinc-400">Overall Health</div>
        <div className="text-base font-semibold text-zinc-100 max-w-[20rem]">{service.predictionText}</div>
        <div className="text-[11px] text-zinc-400 mt-2">
          Last service: <span className="text-zinc-300 font-medium">{service.lastServiceDate}</span>
        </div>
        <div className="text-[11px] text-zinc-400">
          Odometer then: <span className="text-zinc-300 font-medium">{service.lastServiceDistance.toLocaleString()} km</span>
        </div>
      </div>
    </div>
  </Card>
);

const PredictiveMaintenanceWidget = ({ items }) => (
  <Card title="Predictive Maintenance" icon="Gauge" className="col-span-1 md:col-span-2 xl:col-span-3">
    <div className="grid md:grid-cols-2 gap-5">
      {items.map(item => {
        const IconComp = iconMap[item.icon] || Droplets;
        return (
          <div key={item.part} className="flex flex-col gap-3 rounded-lg bg-[#16171b] border border-zinc-800/70 p-3 hover:border-sky-600/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconComp className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-semibold text-zinc-200 tracking-wide">{item.part}</h4>
              </div>
              <CircularHealth value={item.health} />
            </div>
            <div className="h-1.5 w-full bg-zinc-800/80 rounded overflow-hidden">
              <div className={`${barColor(item.health)} h-full transition-all`} style={{ width: `${item.health}%` }} />
            </div>
            <p className={`text-xs leading-snug ${item.health >= 75 ? 'text-green-400' : item.health >= 50 ? 'text-yellow-300' : 'text-red-400'} font-medium`}>{item.prediction}</p>
            <div className="h-20 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={item.trendData}>
                  <Tooltip contentStyle={{ background: '#1f2228', border: '1px solid #30343b', fontSize: '11px', borderRadius: '6px' }} labelStyle={{ color: '#cbd5e1' }} cursor={{ stroke: '#334155', strokeDasharray: 4 }} />
                  <Line type="monotone" dataKey="health" stroke={item.health >= 75 ? '#22c55e' : item.health >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  </Card>
);

const App = () => {
  const [data, setData] = useState(() => mockBikeDataObject);
  const [clock, setClock] = useState(() => new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' }));
  const [spot, setSpot] = useState({ x: 300, y: 200 });

  // Load font
  useEffect(() => {
    if (!document.getElementById('inter-font')) {
      const l = document.createElement('link');
      l.id = 'inter-font';
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
      l.rel = 'stylesheet';
      document.head.appendChild(l);
    }
  }, []);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Spotlight follow
  const onMouseMove = (e) => {
    setSpot({ x: e.clientX, y: e.clientY });
  };

  const handleLockToggle = useCallback(() => setData(p => ({ ...p, security: { ...p.security, status: p.security.status === 'Locked' ? 'Unlocked' : 'Locked' } })), []);
  const handleEngineToggle = useCallback(() => setData(p => ({ ...p, security: { ...p.security, engine: p.security.engine === 'On' ? 'Off' : 'On' } })), []);

  return (
    <div className="min-h-screen w-full text-zinc-100 font-[Inter,sans-serif] bg-[#121212] relative" onMouseMove={onMouseMove}>
      {/* Interactive spotlight */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(600px circle at ${spot.x}px ${spot.y}px, rgba(56,189,248,0.18), transparent 55%)`
        }}
      />
      {/* Subtle grid overlay */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:70px_70px]" />

      <div className="relative mx-auto max-w-7xl px-5 pb-16">
        <Header securityStatus={data.security.status} clock={clock} />

        <div className="grid gap-6 mt-2 xl:grid-cols-6 lg:grid-cols-5 md:grid-cols-4 sm:grid-cols-2">
          <div className="xl:col-span-6 lg:col-span-5 md:col-span-4 sm:col-span-2 flex flex-col gap-6">
            <LiveStatusGrid liveStatus={data.liveStatus} />
          </div>

          <ServiceAdvisorWidget service={data.serviceAdvisor} />
          <MapWidget location={data.location} />
          <SecurityWidget security={data.security} onLockToggle={handleLockToggle} onEngineToggle={handleEngineToggle} />
          <PredictiveMaintenanceWidget items={data.predictiveMaintenance} />
        </div>

        <footer className="mt-12 text-center text-[11px] text-zinc-500">ELITA-1 Prototype • Mock Data • {new Date().getFullYear()}</footer>
      </div>
    </div>
  );
};

export default App;
