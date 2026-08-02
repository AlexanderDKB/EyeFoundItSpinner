# Eye Found It Spinner

A simple browser spinner for **Disney Eye Found It!** when the physical spinner is missing.

No install, no compile — open the page in Safari on your iPhone.

## Spinner layout (clockwise from 12)

1. Clock **1**
2. **3**
3. **4**
4. Mickey search
5. **5**
6. **6**
7. Clock **2**
8. **7**
9. **8**
10. Mickey search
11. **1**
12. **2**

## Run on iPhone (same Wi‑Fi)

On your computer, from this folder:

```bash
python3 -m http.server 8000
```

Then on your iPhone, open Safari and go to:

```text
http://YOUR_COMPUTER_LAN_IP:8000
```

Find your computer’s LAN IP:

- **macOS:** System Settings → Network → Wi‑Fi → Details
- **Windows:** `ipconfig` (look for IPv4 Address)
- **Linux:** `hostname -I`

Optional: in Safari, tap Share → **Add to Home Screen** for a full-screen shortcut.

## Run without a server

If you keep everything as local files, you can also AirDrop `index.html`, `style.css`, and `app.js` together and open `index.html` in Safari. Using the local server above is more reliable.

## Files

- `index.html` — page shell
- `style.css` — wheel look and motion
- `app.js` — segment layout and spin logic
