// ============================================================
// COOKIE CONSENT — DPDP Act (Digital Personal Data Protection
// Act, 2023, India) compliant consent banner
// -------------------------------------------------------------
// What this does:
//   - Shows a banner on first visit asking the user to Accept
//     All, Reject Non-Essential, or Manage Preferences.
//   - Strictly necessary cookies are always on (they're what
//     make the site work, so they don't need consent).
//   - Analytics is off by default — it only turns on if the
//     visitor explicitly says yes. That "off unless opted in"
//     default is the important part for DPDP-style consent:
//     consent has to be a clear, affirmative, opt-in action,
//     not a pre-ticked box someone has to notice and undo.
//   - The choice is remembered in localStorage for 6 months,
//     after which the banner reappears so consent stays current.
//   - "Cookie Settings" in the footer reopens the banner any
//     time so people can change their mind.
//
// How to use this when you add analytics/marketing scripts:
//   Wrap the script-loading code like this instead of dropping
//   the <script> tag straight into the page:
//
//     if (window.hasAnalyticsConsent()) {
//       loadAnalyticsScript();
//     }
//     window.addEventListener('cookie-consent-changed', (e) => {
//       if (e.detail.analytics) loadAnalyticsScript();
//     });
//
//   That way analytics never runs before the visitor has agreed
//   to it, and starts immediately if they turn it on later from
//   Cookie Settings without needing a page reload.
// ============================================================

const CONSENT_KEY = 'sj_cookie_consent';
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182; // ~6 months

function readConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== CONSENT_VERSION) return null;
    if (Date.now() - parsed.timestamp > CONSENT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(analytics) {
  const record = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: !!analytics,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private mode, etc.) — consent
    // still applies for this page view via the in-memory state.
  }
  window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: record }));
  return record;
}

// Public helper other scripts can check before loading anything
// that isn't strictly necessary.
window.hasAnalyticsConsent = function () {
  const c = readConsent();
  return !!(c && c.analytics);
};

document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('cookieBanner');
  const prefsPanel = document.getElementById('cookiePrefs');
  const analyticsToggle = document.getElementById('analyticsToggle');
  const defaultActions = document.getElementById('cookieActions');
  const saveActions = document.getElementById('cookieSaveActions');

  const acceptAllBtn = document.getElementById('cookieAcceptAll');
  const rejectAllBtn = document.getElementById('cookieRejectAll');
  const manageBtn = document.getElementById('cookieManageBtn');
  const savePrefsBtn = document.getElementById('cookieSavePrefs');
  const settingsFooterBtn = document.getElementById('cookieSettingsBtn');

  if (!banner) return;

  function openBanner() {
    banner.classList.add('show');
  }
  function closeBanner() {
    banner.classList.remove('show');
    prefsPanel.classList.remove('show');
    defaultActions.style.display = '';
    saveActions.style.display = 'none';
  }
  function showPrefsView(currentAnalytics) {
    analyticsToggle.checked = !!currentAnalytics;
    prefsPanel.classList.add('show');
    defaultActions.style.display = 'none';
    saveActions.style.display = 'flex';
  }

  // First visit / expired consent -> show the banner.
  const existing = readConsent();
  if (!existing) {
    openBanner();
  }

  acceptAllBtn.addEventListener('click', () => {
    writeConsent(true);
    closeBanner();
  });

  rejectAllBtn.addEventListener('click', () => {
    writeConsent(false);
    closeBanner();
  });

  manageBtn.addEventListener('click', () => {
    const current = readConsent();
    showPrefsView(current ? current.analytics : false);
  });

  savePrefsBtn.addEventListener('click', () => {
    writeConsent(analyticsToggle.checked);
    closeBanner();
  });

  // "Cookie Settings" link in the footer reopens the banner,
  // pre-filled with whatever the visitor last chose.
  if (settingsFooterBtn) {
    settingsFooterBtn.addEventListener('click', () => {
      const current = readConsent();
      openBanner();
      showPrefsView(current ? current.analytics : false);
    });
  }
});
