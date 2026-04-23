(function () {
  // 1. Intercept standard Fetch requests
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const reqUrl = args[0] instanceof Request ? args[0].url : (typeof args[0] === 'string' ? args[0] : '');
    const response = await origFetch.apply(this, args);

    if (reqUrl.includes('/conversation/latest') || reqUrl.includes('/conversation/sync')) {
      try {
        const clone = response.clone();
        clone.json().then(data => {
          window.postMessage({ type: '__EMOCHI_DL_DATA__', data }, '*');
        }).catch(() => {});
      } catch (err) {}
    }
    return response;
  };

  // 2. Intercept XMLHttpRequest (just in case they use older libraries)
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    xhr.open = function(method, url, ...rest) {
      this._url = url;
      return origOpen.apply(this, [method, url, ...rest]);
    };
    xhr.addEventListener('load', function() {
      if (this._url && (this._url.includes('/conversation/latest') || this._url.includes('/conversation/sync'))) {
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            window.postMessage({ type: '__EMOCHI_DL_DATA__', data: JSON.parse(this.responseText) }, '*');
          } else if (this.responseType === 'json') {
            window.postMessage({ type: '__EMOCHI_DL_DATA__', data: this.response }, '*');
          }
        } catch(e) {}
      }
    });
    return xhr;
  };
})();