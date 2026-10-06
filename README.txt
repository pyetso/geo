GeoHub Vercel Window fix

Replace these files in your existing project:
- api/window.js (new)
- api/country-location.js
- lib/game-data.js

Then commit and push:
  git add api/window.js api/country-location.js lib/game-data.js
  git commit -m "Fix Window Vercel API and compass anchors"
  git push origin main

Make sure WINDY_API_KEY exists in Vercel Project Settings > Environment Variables for Production.
After changing environment variables, redeploy.
