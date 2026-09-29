# GeoHub

Minimal geography games built around live data.

### Radio
Radio Browser is the primary station directory and Radio Garden is the fallback. Streams are proxied through `/api/radio-stream` so the Web Audio analyser can draw a real waveform from the station audio.

Players have 5 attempts. Each wrong guess stays in the same round and shows the guessed country, distance to the answer, and direction. The waveform uses frame normalization so its visual energy stays responsive even when the player changes the volume slider.

### Flights
The Flights game uses Aviationstack active-flight data and the same country autocomplete/guess interaction.
When Aviationstack has live aircraft coordinates, the flight card displays altitude, speed, and an approximate position on the route. If live coordinates are missing, it still shows the active departure/arrival route.
