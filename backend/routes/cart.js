const express = require('express');
const router = express.Router();
const { query, run, get } = require('../db');
const { cartSessions, ADMIN_PASSWORD } = require('./auth');

const resetVerification = (req, cartId) => {
    const state = req.getCartState(cartId);
    state.weightVerificationPassed = false;
    state.randomRescanPassed = false;
    state.isBillingEnabled = false;
    req.io.to(cartId).emit('stateUpdate', state);
};

const emitCartUpdate = async (req, cartId) => {
    const items = await query(`
        SELECT c.id as cart_item_id, c.quantity, p.* 
        FROM cart_items c 
        JOIN products p ON c.product_id = p.id
        WHERE c.cart_id = ?
    `, [cartId]);
    
    let total = 0;
    let expectedWeight = 0;
    items.forEach(item => {
        total += item.price * item.quantity;
        expectedWeight += item.expected_weight * item.quantity;
    });

    const state = req.getCartState(cartId);
    state.expectedWeight = expectedWeight;
    req.io.to(cartId).emit('cartUpdate', { items, total });
    req.io.to(cartId).emit('stateUpdate', state);
};

// Get current cart
router.get('/', async (req, res) => {
    const cartId = req.query.cartId || req.body.cartId;
    if (!cartId) return res.status(400).json({ error: 'cartId is required' });

    try {
        const items = await query(`
            SELECT c.id as cart_item_id, c.quantity, p.* 
            FROM cart_items c 
            JOIN products p ON c.product_id = p.id
            WHERE c.cart_id = ?
        `, [cartId]);
        
        let expectedWeight = 0;
        items.forEach(item => {
            expectedWeight += item.expected_weight * item.quantity;
        });
        const state = req.getCartState(cartId);
        state.expectedWeight = expectedWeight;

        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/scan', async (req, res) => {
    const { barcode, cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    if (barcode === ADMIN_PASSWORD) {
        const session = cartSessions[cart_id];
        if (session) {
            const now = Date.now();
            if (now - session.lastPasscodeScanTime < 5000) {
                delete cartSessions[cart_id];
                req.io.to(cart_id).emit('kioskLogout');
                return res.json({ message: 'Session revoked' });
            } else {
                session.lastPasscodeScanTime = now;
                return res.json({ message: 'Passcode scanned' });
            }
        }
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const product = await get('SELECT * FROM products WHERE barcode = ?', [barcode]);
        if (!product) {
            req.io.to(cart_id).emit('scanError', { message: 'Product not found' });
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product.stock_quantity <= 0) {
            req.io.to(cart_id).emit('scanError', { message: 'Out of stock' });
            return res.status(400).json({ error: 'Out of stock' });
        }

        const existing = await get('SELECT * FROM cart_items WHERE product_id = ? AND cart_id = ?', [product.id, cart_id]);
        if (existing) {
            await run('UPDATE cart_items SET quantity = quantity + 1 WHERE id = ?', [existing.id]);
        } else {
            await run('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 1)', [cart_id, product.id]);
        }

        resetVerification(req, cart_id);
        await emitCartUpdate(req, cart_id);
        res.json({ message: 'Scanned successfully', product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/increase', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        const state = req.getCartState(cart_id);
        const items = await query('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id ASC', [cart_id]);
        if (items.length > 0 && state.selectedItemIndex < items.length) {
            const item = items[state.selectedItemIndex];
            
            // Check stock
            const product = await get('SELECT * FROM products WHERE id = ?', [item.product_id]);
            if (product.stock_quantity <= 0) {
                return res.status(400).json({ error: 'Out of stock' });
            }

            await run('UPDATE cart_items SET quantity = quantity + 1 WHERE id = ?', [item.id]);
            
            resetVerification(req, cart_id);
            await emitCartUpdate(req, cart_id);
            res.json({ message: 'Quantity increased' });
        } else {
            res.status(400).json({ error: 'No item selected' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/decrease', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        const state = req.getCartState(cart_id);
        const items = await query('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id ASC', [cart_id]);
        if (items.length > 0 && state.selectedItemIndex < items.length) {
            const item = items[state.selectedItemIndex];
            
            if (item.quantity > 1) {
                await run('UPDATE cart_items SET quantity = quantity - 1 WHERE id = ?', [item.id]);
            } else {
                await run('DELETE FROM cart_items WHERE id = ?', [item.id]);
                if (state.selectedItemIndex >= items.length - 1) {
                    state.selectedItemIndex = Math.max(0, items.length - 2);
                }
            }
            resetVerification(req, cart_id);
            await emitCartUpdate(req, cart_id);
            res.json({ message: 'Quantity decreased' });
        } else {
            res.status(400).json({ error: 'No item selected' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/remove', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        const state = req.getCartState(cart_id);
        const items = await query('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id ASC', [cart_id]);
        if (items.length > 0 && state.selectedItemIndex < items.length) {
            const item = items[state.selectedItemIndex];
            
            await run('DELETE FROM cart_items WHERE id = ?', [item.id]);
            
            if (state.selectedItemIndex >= items.length - 1) {
                state.selectedItemIndex = Math.max(0, items.length - 2);
            }
            resetVerification(req, cart_id);
            await emitCartUpdate(req, cart_id);
            res.json({ message: 'Item removed' });
        } else {
            res.status(400).json({ error: 'No item selected' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clear', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        await run('DELETE FROM cart_items WHERE cart_id = ?', [cart_id]);
        const state = req.getCartState(cart_id);
        state.selectedItemIndex = 0;
        resetVerification(req, cart_id);
        await emitCartUpdate(req, cart_id);
        res.json({ message: 'Cart cleared' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/up', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        const state = req.getCartState(cart_id);
        if (state.selectedItemIndex > 0) {
            state.selectedItemIndex--;
            req.io.to(cart_id).emit('stateUpdate', state);
        }
        res.json({ selectedIndex: state.selectedItemIndex });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/down', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        const state = req.getCartState(cart_id);
        const items = await query('SELECT COUNT(*) as count FROM cart_items WHERE cart_id = ?', [cart_id]);
        const count = items[0].count;
        if (state.selectedItemIndex < count - 1) {
            state.selectedItemIndex++;
            req.io.to(cart_id).emit('stateUpdate', state);
        }
        res.json({ selectedIndex: state.selectedItemIndex });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/navigate', async (req, res) => {
    const { cart_id, target } = req.body;
    if (!cart_id || target === undefined) return res.status(400).json({ error: 'cart_id and target are required' });

    try {
        req.io.to(cart_id).emit('navigate', target);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/finish', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    try {
        const state = req.getCartState(cart_id);
        state.isPaidAndUnlocked = false;
        req.io.to(cart_id).emit('navigate', '');
        req.io.to(cart_id).emit('stateUpdate', state);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
