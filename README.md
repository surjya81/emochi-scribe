# 📥 Emochi Chat Downloader — Chrome Extension

Download your Emochi.com roleplay chat conversations as **TXT**, **Markdown**, or **JSON** files.

---

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `emochi-chat-downloader` folder
5. The extension icon (purple download arrow) appears in your toolbar

---

## How to Use

### Method 1 — Floating Panel (on the chat page)
1. Navigate to any Emochi chat: `emochi.com/character/.../chat`
2. A purple **📥** button appears in the bottom-right corner
3. Click it to open the panel
4. **Scroll through your chat first** to load all messages
5. Click **Scan Chat** to detect messages
6. Choose your format (TXT / MD / JSON)
7. Click **Download**

### Method 2 — Toolbar Popup
1. While on an Emochi chat page, click the extension icon in Chrome's toolbar
2. It auto-scans on open
3. Select format and click **Download Chat**

---

## Export Formats

| Format | Best For |
|--------|----------|
| `.txt` | Simple reading, notes apps |
| `.md`  | Markdown editors (Obsidian, Notion, Typora) |
| `.json`| Developers, data analysis, backups |

---

## Tips

- **Scroll through the entire chat** before scanning — Emochi uses virtualized rendering, so only visible messages are in the DOM at once
- If Scan finds 0 messages, scroll to the top, then slowly scroll to the bottom, then click Scan again
- The JSON format includes metadata (character name, URL, timestamp)

---

## Troubleshooting

**"No messages found"** — Scroll through the entire chat to load all messages into the DOM, then scan again.

**Extension doesn't appear on the page** — Make sure you're on a URL matching `emochi.com/character/*/chat`. Refresh the page after installing.

**Download doesn't start** — Check that Chrome isn't blocking downloads from extensions in Settings → Downloads.
