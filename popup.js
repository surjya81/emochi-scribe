document.addEventListener("DOMContentLoaded", () => {
  let selectedFormat = "txt";
  let selectedGalleryScope = "all";

  const mainUI = document.getElementById("main-ui");
  const notChatPage = document.getElementById("not-chat-page");
  const statusBanner = document.getElementById("status-banner");
  const scanBtn = document.getElementById("scan-btn");
  const dlBtn = document.getElementById("dl-btn");
  const fmtBtns = document.querySelectorAll(".fmt-btn");
  const chatFormatSection = document.querySelector(".format-grid")?.parentElement;

  // Hide the old unused scan button if it exists
  if (scanBtn) scanBtn.style.display = "none";

  fmtBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      fmtBtns.forEach(other => other.classList.remove("active"));
      btn.classList.add("active");
      selectedFormat = btn.dataset.fmt;
    });
  });

  // Inject Chat Download Options (.ZIP & Bundle)
  const optionsContainer = document.createElement("div");
  optionsContainer.style.cssText = "margin-top: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;";
  optionsContainer.innerHTML = `
    <label style="font-size: 12px; color: #d8b4fe; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600;">
      <input type="checkbox" id="popup-zip-check" checked style="accent-color: #a855f7; cursor: pointer; width: 14px; height: 14px;">
      Include In-Chat Images & Avatar (.ZIP)
    </label>
    <label style="font-size: 12px; color: #d8b4fe; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600;">
      <input type="checkbox" id="popup-all-check" style="accent-color: #a855f7; cursor: pointer; width: 14px; height: 14px;">
      Bundle .TXT, .MD, and .JSON in one ZIP
    </label>
  `;
  if (dlBtn?.parentNode) dlBtn.parentNode.insertBefore(optionsContainer, dlBtn);

  // Inject Auto-Scroll Button
  const autoScrollBtn = document.createElement("button");
  autoScrollBtn.id = "popup-autoscroll-btn";
  autoScrollBtn.textContent = "Start Auto-Scroll";
  autoScrollBtn.style.cssText = "display: none; width: 100%; padding: 10px; margin-bottom: 10px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;";
  if (dlBtn?.parentNode) dlBtn.parentNode.insertBefore(autoScrollBtn, dlBtn);

  // Inject Gallery Download UI
  const galleryContainer = document.createElement("div");
  galleryContainer.style.cssText = "display: none; flex-direction: column; gap: 8px;";
  galleryContainer.innerHTML = `
    <div>
      <div class="section-label">Gallery Export</div>
      <div class="format-grid" style="grid-template-columns: repeat(2, 1fr);">
        <button class="fmt-btn active" data-gallery-scope="all">All</button>
        <button class="fmt-btn" data-gallery-scope="favorites">Favorites</button>
      </div>
    </div>
    <button class="btn btn-dl" id="gallery-dl-btn" disabled>Download Gallery</button>
  `;
  if (dlBtn?.parentNode) dlBtn.parentNode.insertBefore(galleryContainer, dlBtn.nextSibling);

  const galleryScopeBtns = galleryContainer.querySelectorAll(".fmt-btn[data-gallery-scope]");
  const galleryDlBtn = galleryContainer.querySelector("#gallery-dl-btn");
  galleryScopeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      galleryScopeBtns.forEach(other => other.classList.remove("active"));
      btn.classList.add("active");
      selectedGalleryScope = btn.dataset.galleryScope;
    });
  });

  function setStatus(msg, type) {
    if (!statusBanner) return;
    statusBanner.textContent = msg;
    statusBanner.className = type || "";
  }

  function getPageKind(tabUrl) {
    try {
      const url = new URL(tabUrl);
      if (url.hostname !== "emochi.com" && !url.hostname.endsWith(".emochi.com")) return "other";
      if (/^\/character\/.+\/chat/.test(url.pathname)) return "chat";
      // Allow for variation in the gallery path
      if (url.pathname.includes("/me") && url.searchParams.get("tab") === "gallery") return "gallery";
      return "other";
    } catch (err) {
      return "other";
    }
  }

  function updateScrollButton(isScrolling) {
    if (isScrolling) {
      autoScrollBtn.textContent = "Stop Auto-Scroll";
      autoScrollBtn.style.background = "#ef4444";
    } else {
      autoScrollBtn.textContent = "Start Auto-Scroll";
      autoScrollBtn.style.background = "#6b7280";
    }
  }

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;

    const pageKind = getPageKind(tab.url);
    if (pageKind === "other") {
      mainUI.style.display = "none";
      if (notChatPage) notChatPage.style.display = "block";
      return;
    }

    mainUI.style.display = "flex";
    if (notChatPage) notChatPage.style.display = "none";

    // Show Auto-Scroll button for BOTH Chat and Gallery pages
    if (pageKind === "chat" || pageKind === "gallery") {
      autoScrollBtn.style.display = "block";
    }

    // Configure layout for Gallery Page vs Chat Page
    if (pageKind === "gallery") {
      if (dlBtn) dlBtn.style.display = "none";
      optionsContainer.style.display = "none";
      if (chatFormatSection) chatFormatSection.style.display = "none";
      galleryContainer.style.display = "flex";
    }

    // Bind listener for Auto-Scroll clicks on either page
    if (pageKind === "chat" || pageKind === "gallery") {
      autoScrollBtn.addEventListener("click", () => {
        chrome.tabs.sendMessage(tab.id, { action: "toggle_scroll" }, response => {
          if (chrome.runtime.lastError) {
            setStatus("Please refresh the Emochi page.", "info");
            return;
          }
          updateScrollButton(!!response?.isScrolling);
        });
      });
    }

    // Polling content script for UI updates
    setInterval(() => {
      chrome.tabs.sendMessage(tab.id, { action: "get_stats" }, response => {
        if (chrome.runtime.lastError) {
          setStatus("Please refresh the Emochi page to enable interception.", "info");
          return;
        }

        const chatCount = response?.count || 0;
        const galleryCount = response?.galleryCount || 0;
        const favoriteCount = response?.favoriteGalleryCount || 0;
        const isChatDownloading = !!response?.isChatDownloading;
        const isGalleryDownloading = !!response?.isGalleryDownloading;
        const selectedGalleryCount = selectedGalleryScope === "favorites" ? favoriteCount : galleryCount;

        // UI Text and Progress handling
        if (isGalleryDownloading) {
          setStatus("Gallery download is running. Keep this page open.", "info");
        } else if (isChatDownloading) {
          setStatus("Chat download is running. Keep this page open.", "info");
        } else if (pageKind === "gallery") {
          if (galleryCount > 0) {
            setStatus(`Gallery ready: ${galleryCount} images, ${favoriteCount} favorites.`, "success");
          } else {
            setStatus("Scroll the gallery to record images.", "info");
          }
        } else if (chatCount > 0) {
          setStatus(`Ready: ${chatCount} messages recorded.`, "success");
        } else {
          setStatus("Scroll up in your chat to load messages.", "info");
        }

        // Toggle buttons enablement
        if (dlBtn) dlBtn.disabled = isChatDownloading || chatCount === 0;
        if (galleryDlBtn) {
          galleryDlBtn.disabled = isGalleryDownloading || selectedGalleryCount === 0;
          galleryDlBtn.textContent = isGalleryDownloading ? "Downloading..." : "Download Gallery";
        }
        
        // Sync scroll button state
        updateScrollButton(!!response?.isScrolling);
      });
    }, 1000);

    // Click logic for "Download Chat"
    if (dlBtn) {
      dlBtn.addEventListener("click", () => {
        const useZip = document.getElementById("popup-zip-check").checked;
        const exportAll = document.getElementById("popup-all-check").checked;
        chrome.tabs.sendMessage(tab.id, { action: "trigger_download", format: selectedFormat, useZip, exportAll });
      });
    }

    // Click logic for "Download Gallery"
    if (galleryDlBtn) {
      galleryDlBtn.addEventListener("click", () => {
        galleryDlBtn.disabled = true;
        galleryDlBtn.textContent = "Downloading...";
        chrome.tabs.sendMessage(tab.id, { action: "trigger_gallery_download", scope: selectedGalleryScope });
      });
    }
  });
});