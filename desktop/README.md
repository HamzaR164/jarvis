# Jarvis (desktop)

A personal JARVIS-style desktop assistant. Voice in, voice out, running as an actual
Electron app — not a browser tab.

Inspired by [huwprosser/jarvis-mlx](https://github.com/huwprosser/jarvis-mlx) — his repo
runs fully offline on Apple Silicon (Whisper + Phi-3 + MeloTTS), which he flags himself as
out of date. This build takes the opposite tradeoff: cloud-based (Claude + ElevenLabs), so
it's cross-platform and sounds better out of the box, at the cost of needing API keys and
an internet connection.

## How it works

Open the app: you see the HUD ring, the clock, the date, and the weather. Nothing else —
no buttons, no menus, no chat window.

Just start talking. Jarvis detects your voice automatically (via a volume-based listener,
not a click) — the clock and weather slide away, and you're in a live conversation, no
re-clicking between sentences. He answers out loud. You can also click the ring to start
or end a conversation manually — useful in a noisy room, or if the automatic detection
isn't reliable on your mic/setup (tune `VAD_THRESHOLD` near the bottom of `index.html` if
it triggers too easily or not easily enough).

The only exception is **school mode** (text-only, silent, Ctrl+Enter) — coming back later
by request; voice is the only input everywhere else for now.

## Setup

1. Install [Node.js](https://nodejs.org) (18+).
2. `npm install`
3. Copy `config.example.json` to `config.json` and fill in:
   - `anthropicApiKey` — your Claude API key
   - `elevenLabsApiKey` — your ElevenLabs API key
   - `elevenLabsVoiceId` — defaults to "Daniel" (British, formal, steady)
   - `weather` — defaults to Cairo, edit lat/lon for your city
   - `allowedApps` — apps Jarvis is allowed to actually launch (see below)
   - `organizableFolders` — folders Jarvis is allowed to tidy up (list/move/rename, never delete)
4. `npm start`

Both API calls happen in the main process — your keys never touch the renderer, so they
can't leak through dev tools or a compromised page.

## What's real right now
- HUD dashboard with live clock, live weather (Open-Meteo, no key needed), and live CPU/RAM stats
- Real speech-to-speech: continuous mic listening → Claude → ElevenLabs voice → played back,
  with the mic muted while Jarvis is talking so he doesn't hear himself
- **Voice-activity detection**: Jarvis notices when you start talking and begins the
  conversation automatically — no click required
- **Desktop control that's actually wired in, not just described**:
  - `launch_app` — opens apps you've explicitly allow-listed in `config.json`
  - `open_website` — opens a URL in your default browser
  - `fetch_webpage` — reads and summarizes a specific page you give him a link to (this is
    *not* a search engine — he can't look things up without a URL, only read a page you name)
  - `organize_files` — lists, moves, or renames files, but **only** inside folders listed in
    `organizableFolders`, and it will **never delete anything**
  - `media_control` / `get_now_playing` — best-effort play/pause/skip and track info.
    Reliable on macOS with Spotify or Music open; play/pause/skip work on Windows via the
    OS media-key signal; Linux needs `playerctl` installed. "What's playing" isn't available
    on Windows yet.
  - `start_screen_recording` / `stop_screen_recording` — captures your screen via the OS
    picker and saves a `.webm` to `~/JarvisRecordings`. **Caveat worth testing**: Chromium
    normally requires a recent click/keypress before it'll open the screen-share picker.
    Since this is triggered by voice, it's possible the OS blocks it if there's been no
    recent physical interaction — if it doesn't work by voice alone, that's a real platform
    constraint, not a bug, and clicking the ring right before asking may be the workaround.
- A standing "prefer free" rule in his personality: free options get used automatically;
  anything paid he doesn't already have a key for gets asked about first.

## Not built yet
- Packaging into a one-click installer (.exe / .dmg) — right now this runs via `npm start`
- School mode (Ctrl+Enter sidebar)
- General web search (only reading a specific URL is wired in — search needs a paid API key)
- Speaker-specific voice recognition — voice detection reacts to any sufficiently loud
  voice/sound, not specifically yours

## Repo
Full history and the earlier web-preview version: https://github.com/HamzaR164/jarvis
