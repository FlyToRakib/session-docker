# Session Docker

Version: 2.0

**What it does**
- Save website login sessions (cookie strings) per domain.
- Paste or sync cookie strings, edit, copy, delete.
- Auto-apply saved sessions when you visit the corresponding domain (optional per-site + global toggle).
- Two UI views: List view and Card view, plus a search box.

**Installation (developer mode)**
1. Open Chrome → Extensions → Manage extensions.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `session-docker` folder.
4. Allow host permissions when prompted.

**How to use**
- Use the search box to find saved sites.
- Use the "Add / Update" row to paste domain and cookie string and click Add.
  - Example cookie string: `sessionid=abc123; csrftoken=xyz987`
- Toggle "Auto-apply (global)" to enable or disable automatic application of saved cookies when visiting their domains.
- Per site, toggle "Auto" to apply only for that site.
- Click **Sync** to fetch current cookies from the browser for that domain.
- Click **Apply Now** to ask the background worker to apply cookies immediately.

**Technical notes & limitations**
- Some cookies are marked HttpOnly/Secure or tied to server-side state — re-setting cookies might not always create a working login.
- Some sites store session in localStorage / IndexedDB / service worker caches — this extension only sets cookies. You can extend it to inject scripts to restore localStorage later (advanced).
- Use responsibly. Only manage sessions for accounts you own or have permission to manage.

**Privacy**
- All data is stored locally in Chrome `chrome.storage.local`. The extension does not send data externally.

**Support**
- This template is a starting point. If you want improvements (localStorage restoration, import/export JSON, scheduled backups), request them.
