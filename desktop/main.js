const { app, BrowserWindow, Tray, Menu, ipcMain, shell, globalShortcut, desktopCapturer, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const execAsync = require('util').promisify(require('child_process').exec);

// Every external call in this file goes through this instead of raw fetch(). Without a
// timeout, a stuck/slow connection just hangs forever with no error - which shows up to
// the user as "thinking" that never resolves. This turns that into a real, visible error
// after a reasonable wait instead of silence.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...(options || {}), signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s - check your internet connection`);
    }
    throw e;
  }
}

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
    tray = new Tray(path.join(__dirname, 'assets', 'tray-idle.png'));
    const menu = Menu.buildFromTemplate([
      { label: 'Show Jarvis', click: () => win.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Jarvis — idle');
    tray.setContextMenu(menu);
    tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
  } catch (e) {
    console.error('Tray failed to initialize:', e.message);
  }
}

let thinkingAnimTimer = null;
function setTrayState(state) {
  if (!tray) return;
  if (thinkingAnimTimer) {
    clearInterval(thinkingAnimTimer);
    thinkingAnimTimer = null;
  }
  const staticIcons = {
    idle: 'tray-idle.png',
    listening: 'tray-listening.png',
    speaking: 'tray-speaking.png',
    recording: 'tray-recording.png'
  };
  if (state === 'thinking') {
    const frames = ['tray-thinking-1.png', 'tray-thinking-2.png'];
    let frame = 0;
    tray.setImage(path.join(__dirname, 'assets', frames[0]));
    thinkingAnimTimer = setInterval(() => {
      frame = (frame + 1) % frames.length;
      try { tray.setImage(path.join(__dirname, 'assets', frames[frame])); } catch (e) {}
    }, 400);
  } else {
    const iconFile = staticIcons[state] || staticIcons.idle;
    try { tray.setImage(path.join(__dirname, 'assets', iconFile)); } catch (e) {}
  }
  tray.setToolTip('Jarvis — ' + state);
}

let schoolMode = false;
let normalBounds = null;

function toggleSchoolMode() {
  if (!win) return;
  schoolMode = !schoolMode;
  if (schoolMode) {
    normalBounds = win.getBounds();
    const display = screen.getPrimaryDisplay();
    const width = 340;
    win.setAlwaysOnTop(true, 'floating');
    win.setBounds({
      x: display.workArea.x + display.workArea.width - width,
      y: display.workArea.y,
      width,
      height: display.workArea.height
    });
  } else {
    win.setAlwaysOnTop(false);
    if (normalBounds) win.setBounds(normalBounds);
  }
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send('school-mode-changed', schoolMode);
}

let popupWin = null;

async function simulateCopy() {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
    } else if (platform === 'win32') {
      await execAsync(`powershell -command "$w = New-Object -ComObject WScript.Shell; $w.SendKeys('^c')"`);
    } else {
      await execAsync(`xdotool key ctrl+c`);
    }
    return true;
  } catch (e) {
    console.error('simulateCopy failed (needs xdotool on Linux):', e.message);
    return false;
  }
}

async function openAskPopup() {
  await simulateCopy();
  await new Promise((r) => setTimeout(r, 180)); // give the OS a moment to update the clipboard
  const selectedText = clipboard.readText() || '';

  if (!popupWin || popupWin.isDestroyed()) {
    popupWin = new BrowserWindow({
      width: 420,
      height: 480,
      minWidth: 320,
      minHeight: 320,
      backgroundColor: '#05070d',
      alwaysOnTop: true,
      title: 'Ask Jarvis',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    popupWin.loadFile('ask-popup.html');
  } else {
    popupWin.show();
    popupWin.focus();
  }
  popupWin.webContents.once('did-finish-load', () => {
    popupWin.webContents.send('popup-selected-text', selectedText);
  });
  // In case the window was already loaded from a previous invocation:
  if (!popupWin.webContents.isLoadingMainFrame()) {
    popupWin.webContents.send('popup-selected-text', selectedText);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  config = loadConfig();
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Enter', toggleSchoolMode);
  globalShortcut.register('CommandOrControl+Shift+J', openAskPopup);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (thinkingAnimTimer) clearInterval(thinkingAnimTimer);
});

function baseSystemPrompt() {
  const allowedNames = Object.keys((config && config.allowedApps) || {});
  const appsLine = allowedNames.length
    ? `You're currently allowed to launch these apps using launch_app: ${allowedNames.join(', ')}. For anything not on that list, say plainly that you don't have permission yet and that it can be added in config.json — don't pretend to do it.`
    : `You are not currently allowed to launch any apps — none are configured in config.json's allowedApps yet.`;

  const folderNames = Object.keys((config && config.organizableFolders) || {});
  const foldersLine = folderNames.length
    ? `You're allowed to list/move/rename files (never delete) inside these folders using organize_files: ${folderNames.join(', ')}. Nothing outside these folders, ever.`
    : `You don't have any folders configured for organize_files yet — none are set in config.json's organizableFolders.`;

  return "You are Jarvis, a personal AI assistant with a dry, witty, butler-like personality inspired by " +
    "Iron Man's JARVIS. You are genuinely competent and helpful first. Occasionally — not every message — " +
    "allow yourself one understated, deadpan-funny line, as a running joke that you are 'not always as helpful " +
    "as I'd hope.' Never let the joke replace an actually useful answer. " +
    "Your replies are converted to speech and spoken aloud, so write the way a person talks: no markdown, no " +
    "bullet points, no headers, no asterisks — just natural spoken sentences. Keep answers concise. " +
    appsLine + " " + foldersLine + " " +
    "fetch_webpage needs an actual URL, for reading one specific page. web_search is for general queries " +
    "when you don't have a URL — it's a free, keyless lookup (DuckDuckGo's instant-answer service), so it " +
    "reliably answers factual/infobox-style questions but isn't a full general search engine; say so plainly " +
    "if it comes back empty rather than guessing. media_control and get_now_playing are best-effort and vary " +
    "by OS and what's open — say so plainly if one fails rather than pretending it worked. " +
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

const FETCH_WEBPAGE_TOOL = {
  name: 'fetch_webpage',
  description: "Fetch a specific webpage's text content by URL, to summarize an article or answer questions about it. Needs an actual URL, not a search query.",
  input_schema: {
    type: 'object',
    properties: { url: { type: 'string', description: 'Full URL including https://' } },
    required: ['url']
  }
};

const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: "Search the web for general information when you don't have a specific URL. Free, no API key — uses DuckDuckGo's instant-answer service, so it's reliable for factual/infobox-style questions but not a full general search engine.",
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search query' } },
    required: ['query']
  }
};

const MEDIA_CONTROL_TOOL = {
  name: 'media_control',
  description: "Send a play/pause/next/previous command to currently playing media. Best-effort, varies by OS and what's open.",
  input_schema: {
    type: 'object',
    properties: { action: { type: 'string', enum: ['play_pause', 'next', 'previous'] } },
    required: ['action']
  }
};

const NOW_PLAYING_TOOL = {
  name: 'get_now_playing',
  description: "Check what's currently playing. Most reliable on macOS with Spotify or Music open.",
  input_schema: { type: 'object', properties: {} }
};

const ORGANIZE_FILES_TOOL = {
  name: 'organize_files',
  description: "List, move, or rename files inside folders the user has explicitly allowed via config.json's organizableFolders. Never deletes anything, and can never touch a folder that isn't on that list.",
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'move', 'rename'] },
      folder: { type: 'string', description: 'The allowed folder key from organizableFolders' },
      file: { type: 'string', description: 'Filename to act on (for move/rename)' },
      destination: { type: 'string', description: 'For move: subfolder name to move the file into (created if missing). For rename: the new filename.' }
    },
    required: ['action', 'folder']
  }
};

const SYSTEM_STATS_TOOL = {
  name: 'get_system_stats',
  description: "Get current CPU and memory usage.",
  input_schema: { type: 'object', properties: {} }
};

const START_RECORDING_TOOL = {
  name: 'start_screen_recording',
  description: "Start recording the screen. Saves as a video file when stopped.",
  input_schema: { type: 'object', properties: {} }
};

const STOP_RECORDING_TOOL = {
  name: 'stop_screen_recording',
  description: "Stop the current screen recording and save it.",
  input_schema: { type: 'object', properties: {} }
};

const ALL_TOOLS = [
  LAUNCH_APP_TOOL, OPEN_WEBSITE_TOOL, FETCH_WEBPAGE_TOOL, WEB_SEARCH_TOOL, MEDIA_CONTROL_TOOL,
  NOW_PLAYING_TOOL, ORGANIZE_FILES_TOOL, SYSTEM_STATS_TOOL, START_RECORDING_TOOL, STOP_RECORDING_TOOL
];

async function callClaude(messages, system) {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, system, messages, tools: ALL_TOOLS })
  }, 30000);
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
    if (platform === 'mac') spawn('open', ['-a', cmd], { detached: true, stdio: 'ignore' }).unref();
    else if (platform === 'win') spawn('cmd', ['/c', 'start', '', cmd], { detached: true, stdio: 'ignore', shell: true }).unref();
    else spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function htmlToText(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

async function fetchWebpage(url) {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (JarvisAssistant)' } }, 15000);
    if (!res.ok) return { ok: false, error: `Got HTTP ${res.status} fetching that page.` };
    const html = await res.text();
    const text = htmlToText(html).slice(0, 6000);
    return { ok: true, text: text || '(page had no readable text content)' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function webSearch(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return { ok: false, error: `Search failed (HTTP ${res.status}).` };
    const data = await res.json();
    const parts = [data.Answer, data.AbstractText, ...((data.RelatedTopics || []).slice(0, 4).map((t) => t.Text))].filter(Boolean);
    if (!parts.length) {
      return { ok: false, error: "No direct answer found — this free search only covers factual/infobox-style queries, not full general results." };
    }
    return { ok: true, text: parts.join('\n').slice(0, 1200) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function mediaControl(action) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      const key = action === 'next' ? 'next track' : action === 'previous' ? 'previous track' : 'playpause';
      try {
        await execAsync(`osascript -e 'tell application "Spotify" to ${key}'`);
        return { ok: true };
      } catch (e) {
        await execAsync(`osascript -e 'tell application "Music" to ${key}'`);
        return { ok: true };
      }
    } else if (platform === 'win32') {
      const codeMap = { play_pause: 179, next: 176, previous: 177 };
      await execAsync(`powershell -command "(New-Object -ComObject WScript.Shell).SendKeys([char]${codeMap[action]})"`);
      return { ok: true };
    } else {
      const cmdMap = { play_pause: 'play-pause', next: 'next', previous: 'previous' };
      await execAsync(`playerctl ${cmdMap[action]}`);
      return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: `Media control not available right now (needs Spotify/Music open on Mac, or playerctl installed on Linux): ${String(e.message || e)}` };
  }
}

async function getNowPlaying() {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      try {
        const { stdout } = await execAsync(`osascript -e 'tell application "Spotify" to name of current track & " by " & artist of current track'`);
        return { ok: true, text: stdout.trim() };
      } catch (e) {
        const { stdout } = await execAsync(`osascript -e 'tell application "Music" to name of current track & " by " & artist of current track'`);
        return { ok: true, text: stdout.trim() };
      }
    } else if (platform === 'linux') {
      const { stdout } = await execAsync(`playerctl metadata --format '{{ title }} by {{ artist }}'`);
      return { ok: true, text: stdout.trim() };
    } else {
      return { ok: false, error: "Reading what's playing isn't available on Windows yet — only play/pause/skip are." };
    }
  } catch (e) {
    return { ok: false, error: "Nothing seems to be playing, or the player isn't open." };
  }
}

function resolveOrganizeFolder(folderKey) {
  const folders = (config && config.organizableFolders) || {};
  const base = folders[folderKey];
  if (!base) return null;
  return path.resolve(base.replace(/^~/, os.homedir()));
}

function organizeFiles(action, folderKey, file, destination) {
  const base = resolveOrganizeFolder(folderKey);
  if (!base) return { ok: false, error: `"${folderKey}" isn't in organizableFolders in config.json.` };
  if (!fs.existsSync(base)) return { ok: false, error: `Configured folder doesn't exist on disk: ${base}` };

  if (action === 'list') {
    const items = fs.readdirSync(base);
    return { ok: true, text: items.length ? items.join(', ') : '(empty)' };
  }
  if (!file) return { ok: false, error: 'A file name is required for move/rename.' };
  const srcPath = path.resolve(base, file);
  if (srcPath !== base && !srcPath.startsWith(base + path.sep)) return { ok: false, error: 'That path is outside the allowed folder.' };
  if (!fs.existsSync(srcPath)) return { ok: false, error: `"${file}" not found in ${folderKey}.` };

  if (action === 'rename') {
    if (!destination) return { ok: false, error: 'A new name is required to rename.' };
    const destPath = path.resolve(base, destination);
    if (destPath !== base && !destPath.startsWith(base + path.sep)) return { ok: false, error: 'Destination is outside the allowed folder.' };
    fs.renameSync(srcPath, destPath);
    return { ok: true, text: `Renamed to ${destination}.` };
  }
  if (action === 'move') {
    if (!destination) return { ok: false, error: 'A destination subfolder is required to move.' };
    const destDir = path.resolve(base, destination);
    if (destDir !== base && !destDir.startsWith(base + path.sep)) return { ok: false, error: 'Destination is outside the allowed folder.' };
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, path.basename(srcPath));
    fs.renameSync(srcPath, destPath);
    return { ok: true, text: `Moved into ${destination}/.` };
  }
  return { ok: false, error: 'Unknown action.' };
}

function cpuSample() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  cpus.forEach((c) => {
    for (const t in c.times) total += c.times[t];
    idle += c.times.idle;
  });
  return { idle, total };
}
function getCpuPercent() {
  return new Promise((resolve) => {
    const start = cpuSample();
    setTimeout(() => {
      const end = cpuSample();
      const idleDiff = end.idle - start.idle;
      const totalDiff = end.total - start.total;
      resolve(totalDiff ? Math.round(100 - (100 * idleDiff) / totalDiff) : 0);
    }, 200);
  });
}
async function getSystemStats() {
  const cpuPct = await getCpuPercent();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    cpuPct,
    usedMemGB: ((totalMem - freeMem) / 1e9).toFixed(1),
    totalMemGB: (totalMem / 1e9).toFixed(1)
  };
}

async function transcribeAudio(base64Audio) {
  if (!config || !config.elevenLabsApiKey) {
    return { ok: false, error: 'No elevenLabsApiKey configured — needed for speech-to-text.' };
  }
  try {
    const buf = Buffer.from(base64Audio, 'base64');
    const form = new FormData();
    form.append('model_id', 'scribe_v2');
    form.append('file', new Blob([buf], { type: 'audio/webm' }), 'audio.webm');
    const res = await fetchWithTimeout('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': config.elevenLabsApiKey },
      body: form
    }, 20000);
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Transcription failed (${res.status}): ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, text: (data.text || '').trim() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

ipcMain.handle('has-config', async () => !!config);
ipcMain.handle('get-system-stats', async () => getSystemStats());
ipcMain.handle('transcribe', async (event, base64Audio) => transcribeAudio(base64Audio));
ipcMain.on('state-changed', (event, state) => setTrayState(state));

ipcMain.handle('get-screen-source', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    if (!sources.length) return { ok: false, error: 'No screen source available on this system.' };
    return { ok: true, sourceId: sources[0].id };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('ask-jarvis', async (event, { text, speak }) => {
  if (!config || !config.anthropicApiKey) {
    return { error: 'Missing anthropicApiKey in config.json — copy config.example.json to config.json and fill it in.' };
  }
  const system = baseSystemPrompt();
  try {
    let messages = [{ role: 'user', content: text }];
    let data = await callClaude(messages, system);
    if (data.error) return { error: data.error.message || 'Claude API error' };

    let guard = 0;
    while (guard < 4) {
      let toolUse = (data.content || []).find((b) => b.type === 'tool_use');
      if (!toolUse) break;
      guard++;
      let toolResultText;
      switch (toolUse.name) {
        case 'launch_app': {
          const r = await launchAllowedApp(toolUse.input.name);
          toolResultText = r.ok ? `Launched ${toolUse.input.name}.` : `Could not launch: ${r.error}`;
          break;
        }
        case 'open_website': {
          try { await shell.openExternal(toolUse.input.url); toolResultText = `Opened ${toolUse.input.url}.`; }
          catch (e) { toolResultText = `Could not open that site: ${String(e.message || e)}`; }
          break;
        }
        case 'fetch_webpage': {
          const r = await fetchWebpage(toolUse.input.url);
          toolResultText = r.ok ? r.text : `Could not fetch that page: ${r.error}`;
          break;
        }
        case 'web_search': {
          const r = await webSearch(toolUse.input.query);
          toolResultText = r.ok ? r.text : r.error;
          break;
        }
        case 'media_control': {
          const r = await mediaControl(toolUse.input.action);
          toolResultText = r.ok ? `Sent ${toolUse.input.action}.` : r.error;
          break;
        }
        case 'get_now_playing': {
          const r = await getNowPlaying();
          toolResultText = r.ok ? r.text : r.error;
          break;
        }
        case 'organize_files': {
          const r = organizeFiles(toolUse.input.action, toolUse.input.folder, toolUse.input.file, toolUse.input.destination);
          toolResultText = r.ok ? r.text : r.error;
          break;
        }
        case 'get_system_stats': {
          const s = await getSystemStats();
          toolResultText = `CPU ${s.cpuPct}%, memory ${s.usedMemGB} of ${s.totalMemGB} GB used.`;
          break;
        }
        case 'start_screen_recording': {
          if (win) win.webContents.send('trigger-start-recording');
          toolResultText = 'Requested a screen recording start.';
          break;
        }
        case 'stop_screen_recording': {
          if (win) win.webContents.send('trigger-stop-recording');
          toolResultText = 'Requested the recording stop and save.';
          break;
        }
        default:
          toolResultText = 'Unknown tool.';
      }
      messages.push({ role: 'assistant', content: data.content });
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: toolResultText }] });
      data = await callClaude(messages, system);
      if (data.error) return { error: data.error.message || 'Claude API error' };
    }

    const block = (data.content || []).find((b) => b.type === 'text');
    const replyText = block ? block.text : 'Static on the line — say that again?';
    const audioDataUrl = (speak !== false && config.elevenLabsApiKey) ? await synthesize(replyText) : null;
    return { replyText, audioDataUrl };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

async function synthesize(text) {
  try {
    const voiceId = config.elevenLabsVoiceId || 'onwK4e9ZLuTAKqWW03F9';
    const res = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': config.elevenLabsApiKey },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.75 } })
    }, 20000);
    if (!res.ok) { console.error('ElevenLabs TTS failed:', res.status, await res.text()); return null; }
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
    const res = await fetchWithTimeout(url, {}, 10000);
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

ipcMain.handle('save-recording', async (event, base64Data) => {
  try {
    const dir = path.join(os.homedir(), 'JarvisRecordings');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});
