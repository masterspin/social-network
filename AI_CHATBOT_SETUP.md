# AI Chatbot Setup Instructions

## Environment Variables

Add the following to your `.env.local` file:

```bash
# OpenRouter API Key (for free AI models)
# Get your free API key at: https://openrouter.ai/keys
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: Your app URL for OpenRouter attribution
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Getting Your OpenRouter API Key

1. Go to https://openrouter.ai/
2. Sign up or log in
3. Navigate to https://openrouter.ai/keys
4. Create a new API key
5. Copy and paste it into your `.env.local` file

## Free Models Available

The chatbot is configured to use free models by default:

- **meta-llama/llama-3.1-8b-instruct:free** (Default)
- **google/gemini-flash-1.5:free** (Alternative)

Both models support function calling for tool use.

## Features Implemented

✅ **AI Chat Interface**

- Floating button in bottom-right corner
- Expandable chat panel
- Message history
- Natural language understanding

✅ **Tool Calling / Agentic Behavior**

- `search_flights(origin, destination, date)` - Searches for flight options
- `search_hotels(location, check_in_date)` - Searches for hotel options
- Automatically extracts parameters from natural language

✅ **Segment Suggestions**

- AI returns structured `SegmentAutofillSuggestion` objects
- Displayed as cards with "Add to Itinerary" buttons
- Pre-fills the segment form when clicked

✅ **Context Awareness**

- AI sees existing segments in the itinerary
- Makes suggestions based on current trip context

## How to Use

1. Open an itinerary in the planner
2. Click the "AI Assistant" button in the bottom-right
3. Ask questions like:
   - "Find flights from NYC to London on January 15"
   - "Search for hotels in Paris"
   - "Show me flights from SFO to Tokyo next week"
4. Review AI suggestions shown as cards
5. Click "Add to Itinerary" to pre-fill the segment form
6. Customize if needed and save

## Current Limitations

⚠️ **Mock Flight Data**: The `fetchFlightSuggestionFree()` function currently returns mock data. To get real flight data:

- Integrate AviationStack free tier (100 requests/month)
- Or implement web scraping for public flight data
- Update `lib/autofill/providers.ts` accordingly

✅ **Real Hotel Data**: Uses Nominatim/OpenStreetMap (completely free, no API key needed)

## Next Steps for Production

1. **Add Real Flight API**:

   - Sign up for AviationStack free tier
   - Add `AVIATIONSTACK_API_KEY` to `.env.local`
   - Implement API calls in `fetchFlightSuggestionFree()`

2. **Enhance Hotel Search**:

   - Already using free Nominatim API
   - Consider adding filters (star rating, price range, amenities)

3. **Add More Tools**:

   - `search_activities(location, type)` - Find things to do
   - `calculate_travel_time(origin, destination)` - Estimate durations
   - `suggest_itinerary(destinations, duration)` - Plan entire trips

4. **Improve Context**:

   - Add user preferences (budget, travel style)
   - Consider past itineraries
   - Suggest based on season/weather

5. **Chat Persistence**:
   - Currently ephemeral (resets on page refresh)
   - Add `itinerary_chat_history` table to save conversations
   - Load history on component mount

## Architecture

```
User Message
    ↓
ChatAssistant Component
    ↓
POST /api/itineraries/[id]/chat
    ↓
OpenRouter AI (with tool definitions)
    ↓
AI decides to call tools
    ↓
executeToolCall() runs provider functions
    ↓
Returns SegmentAutofillSuggestion[]
    ↓
Displayed as cards in chat
    ↓
User clicks "Add" → Pre-fills form
```

## Files Created/Modified

**New Files:**

- `lib/ai/openrouter.ts` - OpenRouter client wrapper
- `app/api/itineraries/[id]/chat/route.ts` - Chat API endpoint
- `components/ChatAssistant.tsx` - UI component
- `AI_CHATBOT_SETUP.md` - This file

**Modified Files:**

- `lib/autofill/providers.ts` - Added `fetchFlightSuggestionFree()`
- `components/ItineraryPlanner.tsx` - Integrated ChatAssistant component

## Troubleshooting

**"Unauthorized" error**:

- Make sure you're logged in
- Verify the itinerary belongs to your user

**"OPENROUTER_API_KEY environment variable is required"**:

- Add the API key to `.env.local`
- Restart your dev server (`pnpm dev`)

**No suggestions appearing**:

- Check browser console for errors
- Verify OpenRouter API key is valid
- Check Network tab for API responses

**AI not calling tools**:

- The free models should support function calling
- Try rephrasing your request more explicitly
- Check the system prompt in `route.ts`
