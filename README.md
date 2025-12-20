This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Smart Fill for Itinerary Segments

The itinerary planner now supports an optional "Smart fill" workflow that calls `/api/segments/autofill`. Travelers can type a flight number, train service, hotel, meal spot, or activity keyword and we will look up the details using free API tiers (AeroDataBox, Navitia, and Foursquare/OpenStreetMap). The modal shows a summary of what was filled so users can tweak the fields before saving.

### Required environment variables

Configure the following keys in your `.env.local` or hosting platform to enable every provider:

- `AERODATABOX_API_KEY` – RapidAPI key for [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) (used for flights). You can optionally override the host with `AERODATABOX_API_HOST` or base URL with `AERODATABOX_API_BASE`.
- `NAVITIA_API_TOKEN` – personal token from [Navitia](https://www.navitia.io/) (used for trains/ground transport). Override the dataset via `NAVITIA_COVERAGE` (defaults to `sncf`).
- `FOURSQUARE_API_KEY` – server-side API key for [Foursquare Places](https://location.foursquare.com/products/places/) (used for hotels, meals, and activities). If omitted, we fall back to the open [Nominatim](https://nominatim.org/) endpoint backed by OpenStreetMap data.
- `SEGMENT_AUTOFILL_CACHE_TTL_SECONDS` – optional override for the in-memory cache TTL (defaults to 900 seconds).

### Testing locally

Each request expects a JSON body with `type` and `query` fields. Example cURL request:

```bash
curl -X POST http://localhost:3000/api/segments/autofill \
	-H 'Content-Type: application/json' \
	-d '{
				"type": "flight",
				"query": "UA 120",
				"date": "2024-07-18"
			}'
```

On success the endpoint responds with a `data` object compatible with the itinerary segment form. This is exactly what the client component consumes when you click the "Auto fill" button inside the "Add segment" modal.
