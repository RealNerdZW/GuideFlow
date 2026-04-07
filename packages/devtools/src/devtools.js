// Bootstrap file for GuideFlow DevTools panel registration.
// Must be a separate file (not inline) to comply with Manifest V3 CSP.
chrome.devtools.panels.create(
  'GuideFlow',
  'assets/icon-16.png',
  'panel.html',
  function (_panel) {
    // Panel created successfully
  }
);
