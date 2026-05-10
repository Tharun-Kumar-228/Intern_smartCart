import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Logs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState({ verification_logs: [], theft_alerts: [] });
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/status/logs', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        }
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/login');
        return;
      }
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="page-container animate-fade-in" style={{ padding: '16px', overflowY: 'auto', display: 'block', maxWidth: '800px', margin: '0 auto' }}>
      <div className="header" style={{ marginBottom: 20 }}>
        <button className="btn btn-icon" onClick={() => navigate('/admin')} title="Back to Admin"><ArrowLeft /></button>
        <h2 style={{ fontSize: '1.8rem' }}>System Logs</h2>
        <button className="btn btn-icon" onClick={fetchLogs} disabled={loading}><RefreshCw size={24} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      
      <div className="glass" style={{ padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ color: 'var(--danger)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
           Security Alerts
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.theft_alerts.length === 0 ? <p style={{ opacity: 0.6 }}>No theft alerts recorded.</p> : logs.theft_alerts.map(a => (
            <div key={a.id} style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: '600' }}>{a.reason}</span>
                <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>{new Date(a.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                Product: <span style={{ color: 'var(--accent-color)' }}>{a.product_name || `Unknown (ID: ${a.product_id})`}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass" style={{ padding: '20px' }}>
        <h3 style={{ marginBottom: '12px' }}>Verification History</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.verification_logs.length === 0 ? <p style={{ opacity: 0.6 }}>No verification attempts yet.</p> : logs.verification_logs.map(v => (
            <div key={v.id} style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', color: v.status === 'PASS' ? 'var(--success)' : 'var(--danger)' }}>
                  {v.status === 'PASS' ? '✅ Weight Verified' : '❌ Weight Mismatch'}
                </span>
                <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>{new Date(v.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
                <div>Expected: <strong>{v.expected_weight}g</strong></div>
                <div>Actual: <strong>{v.actual_weight}g</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
