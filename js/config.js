(function () {
  const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "::1";

  // Lokal = backend project (wrangler dev). External = Cloudflare Workers production.
  const BACKEND_URL = isLocal
    ? "http://127.0.0.1:8787"
    : "https://genco.yararara808.workers.dev";
  window.API_BASE_URL = BACKEND_URL;

  // Backwards-compatible fallbacks: presets & AI pakai backend ini bila user belum set di Settings.
  try {
    window.APP_CONFIG = window.APP_CONFIG || {};
    if (!window.APP_CONFIG.backendURL) window.APP_CONFIG.backendURL = BACKEND_URL;
  } catch (e) {}

  try {
    window.AI = window.AI || {};
    if (!window.AI.backendURL) window.AI.backendURL = BACKEND_URL;
  } catch (e) {}
})();
