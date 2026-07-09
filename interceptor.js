(function () {
  const payloadCache = [];
  const MAX_CACHED_PAYLOADS = 25;
  let contentScriptReady = false;

  console.log("[Emochi Scribe] Interceptor injected. Watching network traffic...");

  // Listen for content.js waking up safely
  document.addEventListener("__EMOCHI_DL_READY__", () => {
    console.log(`[Emochi Scribe] Panel ready! Flushing ${payloadCache.length} cached requests.`);
    contentScriptReady = true;
    payloadCache.forEach(data => {
      document.dispatchEvent(new CustomEvent('__EMOCHI_DL_DATA__', { detail: data }));
    });
    payloadCache.length = 0;
  });

  function processInterceptedData(url, data) {
    const hasMessages = !!(data && (data.messages || (data.data && data.data.messages)));
    const hasImages = !!(data && (data.images || (data.data && data.data.images)));
    if (!hasMessages && !hasImages) return;

    const kind = hasImages ? "gallery" : "chat";
    const payload = { url, kind, body: data };
    console.log(`[Emochi Scribe] Captured ${kind} data from: ${url}`);

    if (contentScriptReady) {
      document.dispatchEvent(new CustomEvent('__EMOCHI_DL_DATA__', { detail: payload }));
    } else {
      if (payloadCache.length >= MAX_CACHED_PAYLOADS) payloadCache.shift();
      payloadCache.push(payload);
    }
  }

  function isRelevantUrl(url) {
    if (typeof url !== 'string') return false;
    // Catch chat history, gallery, and sync routes
    return url.includes('/conversation/') || url.includes('/image/chat/gallery') || url.includes('/userchat/sync');
  }

  // --- 1. FETCH INTERCEPTOR ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    let reqUrl = '';
    try {
      reqUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    } catch (e) {}

    const response = await origFetch.apply(this, args);

    if (isRelevantUrl(reqUrl)) {
      try {
        const clone = response.clone();
        clone.json().then(data => processInterceptedData(reqUrl, data)).catch(() => {});
      } catch (err) {}
    }
    return response;
  };

  // --- 2. XHR INTERCEPTOR ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    try {
      this._reqUrl = String(url);
    } catch (e) {}
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener("load", function() {
      if (isRelevantUrl(this._reqUrl)) {
        if (!this.responseType || this.responseType === "text") {
          try {
            const data = JSON.parse(this.responseText);
            processInterceptedData(this._reqUrl, data);
          } catch (err) {}
        } else if (this.responseType === "json") {
          try {
            processInterceptedData(this._reqUrl, this.response);
          } catch (err) {}
        }
      }
    });
    return origSend.apply(this, args);
  };
})();