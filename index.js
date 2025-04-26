// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const billRoutes = require('./routes/billRouts'); // Import the routes from routes.js

console.log('Starting the server...');


dotenv.config();
const app = express();

// Middleware to allow CORS and parse JSON
app.use(cors());
app.use(express.json());

// Use the routes for the /api path
app.use('/api', billRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected 🚀"))
  .catch((err) => console.error("MongoDB connection error: ", err));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
