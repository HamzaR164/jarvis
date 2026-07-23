# Jarvis

A personal AI assistant dashboard, styled after a JARVIS-style holographic HUD. Built with Claude (chat + personality) and deployed as a React web app via Replit.

## Live in v1
- Dashboard: glowing HUD avatar, live clock/date, weather widget, editable widget grid, notifications
- Chat with Jarvis: Claude-powered, dry-witty personality, occasionally intentionally not-quite-helpful (the bit)
- Creator quick-commands: video idea list, title & description, write a hook, suggest B-roll
- URL summarizer + code/error explainer
- Push-to-talk voice in/out (browser SpeechRecognition + SpeechSynthesis)
- School mode: Ctrl+Enter slides out a silent, text-only sidebar
- Quick-launch tiles that open websites in a new tab
- "Copy Upgrade Prompt" button: packages this repo link + current architecture + a requested feature into a ready-to-paste prompt for any AI coding assistant

## Setup
The deployed app needs its own `ANTHROPIC_API_KEY` added as a Replit Secret for chat to work — it runs outside Claude.ai, so it can't reuse this chat's access.

## Not possible from a browser (see Issues for the honest roadmap)
- Always-on "Hey Jarvis" wake word — browsers can't listen in the background
- Launching native desktop apps (CapCut, file system access) — needs a local companion app
- Real CPU/RAM system stats — not readable from a browser

## Roadmap
See the Issues tab — each one is written so you can copy it straight into an AI coding assistant to implement.
