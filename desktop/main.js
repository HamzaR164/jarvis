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

function baseSystemPrompt() {
  const allowedNames = Object.keys((config && config.allowedApps) || {});
  const appsLine = allowedNames.length
    ? `You're currently allowed to launch these apps on this computer using the launch_app tool: ${allowedNames.join(', ')}. For anything not on that list, say plainly that you don't have permission yet and that it can be added in config.json — don't pretend to do it.`
    : `You are not currently allowed to launch any apps — none are configured in config.json's allowedApps yet.`;

  return "You are Jarvis, a personal AI assistant with a dry, witty, butler-like personality inspired by " +
    "Iron Man's JARVIS. You are genuinely competent and helpful first. Occasionally — not every message — " +
    "allow yourself one understated, deadpan-funny line, as a running joke that you are 'not always as helpful " +
    "as I'd hope.' Never let the joke replace an actually useful answer. " +
    "Your replies are converted to speech and spoken aloud, so write the way a person talks: no markdown, no " +
    "bullet points, no headers, no asterisks — just natural spoken sentences. Keep answers concise. " +
    appsLine + " " +
    "Prefer things you can already do for free with what you have access to right now. If a request would need " +
    "a new paid API or service you don't already have a key for, tell the user plainly which paid option you'd " +
    "use and ask permission before doing anything that would cost money — never assume that permission.";
}

const LAUNCH_APP_TOOL = {
  name: 'launch_app',
  description: "Launch an application the user has explicitly allow-listed on this computer.",
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Exact app name as it appears in the allowed list' } },
    required: ['name']
  }
};

const OPEN_WEBSITE_TOOL = {
  name: 'open_website',
  description: "Open a website in the user's default browser (e.g. YouTube, a streaming site, Gmail).",
  input_schema: {
    type: 'object',
    properties: { url: { type: 'string', description: 'Full URL to open, including https://' } },
    required: ['url']
  }
};

async function callClaude(messages, system) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system,
      messages,
      tools: [LAUNCH_APP_TOOL, OPEN_WEBSITE_TOOL]
    })
  });
  return res.json();
}

async function launchAllowedApp(name) {
  if (!config || !config.allowedApps || !config.allowedApps[name]) {
    return { ok: false, error: `"${name}" isn't in the allowed list in config.json yet.` };
  }
  const entry = config.allowedApps[name];
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const cmd = entry[platform];
  if (!cmd) return { ok: false, error: `No ${platform} command configured for "${name}".` };
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

ipcMain.handle('has-config', async () => !!config);

ipcMain.handle('ask-jarvis', async (event, { text }) => {
  if (!config || !config.anthropicApiKey) {
    return { error: 'Missing anthropicApiKey in config.json — copy config.example.json to config.json and fill it in.' };
  }
  const system = baseSystemPrompt();
  try {
    let messages = [{ role: 'user', content: text }];
    let data = await callClaude(messages, system);
    if (data.error) return { error: data.error.message || 'Claude API error' };

    let toolUse = (data.content || []).find((b) => b.type === 'tool_use');
    if (toolUse) {
      let toolResultText;
      if (toolUse.name === 'launch_app') {
        const result = await launchAllowedApp(toolUse.input.name);
        toolResultText = result.ok ? `Launched ${toolUse.input.name}.` : `Could not launch: ${result.error}`;
      } else if (toolUse.name === 'open_website') {
        try {
          await shell.openExternal(toolUse.input.url);
          toolResultText = `Opened ${toolUse.input.url}.`;
        } catch (e) {
          toolResultText = `Could not open that site: ${String(e.message || e)}`;
        }
      } else {
        toolResultText = 'Unknown tool.';
      }
      messages.push({ role: 'assistant', content: data.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: toolResultText }]
      });
      data = await callClaude(messages, system);
      if (data.error) return { error: data.error.message || 'Claude API error' };
    }

    const block = (data.content || []).find((b) => b.type === 'text');
    const replyText = block ? block.text : 'Static on the line — say that again?';
    const audioDataUrl = config.elevenLabsApiKey ? await synthesize(replyText) : null;
    return { replyText, audioDataUrl };
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

ipcMain.handle('launch-app', async (event, name) => launchAllowedApp(name));
ipcMain.handle('open-external', async (event, url) => { shell.openExternal(url); });
