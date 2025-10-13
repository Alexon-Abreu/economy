# Economy

A zero‑server GitHub Pages dashboard that auto‑updates the **Buffett Indicator** (U.S. Total Market Cap / Nominal GDP).

- **Total Market Cap** ≈ FT Wilshire 5000 level × billions‑per‑point factor (default **1.05**).  
- **GDP (SAAR, billions USD)** via FRED series `GDP` (BEA nominal).

## Quick start
1. **Create a repo** named `economy` and enable **Pages** (Settings → Pages → Source: Deploy from Branch, Branch: main, Folder: / (root)).  
2. **Add a secret**: `FRED_API_KEY` (from your FRED account).  
3. (Optional) Add a **Repository Variable** `BILLIONS_PER_POINT` (default is 1.05).  
4. Commit/push this project. The scheduled workflow runs on weekdays after U.S. market close and commits to `data/*.json`.  
5. Your site will be at `https://<username>.github.io/economy/`.

## Local test
```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Notes
- You can change the site title in `index.html` and footer GitHub link to your actual username.  
- To add more metrics, edit `scripts/update.py` to emit extra fields and update `assets/app.js` to render them.

_Disclaimer: Educational use only. Not investment advice._
