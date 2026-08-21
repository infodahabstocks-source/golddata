'use strict';

/* GoldData intro splash overlay.
 * Injected on every page at startup; fades out smoothly once the
 * backend /health check, window load and the first admin API
 * endpoint have finished loading (with graceful fallbacks so the
 * splash can never trap the user). */

(function () {
  const SPLASH_MIN_MS = 900;
  const ENDPOINT_GRACE_MS = 2500;
  const SPLASH_MAX_MS = 7000;

  const overlay = document.createElement('div');
  overlay.id = 'app-splash';
  overlay.innerHTML = `
    <div class="splash-inner">
      <div class="splash-logo-wrap">
        <img src="images/logo.webp" alt="GoldData" class="splash-logo">
        <div class="splash-shine"></div>
      </div>
      <div class="splash-title">GoldData</div>
      <div class="splash-sub">Admin Console</div>
      <div class="splash-bar"><div class="splash-bar-fill"></div></div>
      <div class="splash-status" id="splash-status">Connecting to secure database\u2026</div>
    </div>`;
  document.body.appendChild(overlay);

  let hidden = false;
  let endpointLoadedResolve;

  function hideSplash() {
    if (hidden) return;
    hidden = true;
    overlay.classList.add('splash-hide');
    setTimeout(() => overlay.remove(), 750);
  }

  function setStatus(text) {
    const el = document.getElementById('splash-status');
    if (el) el.textContent = text;
  }

  /* Called by api.js after each successful admin endpoint response. */
  window.splashEndpointLoaded = function () {
    setStatus('Database online \u2014 loading workspace\u2026');
    if (endpointLoadedResolve) endpointLoadedResolve();
  };

  window.hideSplash = hideSplash;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const minDelay = wait(SPLASH_MIN_MS);

  const winLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((r) => window.addEventListener('load', r, { once: true }));

  const backendReady = fetch('/health', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); })
    .then(() => setStatus('Database online \u2014 loading workspace\u2026'))
    .catch(() => {});

  const firstEndpoint = new Promise((resolve) => { endpointLoadedResolve = resolve; });
  const endpointGrace = wait(ENDPOINT_GRACE_MS).then(() => endpointLoadedResolve());

  Promise.race([
    Promise.all([minDelay, winLoaded, backendReady, firstEndpoint]),
    wait(SPLASH_MAX_MS)
  ]).then(hideSplash);
})();
