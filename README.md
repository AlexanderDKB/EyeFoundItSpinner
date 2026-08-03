# Eye Found It Spinner

A simple browser spinner for **Disney Eye Found It!** when the physical spinner is missing.

**Play:** https://alexanderdkb.github.io/EyeFoundItSpinner/

No install, no compile. Flick the needle, or tap **Spin**. The wheel stays fixed so numbers stay upright; the needle spins and clicks past each segment.

Updates load on a normal visit (or when you switch back to the tab) — no hard refresh needed. When changing the app, bump the same version string in both `version.json` and `index.html`.

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

## Files

- `index.html` — page shell + update bootstrap
- `version.json` — deploy version for cache busting
- `style.css` — wheel look and motion
- `app.js` — needle physics, flick gesture, tick sounds
