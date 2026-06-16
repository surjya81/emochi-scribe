(function () {
  "use strict";

  if (document.getElementById("emochi-dl-root")) return;

  const messageStore = new Map();
  const galleryStore = new Map();

  let autoScrollTimer = null;
  let selectedFormat = "txt";
  let selectedGalleryScope = "all";
  let activeScrollMode = "chat";
  let noNewItemsCount = 0;
  let lastCapturedCount = 0;
  let cachedScrollTarget = null;
  let isChatDownloadRunning = false;
  let isGalleryDownloadRunning = false;

  // --- 1. DATA RECEIVERS ---
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "__EMOCHI_DL_DATA__") return;

    const payload = event.data.data;
    const body = payload?.body || payload;
    const messages = body?.data?.messages || body?.messages || [];
    const images = body?.data?.images || body?.images || [];

    if (Array.isArray(messages) && messages.length > 0) processMessages(messages);
    if (Array.isArray(images) && images.length > 0) processGalleryImages(images);
  });

  function extractInitialData() {
    try {
      const nextData = document.getElementById("__NEXT_DATA__");
      if (!nextData) return;

      const json = JSON.parse(nextData.textContent);
      const searchPageData = (obj) => {
        if (!obj || typeof obj !== "object") return;

        if (Array.isArray(obj.messages) && obj.messages.length > 0 && obj.messages[0].id) {
          processMessages(obj.messages);
        }
        if (Array.isArray(obj.images) && obj.images.length > 0 && obj.images[0].url) {
          processGalleryImages(obj.images);
        }

        Object.values(obj).forEach(value => searchPageData(value));
      };

      searchPageData(json);
    } catch (err) {
      console.error("[Emochi Scribe] Failed to parse initial data", err);
    }
  }

  function processMessages(arr) {
    let changed = false;

    arr.forEach(message => {
      if (!message?.id || !message.content) return;
      if (messageStore.has(message.id)) return;

      messageStore.set(message.id, {
        role: message.role === "assistant" ? "character" : "user",
        content: message.content.trim(),
        createdAt: message.createdAt ? new Date(message.createdAt).getTime() : 0,
        id: message.id,
        images: Array.isArray(message.generatedImagesList) ? message.generatedImagesList : []
      });
      changed = true;
    });

    if (changed) {
      noNewItemsCount = 0;
      updateUI();
    }
  }

  function processGalleryImages(arr) {
    let changed = false;

    arr.forEach(image => {
      if (!image?.url) return;

      const id = image.sid || image.promptId || image.url;
      const nextImage = {
        sid: image.sid || "",
        promptId: image.promptId || "",
        url: image.url,
        createdAt: image.createdAt ? new Date(image.createdAt).getTime() : 0,
        createdAtRaw: image.createdAt || "",
        isFavorited: image.isFavorited === true
      };

      const existing = galleryStore.get(id);
      if (!existing) {
        galleryStore.set(id, nextImage);
        changed = true;
        return;
      }

      if (!existing.isFavorited && nextImage.isFavorited) {
        galleryStore.set(id, { ...existing, isFavorited: true });
        changed = true;
      }
    });

    if (changed) {
      noNewItemsCount = 0;
      updateUI();
    }
  }

  function getSortedMessages() {
    const arr = Array.from(messageStore.values());
    arr.sort((a, b) => a.createdAt - b.createdAt);
    return arr;
  }

  function getGalleryImages(scope = selectedGalleryScope) {
    const arr = Array.from(galleryStore.values());
    const filtered = scope === "favorites" ? arr.filter(image => image.isFavorited) : arr;
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    return filtered;
  }

  function updateDownloadButtons() {
    const chatBtn = document.getElementById("emochi-dl-download");
    const galleryBtn = document.getElementById("emochi-gallery-download");
    const selectedGalleryCount = getGalleryImages(selectedGalleryScope).length;

    if (chatBtn) {
      chatBtn.disabled = isChatDownloadRunning || messageStore.size === 0;
      chatBtn.textContent = isChatDownloadRunning ? "Downloading..." : "Download Chat";
    }
    if (galleryBtn) {
      galleryBtn.disabled = isGalleryDownloadRunning || selectedGalleryCount === 0;
      galleryBtn.textContent = isGalleryDownloadRunning ? "Downloading..." : "Download Gallery";
    }
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

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function formatTxt(messages, name) {
    return messages.map(message => `[${message.role === "user" ? "You" : name}]\n${message.content}\n`).join("\n");
  }

  function formatMd(messages, name) {
    return messages.map(message => `**${message.role === "user" ? "You" : name}**\n\n${message.content}\n\n---\n`).join("\n");
  }

  function formatJson(messages, name) {
    return JSON.stringify({
      character: name,
      url: location.href,
      exported_at: new Date().toISOString(),
      count: messages.length,
      messages
    }, null, 2);
  }

  function getCharacterName() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.innerText.trim()) return h1.innerText.trim();

    const match = location.pathname.match(/\/character\/([^/]+)\/chat/);
    if (!match) return "Unknown Character";

    const rawName = match[1].replace(/-[a-f0-9]{8}$/i, "");
    return rawName.replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  }

  function getSafeName(name) {
    const safeName = String(name || "emochi").replace(/[^a-z0-9_\- ]/gi, "_").replace(/\s+/g, "_");
    return safeName || "emochi";
  }

  function isGalleryPage() {
    return location.pathname === "/me" && new URLSearchParams(location.search).get("tab") === "gallery";
  }

  function getRawImageUrl(url) {
    return String(url).replace(/\/cdn-cgi\/image\/[^/]+\//, "/");
  }

  function getUrlExtension(url) {
    const cleanUrl = String(url).split("?")[0];
    const ext = cleanUrl.split(".").pop();
    return ext && ext.length <= 5 ? ext : "webp";
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "calculating";

    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  function formatProgress(prefix, completed, total, startedAt, failed = 0) {
    const safeTotal = Math.max(total, 1);
    const percent = Math.floor((completed / safeTotal) * 100);
    const elapsed = Date.now() - startedAt;
    const eta = completed > 0 ? formatDuration((elapsed / completed) * (total - completed)) : "calculating";
    const failedText = failed > 0 ? `, ${failed} failed` : "";

    return `${prefix}: ${completed}/${total} (${percent}%). ETA ${eta}${failedText}`;
  }

  function hasGalleryLoadError() {
    return document.body?.innerText?.includes("Failed to load gallery. Please try again.") === true;
  }

  function isLeftSidebarElement(el) {
    const rect = el.getBoundingClientRect();
    const sidebarBoundary = Math.max(280, window.innerWidth * 0.18);

    if (el.closest("aside, nav")) return true;
    if (rect.right <= sidebarBoundary) return true;
    if (rect.left < sidebarBoundary && rect.width < 340) return true;

    return false;
  }

  function isLikelyGalleryScrollTarget(el) {
    const rect = el.getBoundingClientRect();

    if (el.id === "emochi-dl-root" || el.closest("#emochi-dl-root")) return false;
    if (isLeftSidebarElement(el)) return false;
    if (rect.width < 360 || rect.height < 220) return false;
    if (rect.right < window.innerWidth * 0.45) return false;

    return true;
  }

  function getScrollableContainers(mode = "any") {
    return Array.from(document.querySelectorAll("main, section, div"))
      .filter(el => {
        const style = window.getComputedStyle(el);
        const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";
        if (!canScroll || el.scrollHeight <= el.clientHeight + 20) return false;
        if (mode === "gallery" && !isLikelyGalleryScrollTarget(el)) return false;
        return true;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
  }

  function scrollGalleryDown() {
    const amount = Math.max(280, Math.floor(window.innerHeight * 0.45));
    const targets = getScrollableContainers("gallery").slice(0, 2);
    const wheelInit = {
      deltaY: amount,
      bubbles: true,
      cancelable: true
    };

    window.scrollBy({ top: amount, behavior: "smooth" });
    window.dispatchEvent(new WheelEvent("wheel", wheelInit));

    targets.forEach(target => {
      target.scrollBy({ top: amount, behavior: "smooth" });
      target.dispatchEvent(new WheelEvent("wheel", wheelInit));
    });
  }

  async function fetchMediaIntoZip(zip, mediaQueue, statusPrefix) {
    const statusEl = document.getElementById("emochi-dl-status");
    if (mediaQueue.length === 0) return;

    const startedAt = Date.now();
    let failed = 0;

    if (statusEl) {
      statusEl.textContent = `${statusPrefix}: preparing ${mediaQueue.length} files...`;
      statusEl.className = "emochi-status info";
    }

    const concurrencyLimit = 2;
    let activeRequests = 0;
    let currentIndex = 0;
    let completed = 0;

    await new Promise((resolve) => {
      function processNext() {
        if (currentIndex >= mediaQueue.length && activeRequests === 0) {
          resolve();
          return;
        }

        while (activeRequests < concurrencyLimit && currentIndex < mediaQueue.length) {
          const item = mediaQueue[currentIndex++];
          activeRequests++;

          fetch(item.url)
            .then(response => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.blob();
            })
            .then(blob => zip.file(item.name, blob))
            .catch(err => {
              failed++;
              console.warn(`[Emochi Scribe] Failed to fetch ${item.name}`, err);
            })
            .finally(() => {
              activeRequests--;
              completed++;
              if (statusEl) {
                statusEl.textContent = formatProgress(statusPrefix, completed, mediaQueue.length, startedAt, failed);
                statusEl.className = failed > 0 ? "emochi-status warn" : "emochi-status info";
              }
              setTimeout(processNext, 300);
            });
        }
      }

      processNext();
    });

    return { total: mediaQueue.length, completed, failed };
  }

  async function executeDownload(format, useZip) {
    if (messageStore.size === 0 || isChatDownloadRunning) return;

    isChatDownloadRunning = true;
    updateDownloadButtons();

    try {
      if (autoScrollTimer) toggleAutoScroll();

      const messages = getSortedMessages();
      const charName = getCharacterName();
      const safeName = getSafeName(charName);
      const statusEl = document.getElementById("emochi-dl-status");
      if (statusEl) {
        statusEl.textContent = "Preparing chat download...";
        statusEl.className = "emochi-status info";
      }

      let content;
      let filename;
      let mime;

      if (format === "txt") {
        content = formatTxt(messages, charName);
        filename = `emochi_${safeName}.txt`;
        mime = "text/plain";
      } else if (format === "md") {
        content = formatMd(messages, charName);
        filename = `emochi_${safeName}.md`;
        mime = "text/markdown";
      } else {
        content = formatJson(messages, charName);
        filename = `emochi_${safeName}.json`;
        mime = "application/json";
      }

      if (!useZip) {
        downloadFile(content, filename, mime);
        if (statusEl) {
          statusEl.textContent = "Download complete.";
          statusEl.className = "emochi-status success";
        }
        return;
      }

      if (typeof JSZip === "undefined") {
        console.error("[Emochi Scribe] JSZip library not found. Falling back to standard download.");
        downloadFile(content, filename, mime);
        return;
      }

      const zip = new JSZip();
      const mediaQueue = [];
      zip.file(filename, content);

      const avatarEl = document.querySelector('img[alt="thumbnail"]');
      if (avatarEl?.src) {
        const rawImgUrl = getRawImageUrl(avatarEl.src);
        const ext = getUrlExtension(rawImgUrl);
        mediaQueue.push({ url: rawImgUrl, name: `avatar_${safeName}.${ext}` });
      }

      messages.forEach((message, messageIndex) => {
        if (!Array.isArray(message.images)) return;

        message.images.forEach((imageUrl, imageIndex) => {
          const rawUrl = getRawImageUrl(imageUrl);
          const ext = getUrlExtension(rawUrl);
          mediaQueue.push({
            url: rawUrl,
            name: `images/msg_${String(messageIndex + 1).padStart(3, "0")}_img_${imageIndex + 1}.${ext}`
          });
        });
      });

      await fetchMediaIntoZip(zip, mediaQueue, "Fetching media");

      if (statusEl) {
        statusEl.textContent = "Zipping files: 0%";
        statusEl.className = "emochi-status info";
      }

      const zipBlob = await zip.generateAsync({ type: "blob" }, metadata => {
        if (statusEl) statusEl.textContent = `Zipping files: ${Math.floor(metadata.percent)}%`;
      });
      downloadFile(zipBlob, `emochi_${safeName}.zip`, "application/zip");

      if (statusEl) {
        statusEl.textContent = "Download complete.";
        statusEl.className = "emochi-status success";
      }
    } catch (err) {
      const statusEl = document.getElementById("emochi-dl-status");
      console.error("[Emochi Scribe] Chat download failed", err);
      if (statusEl) {
        statusEl.textContent = "Chat download failed. Check the console for details.";
        statusEl.className = "emochi-status error";
      }
    } finally {
      isChatDownloadRunning = false;
      updateDownloadButtons();
    }
  }

  async function executeGalleryDownload(scope = selectedGalleryScope) {
    if (isGalleryDownloadRunning) {
      const statusEl = document.getElementById("emochi-dl-status");
      if (statusEl) {
        statusEl.textContent = "Gallery download is already running. Please wait.";
        statusEl.className = "emochi-status info";
      }
      return;
    }

    const images = getGalleryImages(scope);
    const statusEl = document.getElementById("emochi-dl-status");

    if (images.length === 0) {
      if (statusEl) {
        statusEl.textContent = scope === "favorites"
          ? "No favorited gallery images recorded yet."
          : "No gallery images recorded yet.";
        statusEl.className = "emochi-status warn";
      }
      return;
    }

    isGalleryDownloadRunning = true;
    updateDownloadButtons();

    try {
      if (autoScrollTimer) toggleAutoScroll();

      if (statusEl) {
        statusEl.textContent = `Preparing ${images.length} gallery images...`;
        statusEl.className = "emochi-status info";
      }

      if (typeof JSZip === "undefined") {
        if (statusEl) {
          statusEl.textContent = "JSZip is not available. Cannot export gallery.";
          statusEl.className = "emochi-status error";
        }
        return;
      }

      const zip = new JSZip();
      const exportedAt = new Date().toISOString();
      const manifestImages = images.map(image => ({
        sid: image.sid,
        promptId: image.promptId,
        url: image.url,
        createdAt: image.createdAtRaw,
        isFavorited: image.isFavorited
      }));

      zip.file("manifest.json", JSON.stringify({
        source: location.href,
        scope,
        exported_at: exportedAt,
        count: images.length,
        images: manifestImages
      }, null, 2));

      const mediaQueue = images.map((image, index) => {
        const rawUrl = getRawImageUrl(image.url);
        const ext = getUrlExtension(rawUrl);
        const imageId = getSafeName(image.sid || image.promptId || `image_${index + 1}`).slice(0, 48);
        return {
          url: rawUrl,
          name: `gallery/${String(index + 1).padStart(4, "0")}_${imageId}.${ext}`
        };
      });

      const fetchResult = await fetchMediaIntoZip(zip, mediaQueue, "Fetching gallery");

      if (statusEl) {
        const failedText = fetchResult?.failed ? ` (${fetchResult.failed} failed)` : "";
        statusEl.textContent = `Zipping gallery: 0%${failedText}`;
        statusEl.className = fetchResult?.failed ? "emochi-status warn" : "emochi-status info";
      }

      const datePart = exportedAt.slice(0, 10);
      const zipBlob = await zip.generateAsync({ type: "blob" }, metadata => {
        if (statusEl) statusEl.textContent = `Zipping gallery: ${Math.floor(metadata.percent)}%`;
      });
      downloadFile(zipBlob, `emochi_gallery_${scope}_${datePart}.zip`, "application/zip");

      if (statusEl) {
        const failedText = fetchResult?.failed ? ` (${fetchResult.failed} failed)` : "";
        statusEl.textContent = `Gallery download complete: ${images.length} images${failedText}.`;
        statusEl.className = fetchResult?.failed ? "emochi-status warn" : "emochi-status success";
      }
    } catch (err) {
      console.error("[Emochi Scribe] Gallery download failed", err);
      if (statusEl) {
        statusEl.textContent = "Gallery download failed. Check the console for details.";
        statusEl.className = "emochi-status error";
      }
    } finally {
      isGalleryDownloadRunning = false;
      updateDownloadButtons();
    }
  }

  // --- 3. UI INTEGRATION & AUTO SCROLL ---
  function toggleAutoScroll() {
    const btn = document.getElementById("emochi-dl-autoscroll");

    if (autoScrollTimer) {
      clearInterval(autoScrollTimer);
      autoScrollTimer = null;
      if (btn) btn.textContent = "Start Auto-Scroll";
      return false;
    }

    activeScrollMode = isGalleryPage() ? "gallery" : "chat";
    if (btn) btn.textContent = "Stop Auto-Scroll";
    noNewItemsCount = 0;
    lastCapturedCount = activeScrollMode === "gallery" ? galleryStore.size : messageStore.size;
    cachedScrollTarget = null;

    const intervalMs = activeScrollMode === "gallery" ? 2600 : 1500;

    autoScrollTimer = setInterval(() => {
      const currentCount = activeScrollMode === "gallery" ? galleryStore.size : messageStore.size;
      const stallLimit = activeScrollMode === "gallery" ? 8 : 4;

      if (activeScrollMode === "gallery" && hasGalleryLoadError()) {
        toggleAutoScroll();
        const status = document.getElementById("emochi-dl-status");
        if (status) {
          status.textContent = "Gallery load failed on Emochi. Auto-scroll stopped; wait a moment, then retry.";
          status.className = "emochi-status warn";
        }
        return;
      }

      if (currentCount === lastCapturedCount) {
        noNewItemsCount++;
        if (noNewItemsCount >= stallLimit) {
          toggleAutoScroll();
          updateUI(true);
          return;
        }
      } else {
        lastCapturedCount = currentCount;
        noNewItemsCount = 0;
      }

      if (activeScrollMode === "gallery") {
        scrollGalleryDown();
        return;
      }

      if (!cachedScrollTarget || !document.body.contains(cachedScrollTarget)) {
        const containers = getScrollableContainers();
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
    }, intervalMs);

    return true;
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
            <button id="emochi-dl-close">x</button>
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

          <button id="emochi-dl-autoscroll" class="emochi-action-btn secondary" style="margin-bottom: 8px;">Start Auto-Scroll</button>
          <button id="emochi-dl-download" class="emochi-action-btn primary" disabled>Download Chat</button>

          <div class="emochi-format-row" style="margin-top: 8px;">
            <label class="emochi-format-label">Gallery:</label>
            <div class="emochi-format-btns">
              <button class="fmt-btn active" data-gallery-scope="all">All</button>
              <button class="fmt-btn" data-gallery-scope="favorites">Favorites</button>
            </div>
          </div>
          <button id="emochi-gallery-download" class="emochi-action-btn primary" disabled>Download Gallery</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    root.querySelector("#emochi-dl-toggle").onclick = () => root.querySelector("#emochi-dl-panel").classList.toggle("collapsed");
    root.querySelector("#emochi-dl-close").onclick = () => root.querySelector("#emochi-dl-panel").classList.add("collapsed");
    root.querySelector("#emochi-dl-autoscroll").onclick = toggleAutoScroll;

    const fmtBtns = root.querySelectorAll(".fmt-btn[data-fmt]");
    fmtBtns.forEach(btn => btn.onclick = () => {
      fmtBtns.forEach(other => other.classList.remove("active"));
      btn.classList.add("active");
      selectedFormat = btn.dataset.fmt;
    });

    const galleryBtns = root.querySelectorAll(".fmt-btn[data-gallery-scope]");
    galleryBtns.forEach(btn => btn.onclick = () => {
      galleryBtns.forEach(other => other.classList.remove("active"));
      btn.classList.add("active");
      selectedGalleryScope = btn.dataset.galleryScope;
      updateUI();
    });

    root.querySelector("#emochi-dl-download").onclick = () => {
      const useZip = document.getElementById("emochi-dl-zip-check").checked;
      executeDownload(selectedFormat, useZip);
    };

    root.querySelector("#emochi-gallery-download").onclick = () => {
      executeGalleryDownload(selectedGalleryScope);
    };

    extractInitialData();
    updateUI();
  }

  function updateUI(reachedBoundary = false) {
    const status = document.getElementById("emochi-dl-status");
    const allGalleryCount = galleryStore.size;
    const favoriteGalleryCount = getGalleryImages("favorites").length;

    updateDownloadButtons();
    if (!status) return;

    if (isChatDownloadRunning || isGalleryDownloadRunning) return;

    if (isGalleryPage()) {
      if (allGalleryCount > 0) {
        const prefix = reachedBoundary && activeScrollMode === "gallery" ? "Reached bottom. " : "";
        status.textContent = `${prefix}Gallery: ${allGalleryCount} images, ${favoriteGalleryCount} favorites.`;
        status.className = "emochi-status success";
      } else {
        status.textContent = "Scroll the gallery to begin recording images.";
        status.className = "emochi-status info";
      }
      return;
    }

    if (messageStore.size > 0) {
      const prefix = reachedBoundary && activeScrollMode === "chat" ? "Reached top. " : "";
      status.textContent = `${prefix}Recorded ${messageStore.size} messages.`;
      status.className = "emochi-status success";
    } else if (allGalleryCount > 0) {
      status.textContent = `Gallery recorded: ${allGalleryCount} images, ${favoriteGalleryCount} favorites.`;
      status.className = "emochi-status success";
    } else {
      status.textContent = "Scroll up in the chat or open the gallery to begin recording.";
      status.className = "emochi-status info";
    }
  }

  // --- 4. URL WATCHER ---
  let currentLocationKey = `${location.pathname}${location.search}`;
  setInterval(() => {
    const nextLocationKey = `${location.pathname}${location.search}`;
    if (nextLocationKey !== currentLocationKey) {
      currentLocationKey = nextLocationKey;
      messageStore.clear();
      galleryStore.clear();
      if (autoScrollTimer) toggleAutoScroll();
      cachedScrollTarget = null;

      const nameEl = document.getElementById("emochi-dl-char-name");
      if (nameEl) nameEl.textContent = getCharacterName();

      updateUI();
    }
  }, 800);

  // --- 5. POPUP MESSAGING ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "get_stats") {
      sendResponse({
        count: messageStore.size,
        galleryCount: galleryStore.size,
        favoriteGalleryCount: getGalleryImages("favorites").length,
        isScrolling: !!autoScrollTimer,
        isChatDownloading: isChatDownloadRunning,
        isGalleryDownloading: isGalleryDownloadRunning,
        pageType: isGalleryPage() ? "gallery" : "chat"
      });
    } else if (msg.action === "toggle_scroll") {
      const isRunning = toggleAutoScroll();
      sendResponse({ isScrolling: isRunning });
    } else if (msg.action === "trigger_download") {
      executeDownload(msg.format || selectedFormat, msg.useZip);
      sendResponse({ success: true });
    } else if (msg.action === "trigger_gallery_download") {
      executeGalleryDownload(msg.scope || selectedGalleryScope);
      sendResponse({ success: true });
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", createPanel);
  else createPanel();

  window.postMessage({ type: "__EMOCHI_DL_READY__" }, "*");
})();
