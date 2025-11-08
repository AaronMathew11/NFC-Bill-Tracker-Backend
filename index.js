const functions = require('firebase-functions');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const billRoutes = require('./routes/billRoutes');

console.log('Starting the server...');
// Updated for returned bills functionality - October 2025

// Load local environment variables for local development
dotenv.config();

// Load production environment variables for Firebase Functions
if (process.env.FUNCTION_TARGET) {
  dotenv.config({ path: '.env.production' });
}
const app = express();

// Get configuration based on environment
// For Firebase Functions v2, check if we're in production by checking if certain env vars exist
const isLocal = !process.env.FUNCTION_TARGET;

console.log('Environment:', isLocal ? 'Local' : 'Firebase Functions');

// Middleware to allow CORS and parse JSON
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Use the routes - Firebase Functions handles the /api prefix
if (isLocal) {
  // For local development, mount under /api
  app.get("/", function (req, res) {
    return res.send("Bill Tracker API is running locally");
  });
  app.use('/api', billRoutes);
} else {
  // For Firebase Functions, mount directly (Firebase handles the /api prefix)
  // Handle root route differently to avoid conflicts with bill routes
  app.get("/", function (req, res) {
    return res.send("Bill Tracker API is running on Firebase Functions");
  });
  app.use('/', billRoutes);
}

// MongoDB connection with environment-specific URI
const mongoUri = process.env.MONGO_URI;
console.log('Connecting to MongoDB...', mongoUri ? 'URI available' : 'No URI found');

mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB Connected 🚀"))
  .catch((err) => console.error("MongoDB connection error: ", err));

const connection = mongoose.connection;

connection.once("open", () => {
  console.log("Connected to MongoDB");
});

connection.on("error", (err) => {
  console.log("connection error");
  process.exit();
});

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);

// For local development only (not in Firebase Functions environment)
if (require.main === module) {
  const PORT = process.env.LOCAL_PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
}
