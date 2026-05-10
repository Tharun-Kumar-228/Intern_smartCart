require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Razorpay = require('razorpay');

const { db, get, run, query } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

app.use(cors());
app.use(express.json());

// State mapping: cart_id -> state
const cartStates = {};

const getCartState = (cartId) => {
    if (!cartStates[cartId]) {
        cartStates[cartId] = {
            selectedItemIndex: 0,
            weightVerificationPassed: false,
            randomRescanPassed: false,
            randomRescanItems: [],
            isBillingEnabled: false,
            expectedWeight: 0,
            actualWeight: 0
        };
    }
    return cartStates[cartId];
};

// Razorpay Instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_KEY_ID',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET'
});

// Pass IO and State getter to routes
app.use((req, res, next) => {
    req.io = io;
    req.getCartState = getCartState;
    next();
});

// Import routes (we will create these)
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const verifyRoutes = require('./routes/verify');
const paymentRoutes = require('./routes/payment');
const statusRoutes = require('./routes/status');
const { router: authRoutes, cartAuthMiddleware } = require('./routes/auth');

app.use('/api/products', productRoutes);
app.use('/api/cart', cartAuthMiddleware, cartRoutes);
app.use('/api/verify', cartAuthMiddleware, verifyRoutes);
app.use('/api/payment', cartAuthMiddleware, paymentRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/auth', authRoutes);

// Socket.io connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('joinCart', (cartId) => {
        socket.join(cartId);
        console.log(`Socket ${socket.id} joined room ${cartId}`);
        socket.emit('stateUpdate', getCartState(cartId));
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
