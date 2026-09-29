# GeoHub

Minimal geography games built around live data. Radio is the primary game; Flights is now available from the bottom navigation.

## Local test
Double-click `TEST_LOCAL.bat` on Windows, or run `npm start` and open the local URL shown in the terminal.

### Radio
Radio Browser is the primary station directory and Radio Garden is the fallback. Streams are proxied through `/api/radio-stream` so the Web Audio analyser can draw a real waveform from the station audio.

Players have 5 attempts. Each wrong guess stays in the same round and shows the guessed country, distance to the answer, and direction. The waveform uses frame normalization so its visual energy stays responsive even when the player changes the volume slider.

### Flights
The Flights game uses Aviationstack active-flight data and the same country autocomplete/guess interaction. Add this to `.env` for local testing:

```env
AVIATIONSTACK_API_KEY=your_key_here
```

When Aviationstack has live aircraft coordinates, the flight card displays altitude, speed, and an approximate position on the route. If live coordinates are missing, it still shows the active departure/arrival route.

## Vercel
Deploy the folder as a Vercel project. Add `AVIATIONSTACK_API_KEY` in Vercel Environment Variables to enable Flights. Radio does not require an API key.

## Current games

- **Radio** — live station audio, reactive waveform, five country guesses with distance/direction hints.
- **Flights** — active Aviationstack route with a great-circle route illustration derived from the real departure/arrival coordinates; live aircraft position is shown when available.
- **Newspaper** — a current NewsAPI headline is rendered directly on a newspaper illustration with the location redacted; guess the country in five tries.

The bottom navigation switches between these game modes.

### Local keys

Local testing reads `NEWS_API_KEY` and `AVIATIONSTACK_API_KEY` from `.env`. The file is excluded by `.gitignore`; do not commit it. For Vercel, configure the same names in Project Settings > Environment Variables rather than uploading `.env`.


## Vercel deployment notes

This build keeps Vercel functions independent from the local `server.js`. The API handlers import shared data logic from `lib/game-data.js`, while `server.js` remains only for local `TEST_LOCAL.bat` testing.

Set `NEWS_API_KEY` and `AVIATIONSTACK_API_KEY` in **Vercel > Project > Settings > Environment Variables** for Production and Preview. Do not commit a real `.env` file.

The hosted radio endpoint redirects to the upstream station instead of holding a Vercel function open for the lifetime of an internet-radio stream. Local testing still uses the local proxy.

Useful checks after deployment:

- `/api/status` should return JSON and show whether the News and Flight keys are configured.
- `/api/flights` should return JSON even when the upstream provider has no live coordinates.
- `/api/news` should return JSON or a provider error, not a Vercel function crash page.

If Vercel still reports `FUNCTION_INVOCATION_FAILED`, open the deployment's **Logs > Functions** view to see the uncaught runtime exception for the exact endpoint.
