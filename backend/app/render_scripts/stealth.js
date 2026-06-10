// Minimal stealth patches injected before page scripts run. These hide the most common
// headless/automation tells (navigator.webdriver, empty plugins/languages, missing
// window.chrome) that naive bot-detection checks. NOT a guarantee against sophisticated
// anti-bot systems — those may still block.
() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (e) {}
  try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }); } catch (e) {}
  try { Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] }); } catch (e) {}
  if (!window.chrome) { window.chrome = { runtime: {} }; }
  try {
    const q = window.navigator.permissions && window.navigator.permissions.query;
    if (q) {
      window.navigator.permissions.query = (p) =>
        p && p.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : q(p);
    }
  } catch (e) {}
}
