import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Barcode, ChevronUp, ChevronDown, Plus, Minus,
  Trash2, ShieldAlert, Wifi, WifiOff, RefreshCw, LogIn,
  RotateCcw, CheckCircle, XCircle, Weight, ShoppingCart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const SERVER_URL = 'https://internsmartcart-production.up.railway.app';
const PASSCODE = '9780201379624';
const socket = io(SERVER_URL, { autoConnect: true });

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return { toasts, add };
}

export default function Simulator() {
  const navigate = useNavigate();
  const { toasts, add: toast } = useToast();
  const [cartId, setCartId] = useState(() => localStorage.getItem('kioskCartId') || 'CART-SIM-01');
  const [sessionKey, setSessionKey] = useState('');
  const [barcode, setBarcode] = useState('');
  const [weight, setWeight] = useState(0);
  const [weightInput, setWeightInput] = useState('');
  const [isRescanMode, setIsRescanMode] = useState(false);
  const [rescanItemName, setRescanItemName] = useState('');
  const [connected, setConnected] = useState(socket.connected);
  const [loginStatus, setLoginStatus] = useState('idle');
  const [appState, setAppState] = useState({});
  const [lastResponse, setLastResponse] = useState(null);
  const barcodeRef = useRef(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  useEffect(() => {
    if (!cartId) return;
    socket.emit('joinCart', cartId);
    const onState = (state) => {
      setAppState(state);
      const pending = state.randomRescanItems && state.randomRescanItems.length > 0;
      setIsRescanMode(pending);
      setRescanItemName(pending ? (state.randomRescanItemName || '') : '');
    };
    socket.on('stateUpdate', onState);
    return () => socket.off('stateUpdate', onState);
  }, [cartId]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/auth/cart-session?cartId=${cartId}`);
        if (res.ok) { const d = await res.json(); setSessionKey(d.sessionKey || ''); }
        else setSessionKey('');
      } catch { setSessionKey(''); }
    };
    fetchSession();
    const iv = setInterval(fetchSession, 5000);
    return () => clearInterval(iv);
  }, [cartId]);

  const sendAction = useCallback(async (endpoint, body = {}) => {
    if (!sessionKey) { toast('No session – click Login first', 'error'); return null; }
    try {
      const res = await fetch(`${SERVER_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionKey}` },
        body: JSON.stringify({ cart_id: cartId, ...body }),
      });
      const data = await res.json();
      setLastResponse({ ok: res.ok, data, endpoint });
      if (!res.ok) toast(`❌ ${endpoint}: ${data.error || res.status}`, 'error');
      else toast(`✅ ${endpoint}`, 'success');
      return data;
    } catch (e) { toast(`🔴 Network error: ${endpoint}`, 'error'); return null; }
  }, [sessionKey, cartId, toast]);

  const handleLogin = async () => {
    setLoginStatus('loading');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/cart-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId, passcode: PASSCODE }),
      });
      const data = await res.json();
      if (res.ok && data.sessionKey) {
        setSessionKey(data.sessionKey);
        setLoginStatus('ok');
        toast('🔐 Session started', 'success');
      } else { setLoginStatus('error'); toast(`Login failed: ${data.error}`, 'error'); }
    } catch { setLoginStatus('error'); toast('Login network error', 'error'); }
  };

  const handleScan = () => {
    if (!barcode.trim()) return;
    sendAction(isRescanMode ? 'verify/random/scan' : 'cart/scan', { barcode: barcode.trim() });
    setBarcode('');
    barcodeRef.current?.focus();
  };

  const sendWeight = (val) => {
    const w = parseFloat(val) || 0;
    setWeight(w);
    sendAction('verify/weight', { actual_weight: w });
  };

  const sessionOk = !!sessionKey;

  return (
    <div className="page-container animate-fade-in" style={{ padding: 16, overflowY: 'auto', display: 'block', maxWidth: 560, margin: '0 auto' }}>
      {/* Toasts */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type === 'error' ? '#c0392b' : t.type === 'success' ? '#27ae60' : '#2980b9', color: 'white', padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="header" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-icon" onClick={() => navigate('/')}><ArrowLeft /></button>
        <h2 style={{ fontSize: '1.4rem', margin: 0 }}>🛒 Hardware Simulator</h2>
        {connected
          ? <span style={{ color: '#2ecc71', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}><Wifi size={14} />Live</span>
          : <span style={{ color: '#e74c3c', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}><WifiOff size={14} />Offline</span>}
      </div>

      {/* Cart ID + Login */}
      <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7, fontSize: '0.85rem' }}>Simulating Cart ID:</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={cartId} onChange={e => setCartId(e.target.value)} style={{ flex: 1, padding: 10, background: 'rgba(0,0,0,.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: 6 }} />
          <button className={`btn ${sessionOk ? 'btn-success' : 'btn-warning'}`} onClick={handleLogin} disabled={loginStatus === 'loading'} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            {loginStatus === 'loading' ? <RefreshCw size={16} className="spin" /> : sessionOk ? <CheckCircle size={16} /> : <LogIn size={16} />}
            {sessionOk ? 'Active' : 'Login'}
          </button>
        </div>
        {sessionOk && <div style={{ marginTop: 8, fontSize: '0.72rem', opacity: 0.5, wordBreak: 'break-all' }}>Session: {sessionKey.slice(0, 28)}…</div>}
        <div style={{ marginTop: 6, fontSize: '0.72rem', opacity: 0.55 }}>Server: <span style={{ color: '#3498db' }}>{SERVER_URL}</span></div>
      </div>

      {/* Barcode Scanner */}
      <div className="glass" style={{ padding: 16, marginBottom: 16, border: isRescanMode ? '2px solid var(--warning)' : '1px solid var(--glass-border)', transition: 'border .3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Barcode size={18} /> Barcode Scanner</h3>
          {isRescanMode && <span style={{ color: 'var(--warning)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}><ShieldAlert size={14} /> RESCAN MODE</span>}
        </div>
        {isRescanMode && rescanItemName && (
          <div style={{ marginBottom: 8, padding: '6px 10px', background: 'rgba(241,196,15,.12)', borderRadius: 6, fontSize: '0.85rem', color: 'var(--warning)' }}>
            ⚠️ Rescan required: <strong>{rescanItemName}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={barcodeRef} placeholder="Enter or scan barcode…" value={barcode} onChange={e => setBarcode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleScan()} style={{ flex: 1, padding: 10, background: 'rgba(0,0,0,.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: 6 }} />
          <button className="btn btn-success" onClick={handleScan} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Barcode size={18} /> Scan</button>
        </div>
      </div>

      {/* Weight Sensor */}
      <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><Weight size={18} /> Load Cell (Weight)</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: '0.85rem' }}>
          <span>Expected: <strong style={{ color: '#3498db' }}>{appState.expectedWeight || 0}g</strong></span>
          <span>Actual: <strong style={{ color: weight <= 0 ? '#e74c3c' : '#2ecc71' }}>{weight}g</strong></span>
          <span>Status: <strong style={{ color: appState.weightVerificationPassed ? '#2ecc71' : '#e74c3c' }}>{appState.weightVerificationPassed ? '✅ PASS' : '❌ FAIL'}</strong></span>
        </div>
        <input type="range" min="0" max="5000" step="10" value={weight} onChange={e => sendWeight(e.target.value)} style={{ width: '100%', cursor: 'pointer', accentColor: '#3498db' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {[0, 100, 250, 500, 1000, 2000].map(v => (
            <button key={v} className="btn" style={{ flex: 1, minWidth: 55 }} onClick={() => sendWeight(v)}>{v === 0 ? 'Zero' : `${v}g`}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input type="number" min="0" max="9999" placeholder="Custom (g)" value={weightInput} onChange={e => setWeightInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { sendWeight(weightInput); setWeightInput(''); } }} style={{ flex: 1, padding: 8, background: 'rgba(0,0,0,.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: 6 }} />
          <button className="btn" onClick={() => { sendWeight(weightInput); setWeightInput(''); }}>Set</button>
        </div>
      </div>

      {/* Verification Flow */}
      <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 10px' }}>🔍 Verification Status</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.82rem', marginBottom: 12 }}>
          <span>Weight: <strong style={{ color: appState.weightVerificationPassed ? '#2ecc71' : '#e74c3c' }}>{appState.weightVerificationPassed ? '✅' : '❌'}</strong></span>
          <span>Rescan: <strong style={{ color: appState.randomRescanPassed ? '#2ecc71' : '#e74c3c' }}>{appState.randomRescanPassed ? '✅' : '❌'}</strong></span>
          <span>Billing: <strong style={{ color: appState.isBillingEnabled ? '#2ecc71' : '#e74c3c' }}>{appState.isBillingEnabled ? 'Enabled' : 'Disabled'}</strong></span>
        </div>
        <button className="btn btn-warning" onClick={() => sendAction('verify/random/start', {})} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ShieldAlert size={16} /> Start Random Rescan Check
        </button>
      </div>

      {/* Physical Buttons */}
      <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={18} /> Physical Buttons</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn flex-center" onClick={() => sendAction('cart/up')} style={{ gap: 6 }}><ChevronUp size={18} /> Up</button>
          <button className="btn flex-center" onClick={() => sendAction('cart/down')} style={{ gap: 6 }}><ChevronDown size={18} /> Down</button>
          <button className="btn btn-success flex-center" onClick={() => sendAction('cart/increase')} style={{ gap: 6 }}><Plus size={18} /> Increase</button>
          <button className="btn btn-warning flex-center" onClick={() => sendAction('cart/decrease')} style={{ gap: 6 }}><Minus size={18} /> Decrease</button>
          <button className="btn btn-danger flex-center" onClick={() => sendAction('cart/remove')} style={{ gap: 6, gridColumn: 'span 2' }}><Trash2 size={18} /> Remove Selected</button>
          <button className="btn btn-warning flex-center" onClick={() => sendAction('cart/navigate', { target: 'verify' })} style={{ gap: 6 }}>Go to Verify</button>
          <button className="btn btn-success flex-center" onClick={() => sendAction('cart/navigate', { target: 'payment' })} style={{ gap: 6 }}>Go to Pay</button>
          <button className="btn flex-center" onClick={() => sendAction('cart/finish')} style={{ gap: 6, gridColumn: 'span 2', background: 'var(--danger)', color: 'white' }}>
            <RotateCcw size={16} /> Reset Cart (Simulate Long Press)
          </button>
        </div>
      </div>

      {/* Last API Response */}
      {lastResponse && (
        <div className="glass" style={{ padding: 12, marginBottom: 16, fontSize: '0.74rem', opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong>Last Response</strong>
            <span style={{ color: lastResponse.ok ? '#2ecc71' : '#e74c3c', display: 'flex', alignItems: 'center', gap: 4 }}>
              {lastResponse.ok ? <CheckCircle size={13} /> : <XCircle size={13} />} {lastResponse.endpoint}
            </span>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#aaa' }}>
            {JSON.stringify(lastResponse.data, null, 2)}
          </pre>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
