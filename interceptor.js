(function () {
  const payloadCache = [];
  const MAX_CACHED_PAYLOADS = 25;
  let contentScriptReady = false;

  console.log("[Emochi Scribe] Interceptor injected. Watching network traffic...");

  // Listen for content.js waking up
  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.type === "__EMOCHI_DL_READY__") {
      console.log(`[Emochi Scribe] Panel ready! Flushing ${payloadCache.length} cached requests.`);
      contentScriptReady = true;
      payloadCache.forEach(data => {
        window.postMessage({ type: '__EMOCHI_DL_DATA__', data }, '*');
      });
      payloadCache.length = 0;
    }
  });

  // Helper to validate and send data
  function processInterceptedData(url, data) {
    const hasMessages = !!(data && (data.messages || (data.data && data.data.messages)));
    const hasImages = !!(data && (data.images || (data.data && data.data.images)));
    if (!hasMessages && !hasImages) return;

    const kind = hasImages ? "gallery" : "chat";
    const payload = { url, kind, body: data };
    console.log(`[Emochi Scribe] Captured ${kind} data from: ${url}`);

    if (contentScriptReady) {
      window.postMessage({ type: '__EMOCHI_DL_DATA__', data: payload }, '*');
    } else {
      if (payloadCache.length >= MAX_CACHED_PAYLOADS) payloadCache.shift();
      payloadCache.push(payload);
    }
  }

  function isRelevantUrl(url) {
    return url.includes('/conversation/')
      || url.includes('/image/chat/gallery');
  }

  // --- 1. FETCH INTERCEPTOR ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    // Safely force the URL to a string
    const reqUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    const response = await origFetch.apply(this, args);

    if (isRelevantUrl(reqUrl)) {
      try {
        const clone = response.clone();
        clone.json().then(data => processInterceptedData(reqUrl, data)).catch(() => {});
      } catch (err) {}
    }
    return response;
  };

  // --- 2. SAFE XHR INTERCEPTOR ---
  // Safely intercepts older XHR requests without breaking CORS or Credentials
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    
    xhr.open = function(method, url, ...rest) {
      this._url = String(url);
      return origOpen.call(this, method, url, ...rest);
    };
    
    xhr.addEventListener('load', function() {
      try {
        const url = xhr.responseURL || xhr._url || "";
        if (isRelevantUrl(url)) {
          const data = xhr.responseType === 'json' ? xhr.response : JSON.parse(xhr.responseText);
          processInterceptedData(url, data);
        }
      } catch (e) {}
    });
    
    return xhr;
  };
})();
