import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Plus, Minus, Trash2, ArrowLeft } from 'lucide-react';
import { SERVER_URL } from '../config';

export default function Cart({ appState, cart, cartId }) {
  const navigate = useNavigate();

  const handleAction = async (action) => {
    try {
      await fetch(`${SERVER_URL}/api/cart/${action}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_id: cartId })
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header">
        <button className="btn btn-icon" onClick={() => navigate(`/?cartId=${cartId}`)}><ArrowLeft /></button>
        <h2>Manage Cart</h2>
        <div style={{width: 48}}></div>
      </div>
      
      <div className="content-area glass" style={{ padding: '8px', flex: 1, display: 'flex' }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
          {cart.items.length === 0 && <div className="flex-center" style={{height:'100%'}}>Empty</div>}
          {cart.items.map((item, idx) => (
            <div key={item.cart_item_id} className={`cart-item ${idx === appState.selectedItemIndex ? 'selected' : ''}`} style={{ marginBottom: 4 }}>
              <div className="cart-item-info">
                <div className="cart-item-name">{item.name}</div>
                <div className="cart-item-price">₹{item.price} x {item.quantity}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '60px' }}>
          <button className="btn btn-icon" onClick={() => handleAction('up')}><ChevronUp /></button>
          <button className="btn btn-icon" onClick={() => handleAction('down')}><ChevronDown /></button>
          <button className="btn btn-icon btn-success" onClick={() => handleAction('increase')}><Plus /></button>
          <button className="btn btn-icon btn-warning" onClick={() => handleAction('decrease')}><Minus /></button>
          <button className="btn btn-icon btn-danger" onClick={() => handleAction('remove')}><Trash2 /></button>
        </div>
      </div>
      <button className="btn btn-danger" onClick={() => handleAction('clear')} style={{ height: '50px', fontSize: '1.2rem' }}>Clear All</button>
    </div>
  );
}
