# Amadeus Flight Search API Setup

## Overview

The AI assistant now uses **Amadeus Flight Offers Search API** instead of AeroDataBox for flight searches. This provides:

✅ **Multi-leg flights** - Automatically finds connecting flights  
✅ **Price information** - Shows actual flight prices  
✅ **Better coverage** - More comprehensive flight data  
✅ **Free tier** - 2,000 API calls/month  

## Setup Instructions

### 1. Create Amadeus Account

1. Go to [Amadeus for Developers](https://developers.amadeus.com/)
2. Click "Register" and create a free account
3. Verify your email

### 2. Create an App

1. Log in to your Amadeus account
2. Go to "My Self-Service Workspace"
3. Click "Create New App"
4. Give it a name (e.g., "Social Network Itinerary Planner")
5. You'll receive:
   - **API Key** (Client ID)
   - **API Secret** (Client Secret)

### 3. Add Credentials to `.env.local`

```bash
# Amadeus API (for AI flight search)
AMADEUS_API_KEY=your_api_key_here
AMADEUS_API_SECRET=your_api_secret_here
```

### 4. Test Environment

By default, the code uses Amadeus **Test Environment**:
- URL: `https://test.api.amadeus.com`
- Free tier: 2,000 calls/month
- Test data (not real bookable flights)

For production, change to:
- URL: `https://api.amadeus.com`
- Requires paid plan

## What Changed

### Before (AeroDataBox)
- ❌ Only direct flights
- ❌ No price information
- ❌ Required 2 API calls per search (12-hour windows)
- ❌ No multi-leg support

### After (Amadeus)
- ✅ Direct AND connecting flights
- ✅ Price information included
- ✅ Single API call per search
- ✅ Automatic multi-leg routing

## Example Response

**User:** "Find flights from DTW to ZRH on Feb 27"

**Before:**
```
No direct flights found
```

**After:**
```
1. Direct Flight - LH8 · $850
2. 1-Stop Flight - via FRA · $620
   - DL123 · DTW → FRA
   - LH456 · FRA → ZRH
3. 1-Stop Flight - via AMS · $680
   - KL789 · DTW → AMS
   - KL234 · AMS → ZRH
```

## API Limits

**Free Tier:**
- 2,000 API calls/month
- Test environment only
- No credit card required

**Production:**
- Pay-as-you-go pricing
- Real bookable flights
- Requires credit card

## Files Modified

- `lib/autofill/amadeus.ts` - New Amadeus client
- `app/api/itineraries/[id]/chat/route.ts` - Updated to use Amadeus
- Kept AeroDataBox for manual flight number lookups (still useful)

## Troubleshooting

**"AMADEUS_API_KEY and AMADEUS_API_SECRET are required"**
- Add credentials to `.env.local`
- Restart dev server (`pnpm dev`)

**"Amadeus auth failed: 401"**
- Check that API Key and Secret are correct
- Make sure there are no extra spaces

**"No flights found"**
- Amadeus test environment has limited data
- Try common routes (e.g., NYC-LAX, LON-PAR)
- Check date is not too far in future
