import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { SERVER_URL } from '../config';

export default function Verification({ appState, cartId }) {
  const navigate = useNavigate();
  const startRandomCalled = useRef(false);

  const handleStartRandom = async () => {
    try {
      await fetch(`${SERVER_URL}/api/verify/random/start`, { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('kioskSessionKey')}`
        },
        body: JSON.stringify({ cart_id: cartId })
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (appState.weightVerificationPassed && !appState.randomRescanPassed && appState.randomRescanItems.length === 0 && !startRandomCalled.current) {
      startRandomCalled.current = true;
      handleStartRandom();
    }
  }, [appState.weightVerificationPassed, appState.randomRescanPassed, appState.randomRescanItems.length]);

  return (
    <div className="page-container animate-fade-in">
      <div className="header">
        <button className="btn btn-icon" onClick={() => navigate(`/?cartId=${cartId}`)}><ArrowLeft /></button>
        <h2>Verification</h2>
        <div style={{width: 48}}></div>
      </div>

      <div className="content-area glass flex-center" style={{ flexDirection: 'column', gap: '16px', padding: '16px' }}>
        <div style={{ textAlign: 'center', width: '100%' }}>
          <h3 style={{ marginBottom: 8 }}>Weight Check</h3>
          <div style={{ fontSize: '1.2rem', margin: '8px 0', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
            Expected: <span style={{fontWeight:'bold'}}>{appState.expectedWeight}g</span> <br/>
            Actual: <span style={{fontWeight:'bold'}}>{appState.actualWeight}g</span>
          </div>
          {appState.weightVerificationPassed ? (
            <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', fontSize: '1.2rem' }}>
              <CheckCircle /> Passed
            </div>
          ) : (
            <div style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', fontSize: '1.2rem', animation: 'pulse 2s infinite' }}>
              <XCircle /> Please wait for weight match...
            </div>
          )}
        </div>

        <hr style={{ width: '100%', borderColor: 'var(--glass-border)' }} />

        {appState.randomRescanItems && appState.randomRescanItems.length > 0 && (
          <div style={{ textAlign: 'center', color: 'var(--warning)', animation: 'pulse 2s infinite' }}>
            <ShieldAlert size={48} style={{ margin: '0 auto' }} />
            <h3 style={{ margin: '8px 0' }}>Security Check</h3>
            <p style={{fontSize: '1.2rem'}}>Please scan the following item:</p>
            <div style={{ fontSize: '1.5rem', color: 'white', padding: '10px 20px', border: '2px dashed var(--warning)', display: 'inline-block', marginTop: '10px', fontWeight: 'bold' }}>
                {appState.randomRescanItemName || 'Loading...'}
            </div>
          </div>
        )}

        {appState.randomRescanPassed && (
          <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', fontSize: '1.2rem', flexDirection: 'column', textAlign: 'center' }}>
            <div><CheckCircle size={48} /></div>
            <div>Security Check Passed</div>
            <div style={{ fontSize: '1rem', opacity: 0.8, marginTop: '8px' }}>You can now proceed to pay</div>
          </div>
        )}
      </div>
    </div>
  );
}
