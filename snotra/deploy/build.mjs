// Build the Vercel deploy bundle for Snotra, pinned to a commit SHA.
// Usage: node build.mjs <full-commit-sha> <cache-version e.g. snotra-v5>
import { readFileSync, writeFileSync } from 'fs';
const SHA = process.argv[2];
const CACHEV = process.argv[3];
if (!/^[0-9a-f]{40}$/.test(SHA || '') || !/^snotra-v\d+$/.test(CACHEV || '')) {
  console.error('usage: node build.mjs <40-char-sha> <snotra-vN>'); process.exit(1);
}
const CDN = `https://cdn.jsdelivr.net/gh/odinholm04/omni-systems-website@${SHA}`;
const OUT = '/tmp/claude-0/-home-user/e2b6ca71-d9e0-558b-8ba1-f37205129bf0/scratchpad/pwa';
const SRC = '/home/user/omni-systems-website/snotra';

// index: real source, asset URLs pinned to the SHA, PWA head + SW registration injected
let html = readFileSync(`${SRC}/index.html`, 'utf8')
  .replace('href="../icon.svg"', `href="${CDN}/icon.svg"`)
  .replace('href="css/app.css"', `href="${CDN}/snotra/css/app.css"`)
  .replace('src="js/app.js"', `src="${CDN}/snotra/js/app.js"`)
  .replace('</head>', `  <meta name="theme-color" content="#0a0b0c">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="${CDN}/snotra/icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Snotra">
</head>`)
  .replace('</body>', `  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  </script>
</body>`);
if (/[—–]/.test(html)) throw new Error('em/en dash found in built index.html');
writeFileSync(`${OUT}/index.deploy.html`, html);

// manifest
writeFileSync(`${OUT}/manifest.deploy.webmanifest`, JSON.stringify({
  name: 'Snotra - your unified brain',
  short_name: 'Snotra',
  description: 'Tasks, calendar, notes, deep work and rituals - all connected.',
  start_url: '/', scope: '/', display: 'standalone',
  background_color: '#0a0b0c', theme_color: '#0a0b0c',
  icons: [
    { src: `${CDN}/snotra/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${CDN}/snotra/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${CDN}/snotra/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// service worker: bump cache name so installed clients refresh
const sw = readFileSync(`${OUT}/sw.deploy.js`, 'utf8').replace(/snotra-v\d+/, CACHEV);
writeFileSync(`${OUT}/sw.deploy.js`, sw);

// serverless proxy comes straight from the repo
writeFileSync(`${OUT}/api-uh.deploy.js`, readFileSync(`${SRC}/deploy/api/uh.js`, 'utf8'));

console.log(`built: SHA ${SHA.slice(0, 7)}, cache ${CACHEV}, files: index.deploy.html manifest.deploy.webmanifest sw.deploy.js api-uh.deploy.js`);
