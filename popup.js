let selectedFormat = "txt";

const mainUI       = document.getElementById("main-ui");
const notChatPage  = document.getElementById("not-chat-page");
const statusBanner = document.getElementById("status-banner");
const scanBtn      = document.getElementById("scan-btn");
const dlBtn        = document.getElementById("dl-btn");
const fmtBtns      = document.querySelectorAll(".fmt-btn");

// Hide the old scan button since interception is automatic
if (scanBtn) scanBtn.style.display = "none";

// Format buttons
fmtBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    fmtBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFormat = btn.dataset.fmt;
  });
});

// Detect chat page and show UI
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const isChat = /https:\/\/emochi\.(com|ai)\/character\/.+\/chat/.test(tab.url);
  
  if (isChat) {
    mainUI.style.display = "flex";
    if (notChatPage) notChatPage.style.display = "none";
    
    // Start polling the content script for message stats
    setInterval(() => {
      chrome.tabs.sendMessage(tab.id, { action: "get_stats" }, response => {
        if (chrome.runtime.lastError) {
          // If the script hasn't loaded yet
          setStatus("Please refresh the chat page to enable interception.", "info");
          return;
        }
        if (response && response.count > 0) {
          setStatus(`✓ Ready! ${response.count} messages recorded.`, "success");
          dlBtn.disabled = false;
        } else {
          setStatus("Scroll up in your chat to load messages...", "info");
          dlBtn.disabled = true;
        }
      });
    }, 1000);

  } else {
    mainUI.style.display = "none";
    if (notChatPage) notChatPage.style.display = "block";
  }
});

// Download button triggers the content script
dlBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { action: "trigger_download", format: selectedFormat });
  });
});

function setStatus(msg, type) {
  if (!statusBanner) return;
  statusBanner.textContent = msg;
  statusBanner.className = type || "";
}