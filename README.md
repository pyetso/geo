# GeoHub Radio

Focused radio-country guessing game.

## Local test
Double-click `TEST_LOCAL.bat` on Windows, or run `npm start` and open the local URL shown in the terminal.

The radio game is the main experience. A live Radio Garden station is streamed through `/api/radio-stream` so the Web Audio analyser can draw a real time-domain waveform from the audio signal.

Players get 5 attempts. Wrong guesses stay in the same round and receive a distance + direction hint based on country locations. The answer is revealed after a correct guess or after the fifth miss.

## Vercel
Deploy the folder as a Vercel project. No API key is required for the radio game.


## Radio reliability

The radio game now uses Radio Browser as its primary station directory and Radio Garden as a fallback. Both sources are served through `/api/radio-stream` so the browser can feed the real station audio into the waveform analyser. If a selected stream drops immediately, the client automatically requests another station before showing an error.
