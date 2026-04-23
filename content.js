(function () {
  "use strict";

  if (document.getElementById("emochi-dl-root")) return;

  // This Map stores unique messages by their ID
  const messageStore = new Map();

  // --- 1. DATA RECEIVERS ---

  // Listen for the interceptor catching new API data when you scroll
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "__EMOCHI_DL_DATA__") return;
    const payload = event.data.data;
    let msgs =[];
    if (payload?.data?.messages) msgs = payload.data.messages;
    else if (payload?.messages) msgs = payload.messages;
    if (msgs.length > 0) processMessages(msgs);
  });

  // Extract initial page load data hidden in Next.js script tag
  function extractInitialData() {
    try {
      const nextData = document.getElementById('__NEXT_DATA__');
      if (!nextData) return;
      const json = JSON.parse(nextData.textContent);
      
      // Recursively search the massive state object for any message arrays
      const searchForMessages = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj.messages) && obj.messages.length > 0 && obj.messages[0].id) {
          processMessages(obj.messages);
        }
        Object.values(obj).forEach(val => searchForMessages(val));
      };
      searchForMessages(json);
    } catch (e) {
      console.error("[Emochi DL] Failed to parse initial Next.js data", e);
    }
  }

  function processMessages(arr) {
    let added = false;
    arr.forEach(m => {
      if (m.id && m.content && !messageStore.has(m.id)) {
        messageStore.set(m.id, {
          role: m.role === "assistant" ? "character" : "user",
          content: m.content.trim(),
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : 0,
          id: m.id
        });
        added = true;
      }
    });
    if (added) updateUI();
  }

  function getSortedMessages() {
    const arr = Array.from(messageStore.values());
    arr.sort((a, b) => a.createdAt - b.createdAt); // Sort oldest to newest
    return arr.map((m, i) => ({ ...m, index: i + 1 }));
  }

  // --- 2. FORMATTERS & DOWNLOAD LOGIC ---

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function formatTxt(msgs, name) {
    return msgs.map(m => `[${m.role === "user" ? "You" : name}]\n${m.content}\n`).join("\n");
  }

  function formatMd(msgs, name) {
    return msgs.map(m => `**${m.role === "user" ? "You" : name}**\n\n${m.content}\n\n---\n`).join("\n");
  }

  function formatJson(msgs, name) {
    return JSON.stringify({ character: name, url: location.href, exported_at: new Date().toISOString(), count: msgs.length, messages: msgs }, null, 2);
  }

  function getCharacterName() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.innerText.trim()) return h1.innerText.trim();
    const match = location.pathname.match(/\/character\/([^/]+)\/chat/);
    return match ? match[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Unknown Character";
  }

  // --- 3. UI INTEGRATION ---

  let selectedFormat = "txt";

  function createPanel() {
    const root = document.createElement("div");
    root.id = "emochi-dl-root";
    root.innerHTML = `
      <div id="emochi-dl-panel" class="emochi-panel collapsed">
        <button id="emochi-dl-toggle" title="Toggle Downloader">📥</button>
        <div id="emochi-dl-body">
          <div class="emochi-header">
            <span class="emochi-title">Chat Downloader</span>
            <button id="emochi-dl-close">✕</button>
          </div>
          <div id="emochi-dl-char-name" class="emochi-char">${getCharacterName()}</div>
          <div id="emochi-dl-status" class="emochi-status info">Initializing...</div>
          <div class="emochi-format-row">
            <label>Format:</label>
            <div class="emochi-format-btns">
              <button class="fmt-btn active" data-fmt="txt">.TXT</button>
              <button class="fmt-btn" data-fmt="md">.MD</button>
              <button class="fmt-btn" data-fmt="json">.JSON</button>
            </div>
          </div>
          <button id="emochi-dl-download" class="emochi-action-btn primary" disabled>⬇ Download</button>
          <div class="emochi-tip">Tip: Scroll UP in your chat to load older messages. They will automatically be added to your download!</div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    root.querySelector("#emochi-dl-toggle").onclick = () => root.querySelector("#emochi-dl-panel").classList.toggle("collapsed");
    root.querySelector("#emochi-dl-close").onclick = () => root.querySelector("#emochi-dl-panel").classList.add("collapsed");

    const fmtBtns = root.querySelectorAll(".fmt-btn");
    fmtBtns.forEach(btn => btn.onclick = () => {
      fmtBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedFormat = btn.dataset.fmt;
    });

    root.querySelector("#emochi-dl-download").onclick = () => {
      if (messageStore.size === 0) return;
      const msgs = getSortedMessages();
      const charName = getCharacterName();
      const safeName = charName.replace(/[^a-z0-9_\- ]/gi, "_").replace(/\s+/g, "_");
      
      if (selectedFormat === "txt") downloadFile(formatTxt(msgs, charName), `emochi_${safeName}.txt`, "text/plain");
      if (selectedFormat === "md") downloadFile(formatMd(msgs, charName), `emochi_${safeName}.md`, "text/markdown");
      if (selectedFormat === "json") downloadFile(formatJson(msgs, charName), `emochi_${safeName}.json`, "application/json");
    };

    extractInitialData();
    updateUI();
  }

  function updateUI() {
    const status = document.getElementById("emochi-dl-status");
    const dlBtn = document.getElementById("emochi-dl-download");
    if (!status) return;

    if (messageStore.size > 0) {
      status.textContent = `✓ Recorded ${messageStore.size} messages! Scroll up to find more.`;
      status.className = "emochi-status success";
      dlBtn.disabled = false;
    } else {
      status.textContent = "Scroll up in the chat to begin recording messages.";
      status.className = "emochi-status info";
      dlBtn.disabled = true;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "get_stats") {
      sendResponse({ count: messageStore.size });
    } else if (msg.action === "trigger_download") {
      // Update the format based on what was selected in the popup
      if (msg.format) {
        selectedFormat = msg.format;
      }
      // Click the hidden download button
      document.getElementById("emochi-dl-download").click();
      sendResponse({ success: true });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel);
  } else {
    createPanel();
  }
})();