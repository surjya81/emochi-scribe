document.addEventListener("DOMContentLoaded", () => {
  let selectedFormat = "txt";

  const mainUI       = document.getElementById("main-ui");
  const notChatPage  = document.getElementById("not-chat-page");
  const statusBanner = document.getElementById("status-banner");
  const scanBtn      = document.getElementById("scan-btn");
  const dlBtn        = document.getElementById("dl-btn");
  const fmtBtns      = document.querySelectorAll(".fmt-btn");

  // Hide the old scan button
  if (scanBtn) scanBtn.style.display = "none";

  // Format buttons
  fmtBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      fmtBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedFormat = btn.dataset.fmt;
    });
  });

  // Dynamically inject the Auto-Scroll button into the popup
  const autoScrollBtn = document.createElement("button");
  autoScrollBtn.id = "popup-autoscroll-btn";
  autoScrollBtn.textContent = "🚀 Start Auto-Scroll";
  autoScrollBtn.style.cssText = "width: 100%; padding: 10px; margin-bottom: 10px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;";
  if (dlBtn && dlBtn.parentNode) {
    dlBtn.parentNode.insertBefore(autoScrollBtn, dlBtn);
  }

  function setStatus(msg, type) {
    if (!statusBanner) return;
    statusBanner.textContent = msg;
    statusBanner.className = type || "";
  }

  // Detect chat page and show UI
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    const isChat = /https:\/\/emochi\.(com|ai)\/character\/.+\/chat/.test(tab.url);
    
    if (isChat) {
      mainUI.style.display = "flex";
      if (notChatPage) notChatPage.style.display = "none";
      
      // Auto-Scroll Click Handler
      autoScrollBtn.addEventListener("click", () => {
        chrome.tabs.sendMessage(tab.id, { action: "toggle_scroll" }, response => {
          if (chrome.runtime.lastError) {
            setStatus("Please refresh the chat page to enable interception.", "info");
            return;
          }
          if (response && response.isScrolling) {
            autoScrollBtn.textContent = "⏹ Stop Auto-Scroll";
            autoScrollBtn.style.background = "#ef4444"; // Red for stop
          } else {
            autoScrollBtn.textContent = "🚀 Start Auto-Scroll";
            autoScrollBtn.style.background = "#6b7280"; // Gray for start
          }
        });
      });

      // Start polling the content script for message stats
      setInterval(() => {
        chrome.tabs.sendMessage(tab.id, { action: "get_stats" }, response => {
          if (chrome.runtime.lastError) {
            setStatus("Please refresh the chat page to enable interception.", "info");
            return;
          }
          if (response && response.count > 0) {
            setStatus(`✓ Ready! ${response.count} messages recorded.`, "success");
            if (dlBtn) dlBtn.disabled = false;
          } else {
            setStatus("Scroll up in your chat to load messages...", "info");
            if (dlBtn) dlBtn.disabled = true;
          }
          
          // Keep popup button text in sync with page state
          if (response && response.isScrolling) {
            autoScrollBtn.textContent = "⏹ Stop Auto-Scroll";
            autoScrollBtn.style.background = "#ef4444";
          } else {
            autoScrollBtn.textContent = "🚀 Start Auto-Scroll";
            autoScrollBtn.style.background = "#6b7280";
          }
        });
      }, 1000);

    } else {
      mainUI.style.display = "none";
      if (notChatPage) notChatPage.style.display = "block";
    }
  });

  // Download button triggers the content script
  if (dlBtn) {
    dlBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.tabs.sendMessage(tab.id, { action: "trigger_download", format: selectedFormat });
      });
    });
  }
});