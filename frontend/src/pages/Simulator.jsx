import React, { useState } from 'react';
import { ArrowLeft, RefreshCw, Barcode, ChevronUp, ChevronDown, Plus, Minus, Trash2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

export default function Simulator() {
  const navigate = useNavigate();
  const [cartId, setCartId] = useState(() => localStorage.getItem('kioskCartId') || 'CART-SIM-01');
  const [sessionKey, setSessionKey] = useState('');
  const [barcode, setBarcode] = useState('');
  const [weight, setWeight] = useState(0);
  const [isRescanMode, setIsRescanMode] = useState(false);

  React.useEffect(() => {
    socket.emit('joinCart', cartId);
    socket.on('stateUpdate', (state) => {
      setIsRescanMode(state.randomRescanItems && state.randomRescanItems.length > 0);
    });
    return () => socket.off('stateUpdate');
  }, [cartId]);

  React.useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/auth/cart-session?cartId=${cartId}`);
        const data = await res.json();
        setSessionKey(data.sessionKey || '');
      } catch (e) { setSessionKey(''); }
    };
    fetchSession();
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, [cartId]);

  const sendAction = async (endpoint, body = {}) => {
    try {
      await fetch(`http://localhost:5000/api/${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionKey}`
        },
        body: JSON.stringify({ cart_id: cartId, ...body })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleScan = () => {
    if (!barcode) return;
    const endpoint = isRescanMode ? 'verify/random/scan' : 'cart/scan';
    sendAction(endpoint, { barcode });
    setBarcode('');
  };

  const handleWeightChange = (val) => {
    setWeight(val);
    sendAction('verify/weight', { actual_weight: parseFloat(val) });
  };

  return (
    <div className="page-container animate-fade-in" style={{ padding: '16px', overflowY: 'auto', display: 'block', maxWidth: '500px', margin: '0 auto' }}>
      <div className="header" style={{ marginBottom: 20 }}>
        <button className="btn btn-icon" onClick={() => navigate('/')}><ArrowLeft /></button>
        <h2 style={{ fontSize: '1.5rem' }}>Hardware Simulator</h2>
        <div style={{width: 40}}></div>
      </div>

      <div className="glass" style={{ padding: '16px', marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', opacity: 0.7 }}>Simulating Cart ID:</label>
        <input 
          value={cartId} 
          onChange={(e) => setCartId(e.target.value)} 
          style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}
        />
      </div>

      <div className="glass" style={{ padding: '16px', marginBottom: '16px', border: isRescanMode ? '2px solid var(--warning)' : '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Barcode Scanner</h3>
          {isRescanMode && <span style={{ color: 'var(--warning)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={14}/> RESCAN MODE</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <input 
            placeholder="Enter barcode..." 
            value={barcode} 
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            style={{ flex: 1, padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}
          />
          <button className="btn btn-success" onClick={handleScan}><Barcode size={20}/></button>
        </div>
      </div>

      <div className="glass" style={{ padding: '16px', marginBottom: '16px' }}>
        <h3>Load Cell (Weight)</h3>
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Current: <strong>{weight}g</strong></span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="5000" 
            step="10" 
            value={weight} 
            onChange={(e) => handleWeightChange(e.target.value)}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn" style={{flex: 1}} onClick={() => handleWeightChange(0)}>Zero</button>
            <button className="btn" style={{flex: 1}} onClick={() => handleWeightChange(500)}>+500g</button>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: '16px' }}>
        <h3>Physical Buttons</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
          <button className="btn flex-center" onClick={() => sendAction('cart/up')} style={{gap: '8px'}}><ChevronUp /> Up</button>
          <button className="btn flex-center" onClick={() => sendAction('cart/down')} style={{gap: '8px'}}><ChevronDown /> Down</button>
          <button className="btn btn-success flex-center" onClick={() => sendAction('cart/increase')} style={{gap: '8px'}}><Plus /> Increase</button>
          <button className="btn btn-warning flex-center" onClick={() => sendAction('cart/decrease')} style={{gap: '8px'}}><Minus /> Decrease</button>
          <button className="btn btn-danger flex-center" onClick={() => sendAction('cart/remove')} style={{gap: '8px', gridColumn: 'span 2'}}><Trash2 /> Remove Selected</button>
          <button className="btn btn-warning flex-center" onClick={() => sendAction('cart/navigate', { target: 'verify' })} style={{gap: '8px', gridColumn: 'span 1'}}>Go to Verify</button>
          <button className="btn btn-success flex-center" onClick={() => sendAction('cart/navigate', { target: 'payment' })} style={{gap: '8px', gridColumn: 'span 1'}}>Go to Pay</button>
          <button className="btn flex-center" onClick={() => sendAction('cart/finish')} style={{gap: '8px', gridColumn: 'span 2', background: 'var(--danger)', color: 'white'}}>Reset Cart (Simulate Long Press)</button>
        </div>
      </div>
    </div>
  );
}
