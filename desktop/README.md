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
isn't reliable on your mic/setup (tune `VAD_THRESHOLD` near the top of the script in
`index.html` if it triggers too easily or not easily enough).

**Speech-to-text runs through ElevenLabs (Scribe), not the browser's built-in speech
recognition.** Electron's bundled Chromium doesn't have a working `webkitSpeechRecognition`
— Google restricts the free backing service to the actual Chrome browser, so it throws a
permanent `network` error in any Electron app, always has. So this records your voice
properly (stops on a pause, detected the same way the start-of-conversation listener
works) and sends it to ElevenLabs for transcription. That means speech-to-text is now a
paid, usage-based ElevenLabs cost too, on top of the voice replies — worth knowing since
it wasn't before.

The only exception is **school mode** (text-only, silent, Ctrl+Enter — the window docks itself
to a slim panel on the side of your screen and drops the avatar/voice entirely, same ambient
philosophy as the tray, just text). Everywhere else, voice is the only input.

**Ask Jarvis anywhere (Ctrl+Shift+J):** select text in any app, hit the shortcut, and a small
popup opens with Jarvis already answering about it. This is the honest version of "add it to
the right-click menu" — a real native context-menu entry needs OS-level extensions (a proper
macOS Services provider, a Windows shell extension) that Electron can't build and that I can't
compile or test from here. This gets you the same outcome through a hotkey instead.

**Launching Jarvis hands-free:** `clap-launcher.js` is a small *separate* background script
(not part of the main app — it has to be separate, since the whole point is starting Jarvis
when it isn't running yet) that listens locally for a clap and launches the app. Nothing is
recorded or sent anywhere; it's pure local audio-level analysis. Run `npm install mic` once,
then `node clap-launcher.js` to start listening (leave it running, or set it as a login item
yourself — that OS-specific step isn't done here). I tested its detection *logic* against
synthetic signals (`node clap-launcher.js --self-test`) since this sandbox has no real
microphone to clap in front of — the thresholds are a reasonable starting point, not
verified-in-a-real-room tuning.

**On "daddy's home" as a spoken launch phrase — deliberately not built as described.** Detecting
one specific phrase from continuous background audio needs either (a) constant cloud
transcription of everything said near the mic, all day, which is a real ongoing cost and a real
privacy shift from everything else here (which only listens once you've opened the app), or
(b) a dedicated local wake-word engine (Picovoice/Porcupine is the standard one), which needs
its own free account and training the exact phrase yourself in their console — not something I
can do on your behalf. Happy to wire up the Porcupine integration if you set up that account;
just didn't want to quietly build the always-listening cloud version instead.

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

**Quicker launching, no terminal each time:** this folder now also has one-click
launchers, so `npm start` above is only needed the first time to make sure everything's
installed correctly:
- **Windows**: double-click `Start Jarvis.bat`. To pin it: right-click the file → *Create
  shortcut* → right-click that shortcut → *Pin to taskbar* (Windows generally won't pin a
  raw `.bat` directly, but pins its shortcut fine).
- **Mac**: double-click `Jarvis.app` (a real, proper app — keep it inside this folder,
  don't move it elsewhere) or `Start Jarvis.command`. Drag `Jarvis.app` straight to your
  Dock for one-click access from then on.
- **Linux**: edit the two `REPLACE_WITH_FULL_PATH_TO_jarvis-desktop_FOLDER` placeholders in
  `jarvis.desktop` to the actual full path where you extracted this folder, then move
  `jarvis.desktop` to `~/.local/share/applications/` — it'll show up in your app menu to
  pin like any other app. (Linux's `.desktop` format needs a real absolute path here;
  that's a platform requirement, not something I could route around.)

Once it's open, **it already lives in your system tray/menu bar** — closing the window
doesn't quit it, and clicking the tray icon brings it right back, so you only need a
launcher for the very first open each session.

Both API calls happen in the main process — your keys never touch the renderer, so they
can't leak through dev tools or a compromised page.

## What's real right now
- HUD dashboard with live clock, live weather (Open-Meteo, no key needed), and live CPU/RAM stats
- Real speech-to-speech: continuous mic listening → Claude → ElevenLabs voice → played back,
  with the mic muted while Jarvis is talking so he doesn't hear himself
- **Voice-activity detection**: Jarvis notices when you start talking and begins the
  conversation automatically — no click required, gated by saying "Jarvis" once per conversation
- **Desktop control that's actually wired in, not just described**:
  - `launch_app` — opens apps you've explicitly allow-listed in `config.json`
  - `open_website` — opens a URL in your default browser
  - `fetch_webpage` — reads and summarizes a specific page you give him a link to (this is
    *not* a search engine — he can't look things up without a URL, only read a page you name)
  - `web_search` — free, keyless general search via DuckDuckGo's instant-answer service;
    good for factual/infobox-style questions, not a full search engine
  - `organize_files` — lists, moves, or renames files, but **only** inside folders listed in
    `organizableFolders`, and it will **never delete anything**
  - `media_control` / `get_now_playing` — best-effort play/pause/skip and track info.
    Reliable on macOS with Spotify or Music open; play/pause/skip work on Windows via the
    OS media-key signal; Linux needs `playerctl` installed. "What's playing" isn't available
    on Windows yet.
  - `start_screen_recording` / `stop_screen_recording` — captures your screen via
    `desktopCapturer` (not `getDisplayMedia`), specifically so voice can trigger it without
    a prior click. macOS will still ask you to grant Screen Recording permission once in
    System Settings > Privacy — that's an OS-level gate no code can skip.
- **School mode** (Ctrl+Enter) — docks the window to a slim side panel, text-only, no voice
- **Ask Jarvis anywhere** (Ctrl+Shift+J) — captures selected text from any app, pops open a
  small chat window already answering about it
- A standing "prefer free" rule in his personality: free options get used automatically;
  anything paid he doesn't already have a key for gets asked about first.

## Not built yet
- Packaging into a one-click installer (.exe / .dmg) — right now this runs via `npm start`
- A literal entry in the native OS right-click menu — needs platform-native extensions
  (macOS Services, Windows shell extensions) Electron can't build; the hotkey popup above
  is the real substitute
- Speaker-specific voice recognition — voice detection reacts to any sufficiently loud
  voice/sound (gated by saying "Jarvis" once per conversation), not a verified voiceprint
- A spoken wake phrase for hands-free launch ("daddy's home") — see the honest explanation
  above; clap-launcher.js is the free/local alternative that's actually built

## Repo
Full history and the earlier web-preview version: https://github.com/HamzaR164/jarvis
