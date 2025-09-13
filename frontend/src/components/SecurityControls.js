import React, { useState } from 'react';
import './SecurityControls.css';

export const SecurityControls = ({ bikeData, sendCommand }) => {
  const [busy, setBusy] = useState(false);
  if (!bikeData) return null;
  const immobilized = !!bikeData.immobilization_status;

  const handleClick = async (action) => {
    setBusy(true);
    try {
      await sendCommand(action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel security-panel">
      <h2>Security</h2>
      <div className={`status-line ${immobilized ? 'immobilized' : 'active'}`}>
        Engine Status: {immobilized ? 'IMMOBILIZED' : 'ACTIVE'}
      </div>
      <div className="button-row">
        <button
          disabled={busy || immobilized}
          className="btn danger"
          onClick={() => handleClick('immobilize')}
        >
          IMMOBILIZE ENGINE
        </button>
        <button
          disabled={busy || !immobilized}
          className="btn primary"
          onClick={() => handleClick('resume')}
        >
          ACTIVATE ENGINE
        </button>
      </div>
      {busy && <div className="working">Processing...</div>}
    </div>
  );
};
