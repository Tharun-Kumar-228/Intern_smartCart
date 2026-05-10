import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function KioskLogin() {
  const [scannedCartId, setScannedCartId] = useState('');
  const [status, setStatus] = useState('Waiting for Cart ID scan...');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let buffer = '';
    let timeoutId = null;

    const handleKeyDown = async (e) => {
      // Ignore modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;

      if (e.key === 'Enter') {
        const scan = buffer.trim();
        buffer = '';
        if (!scan) return;

        if (!scannedCartId) {
            setScannedCartId(scan);
            setStatus(`Cart ID: ${scan}. Now scan Admin Passcode.`);
            setError('');
        } else {
            // Second scan is the passcode
            const passcode = scan;
            setStatus('Authenticating...');
            try {
                const res = await fetch('http://localhost:5000/api/auth/cart-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cartId: scannedCartId, passcode })
                });
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('kioskSessionKey', data.sessionKey);
                    localStorage.setItem('kioskCartId', data.cartId);
                    try {
                        await document.documentElement.requestFullscreen();
                    } catch (fsError) {
                        console.warn('Fullscreen request failed:', fsError);
                    }
                    navigate('/');
                } else {
                    setError(data.error || 'Login failed');
                    setScannedCartId('');
                    setStatus('Waiting for Cart ID scan...');
                }
            } catch (err) {
                setError('Network error');
                setScannedCartId('');
                setStatus('Waiting for Cart ID scan...');
            }
        }
      } else {
        buffer += e.key;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { buffer = ''; }, 100); // clear buffer if slow typing (scanner is fast)
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scannedCartId, navigate]);

  const handleSimulatorLogin = async () => {
    setStatus('Authenticating simulator...');
    try {
        const res = await fetch('http://localhost:5000/api/auth/cart-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartId: 'CART-SIM-01', passcode: '9780201379624' })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('kioskSessionKey', data.sessionKey);
            localStorage.setItem('kioskCartId', data.cartId);
            try {
                await document.documentElement.requestFullscreen();
            } catch (fsError) {
                console.warn('Fullscreen request failed:', fsError);
            }
            navigate('/');
        } else {
            setError(data.error || 'Login failed');
            setStatus('Waiting for Cart ID scan...');
        }
    } catch (err) {
        setError('Network error');
        setStatus('Waiting for Cart ID scan...');
    }
  };

  return (
    <div className="page-container flex-center animate-fade-in" style={{ height: '100vh', flexDirection: 'column' }}>
      <div className="glass" style={{ padding: '40px', width: '80%', maxWidth: '400px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '20px' }}>Kiosk Login</h2>
        <div style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-secondary)' }}>
          {status}
        </div>
        {error && <div style={{ color: 'var(--danger)', marginTop: '10px' }}>{error}</div>}
        
        <div style={{ marginTop: '30px', opacity: 0.5, fontSize: '0.9rem' }}>
          Please use the barcode scanner. No keyboard required.
        </div>

        <div style={{ marginTop: '30px' }}>
          <button 
            onClick={handleSimulatorLogin}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            Simulator Login
          </button>
        </div>
      </div>
    </div>
  );
}
