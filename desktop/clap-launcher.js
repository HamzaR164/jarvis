#!/usr/bin/env node
/**
 * clap-launcher.js
 *
 * A tiny, standalone background listener - separate from the main Jarvis app on
 * purpose, since the whole point is to launch Jarvis when it isn't running yet.
 * Detects a clap (sharp, short, loud transient) using local audio analysis only -
 * nothing is ever recorded to disk or sent anywhere. Free, no API, no account.
 *
 * Requires the `mic` package, which wraps a system audio tool:
 *   npm install mic
 *   Mac/Windows: needs SoX installed (https://sox.sourceforge.net)
 *   Linux: needs alsa-utils (`arecord`) - usually already present
 *
 * Run it with: node clap-launcher.js
 * Leave it running in a terminal, or set it up as a login item / startup task
 * yourself so it's always listening (that OS-specific step isn't done here).
 *
 * HONEST CAVEAT: this was written and syntax/logic-tested against synthetic
 * signals (see selfTest() below) since this sandbox has no real microphone to
 * clap in front of. The detection thresholds below are a reasonable starting
 * point, not a verified-against-a-real-room tuning - expect to adjust
 * PEAK_THRESHOLD if it's too sensitive (triggers on any loud sound) or not
 * sensitive enough (misses real claps).
 */

const path = require('path');
const { spawn } = require('child_process');

const PEAK_THRESHOLD = 0.55;      // 0-1 scale; how loud a sample must be to count as part of a clap
const BASELINE_MAX = 0.08;        // ambient noise must be below this for a clap to register cleanly
const MIN_GAP_MS = 1500;          // ignore repeat triggers within this window (debounce)
const JARVIS_DIR = __dirname;     // this script lives inside the jarvis-desktop folder

let lastTriggerAt = 0;
let recentPeaks = []; // rolling short window of peak amplitudes, for baseline + transient detection

function launchJarvis() {
  const now = Date.now();
  if (now - lastTriggerAt < MIN_GAP_MS) return;
  lastTriggerAt = now;
  console.log('[clap-launcher] Clap detected - launching Jarvis...');
  const child = spawn('npm', ['start'], { cwd: JARVIS_DIR, detached: true, stdio: 'ignore', shell: true });
  child.unref();
}

// Returns true if `peak` (the latest sample's peak amplitude, 0-1) looks like a clap
// given the recent rolling history. A clap = ambient is quiet, then one very sharp spike.
function isClapLike(peak, history) {
  if (history.length < 3) return false;
  const baseline = history.slice(0, -1).reduce((a, b) => a + b, 0) / (history.length - 1);
  return baseline < BASELINE_MAX && peak > PEAK_THRESHOLD && peak > baseline * 4;
}

function processSample(peak) {
  recentPeaks.push(peak);
  if (recentPeaks.length > 6) recentPeaks.shift();
  if (isClapLike(peak, recentPeaks)) {
    launchJarvis();
    recentPeaks = []; // reset so the trailing edge of this same clap doesn't double-trigger
  }
}

function selfTest() {
  console.log('[clap-launcher] Running self-test on synthetic signals...');
  recentPeaks = [];
  const quiet = [0.02, 0.03, 0.02, 0.04, 0.03];
  quiet.forEach((p) => {
    recentPeaks.push(p); if (recentPeaks.length > 6) recentPeaks.shift();
  });
  const clapPeak = 0.85;
  const detectedClap = isClapLike(clapPeak, [...recentPeaks, clapPeak]);

  recentPeaks = [];
  const loudRoom = [0.3, 0.35, 0.4, 0.38, 0.42];
  loudRoom.forEach((p) => { recentPeaks.push(p); if (recentPeaks.length > 6) recentPeaks.shift(); });
  const falsePositiveCheck = isClapLike(0.5, [...recentPeaks, 0.5]);

  console.log(`[clap-launcher] Quiet room + sharp spike -> detected as clap: ${detectedClap} (expected true)`);
  console.log(`[clap-launcher] Already-loud room + modest rise -> detected as clap: ${falsePositiveCheck} (expected false)`);
  console.log('[clap-launcher] Self-test complete. This validates the detection LOGIC only, not real-world mic behavior.');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
    process.exit(0);
  }

  let mic;
  try {
    mic = require('mic');
  } catch (e) {
    console.error('[clap-launcher] Missing dependency. Run: npm install mic');
    console.error('[clap-launcher] Also needs SoX (Mac/Windows) or arecord/alsa-utils (Linux) installed on the system.');
    process.exit(1);
  }

  const micInstance = mic({ rate: '16000', channels: '1', bitwidth: '16', encoding: 'signed-integer' });
  const micStream = micInstance.getAudioStream();

  micStream.on('data', (chunk) => {
    let peak = 0;
    for (let i = 0; i < chunk.length - 1; i += 2) {
      const sample = Math.abs(chunk.readInt16LE(i)) / 32768;
      if (sample > peak) peak = sample;
    }
    processSample(peak);
  });
  micStream.on('error', (err) => console.error('[clap-launcher] Mic error:', err.message));

  micInstance.start();
  console.log('[clap-launcher] Listening for a clap to launch Jarvis... (Ctrl+C to stop)');
}

module.exports = { isClapLike, processSample };
