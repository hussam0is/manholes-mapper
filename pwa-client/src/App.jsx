import React, { useState, useEffect, useRef } from 'react';
import { parseNmeaSentence, FIX_QUALITY } from './nmea/parse';

function App() {
  const [status, setStatus] = useState({ bt: 'unknown', clients: 0, device: 'None' });
  const [data, setData] = useState({
    lat: null,
    lon: null,
    alt: 0,
    fix: 0,
    sats: 0,
    speed: 0,
    course: 0,
    lastUpdate: null,
  });
  const [logs, setLogs] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    connectWs();
    return () => ws.current?.close();
  }, []);

  const connectWs = () => {
    ws.current = new WebSocket('ws://127.0.0.1:8787');

    ws.current.onopen = () => {
      setWsConnected(true);
      console.log('WS Connected');
    };

    ws.current.onclose = () => {
      setWsConnected(false);
      console.log('WS Disconnected, retrying...');
      setTimeout(connectWs, 3000);
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        setStatus(msg);
      } else if (msg.type === 'nmea') {
        const parsed = parseNmeaSentence(msg.line);
        if (parsed) {
          setData(prev => ({
            ...prev,
            ...parsed,
            lastUpdate: new Date().toLocaleTimeString(),
          }));
        }
        setLogs(prev => [msg.line, ...prev].slice(0, 50));
      }
    };
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: 'auto' }}>
      <h1>GNSS Dashboard</h1>
      
      <div style={{ background: wsConnected ? '#e8f5e9' : '#ffebee', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
        <strong>WS Status:</strong> {wsConnected ? 'Connected' : 'Connecting...'} <br/>
        <strong>BT Status:</strong> {status.bt} <br/>
        <strong>Device:</strong> {status.device} <br/>
        <strong>Clients:</strong> {status.clients}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        <Card label="Latitude" value={data.lat?.toFixed(7) || 'N/A'} />
        <Card label="Longitude" value={data.lon?.toFixed(7) || 'N/A'} />
        <Card label="Altitude" value={`${data.alt} m`} />
        <Card label="Fix Quality" value={FIX_QUALITY[data.fix] || 'N/A'} />
        <Card label="Satellites" value={data.sats} />
        <Card label="Speed" value={`${data.speed.toFixed(1)} km/h`} />
        <Card label="Course" value={`${data.course}°`} />
        <Card label="Last Update" value={data.lastUpdate || 'N/A'} />
      </div>

      <h3>Raw NMEA Log (last 50)</h3>
      <div style={{ 
        background: '#333', color: '#0f0', padding: '10px', height: '200px', 
        overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace', borderRadius: '4px' 
      }}>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ fontSize: '12px', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}

export default App;
