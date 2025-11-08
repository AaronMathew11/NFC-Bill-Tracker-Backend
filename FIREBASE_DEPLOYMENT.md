# Firebase Deployment Guide

## Prerequisites
1. Firebase CLI is already installed
2. Firebase project `nfc-finance-app` should be created in Firebase Console

## Setup Steps

### 1. Login to Firebase (Required)
```bash
firebase login
```

### 2. Set Environment Variables
You need to set your environment variables in Firebase Functions:

```bash
# Set MongoDB URI
firebase functions:config:set mongo.uri="your_mongodb_connection_string"

# Set Cloudinary credentials
firebase functions:config:set cloudinary.cloud_name="your_cloud_name"
firebase functions:config:set cloudinary.api_key="your_api_key"
firebase functions:config:set cloudinary.api_secret="your_api_secret"
```

### 3. Update Functions Code for Config
The environment variables in Firebase Functions are accessed differently. Update `functions/index.js`:

```javascript
// Instead of process.env.MONGO_URI, use:
const config = functions.config();
const mongoUri = config.mongo.uri;
```

### 4. Deploy to Firebase
```bash
# Deploy functions
npm run deploy

# Or deploy everything
firebase deploy
```

### 5. Get Your API URL
After deployment, you'll get a URL like:
```
https://us-central1-nfc-finance-app.cloudfunctions.net/api
```

## Local Testing
```bash
# Run Firebase emulator locally
npm run serve
```

## Important Notes

1. **Environment Variables**: Firebase Functions use `functions.config()` instead of `process.env`
2. **Cold Starts**: First request may be slow due to MongoDB connection
3. **Timeout**: Functions have a 60-second timeout by default
4. **Pricing**: Firebase Functions are pay-per-use

## API Endpoints
Your API will be available at:
- Base URL: `https://us-central1-nfc-finance-app.cloudfunctions.net/api`
- All your existing routes will work under `/api/*`

Example:
- `GET /api/user-bills/:userId`
- `POST /api/upload-bill`
- `PATCH /api/update-bill/:billId`

## Troubleshooting
- Check logs: `firebase functions:log`
- Monitor in Firebase Console under Functions tab
- For CORS issues, verify the origin settings in your Express app