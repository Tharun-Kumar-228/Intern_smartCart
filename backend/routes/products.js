const express = require('express');
const router = express.Router();
const { query, run, get } = require('../db');
const { authMiddleware } = require('./auth');

// Get all products
router.get('/', async (req, res) => {
    try {
        const products = await query('SELECT * FROM products');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a product
router.post('/', authMiddleware, async (req, res) => {
    const { barcode, name, price, expected_weight, stock_quantity } = req.body;
    try {
        await run(
            'INSERT INTO products (barcode, name, price, expected_weight, stock_quantity) VALUES (?, ?, ?, ?, ?)',
            [barcode, name, price, expected_weight, stock_quantity]
        );
        res.status(201).json({ message: 'Product added successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a product
router.put('/:id', authMiddleware, async (req, res) => {
    const { barcode, name, price, expected_weight, stock_quantity } = req.body;
    try {
        await run(
            'UPDATE products SET barcode=?, name=?, price=?, expected_weight=?, stock_quantity=? WHERE id=?',
            [barcode, name, price, expected_weight, stock_quantity, req.params.id]
        );
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a product
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await run('DELETE FROM products WHERE id=?', [req.params.id]);
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
