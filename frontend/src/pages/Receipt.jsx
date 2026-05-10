import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export default function Receipt({ cartId }) {
  const { billId } = useParams();
  const navigate = useNavigate();
  const [billData, setBillData] = useState(null);
  const printed = useRef(false);

  useEffect(() => {
    fetch(`http://localhost:5000/api/status/bills/${billId}`)
      .then(res => {
        if (!res.ok) throw new Error('Receipt not found');
        return res.json();
      })
      .then(data => setBillData(data))
      .catch(err => {
        console.error(err);
        setBillData({ error: true });
      });
  }, [billId]);

  useEffect(() => {
    if (billData && !billData.error && billData.bill && !printed.current) {
      printed.current = true;
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [billData]);

  if (!billData) return <div className="flex-center" style={{height:'100%', color: 'white'}}>Loading...</div>;
  if (billData.error || !billData.bill) return <div className="flex-center" style={{height:'100%', color: 'white', flexDirection: 'column'}}>
    <h2>Receipt Error</h2>
    <button className="btn" onClick={() => navigate(`/?cartId=${cartId}`)} style={{marginTop: '20px'}}>Back to Home</button>
  </div>;

  const handleFinish = async () => {
    try {
      await fetch('http://localhost:5000/api/cart/finish', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('kioskSessionKey')}`
        },
        body: JSON.stringify({ cart_id: cartId })
      });
    } catch (e) {
      console.error(e);
      navigate(`/?cartId=${cartId}`); // fallback
    }
  };

  return (
    <div className="page-container animate-fade-in" style={{ backgroundColor: 'var(--success)', padding: 0 }}>
      <style>
        {`
          @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; color: black !important; }
          }
          @media screen {
            .print-only { display: none !important; }
          }
        `}
      </style>
      <div className="content-area flex-center" style={{ flexDirection: 'column', padding: '24px', background: 'white', color: 'black', borderRadius: 0 }}>
        
        {/* SCREEN VIEW */}
        <div className="no-print" style={{ textAlign: 'center', width: '100%' }}>
          <CheckCircle size={64} color="var(--success)" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '1.8rem' }}>Payment Successful!</h2>
          
          <div style={{ margin: '24px 0', fontSize: '2rem', fontWeight: 'bold' }}>
            Bill #{billData.bill.id}
          </div>
          
          <div style={{ margin: '16px 0', fontSize: '1.3rem', color: '#555', padding: '16px', background: '#f5f5f5', borderRadius: '8px' }}>
            Please collect your printed receipt at the counter.
          </div>
        </div>

        <div className="no-print" style={{ backgroundColor: 'rgba(0, 255, 0, 0.1)', border: '2px dashed var(--success)', padding: '12px', borderRadius: '8px', marginTop: '16px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--success)', animation: 'pulse 2s infinite', width: '100%' }}>
          CART UNLOCKED
          <div style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginTop: '4px' }}>Please remove your items</div>
        </div>

        <button 
          className="btn no-print" 
          onClick={handleFinish} 
          style={{ width: '100%', marginTop: 'auto', background: 'var(--success)', color: 'white', fontSize: '1.3rem', padding: '16px' }}
        >
          New Cart
        </button>

        {/* PRINT VIEW */}
        <div className="print-only" style={{ width: '100%', fontFamily: 'monospace' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '4px', fontSize: '24px' }}>SMART CART</h2>
          <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>Receipt #{billData.bill.id}</div>
          
          <div style={{ width: '100%', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '16px 0', marginBottom: '16px' }}>
            {billData.items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '16px' }}>
                <span>{item.quantity}x {item.name}</span>
                <span>Rs. {item.price * item.quantity}</span>
              </div>
            ))}
          </div>
          
          <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '20px' }}>
            TOTAL: Rs. {billData.bill.total_amount}
          </div>
          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px' }}>
            Thank you for shopping!
          </div>
        </div>

      </div>
    </div>
  );
}
