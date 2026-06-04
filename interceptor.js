(function () {
  const messageCache = [];
  let contentScriptReady = false;

  console.log("[Emochi Scribe] Interceptor injected. Watching network traffic...");

  // Listen for content.js waking up
  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.type === "__EMOCHI_DL_READY__") {
      console.log(`[Emochi Scribe] Panel ready! Flushing ${messageCache.length} cached requests.`);
      contentScriptReady = true;
      messageCache.forEach(data => {
        window.postMessage({ type: '__EMOCHI_DL_DATA__', data }, '*');
      });
      messageCache.length = 0; 
    }
  });

  // Helper to validate and send data
  function processInterceptedData(url, data) {
    // If the JSON contains our precious messages array, capture it!
    if (data && (data.messages || (data.data && data.data.messages))) {
      console.log(`[Emochi Scribe] Captured chat data from: ${url}`);
      if (contentScriptReady) {
        window.postMessage({ type: '__EMOCHI_DL_DATA__', data }, '*');
      } else {
        messageCache.push(data);
      }
    }
  }

  // --- 1. FETCH INTERCEPTOR ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    // Safely force the URL to a string
    const reqUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    const response = await origFetch.apply(this, args);

    if (reqUrl.includes('/conversation/')) {
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
        if (url.includes('/conversation/')) {
          const data = xhr.responseType === 'json' ? xhr.response : JSON.parse(xhr.responseText);
          processInterceptedData(url, data);
        }
      } catch (e) {}
    });
    
    return xhr;
  };
})();