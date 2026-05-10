const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authMiddleware, cartAuthMiddleware } = require('./auth');

router.get('/', cartAuthMiddleware, async (req, res) => {
    const cart_id = req.authenticatedCartId; // Use authenticated ID for security
    const state = req.getCartState(cart_id);

    // If expectedWeight is 0, try to recalculate it from the database (state recovery)
    if (state.expectedWeight === 0) {
        try {
            const items = await query(`
                SELECT c.quantity, p.expected_weight 
                FROM cart_items c 
                JOIN products p ON c.product_id = p.id
                WHERE c.cart_id = ?
            `, [cart_id]);
            
            let totalWeight = 0;
            items.forEach(item => {
                totalWeight += item.expected_weight * item.quantity;
            });
            state.expectedWeight = totalWeight;
        } catch (err) {
            console.error("Status weight recovery error:", err);
        }
    }

    res.json(state);
});

router.get('/logs', authMiddleware, async (req, res) => {
    try {
        const vLogs = await query('SELECT * FROM verification_logs ORDER BY id DESC LIMIT 50');
        const tLogs = await query(`
            SELECT t.*, p.name as product_name 
            FROM theft_alerts t 
            LEFT JOIN products p ON t.product_id = p.id 
            ORDER BY t.id DESC LIMIT 50
        `);
        res.json({ verification_logs: vLogs, theft_alerts: tLogs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/bills', authMiddleware, async (req, res) => {
    try {
        const bills = await query('SELECT * FROM bills ORDER BY id DESC');
        res.json(bills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/bills/:id', async (req, res) => {
    try {
        const bill = await query('SELECT * FROM bills WHERE id = ?', [req.params.id]);
        if (bill.length === 0) return res.status(404).json({ error: 'Bill not found' });
        
        const items = await query(`
            SELECT b.*, p.name, p.barcode 
            FROM bill_items b 
            JOIN products p ON b.product_id = p.id 
            WHERE b.bill_id = ?
        `, [req.params.id]);
        
        res.json({ bill: bill[0], items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/whatsapp', async (req, res) => {
    const { billId, phone } = req.body;
    if (!billId || !phone) return res.status(400).json({ error: 'Bill ID and Phone number are required' });

    try {
        const bill = await query('SELECT * FROM bills WHERE id = ?', [billId]);
        if (bill.length === 0) return res.status(404).json({ error: 'Bill not found' });
        
        const items = await query(`
            SELECT b.*, p.name 
            FROM bill_items b 
            JOIN products p ON b.product_id = p.id 
            WHERE b.bill_id = ?
        `, [billId]);

        let message = `*Smart Cart Receipt*\nBill ID: #${bill[0].id}\nTotal: Rs.${bill[0].total_amount}\n\n*Items:*\n`;
        items.forEach(item => {
            message += `${item.quantity}x ${item.name} - Rs.${item.price * item.quantity}\n`;
        });
        message += `\nThank you for shopping!`;

        // This simulates calling a WhatsApp API (like Twilio or CallMeBot)
        // e.g., fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=YOUR_API_KEY`)
        console.log(`\n--- WHATSAPP API CALLED ---`);
        console.log(`To: ${phone}\nMessage:\n${message}\n---------------------------\n`);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
