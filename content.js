(function () {
  "use strict";

  if (document.getElementById("emochi-dl-root")) return;

  const messageStore = new Map();
  let autoScrollTimer = null;
  let selectedFormat = "txt";
  
  let noNewMessagesCount = 0;
  let lastMessageCount = 0;
  let cachedScrollTarget = null;

  // --- 1. DATA RECEIVERS ---
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "__EMOCHI_DL_DATA__") return;
    const payload = event.data.data;
    let msgs = [];
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
      console.error("[Emochi Scribe] Failed to parse initial data", e);
    }
  }

  function processMessages(arr) {
    let added = false;
    arr.forEach(m => {
      if (!m.id || !m.content) return;
      if (!messageStore.has(m.id)) {
        messageStore.set(m.id, {
          role: m.role === "assistant" ? "character" : "user",
          content: m.content.trim(),
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : 0,
          id: m.id,
          images: Array.isArray(m.generatedImagesList) ? m.generatedImagesList : []
        });
        added = true;
      }
    });
    
    if (added) {
      noNewMessagesCount = 0; 
      updateUI();
    }
  }

  function getSortedMessages() {
    const arr = Array.from(messageStore.values());
    arr.sort((a, b) => a.createdAt - b.createdAt); 
    return arr;
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
    if (!match) return "Unknown Character";
    let rawName = match[1].replace(/-[a-f0-9]{8}$/i, "");
    return rawName.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // --- 3. UI INTEGRATION & AUTO SCROLL ---
  function toggleAutoScroll() {
    const btn = document.getElementById("emochi-dl-autoscroll");
    if (autoScrollTimer) {
      clearInterval(autoScrollTimer);
      autoScrollTimer = null;
      if (btn) btn.textContent = "🚀 Start Auto-Scroll";
      return false; 
    }
    
    if (btn) btn.textContent = "⏹ Stop Auto-Scroll";
    noNewMessagesCount = 0;
    lastMessageCount = messageStore.size;
    
    autoScrollTimer = setInterval(() => {
      // Stall detector
      if (messageStore.size === lastMessageCount) {
        noNewMessagesCount++;
        if (noNewMessagesCount >= 4) {
          toggleAutoScroll();
          updateUI(true);
          return;
        }
      } else {
        lastMessageCount = messageStore.size;
        noNewMessagesCount = 0;
      }

      // High-performance scroll targeting
      if (!cachedScrollTarget || !document.body.contains(cachedScrollTarget)) {
        const containers = Array.from(document.querySelectorAll('div')).filter(el => {
          const style = window.getComputedStyle(el);
          return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
        });
        containers.sort((a, b) => b.scrollHeight - a.scrollHeight);
        cachedScrollTarget = containers.length > 0 ? containers[0] : window;
      }

      if (cachedScrollTarget === window) {
        window.scrollTo(0, 15);
        setTimeout(() => window.scrollTo(0, 0), 50);
      } else {
        cachedScrollTarget.scrollTop = 15;
        setTimeout(() => cachedScrollTarget.scrollTop = 0, 50);
      }
    }, 1500);
    
    return true; 
  }

  async function executeDownload(format, useZip) {
    if (messageStore.size === 0) return;
    if (autoScrollTimer) toggleAutoScroll();
    
    const msgs = getSortedMessages();
    const charName = getCharacterName();
    const safeName = charName.replace(/[^a-z0-9_\- ]/gi, "_").replace(/\s+/g, "_");
    const statusEl = document.getElementById("emochi-dl-status");
    
    let content, filename, mime;
    if (format === "txt") { content = formatTxt(msgs, charName); filename = `emochi_${safeName}.txt`; mime = "text/plain"; }
    else if (format === "md") { content = formatMd(msgs, charName); filename = `emochi_${safeName}.md`; mime = "text/markdown"; }
    else { content = formatJson(msgs, charName); filename = `emochi_${safeName}.json`; mime = "application/json"; }

    if (!useZip) {
      downloadFile(content, filename, mime);
      return;
    }

    if (typeof JSZip === 'undefined') {
      console.error("[Emochi Scribe] JSZip library not found! Falling back to standard download.");
      downloadFile(content, filename, mime);
      return;
    }

    const zip = new JSZip();
    zip.file(filename, content);

    const mediaQueue = [];

    // Queue Avatar
    const avatarEl = document.querySelector('img[alt="thumbnail"]');
    if (avatarEl && avatarEl.src) {
      const rawImgUrl = avatarEl.src.replace(/\/cdn-cgi\/image\/[^/]+\//, '/');
      const ext = rawImgUrl.split('.').pop().split('?')[0] || 'webp';
      mediaQueue.push({ url: rawImgUrl, name: `avatar_${safeName}.${ext}` });
    }

    // Queue In-Chat Images
    msgs.forEach((m, i) => {
      if (m.images && m.images.length > 0) {
        m.images.forEach((imgUrl, imgIdx) => {
          const rawUrl = imgUrl.replace(/\/cdn-cgi\/image\/[^/]+\//, '/');
          const ext = rawUrl.split('.').pop().split('?')[0] || 'webp';
          mediaQueue.push({ url: rawUrl, name: `images/msg_${String(i+1).padStart(3, '0')}_img_${imgIdx+1}.${ext}` });
        });
      }
    });

    // Rate-limited Download Queue
    if (mediaQueue.length > 0) {
      if (statusEl) {
        statusEl.textContent = `Fetching ${mediaQueue.length} media files...`;
        statusEl.className = "emochi-status info";
      }

      const CONCURRENCY_LIMIT = 2;
      let activeReqs = 0;
      let currentIndex = 0;
      let completed = 0;

      await new Promise((resolve) => {
        function processNext() {
          if (currentIndex >= mediaQueue.length && activeReqs === 0) {
            resolve();
            return;
          }
          while (activeReqs < CONCURRENCY_LIMIT && currentIndex < mediaQueue.length) {
            const item = mediaQueue[currentIndex++];
            activeReqs++;
            
            fetch(item.url)
              .then(res => res.blob())
              .then(blob => zip.file(item.name, blob))
              .catch(err => console.warn(`[Emochi Scribe] Failed to fetch ${item.name}`, err))
              .finally(() => {
                activeReqs--;
                completed++;
                if (statusEl) statusEl.textContent = `Fetching media: ${completed}/${mediaQueue.length}`;
                setTimeout(processNext, 300);
              });
          }
        }
        processNext();
      });
    }

    if (statusEl) {
      statusEl.textContent = "Zipping files... please wait.";
      statusEl.className = "emochi-status info";
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadFile(zipBlob, `emochi_${safeName}.zip`, "application/zip");
    
    if (statusEl) {
      statusEl.textContent = "✓ Download Complete!";
      statusEl.className = "emochi-status success";
    }
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
            <span class="emochi-title">Emochi Scribe</span>
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
          
          <div style="margin: 4px 0 10px 0;">
            <label style="font-size: 12px; color: #d8b4fe; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" id="emochi-dl-zip-check" checked style="accent-color: #a855f7; cursor: pointer;">
              Include In-Chat Images & Avatar (.ZIP)
            </label>
          </div>

          <button id="emochi-dl-autoscroll" class="emochi-action-btn secondary" style="margin-bottom: 8px;">🚀 Start Auto-Scroll</button>
          <button id="emochi-dl-download" class="emochi-action-btn primary" disabled>⬇ Download</button>
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
      const useZip = document.getElementById("emochi-dl-zip-check").checked;
      executeDownload(selectedFormat, useZip);
    };

    extractInitialData();
    updateUI();
  }

  function updateUI(reachedTop = false) {
    const status = document.getElementById("emochi-dl-status");
    const dlBtn = document.getElementById("emochi-dl-download");
    if (!status) return;

    if (messageStore.size > 0) {
      if (reachedTop) {
        status.textContent = `✓ Reached top! Total: ${messageStore.size} messages.`;
      } else {
        status.textContent = `✓ Recorded ${messageStore.size} messages.`;
      }
      status.className = "emochi-status success";
      dlBtn.disabled = false;
    } else {
      status.textContent = "Scroll up in the chat to begin recording messages.";
      status.className = "emochi-status info";
      dlBtn.disabled = true;
    }
  }

  // --- 4. URL WATCHER ---
  let currentPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== currentPath) {
      currentPath = location.pathname; 
      messageStore.clear(); 
      if (autoScrollTimer) toggleAutoScroll(); 
      const nameEl = document.getElementById("emochi-dl-char-name");
      if (nameEl) nameEl.textContent = getCharacterName();
      updateUI();
    }
  }, 800);

  // --- 5. POPUP MESSAGING ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "get_stats") {
      sendResponse({ count: messageStore.size, isScrolling: !!autoScrollTimer });
    } 
    else if (msg.action === "toggle_scroll") {
      const isRunning = toggleAutoScroll();
      sendResponse({ isScrolling: isRunning });
    }
    else if (msg.action === "trigger_download") {
      executeDownload(msg.format || selectedFormat, msg.useZip);
      sendResponse({ success: true });
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", createPanel);
  else createPanel();

  // Tell interceptor we are awake!
  window.postMessage({ type: "__EMOCHI_DL_READY__" }, "*");

})();