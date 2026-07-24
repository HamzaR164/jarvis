const { app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let config = null;
let win = null;
let tray = null;

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to parse config.json:', e.message);
    return null;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 620,
    minHeight: 480,
    backgroundColor: '#05070d',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
    const menu = Menu.buildFromTemplate([
      { label: 'Show Jarvis', click: () => win.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Jarvis');
    tray.setContextMenu(menu);
    tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
  } catch (e) {
    console.error('Tray failed to initialize:', e.message);
  }
}

app.whenReady().then(() => {
  config = loadConfig();
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => globalShortcut.unregisterAll());

// Everything here is heard, not read - the user talks to Jarvis by voice, so replies
// should sound like speech, not a document. The free-vs-paid line is a standing
// instruction: as more tools get added beyond the launcher below, this is the rule
// they should follow too.
const JARVIS_SYSTEM_PROMPT =
  "You are Jarvis, a personal AI assistant with a dry, witty, butler-like personality inspired by Iron Man's JARVIS. " +
  "The user is talking to you by voice and hearing your reply spoken aloud, not reading it - keep answers short, " +
  "natural, and conversational, never a list or anything that reads like a document. You are genuinely competent " +
  "and helpful first. Occasionally - not every message - allow yourself one understated, deadpan-funny line, as a " +
  "running joke that you are 'not always as helpful as I'd hope.' Never let the joke replace an actually useful answer. " +
  "When a task could be done a free way or a paid way, default to free and just do it; only pause to ask permission " +
  "before using something paid, and briefly say which you used if it's not obvious. You can launch a small set of " +
  "apps the user has explicitly allowed via the launch_app tool - use it when they ask to open one of those. If they " +
  "ask for an app that isn't on that list, tell them it isn't allowed yet rather than acting like you can't open anything.";

ipcMain.handle('has-config', async () => !!config);

function buildToolDefs() {
  const apps = config && config.allowedApps ? Object.keys(config.allowedApps) : [];
  if (!apps.length) return [];
  return [
    {
      name: 'launch_app',
      description: "Launch one of the user's explicitly allow-listed desktop apps. Only use names from the enum - never invent one.",
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string', enum: apps } },
        required: ['name']
      }
    }
  ];
}

async function callClaude(messages, tools) {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: JARVIS_SYSTEM_PROMPT,
    messages
  };
  if (tools && tools.length) body.tools = tools;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) return { error: data.error.message || 'Claude API error' };
  return { content: data.content || [] };
}

async function doLaunchApp(name) {
  if (!config || !config.allowedApps || !config.allowedApps[name]) {
    return { ok: false, error: `"${name}" is not in allowedApps` };
  }
  const entry = config.allowedApps[name];
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const cmd = entry[platform];
  if (!cmd) return { ok: false, error: `No ${platform} command configured for "${name}"` };
  try {
    if (platform === 'mac') {
      spawn('open', ['-a', cmd], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'win') {
      spawn('cmd', ['/c', 'start', '', cmd], { detached: true, stdio: 'ignore', shell: true }).unref();
    } else {
      spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Real, working "do things on the desktop" - via voice, through Claude's tool use,
// but still hard-scoped to config.json's allowedApps. Jarvis decides WHEN to launch
// something based on the conversation; it can never launch anything outside the list.
ipcMain.handle('ask-jarvis', async (event, { text, speak }) => {
  if (!config || !config.anthropicApiKey) {
    return { error: 'Missing anthropicApiKey in config.json - copy config.example.json to config.json and fill it in.' };
  }
  try {
    const tools = buildToolDefs();
    let messages = [{ role: 'user', content: text }];
    let finalText = null;
    let launchedApp = null;

    for (let round = 0; round < 3 && finalText === null; round++) {
      const res = await callClaude(messages, tools);
      if (res.error) return { error: res.error };
      const toolUse = res.content.find((b) => b.type === 'tool_use');
      if (toolUse && toolUse.name === 'launch_app') {
        const appName = toolUse.input && toolUse.input.name;
        const launchResult = await doLaunchApp(appName);
        launchedApp = launchResult.ok ? appName : null;
        messages.push({ role: 'assistant', content: res.content });
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(launchResult) }]
        });
        continue;
      }
      const block = res.content.find((b) => b.type === 'text');
      finalText = block ? block.text : 'Static on the line - say that again?';
    }

    let audioDataUrl = null;
    if (speak && config.elevenLabsApiKey && finalText) {
      audioDataUrl = await synthesize(finalText);
    }
    return { replyText: finalText, audioDataUrl, launchedApp };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

async function synthesize(text) {
  try {
    const voiceId = config.elevenLabsVoiceId || 'onwK4e9ZLuTAKqWW03F9';
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': config.elevenLabsApiKey },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.75 }
      })
    });
    if (!res.ok) {
      console.error('ElevenLabs TTS failed:', res.status, await res.text());
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return 'data:audio/mpeg;base64,' + buf.toString('base64');
  } catch (e) {
    console.error('TTS error:', e.message);
    return null;
  }
}

ipcMain.handle('get-weather', async () => {
  const w = (config && config.weather) || { lat: 30.0444, lon: 31.2357, label: 'Cairo' };
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    return {
      label: w.label,
      temp: Math.round(data.current.temperature_2m),
      code: data.current.weather_code,
      hi: Math.round(data.daily.temperature_2m_max[0]),
      lo: Math.round(data.daily.temperature_2m_min[0])
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

ipcMain.handle('launch-app', async (event, name) => doLaunchApp(name));
ipcMain.handle('open-external', async (event, url) => shell.openExternal(url));
