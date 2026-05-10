const express = require('express');
const router = express.Router();
const { query, run, get } = require('../db');

const TOLERANCE = process.env.WEIGHT_TOLERANCE || 50; 

router.post('/weight', async (req, res) => {
    const { actual_weight, cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    const state = req.getCartState(cart_id);
    state.actualWeight = actual_weight;

    if (state.isPaidAndUnlocked && actual_weight < 30) {
        state.isPaidAndUnlocked = false;
        req.io.to(cart_id).emit('navigate', '');
        req.io.to(cart_id).emit('stateUpdate', state);
        return res.json({ status: 'RESET', message: 'Cart reset successful' });
    }

    const items = await query('SELECT COUNT(*) as count FROM cart_items WHERE cart_id = ?', [cart_id]);
    if (items[0].count === 0) {
        state.weightVerificationPassed = false;
        state.isBillingEnabled = false;
        req.io.to(cart_id).emit('stateUpdate', state);
        return res.status(400).json({ error: 'Cart is empty' });
    }

    // Dynamic tolerance: 50g base noise + 2% of total weight for scale inaccuracies
    const TOLERANCE = 50 + (state.expectedWeight * 0.02);
    const diff = Math.abs(state.expectedWeight - actual_weight);
    let status = 'FAIL';

    console.log(`[Weight Check] Cart: ${cart_id} | Expected: ${state.expectedWeight}g | Actual: ${actual_weight}g | Diff: ${diff}g | Tolerance: ${TOLERANCE}g`);

    if (diff <= TOLERANCE) {
        status = 'PASS';
        state.weightVerificationPassed = true;
    } else {
        state.weightVerificationPassed = false;
        state.isBillingEnabled = false;
    }

    await run('INSERT INTO verification_logs (expected_weight, actual_weight, status) VALUES (?, ?, ?)',
        [state.expectedWeight, actual_weight, status]
    );

    req.io.to(cart_id).emit('stateUpdate', state);
    res.json({ status, expected: state.expectedWeight, actual: actual_weight, tolerance: TOLERANCE });
});

router.post('/random/start', async (req, res) => {
    const { cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    const state = req.getCartState(cart_id);

    if (!state.weightVerificationPassed) {
        return res.status(400).json({ error: 'Weight verification must pass first' });
    }

    const items = await query(`
        SELECT c.id, c.quantity, p.barcode, p.name 
        FROM cart_items c JOIN products p ON c.product_id = p.id
        WHERE c.cart_id = ?
    `, [cart_id]);

    if (items.length === 0) return res.status(400).json({ error: 'Empty cart' });

    const randomItem = items[Math.floor(Math.random() * items.length)];
    state.randomRescanItems = [randomItem.barcode];
    state.randomRescanItemName = randomItem.name;
    state.randomRescanPassed = false;
    state.isBillingEnabled = false;

    req.io.to(cart_id).emit('stateUpdate', state);
    res.json({ message: 'Random rescan required', item: randomItem.name });
});

router.post('/random/scan', async (req, res) => {
    const { barcode, cart_id } = req.body;
    if (!cart_id) return res.status(400).json({ error: 'cart_id is required' });

    const state = req.getCartState(cart_id);
    
    if (state.randomRescanItems.includes(barcode)) {
        state.randomRescanPassed = true;
        state.isBillingEnabled = true;
        state.randomRescanItems = [];
        state.randomRescanItemName = null;
        req.io.to(cart_id).emit('stateUpdate', state);
        res.json({ status: 'PASS' });
    } else {
        state.randomRescanPassed = false;
        state.isBillingEnabled = false;
        req.io.to(cart_id).emit('stateUpdate', state);
        
        const product = await get('SELECT id FROM products WHERE barcode = ?', [barcode]);
        const pid = product ? product.id : null;
        await run('INSERT INTO theft_alerts (product_id, reason) VALUES (?, ?)', [pid, 'Failed random rescan']);
        
        res.json({ status: 'FAIL', message: 'Barcode mismatch' });
    }
});

module.exports = router;
