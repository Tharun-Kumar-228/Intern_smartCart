import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SERVER_URL } from '../config';

export default function Payment({ appState, cart, cartId }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && cart.items.length > 0) {
      initialized.current = true;
      handlePayment();
    }
  }, [cart]);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const sessionKey = localStorage.getItem('kioskSessionKey');
      const orderRes = await fetch(`${SERVER_URL}/api/payment/create-order`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionKey}`
        },
        body: JSON.stringify({ cart_id: cartId })
      });
      const orderData = await orderRes.json();
      
      if (!orderRes.ok) {
        alert(orderData.error || "Payment system error");
        setLoading(false);
        return;
      }

      if (orderData.is_mock) {
        console.log("Using Mock Payment flow");
        handleVerify(orderData.order.id, 'mock_payment_id', 'mock_signature');
        return;
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "Smart Cart",
        description: "Test Transaction",
        order_id: orderData.order.id,
        handler: async function (response) {
          handleVerify(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
        },
        prefill: {
          name: "Customer",
          email: "customer@example.com",
          contact: "9876543210"
        },
        theme: {
          color: "#3b82f6"
        }
      };
      
      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', function (response){
        alert("Payment Failed: " + response.error.description);
        setLoading(false);
        navigate(`/?cartId=${cartId}`); // Navigate back if payment explicitly fails
      });
      rzp1.open();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleVerify = async (order_id, payment_id, signature) => {
    try {
      const sessionKey = localStorage.getItem('kioskSessionKey');
      const verifyRes = await fetch(`${SERVER_URL}/api/payment/verify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionKey}`
        },
        body: JSON.stringify({
          razorpay_order_id: order_id,
          razorpay_payment_id: payment_id,
          razorpay_signature: signature,
          cart_id: cartId
        })
      });
      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        navigate(`/receipt/${verifyData.billId}?cartId=${cartId}`);
      } else {
        alert("Payment verification failed: " + (verifyData.error || "Unknown error"));
        navigate(`/?cartId=${cartId}`); // Navigate back on server verify failure
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header">
        <button className="btn btn-icon" onClick={() => navigate(`/?cartId=${cartId}`)}><ArrowLeft /></button>
        <h2>Payment</h2>
        <div style={{width: 48}}></div>
      </div>
      
      <div className="content-area glass flex-center" style={{ flexDirection: 'column', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <h3>Total Amount</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
            ₹{cart.total.toFixed(2)}
          </div>
        </div>
        
        {loading && (
          <div style={{ fontSize: '1.4rem', color: 'var(--warning)', animation: 'pulse 2s infinite' }}>
            Processing Payment...
          </div>
        )}
      </div>
    </div>
  );
}
