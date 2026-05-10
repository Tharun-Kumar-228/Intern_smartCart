import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../config';

export default function Admin() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ barcode: '', name: '', price: '', expected_weight: '', stock_quantity: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/products`); // public endpoint
      const data = await res.json();
      setProducts(data);
    } catch(e) { console.error(e); }
  };

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: parseFloat(form.price),
      expected_weight: parseFloat(form.expected_weight),
      stock_quantity: parseInt(form.stock_quantity, 10)
    };

    if (editingId) {
      await fetch(`${SERVER_URL}/api/products/${editingId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      setEditingId(null);
    } else {
      await fetch(`${SERVER_URL}/api/products`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }
    setForm({ barcode: '', name: '', price: '', expected_weight: '', stock_quantity: '' });
    fetchProducts();
  };

  const handleQuickStock = async (product, change) => {
    const payload = {
      ...product,
      stock_quantity: product.stock_quantity + change
    };
    await fetch(`${SERVER_URL}/api/products/${product.id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    fetchProducts();
  };

  const handleEdit = (product) => {
    setForm({
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      expected_weight: product.expected_weight,
      stock_quantity: product.stock_quantity
    });
    setEditingId(product.id);
  };

  const cancelEdit = () => {
    setForm({ barcode: '', name: '', price: '', expected_weight: '', stock_quantity: '' });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await fetch(`${SERVER_URL}/api/products/${id}`, { 
      method: 'DELETE',
      headers: getHeaders()
    });
    fetchProducts();
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    navigate('/login');
  };

  return (
    <div className="page-container animate-fade-in" style={{ padding: '12px', overflowY: 'auto', display: 'block' }}>
      <div className="header" style={{ marginBottom: 12 }}>
        <button className="btn btn-icon" onClick={() => navigate('/')}><ArrowLeft /></button>
        <h2>Admin Panel</h2>
        <button className="btn btn-warning" onClick={logout} style={{ padding: '8px', fontSize: '0.9rem' }}>Logout</button>
      </div>
      
      <div className="glass" style={{ padding: '12px', marginBottom: '16px' }}>
        <h3>{editingId ? 'Edit Product' : 'Add Product'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <input placeholder="Barcode" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} required style={{padding:'8px'}}/>
          <input placeholder="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required style={{padding:'8px'}}/>
          <input placeholder="Price" type="number" step="0.01" value={form.price} onChange={e => setForm({...form, price: e.target.value})} required style={{padding:'8px'}}/>
          <input placeholder="Expected Wt (g)" type="number" step="0.1" value={form.expected_weight} onChange={e => setForm({...form, expected_weight: e.target.value})} required style={{padding:'8px'}}/>
          <input placeholder="Stock" type="number" value={form.stock_quantity} onChange={e => setForm({...form, stock_quantity: e.target.value})} required style={{padding:'8px'}}/>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>{editingId ? 'Update' : 'Add'}</button>
            {editingId && <button type="button" className="btn btn-warning" onClick={cancelEdit} style={{ flex: 1 }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="glass" style={{ padding: '12px' }}>
        <h3>Products</h3>
        <div style={{ marginTop: '8px' }}>
          {products.map(p => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.1rem' }}>{p.name}</strong>
                <span>₹{p.price}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Stock: <strong>{p.stock_quantity}</strong></span>
                  <button className="btn btn-icon btn-danger" style={{ width: 28, height: 28, fontSize: '1.2rem', padding: 0 }} onClick={() => handleQuickStock(p, -1)}>-</button>
                  <button className="btn btn-icon btn-success" style={{ width: 28, height: 28, fontSize: '1.2rem', padding: 0 }} onClick={() => handleQuickStock(p, 1)}>+</button>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-warning" style={{ padding: '4px 8px', fontSize: '0.9rem' }} onClick={() => handleEdit(p)}>Edit</button>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.9rem' }} onClick={() => handleDelete(p.id)}>Del</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
