// The shot-download anchor and the export status line.
//
// Why this exists: the capturing browser has no JS eval and cannot click
// display:none elements, and the old code revoked the blob URL 5 s after
// creating it — dead by the time anyone could click it. So the anchor is a
// real visible link (styled in game/index.html, bottom-left, above the
// title overlay) and its blob URL stays alive until the browser clicks it.
//
// Only a trusted (real user) click retires the link: the automatic click
// below is untrusted (isTrusted false) and must not kill the URL the
// capturing browser still needs to click. The revoke after a trusted click
// waits 1 s so the browser has the download in hand before the URL goes
// away. A 10-minute safety timeout covers the never-clicked case.
//
// The functions take the document / URL API as parameters so the node tests
// (test/shot.test.mjs) can drive them with stubs; in the browser main.js
// passes the real document and URL.
const REVOKE_AFTER_CLICK_MS = 1000;
const REVOKE_AFTER_MS = 10 * 60 * 1000;

export function createShotDownload(doc, urlApi) {
  let anchor = null;
  let url = null;
  let expiryTimer = 0;

  function revoke() {
    if (url) {
      urlApi.revokeObjectURL(url);
      url = null;
    }
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = 0;
    }
  }

  return {
    attach(blob, filename) {
      // A second attach (one shot per page load, so this should not happen)
      // replaces the old link and frees its URL first.
      revoke();
      url = urlApi.createObjectURL(blob);
      anchor = doc.createElement('a');
      anchor.id = 'shot-download';
      anchor.href = url;
      anchor.download = filename;
      anchor.textContent = `Download ${filename}`;
      doc.body.appendChild(anchor);
      anchor.addEventListener('click', (event) => {
        if (event.isTrusted) setTimeout(revoke, REVOKE_AFTER_CLICK_MS);
      });
      expiryTimer = setTimeout(revoke, REVOKE_AFTER_MS);
      // Best-effort automatic download; the visible link is the primary path.
      anchor.click();
      return anchor;
    },
    get anchor() { return anchor; },
    get url() { return url; },
  };
}

// Export status as visible page text, so the capturing browser can read the
// ready state + which path produced the file without JS eval. The element
// (#shot-status in game/index.html) starts hidden and is only ever shown in
// shot mode — normal play never sees it.
export function setShotStatus(doc, text) {
  const el = doc.getElementById('shot-status');
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}
