# Map Memory Merchandise - Complete Setup Guide

This guide will walk you through setting up the automated map merchandise system step by step. Follow each section carefully.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Etsy Developer Setup](#2-etsy-developer-setup)
3. [Printify Setup](#3-printify-setup)
4. [Airtable Setup](#4-airtable-setup)
5. [Environment Variables](#5-environment-variables)
6. [Running the Application](#6-running-the-application)
7. [Testing the System](#7-testing-the-system)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

Before starting, make sure you have:

- [ ] A computer with Node.js 18+ installed
- [ ] Python 3.9+ installed (for the map generator)
- [ ] An Etsy seller account
- [ ] A Printify account (free to start)
- [ ] An Airtable account (free tier works)

---

## 2. Etsy Developer Setup

### Step 2.1: Create an Etsy Developer Account

1. Go to [https://www.etsy.com/developers](https://www.etsy.com/developers)
2. Click "Register as a Developer" (top right)
3. Log in with your Etsy seller account
4. Accept the API Terms of Use

### Step 2.2: Create a New App

1. Click "Create a New App"
2. Fill in the form:
   - **App Name**: "Map Memory Merchandise" (or your business name)
   - **Description**: "Automated order processing for personalized map products"
   - **App Type**: Select "Seller Tool"
   - **Who will use this app?**: Select "For my shop only"
3. Click "Create App"

### Step 2.3: Get Your API Keys

After creating the app, you'll see your app dashboard:

1. Find and copy your **Keystring** (this is your API Key)
   - It looks like: `abc123xyz789...`
   - Save this as `ETSY_API_KEY`

2. Find and copy your **Shared Secret**
   - Save this as `ETSY_SHARED_SECRET`

### Step 2.4: Set Up OAuth Callback URL

1. In your app settings, find "Callback URLs"
2. Add your callback URL:
   - For local development: `http://localhost:3000/auth/etsy`
   - For production: `https://your-domain.com/auth/etsy`
3. Click "Save"

### Step 2.5: Request API Scopes

Your app needs these permissions (scopes):
- `transactions_r` - Read shop transactions/orders
- `shops_r` - Read shop information

These should be available by default for seller tools.

---

## 3. Printify Setup

### Step 3.1: Create a Printify Account

1. Go to [https://printify.com](https://printify.com)
2. Click "Sign Up" and create a free account
3. Choose "Connect your store" → "Sell on Etsy" (you can skip this for now)

### Step 3.2: Get Your API Token

1. Log into Printify
2. Click on your profile icon (top right) → "Settings"
3. Click "Connect" in the left sidebar
4. Under "API", click "Manage tokens"
5. Click "Generate new token"
6. Give it a name like "Map Memory Automation"
7. Copy the token immediately (it won't be shown again!)
   - Save this as `PRINTIFY_API_TOKEN`

### Step 3.3: Get Your Shop ID

1. In Printify, go to "My Stores"
2. If you haven't connected a store yet, click "Add new store" → "API Integration"
3. Once you have a store, look at the URL when viewing it
4. The Shop ID is in the URL: `printify.com/app/stores/[SHOP_ID]/...`
   - Save this as `PRINTIFY_SHOP_ID`

### Step 3.4: Find Your Print Provider

For beer can glasses, we recommend:

1. Go to Printify → "Catalog"
2. Search for "16oz Glass"
3. Look for "Sipper Glass 16oz" or similar
4. Click on it and note the Print Provider options
5. Choose a provider (e.g., "Monster Digital")
6. Note the Blueprint ID from the URL: `.../blueprint/[BLUEPRINT_ID]/...`

Default Blueprint ID for 16oz Glass: `1441`

---

## 4. Airtable Setup

### Step 4.1: Create an Airtable Account

1. Go to [https://airtable.com](https://airtable.com)
2. Sign up for a free account

### Step 4.2: Create a New Base

1. Click "Add a base" → "Start from scratch"
2. Name it "Map Memory Orders"

### Step 4.3: Import the Schema

**Option A: Import CSV (Recommended)**

1. In your new base, click the table name ("Table 1")
2. Rename it to "Orders"
3. Click the "..." menu → "Import data"
4. Choose "CSV file"
5. Upload `docs/airtable-schema.csv` from this project
6. Click "Import"
7. Delete the sample row after import

**Option B: Create Manually**

Create these columns with these exact names and types:

| Column Name | Type | Description |
|-------------|------|-------------|
| Etsy Receipt ID | Single line text | Unique order ID from Etsy |
| Status | Single select | Order status (see values below) |
| Customer Name | Single line text | Customer's name |
| Customer Email | Email | Customer's email |
| Shipping Address | Long text | Full street address |
| Shipping City | Single line text | City |
| Shipping State | Single line text | State/Province |
| Shipping Zip | Single line text | ZIP/Postal code |
| Shipping Country | Single line text | Country |
| Map Address | Long text | Address for the map design |
| Custom Text | Single line text | Text to print on product |
| Latitude | Number (decimal) | Map center latitude |
| Longitude | Number (decimal) | Map center longitude |
| Print File URL | URL | Link to generated artwork |
| Printify Order ID | Single line text | Order ID from Printify |
| Tracking Number | Single line text | Shipping tracking number |
| Tracking Carrier | Single line text | Carrier name (USPS, UPS, etc.) |
| Tracking URL | URL | Link to tracking page |
| Error Message | Long text | Error details if failed |
| Created At | Date (with time) | When order was created |
| Updated At | Date (with time) | Last update time |
| Processed At | Date (with time) | When processing completed |
| Shipped At | Date (with time) | When shipment was created |

For the **Status** column, add these options:
- pending
- geocoding
- generating_map
- composing
- uploading
- submitting
- in_production
- shipped
- delivered
- failed
- cancelled

### Step 4.4: Get Your Airtable Credentials

**Get your API Key:**
1. Go to [https://airtable.com/account](https://airtable.com/account)
2. Under "API", generate a personal access token
3. Click "Create new token"
4. Give it a name: "Map Memory System"
5. Add these scopes:
   - `data.records:read`
   - `data.records:write`
6. Add access to your "Map Memory Orders" base
7. Click "Create token"
8. Copy the token (starts with `pat...`)
   - Save this as `AIRTABLE_API_KEY`

**Get your Base ID:**
1. Go to [https://airtable.com/api](https://airtable.com/api)
2. Click on your "Map Memory Orders" base
3. Look at the URL: `airtable.com/[BASE_ID]/api/docs`
4. The Base ID starts with `app...`
   - Save this as `AIRTABLE_BASE_ID`

---

## 5. Environment Variables

Create a `.env` file in the root of your project with these variables:

```bash
# Session Secret (generate a random string)
SESSION_SECRET="your-random-secret-at-least-32-characters-long"

# Etsy API (from Step 2)
ETSY_API_KEY="your-etsy-keystring"
ETSY_SHARED_SECRET="your-etsy-shared-secret"
ETSY_REDIRECT_URI="http://localhost:3000/auth/etsy"

# Printify API (from Step 3)
PRINTIFY_API_TOKEN="your-printify-api-token"
PRINTIFY_SHOP_ID="your-printify-shop-id"
PRINTIFY_WEBHOOK_SECRET="choose-a-random-secret"

# Airtable (from Step 4)
AIRTABLE_API_KEY="pat..."
AIRTABLE_BASE_ID="app..."
AIRTABLE_TABLE_NAME="Orders"

# Map Service (local Python service)
MAP_ETCHER_URL="http://localhost:5000"

# Optional: File Storage (Cloudflare R2)
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
R2_ENDPOINT=""
R2_PUBLIC_URL=""
```

### Generate a Session Secret

Run this command to generate a secure random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `SESSION_SECRET`.

---

## 6. Running the Application

### Step 6.1: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Set up the map-etcher Python service
cd services/map-etcher
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Step 6.2: Start the Services

**Terminal 1 - Map Etcher Service:**
```bash
cd services/map-etcher
source venv/bin/activate
python -m src.api
```
This starts the map generation API on http://localhost:5000

**Terminal 2 - Main Application:**
```bash
npm run dev
```
This starts the Remix app on http://localhost:3000

### Step 6.3: Connect Etsy

1. Open http://localhost:3000/admin
2. Click "Connect" next to Etsy
3. You'll be redirected to Etsy to authorize the app
4. After authorization, you'll be back at the admin dashboard

---

## 7. Testing the System

### Test 1: Generate a Map

```bash
cd services/map-etcher
python test_generate.py
```

Check the `output/` folder for generated test images.

### Test 2: Poll for Orders

1. Make sure you have test orders in your Etsy shop
2. Go to http://localhost:3000/admin
3. Click "Poll Etsy Orders"
4. Check Airtable - orders should appear in your base

### Test 3: Process an Order

1. Add a test row to Airtable with status "pending"
2. Fill in Map Address: "Empire State Building, New York, NY"
3. Fill in Custom Text: "TEST"
4. Go to admin dashboard
5. Click "Process Pending"
6. Watch the status change as it processes

---

## 8. Troubleshooting

### "Failed to connect to Airtable"
- Check that your `AIRTABLE_API_KEY` starts with `pat`
- Verify `AIRTABLE_BASE_ID` starts with `app`
- Make sure the token has access to the correct base

### "Etsy OAuth error"
- Verify your callback URL matches exactly in Etsy and `.env`
- Check that your API key and secret are correct
- Make sure you're using HTTPS in production

### "Map generation failed"
- Check that Python 3.9+ is installed
- Verify all pip packages installed correctly
- Check internet connection (needs OpenStreetMap access)

### "Printify order failed"
- Verify your API token is valid
- Check Shop ID is correct
- Make sure you have a valid blueprint configured

### Orders Not Appearing
- Check the Etsy polling is working (see admin dashboard)
- Verify the Etsy Receipt parsing is matching your listing
- Check for errors in the browser console or server logs

---

## Need More Help?

- Check the `docs/MAP_MERCHANDISE_SYSTEM_DESIGN.md` for technical details
- Review logs in your terminal for error messages
- Make sure all environment variables are set correctly

---

## Production Deployment Checklist

Before going live:

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS for all URLs
- [ ] Update `ETSY_REDIRECT_URI` to production URL
- [ ] Set up Printify webhook URL: `https://your-domain.com/api/webhooks/printify?token=YOUR_SECRET`
- [ ] Configure a process manager (PM2) for the map-etcher service
- [ ] Set up automated polling (cron job or scheduled task)
- [ ] Test with a real order
- [ ] Monitor Airtable for failed orders
