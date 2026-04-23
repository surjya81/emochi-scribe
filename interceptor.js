// ============================================================
// Emochi Chat Downloader — Page-Context Fetch Interceptor
// Runs in MAIN world (declared in manifest) to bypass CSP.
// Wraps window.fetch to capture the Bearer token the app uses,
// then posts it to the content script via postMessage.
// ============================================================

(function () {
  const TARGET = "emochi-backend-k8s.flowgpt.com";
  const EXTRA_KEYS = [
    "x-flow-app-version",
    "x-flow-language",
    "x-flow-platform-os",
    "x-flow-timezone-offset",
    "x-flow-userid",
  ];

  const _origFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
          ? input.url
          : String(input);

      if (url.includes(TARGET)) {
        const rawHeaders = init?.headers ?? (input instanceof Request ? input.headers : null);
        const token = extractToken(rawHeaders);
        const extraHeaders = extractExtraHeaders(rawHeaders);

        if (token) {
          window.postMessage(
            { type: "__EMOCHI_DL_TOKEN__", token, extraHeaders },
            "*"
          );
        }
      }
    } catch (_) {
      // Never break the page's fetch
    }

    return _origFetch(input, init);
  };

  function extractToken(headers) {
    if (!headers) return null;
    const auth = getHeader(headers, "authorization");
    if (!auth) return null;
    return auth.replace(/^Bearer\s+/i, "").trim();
  }

  function extractExtraHeaders(headers) {
    if (!headers) return {};
    const out = {};
    for (const k of EXTRA_KEYS) {
      const v = getHeader(headers, k);
      if (v) out[k] = v;
    }
    return out;
  }

  function getHeader(headers, name) {
    if (typeof headers.get === "function") {
      // Headers instance
      return headers.get(name) || headers.get(name.toLowerCase()) || null;
    }
    if (Array.isArray(headers)) {
      const pair = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
      return pair ? pair[1] : null;
    }
    if (typeof headers === "object") {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === name.toLowerCase()) return v;
      }
    }
    return null;
  }
})();