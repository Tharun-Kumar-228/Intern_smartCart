# Smart Cart Automatic Billing System

This is a complete full-stack project for a Smart Shopping Cart. The business logic runs on a central Node.js server, the frontend UI is built with React (optimized for a 4.5"x4.5" display), and the hardware logic runs on a Raspberry Pi using Python.

## Features
- **Centralized Logic**: Server handles cart math, expected weight, verification rules, and Razorpay.
- **Hardware Integration**: Raspberry Pi Python script manages HX711 load cell, GPIO buttons, and barcode scanner inputs.
- **Real-Time UI**: React frontend connects via Socket.IO for instant UI updates. Designed to fit a 1:1 aspect ratio square kiosk screen.
- **Anti-Theft System**: Weight verification (expected vs actual) and random rescan prompts.

## Structure
- `/backend`: Node.js, Express, SQLite, Socket.IO
- `/frontend`: React, Vite, Socket.IO-Client
- `/pi`: Python hardware controller (GPIO, HX711, Barcode)

## Setup Backend
1. `cd backend`
2. Create a `.env` file and add:
   ```env
   PORT=5000
   RAZORPAY_KEY_ID=YOUR_KEY_ID
   RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
   WEIGHT_TOLERANCE=50
   BYPASS_PAYMENT=true
   BYPASS_VERIFICATION=true
   ```
3. `npm start` (or `node server.js`)

## Setup Frontend
1. `cd frontend`
2. `npm run dev`
3. View on `http://localhost:5173` (Use a square window to simulate the 4.5" display)

## Setup Pi
1. `cd pi`
2. `pip install -r requirements.txt`
3. `python main.py`
(If running on a non-Pi machine, it will run in MOCK mode and allow you to test barcode scanning via terminal input).

## Demo Flow
1. Open Admin Panel at `http://localhost:5173/admin` to add test products.
2. In the Pi terminal, type a barcode and hit Enter to simulate scanning.
3. The UI will update in real-time. Use the Verify and Pay buttons to checkout.
