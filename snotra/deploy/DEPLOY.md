# Deploying Snotra

The live app is the Vercel project "snotra" (production alias: snotra-fawn.vercel.app).
App code (js/css) is served from jsDelivr pinned to a commit SHA; the Vercel deploy
carries only the shell: index.html, manifest.webmanifest, sw.js, api/uh.js.

Loop for every release:
1. Commit + push the source changes on the working branch.
2. node deploy/build.mjs <full-commit-sha> snotra-v<N+1>
   (bump the cache version every deploy so installed PWAs refresh)
3. Deploy the four built files to Vercel (project "snotra", target production):
   index.html, manifest.webmanifest, sw.js, and api/uh.js (from deploy/api/uh.js).
4. Verify: the served index references the new SHA, and GET /api/uh returns 403
   "same-origin only" from outside a browser (proves the function deployed).

Notes:
- sw.template.js is the service-worker source; build.mjs stamps the cache name.
- Never cache /api/ in the service worker (live ring data).
- No em dashes in anything user-facing.
