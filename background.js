let capturedToken = null;
let capturedExtraHeaders = {};

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    // Ignore preflight requests
    if (!details.requestHeaders || details.method === "OPTIONS") return;

    let tempToken = null;

    for (const header of details.requestHeaders) {
      const name = header.name.toLowerCase();
      
      // Capture Token
      if (name === "authorization" && header.value.toLowerCase().startsWith("bearer ")) {
        tempToken = header.value.substring(7).trim();
      } 
      // Aggressively capture all x-flow headers
      else if (name.startsWith("x-flow-")) {
        capturedExtraHeaders[name] = header.value;
      }
    }

    if (tempToken) {
      capturedToken = tempToken;
    }
  },
  { urls:["https://emochi-backend-k8s.flowgpt.com/*"] },["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_AUTH_DATA") {
    // Only flag as "ready" if we have BOTH the token AND the userid
    const isReady = !!(capturedToken && capturedExtraHeaders['x-flow-userid']);
    sendResponse({ 
      ready: isReady, 
      token: capturedToken, 
      extraHeaders: capturedExtraHeaders 
    });
    return true;
  }
});