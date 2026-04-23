(function () {
  "use strict";

  if (document.getElementById("emochi-dl-root")) return;

  const messageStore = new Map();
  let autoScrollTimer = null;
  let selectedFormat = "txt";
  
  // Variables for the auto-stop stall detector
  let noNewMessagesCount = 0;
  let lastMessageCount = 0;

  // --- URL WATCHER (Resets extension when clicking a new chat) ---
  let currentPath = location.pathname;

  setInterval(() => {
    if (location.pathname !== currentPath) {
      currentPath = location.pathname; // Update to the new URL
      
      messageStore.clear(); // Wipe the old chat's memory
      
      if (autoScrollTimer) toggleAutoScroll(); // Stop scroller if it was running
      
      // Update the panel text to the new Character's name
      const nameEl = document.getElementById("emochi-dl-char-name");
      if (nameEl) nameEl.textContent = getCharacterName();
      
      updateUI(); // Reset the UI to 0 messages
    }
  }, 800); // Checks the URL every 800ms

  // --- 1. DATA RECEIVERS ---
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "__EMOCHI_DL_DATA__") return;
    const payload = event.data.data;
    let msgs =[];
    if (payload?.data?.messages) msgs = payload.data.messages;
    else if (payload?.messages) msgs = payload.messages;
    if (msgs.length > 0) processMessages(msgs);
  });

  function extractInitialData() {
    try {
      const nextData = document.getElementById('__NEXT_DATA__');
      if (!nextData) return;
      const json = JSON.parse(nextData.textContent);
      
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
      // BUG FIX: Ignore alternate swipes! Only keep active messages.
      if (m.isSelected === false) return; 
      // Ignore system errors or empty IDs
      if (!m.id || !m.content) return;

      if (!messageStore.has(m.id)) {
        messageStore.set(m.id, {
          role: m.role === "assistant" ? "character" : "user",
          content: m.content.trim(),
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : 0,
          id: m.id
        });
        added = true;
      }
    });
    
    if (added) {
      noNewMessagesCount = 0; // Reset the stall detector
      updateUI();
    }
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

  // --- 3. UI INTEGRATION & AUTO SCROLL ---
  function toggleAutoScroll() {
    const btn = document.getElementById("emochi-dl-autoscroll");
    
    if (autoScrollTimer) {
      clearInterval(autoScrollTimer);
      autoScrollTimer = null;
      if (btn) btn.textContent = "🚀 Start Auto-Scroll";
      return false; // Stopped
    }

    if (btn) btn.textContent = "⏹ Stop Auto-Scroll";
    
    noNewMessagesCount = 0;
    lastMessageCount = messageStore.size;
    
    autoScrollTimer = setInterval(() => {
      // --- STALL DETECTOR (Auto-Stop when reached the top) ---
      if (messageStore.size === lastMessageCount) {
        noNewMessagesCount++;
        // If 4 ticks (6 seconds) pass with no new messages, stop scrolling!
        if (noNewMessagesCount >= 4) {
          toggleAutoScroll(); // Stop timer
          const status = document.getElementById("emochi-dl-status");
          if (status) {
            status.textContent = `✓ Reached top! Total: ${messageStore.size} messages.`;
            status.className = "emochi-status success";
          }
          return;
        }
      } else {
        lastMessageCount = messageStore.size;
        noNewMessagesCount = 0;
      }

      // --- SMART CONTAINER SELECTOR ---
      const containers = Array.from(document.querySelectorAll('div')).filter(el => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      });

      // BUG FIX: Sort boxes by their internal height. The chat window will practically ALWAYS be 
      // the tallest one (unlike the short profile sidebar).
      containers.sort((a, b) => b.scrollHeight - a.scrollHeight);
      const target = containers.length > 0 ? containers[0] : window;

      // Nudge down slightly, then instantly snap to top to force data fetch
      if (target === window) {
        window.scrollTo(0, 15);
        setTimeout(() => window.scrollTo(0, 0), 50);
      } else {
        target.scrollTop = 15;
        setTimeout(() => target.scrollTop = 0, 50);
      }
    }, 1500); // Runs every 1.5 seconds

    return true; // Started
  }

  function createPanel() {
    const root = document.createElement("div");
    root.id = "emochi-dl-root";
    root.innerHTML = `
      <div id="emochi-dl-panel" class="emochi-panel collapsed">
        <button id="emochi-dl-toggle" title="Toggle Downloader">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 22px; height: 22px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <div id="emochi-dl-body">
          <div class="emochi-header">
            <span class="emochi-title">Chat Downloader</span>
            <button id="emochi-dl-close">✕</button>
          </div>
          <div id="emochi-dl-char-name" class="emochi-char">${getCharacterName()}</div>
          <div id="emochi-dl-status" class="emochi-status info">Initializing...</div>
          <div class="emochi-format-row">
            <label class="emochi-format-label">Format:</label>
            <div class="emochi-format-btns">
              <button class="fmt-btn active" data-fmt="txt">.TXT</button>
              <button class="fmt-btn" data-fmt="md">.MD</button>
              <button class="fmt-btn" data-fmt="json">.JSON</button>
            </div>
          </div>
          <button id="emochi-dl-autoscroll" class="emochi-action-btn secondary" style="margin-bottom: 8px;">🚀 Start Auto-Scroll</button>
          <button id="emochi-dl-download" class="emochi-action-btn primary" disabled>⬇ Download</button>
          <div class="emochi-tip">Tip: Auto-scroll pulls ~50 messages per second. It will automatically stop when it reaches the top.</div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    root.querySelector("#emochi-dl-toggle").onclick = () => root.querySelector("#emochi-dl-panel").classList.toggle("collapsed");
    root.querySelector("#emochi-dl-close").onclick = () => root.querySelector("#emochi-dl-panel").classList.add("collapsed");
    root.querySelector("#emochi-dl-autoscroll").onclick = toggleAutoScroll;

    const fmtBtns = root.querySelectorAll(".fmt-btn");
    fmtBtns.forEach(btn => btn.onclick = () => {
      fmtBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedFormat = btn.dataset.fmt;
    });

    root.querySelector("#emochi-dl-download").onclick = () => {
      if (messageStore.size === 0) return;
      if (autoScrollTimer) toggleAutoScroll(); // Stop scrolling before download
      
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
      status.textContent = `✓ Recorded ${messageStore.size} messages!`;
      status.className = "emochi-status success";
      dlBtn.disabled = false;
    } else {
      status.textContent = "Scroll up in the chat to begin recording messages.";
      status.className = "emochi-status info";
      dlBtn.disabled = true;
    }
  }

  // --- 4. POPUP MESSAGING ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "get_stats") {
      sendResponse({ count: messageStore.size, isScrolling: !!autoScrollTimer });
    } 
    else if (msg.action === "toggle_scroll") {
      const isRunning = toggleAutoScroll();
      sendResponse({ isScrolling: isRunning });
    }
    else if (msg.action === "trigger_download") {
      if (msg.format) selectedFormat = msg.format;
      document.getElementById("emochi-dl-download").click();
      sendResponse({ success: true });
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", createPanel);
  else createPanel();

})();