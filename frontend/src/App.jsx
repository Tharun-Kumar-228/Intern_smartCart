import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Dashboard from './pages/Dashboard';
import Cart from './pages/Cart';
import Verification from './pages/Verification';
import Payment from './pages/Payment';
import Receipt from './pages/Receipt';
import Admin from './pages/Admin';
import Logs from './pages/Logs';
import Login from './pages/Login';
import Simulator from './pages/Simulator';
import KioskLogin from './pages/KioskLogin';

const SERVER_URL = 'https://internsmartcart-production.up.railway.app';
const socket = io(SERVER_URL);
const ADMIN_PASSWORD = '9780201379624';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/login" />;
};

const KioskRoute = ({ children }) => {
  const token = localStorage.getItem('kioskSessionKey');
  return token ? children : <Navigate to="/kiosk-login" />;
};

const LockScreen = ({ onUnlock, onLogout, cartId, sessionKey }) => {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let buffer = '';
    let timeoutId = null;
    let lastScanTime = 0;

    const handleKeyDown = async (e) => {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;

      if (e.key === 'Enter') {
        const scan = buffer.trim();
        buffer = '';
        if (!scan) return;

        if (scan === ADMIN_PASSWORD) {
          const now = Date.now();
          if (now - lastScanTime < 5000) {
            onLogout();
          } else {
            lastScanTime = now;
            setMessage('Scan passcode once more to confirm exit.');
            setTimeout(() => setMessage(''), 4000);
          }
        } else {
          // Scanned a product or something else. Unlock and add to cart!
          setMessage('Resuming cart...');
          try {
            await fetch(`${SERVER_URL}/api/cart/scan`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionKey}`
              },
              body: JSON.stringify({ barcode: scan, cart_id: cartId })
            });
          } catch (err) {
            console.error(err);
          }
          onUnlock();
        }
      } else {
        buffer += e.key;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { buffer = ''; }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUnlock, onLogout, cartId, sessionKey]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
      <h1 style={{ color: 'var(--danger)', marginBottom: '20px' }}>SYSTEM LOCKED</h1>
      <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>Full screen mode was interrupted.</p>
      <p style={{ fontSize: '1.2rem', marginBottom: '40px' }}>Scan admin passcode <b>TWICE</b> to exit, or scan any <b>Product</b> to resume.</p>
      {message && <div style={{ color: 'var(--warning)', fontSize: '1.2rem', padding: '10px', border: '1px solid var(--warning)', borderRadius: '8px' }}>{message}</div>}
    </div>
  );
};

const KioskApp = () => {
  const navigate = useNavigate();
  const cartId = localStorage.getItem('kioskCartId');
  const sessionKey = localStorage.getItem('kioskSessionKey');

  const [isLocked, setIsLocked] = useState(false);
  const [appState, setAppState] = useState({
    selectedItemIndex: 0,
    weightVerificationPassed: false,
    randomRescanPassed: false,
    isBillingEnabled: false,
    expectedWeight: 0,
    actualWeight: 0,
    randomRescanItems: []
  });
  const [cart, setCart] = useState({ items: [], total: 0 });

  const handleKioskLogout = () => {
    try { document.exitFullscreen(); } catch (e) {}
    localStorage.removeItem('kioskSessionKey');
    localStorage.removeItem('kioskCartId');
    setIsLocked(false);
    navigate('/kiosk-login');
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && localStorage.getItem('kioskSessionKey')) {
        setIsLocked(true);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!cartId || !sessionKey || isLocked) return;

    let buffer = '';
    let timeoutId = null;

    const handleGlobalScan = async (e) => {
      // Ignore modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return;

      if (e.key === 'Enter') {
        const scan = buffer.trim();
        buffer = '';
        if (!scan) return;

        // Determine correct endpoint based on current app state
        const isRescanPending = appState.randomRescanItems && appState.randomRescanItems.length > 0;
        const endpoint = isRescanPending ? 'verify/random/scan' : 'cart/scan';

        // Send the scan to the backend
        try {
          await fetch(`${SERVER_URL}/api/${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionKey}`
            },
            body: JSON.stringify({ barcode: scan, cart_id: cartId })
          });
        } catch (err) {
          console.error("Global scan error:", err);
        }
      } else {
        buffer += e.key;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { buffer = ''; }, 100);
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [cartId, sessionKey, isLocked, appState.randomRescanItems]);

  useEffect(() => {
    if (!cartId || !sessionKey) return;

    socket.emit('joinCart', cartId);

    const handleStateUpdate = (state) => setAppState(state);
    const handleCartUpdate = (cartData) => setCart(cartData);
    const handleNavigate = (target) => {
      const path = window.location.pathname;
      if (path.includes('/simulator') || path.includes('/admin') || path.includes('/logs')) {
        return;
      }
      navigate(target ? `/${target}?cartId=${cartId}` : `/?cartId=${cartId}`);
    };
    const handleScanError = (err) => {
      alert(`Scanner Error: ${err.message}`);
    };

    socket.on('stateUpdate', handleStateUpdate);
    socket.on('cartUpdate', handleCartUpdate);
    socket.on('kioskLogout', handleKioskLogout);
    socket.on('navigate', handleNavigate);
    socket.on('scanError', handleScanError);
    
    fetch(`${SERVER_URL}/api/status?cartId=${cartId}`, {
      headers: { 'Authorization': `Bearer ${sessionKey}` }
    })
      .then(res => {
        if (res.status === 401) { handleKioskLogout(); throw new Error('Unauthorized'); }
        return res.json();
      })
      .then(data => setAppState(prev => ({...prev, ...data})))
      .catch(console.error);
      
    fetch(`${SERVER_URL}/api/cart?cartId=${cartId}`, {
      headers: { 'Authorization': `Bearer ${sessionKey}` }
    })
      .then(res => {
        if (res.status === 401) { handleKioskLogout(); throw new Error('Unauthorized'); }
        return res.json();
      })
      .then(items => {
        let total = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        setCart({ items, total });
      })
      .catch(console.error);

    return () => {
      socket.off('stateUpdate', handleStateUpdate);
      socket.off('cartUpdate', handleCartUpdate);
      socket.off('kioskLogout', handleKioskLogout);
      socket.off('navigate', handleNavigate);
      socket.off('scanError', handleScanError);
    };
  }, [cartId, sessionKey, navigate]);

  const handleUnlock = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsLocked(false);
    } catch (err) {
      console.warn("Could not enter full screen", err);
    }
  };

  return (
    <>
      {isLocked && <LockScreen onUnlock={handleUnlock} onLogout={handleKioskLogout} cartId={cartId} sessionKey={sessionKey} />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/kiosk-login" element={<KioskLogin />} />
        
        <Route path="/" element={<KioskRoute><Dashboard appState={appState} cart={cart} cartId={cartId} /></KioskRoute>} />
        <Route path="/cart" element={<KioskRoute><Cart appState={appState} cart={cart} cartId={cartId} /></KioskRoute>} />
        <Route path="/verify" element={<KioskRoute><Verification appState={appState} cartId={cartId} /></KioskRoute>} />
        <Route path="/payment" element={<KioskRoute><Payment appState={appState} cart={cart} cartId={cartId} /></KioskRoute>} />
        <Route path="/receipt/:billId" element={<KioskRoute><Receipt cartId={cartId} /></KioskRoute>} />
        
        <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
        <Route path="/logs" element={<PrivateRoute><Logs /></PrivateRoute>} />
        <Route path="/simulator" element={<Simulator />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <Router>
      <KioskApp />
    </Router>
  );
}

export default App;
