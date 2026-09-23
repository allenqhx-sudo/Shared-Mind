# Thought Bubbles

A minimalist web app where you type fragmented thoughts — each one becomes a white liquid bubble floating on a black canvas. Bubbles can be dragged, they fuse visually when close, and two selected bubbles can be merged into a new one using an AI model.

## Project Files

```
week2/
├── index.html   ← the complete single-file web app (open this in a browser)
├── proxy.js     ← a copy of index.html kept for reference / review
└── README.md    ← this file
```

## How to Run Locally

### Option 1 — Python built-in server (recommended)

Open Terminal, navigate to this folder, then run:

```bash
cd "/Users/allenqiu/Desktop/shared minds/week2"
python3 -m http.server 8089
```

Then open your browser and go to:

```
http://localhost:8089/index.html
```

To stop the server, press `Ctrl + C` in Terminal.

### Option 2 — Open directly in browser

Double-click `index.html` in Finder to open it directly.
Note: the AI Generate feature requires a server (Option 1) due to browser CORS rules.

## Features

- Type a thought → press **Enter** → a white bubble appears
- Drag bubbles freely around the canvas
- Bubbles that get close visually merge (liquid / metaball effect)
- Click a bubble to select it (thin white ring appears); click again to deselect
- Drag one bubble onto another to auto-select both as a pair
- **Delete** — removes selected bubble(s)
- **Generate** — sends the two selected bubbles' full text to AI (via school proxy), and if successful, replaces them with one new bubble at their midpoint

## AI Integration

- **Proxy:** `https://itp-ima-replicate-proxy.web.app/api/create_n_get`
- **Model:** `google/gemini-2.5-flash`
- No personal API key required — the school proxy handles authentication
- On failure the original two bubbles are preserved

## Notes

- Maximum 10 bubbles on screen at once
- Supports Chinese and English input (IME-safe)
- All data is in-memory only — refreshing the page clears everything
