// ============================================================
// Emochi Chat Downloader — Content Script
// ============================================================

(function () {
  "use strict";

  if (document.getElementById("emochi-dl-root")) return;

  // ── 1. TOKEN CAPTURE ─────────────────────────────────────────
  // interceptor.js runs in MAIN world (declared in manifest.json) and wraps
  // window.fetch to capture the Bearer token, posting it back here via
  // postMessage. No inline script injection needed — avoids CSP issues.

  let capturedToken = null;
  let capturedExtraHeaders = {};

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "__EMOCHI_DL_TOKEN__") return;
    if (event.data.token) {
      capturedToken = event.data.token;
      capturedExtraHeaders = event.data.extraHeaders || {};
      console.debug("[Emochi DL] Token captured ✓");
    }
  });

  // ── 2. WAIT FOR TOKEN ────────────────────────────────────────
  function waitForToken(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (capturedToken) return resolve(capturedToken);
      const start = Date.now();
      const iv = setInterval(() => {
        if (capturedToken) {
          clearInterval(iv);
          resolve(capturedToken);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          reject(new Error("Token not captured yet. Try scrolling the chat to trigger a network call, then scan again."));
        }
      }, 200);
    });
  }

  // ── 3. FETCH VIA BACKGROUND ──────────────────────────────────
  async function fetchPage(url, token) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "FETCH_CHAT",
          url,
          token,
          extraHeaders: capturedExtraHeaders,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response?.ok) {
            return reject(new Error(response?.error || "Fetch failed"));
          }
          resolve(response.data);
        }
      );
    });
  }

  async function fetchFullConversation() {
    const match = location.pathname.match(/character\/(.+?)\//);
    if (!match) throw new Error("Could not extract promptId from URL");
    const promptId = match[1];

    const token = await waitForToken();

    let cursor = null;
    let allMessages = [];

    while (true) {
      const url = new URL("https://emochi-backend-k8s.flowgpt.com/conversation/latest");
      url.searchParams.set("promptId", promptId);
      url.searchParams.set("take", "50");
      if (cursor) url.searchParams.set("cursor", cursor);

      const data = await fetchPage(url.toString(), token);
      console.debug("[Emochi DL] API response:", data);

      const msgs = data?.data?.messages ?? [];
      if (!msgs.length) break;

      allMessages = [...msgs, ...allMessages];
      cursor = msgs[0].id;

      if (msgs.length < 50) break;
    }

    return allMessages.map((m, i) => ({
      role: m.role === "assistant" ? "character" : "user",
      content: m.content.trim(),
      index: i + 1,
    }));
  }

  // ── 4. FORMATTERS ───────────────────────────────────────────
  function toTxt(messages, charName) {
    const lines = [
      `Emochi Chat with: ${charName}`,
      `Exported: ${new Date().toLocaleString()}`,
      "=".repeat(60),
      "",
    ];
    messages.forEach((m) => {
      lines.push(`[${m.role === "user" ? "You" : charName}]`);
      lines.push(m.content);
      lines.push("");
    });
    return lines.join("\n");
  }

  function toMarkdown(messages, charName) {
    const lines = [
      `# Emochi Chat — ${charName}`,
      `> Exported on ${new Date().toLocaleString()}`,
      "",
      "---",
      "",
    ];
    messages.forEach((m) => {
      const label = m.role === "user" ? "**You**" : `**${charName}**`;
      lines.push(label);
      lines.push("");
      lines.push(m.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    });
    return lines.join("\n");
  }

  function toJson(messages, charName) {
    return JSON.stringify(
      {
        character: charName,
        url: location.href,
        exported_at: new Date().toISOString(),
        message_count: messages.length,
        messages,
      },
      null,
      2
    );
  }

  // ── 5. DOWNLOAD HELPER ──────────────────────────────────────
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_\- ]/gi, "_").trim().replace(/\s+/g, "_");
  }

  function getCharacterName() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.innerText.trim()) return h1.innerText.trim();
    const match = location.pathname.match(/\/character\/([^/]+)\/chat/);
    if (match) {
      return match[1]
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\s+\w{8}$/, "")
        .trim();
    }
    return "Unknown Character";
  }

  // ── 6. FLOATING UI ──────────────────────────────────────────
  function createPanel() {
    const root = document.createElement("div");
    root.id = "emochi-dl-root";
    root.innerHTML = `
      <div id="emochi-dl-panel" class="emochi-panel collapsed">
        <button id="emochi-dl-toggle" title="Emochi Chat Downloader" aria-label="Toggle chat downloader">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <div id="emochi-dl-body">
          <div class="emochi-header">
            <span class="emochi-logo">📥</span>
            <span class="emochi-title">Chat Downloader</span>
            <button id="emochi-dl-close" title="Close">✕</button>
          </div>
          <div id="emochi-dl-char-name" class="emochi-char"></div>
          <div id="emochi-dl-status" class="emochi-status info">Waiting for token… scroll the chat to trigger a network call.</div>
          <div class="emochi-format-row">
            <label class="emochi-format-label">Format:</label>
            <div class="emochi-format-btns">
              <button class="fmt-btn active" data-fmt="txt">.TXT</button>
              <button class="fmt-btn" data-fmt="md">.MD</button>
              <button class="fmt-btn" data-fmt="json">.JSON</button>
            </div>
          </div>
          <button id="emochi-dl-scan" class="emochi-action-btn secondary">🔍 Scan Chat</button>
          <button id="emochi-dl-download" class="emochi-action-btn primary" disabled>⬇ Download</button>
          <div class="emochi-tip">
            Tip: The extension captures your auth token automatically when the page makes a network call. Just scroll the chat a little if the token hasn't been detected yet.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    let messages = [];
    let selectedFormat = "txt";
    const charName = getCharacterName();

    const panel   = root.querySelector("#emochi-dl-panel");
    const toggle  = root.querySelector("#emochi-dl-toggle");
    const close   = root.querySelector("#emochi-dl-close");
    const status  = root.querySelector("#emochi-dl-status");
    const charEl  = root.querySelector("#emochi-dl-char-name");
    const scanBtn = root.querySelector("#emochi-dl-scan");
    const dlBtn   = root.querySelector("#emochi-dl-download");
    const fmtBtns = root.querySelectorAll(".fmt-btn");

    charEl.textContent = charName;

    toggle.addEventListener("click", () => panel.classList.toggle("collapsed"));
    close.addEventListener("click", () => panel.classList.add("collapsed"));

    fmtBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        fmtBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedFormat = btn.dataset.fmt;
      });
    });

    // Update status when token arrives
    const tokenPollInterval = setInterval(() => {
      if (capturedToken) {
        clearInterval(tokenPollInterval);
        status.textContent = "✓ Token ready. Click Scan to fetch messages.";
        status.className = "emochi-status success";
      }
    }, 500);

    scanBtn.addEventListener("click", async () => {
      status.textContent = "Fetching full conversation…";
      status.className = "emochi-status info";
      dlBtn.disabled = true;

      try {
        messages = await fetchFullConversation();
        if (!messages.length) {
          status.textContent = "⚠ No messages found.";
          status.className = "emochi-status warn";
        } else {
          status.textContent = `✓ Found ${messages.length} messages.`;
          status.className = "emochi-status success";
          dlBtn.disabled = false;
        }
      } catch (e) {
        console.error("[Emochi DL] Scan error:", e);
        status.textContent = `⚠ ${e.message}`;
        status.className = "emochi-status warn";
      }
    });

    dlBtn.addEventListener("click", () => {
      if (!messages.length) return;
      const safe = sanitizeFilename(charName);
      const ts = new Date().toISOString().slice(0, 10);

      if (selectedFormat === "txt") {
        downloadFile(toTxt(messages, charName), `emochi_${safe}_${ts}.txt`, "text/plain");
      } else if (selectedFormat === "md") {
        downloadFile(toMarkdown(messages, charName), `emochi_${safe}_${ts}.md`, "text/markdown");
      } else {
        downloadFile(toJson(messages, charName), `emochi_${safe}_${ts}.json`, "application/json");
      }

      status.textContent = `✓ Downloaded ${messages.length} messages as .${selectedFormat}!`;
      status.className = "emochi-status success";
    });
  }

  // ── 7. BOOT ─────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel);
  } else {
    createPanel();
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.action) return;

    (async () => {
      try {
        if (msg.action === "scrape") {
          const messages = await fetchFullConversation();
          const charName = getCharacterName();
          sendResponse({ success: true, messages, charName, count: messages.length });
          return;
        }

        if (msg.action === "download" || msg.action === "download_full") {
          const messages = await fetchFullConversation();
          const charName = getCharacterName();
          const safe = sanitizeFilename(charName);
          const ts = new Date().toISOString().slice(0, 10);

          let content, filename, mime;
          if (msg.format === "md") {
            content = toMarkdown(messages, charName);
            filename = `emochi_${safe}_${ts}.md`;
            mime = "text/markdown";
          } else if (msg.format === "json") {
            content = toJson(messages, charName);
            filename = `emochi_${safe}_${ts}.json`;
            mime = "application/json";
          } else {
            content = toTxt(messages, charName);
            filename = `emochi_${safe}_${ts}.txt`;
            mime = "text/plain";
          }

          downloadFile(content, filename, mime);
          sendResponse({ success: true, count: messages.length });
          return;
        }

        sendResponse({ success: false, error: "Unknown action" });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || "Failed" });
      }
    })();

    return true;
  });
})();