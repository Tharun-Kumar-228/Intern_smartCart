import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Scale, ShieldCheck } from 'lucide-react';

export default function Dashboard({ appState, cart, cartId }) {
  const navigate = useNavigate();

  return (
    <div className="page-container animate-fade-in">
      <div className="header">
        <h2 style={{ fontSize: '1.4rem' }}>{cartId}</h2>
        <div style={{color: 'var(--success)', fontWeight: 'bold', fontSize: '1.4rem'}}>
          ₹{cart.total.toFixed(2)}
        </div>
      </div>


      <div className="content-area glass" style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '8px' }}>
          {cart.items.length === 0 ? (
            <div className="flex-center" style={{ height: '100%', color: 'var(--text-secondary)', flexDirection: 'column', gap: '12px' }}>
              <ShoppingCart size={48} opacity={0.5} />
              <span style={{ fontSize: '1.2rem' }}>Scan item to start</span>
            </div>
          ) : (
            cart.items.map((item, idx) => (
              <div key={item.cart_item_id} className={`cart-item ${idx === appState.selectedItemIndex ? 'selected' : ''}`}>
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">₹{item.price}</div>
                </div>
                <div className="cart-item-qty">x{item.quantity}</div>
              </div>
            ))
          )}
        </div>
        
        {!appState.weightVerificationPassed && cart.items.length > 0 && (
          <div style={{ backgroundColor: 'var(--warning)', color: '#000', padding: '12px', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '8px', animation: 'pulse 2s infinite' }}>
            Please place/remove item on the scale!
          </div>
        )}

        <div className="status-bar" style={{ marginTop: 'auto' }}>
          <div className={`status-item ${appState.weightVerificationPassed ? 'pass' : 'fail'}`}>
            <Scale size={18} /> 
            {appState.weightVerificationPassed ? 'Verified' : 'Unverified'}
          </div>
          <div className={`status-item ${appState.isBillingEnabled ? 'pass' : 'fail'}`}>
            <ShieldCheck size={18} />
            {appState.isBillingEnabled ? 'Ready to Pay' : 'Locked'}
          </div>
        </div>
      </div>

    </div>
  );
}
