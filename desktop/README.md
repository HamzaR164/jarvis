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
4. `npm start`

Both API calls happen in the main process — your keys never touch the renderer, so they
can't leak through dev tools or a compromised page.

## What's real right now
- HUD dashboard with live clock and live weather (Open-Meteo, no key needed)
- Real speech-to-speech: continuous mic listening → Claude → ElevenLabs voice → played back,
  with the mic muted while Jarvis is talking so he doesn't hear himself
- **Voice-activity detection**: Jarvis notices when you start talking and begins the
  conversation automatically — no click required
- **Desktop control that's actually wired in**: Jarvis has a `launch_app` tool. Ask him to
  open something in your `allowedApps` list and he decides to do it as part of the
  conversation — this isn't a button sitting unused, it's live. He'll only ever launch
  something you've explicitly listed in `config.json`; if you ask for anything else, he'll
  tell you it isn't allowed yet instead of pretending he can't do anything.
- A standing "prefer free" rule in his personality: when a task could be done a free way or
  a paid way, he defaults to free and just does it, and only pauses to ask before using
  anything paid.

## Not built yet
- Packaging into a one-click installer (.exe / .dmg) — right now this runs via `npm start`
- School mode (Ctrl+Enter sidebar)
- Broader desktop actions beyond launching allow-listed apps (file organization, etc.) —
  same safety pattern (explicit allow-list, never a free-form command) would extend to these

## Repo
This repo is now public — https://github.com/HamzaR164/jarvis
