chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "FETCH_CHAT") return;

  const headers = {
    "Cache-Control": "no-cache",
    "Accept": "application/json",
  };

  // Use Bearer token if provided (avoids credentials:include + wildcard CORS conflict)
  if (msg.token) {
    headers["Authorization"] = `Bearer ${msg.token}`;
  }

  // Forward any extra headers the page uses (x-flow-* etc.)
  if (msg.extraHeaders) {
    Object.assign(headers, msg.extraHeaders);
  }

  fetch(msg.url, {
    method: "GET",
    cache: "no-store",
    headers,
  })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => sendResponse({ ok: true, data }))
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true; // keep message channel open for async response
});