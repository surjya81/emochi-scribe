// ============================================================
// Emochi Chat Downloader — Popup Script
// ============================================================

let selectedFormat = "txt";

const mainUI       = document.getElementById("main-ui");
const notChatPage  = document.getElementById("not-chat-page");
const statusBanner = document.getElementById("status-banner");
const scanBtn      = document.getElementById("scan-btn");
const dlBtn        = document.getElementById("dl-btn");
const fmtBtns      = document.querySelectorAll(".fmt-btn");

// Detect chat page
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const isChat = /https:\/\/emochi\.(com|ai)\/character\/.+\/chat/.test(tab.url);
  if (isChat) {
    mainUI.style.display = "flex";
    setStatus("Waiting for auth token… the chat page captures it automatically.", "info");
    dlBtn.disabled = false;
  } else {
    notChatPage.style.display = "block";
  }
});

// Format buttons
fmtBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    fmtBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFormat = btn.dataset.fmt;
  });
});

// Scan button
scanBtn.addEventListener("click", () => {
  setStatus("Scanning…", "info");
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { action: "scrape" }, response => {
      if (chrome.runtime.lastError || !response?.success) {
        setStatus("⚠ Scan failed. Make sure you're on a chat page and try scrolling first.", "warn");
        return;
      }
      setStatus(`✓ Found ${response.count} messages. Ready to download.`, "success");
    });
  });
});

// Download button
dlBtn.addEventListener("click", () => {
  setStatus("Downloading full chat…", "info");
  dlBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(
      tab.id,
      { action: "download_full", format: selectedFormat },
      response => {
        dlBtn.disabled = false;
        if (chrome.runtime.lastError || !response?.success) {
          const err = chrome.runtime.lastError?.message || response?.error || "Unknown error";
          setStatus(`⚠ ${err}`, "warn");
          return;
        }
        setStatus(`✓ Downloaded ${response.count} messages!`, "success");
      }
    );
  });
});

function setStatus(msg, type) {
  statusBanner.textContent = msg;
  statusBanner.className = type || "";
}