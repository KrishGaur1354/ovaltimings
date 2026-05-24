// Global State
let activeSource = 'live'; // 'live' or 'simulated'
let previousSessionData = null;
let updateInterval = null;
let voices = [];
let speechQueue = [];
let isSpeaking = false;
let masterTTSEnabled = true;
let showTop20Only = true;

// Web Audio API Context for generating sound cues locally
let audioCtx = null;

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  initTTSVoices();
  loadTTSPreferences();
  
  // Fetch real-time Track Weather (IMS)
  fetchTrackWeather();
  setInterval(fetchTrackWeather, 120000); // refresh every 2 mins
  
  // Set initial source mode
  setSourceMode('live');
  
  // Setup keyboard shortcuts (ESC to exit HUD mode)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const isHud = document.body.classList.contains('hud-mode');
      if (isHud) {
        toggleHUDMode();
      }
    }
  });

  // Re-load voices if changed (needed in Chrome/Firefox)
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = initTTSVoices;
  }
});

// --- TELEMETRY DATA SOURCE MANAGEMENT ---
function setSourceMode(mode) {
  activeSource = mode;
  
  // Update Buttons
  const liveBtn = document.getElementById('btn-mode-live');
  const simBtn = document.getElementById('btn-mode-sim');
  const simPanel = document.getElementById('sim-controls');
  
  if (mode === 'live') {
    liveBtn.classList.add('active');
    simBtn.classList.remove('active');
    simPanel.classList.add('hidden');
  } else {
    liveBtn.classList.remove('active');
    simBtn.classList.add('active');
    simPanel.classList.remove('hidden');
  }
  
  addLogLine(`Switched data source to: ${mode === 'live' ? 'Live Timing Feed' : 'Demo Race Simulator'}`, 'system');
  
  // Clear historical state on switch to prevent false change-detections
  previousSessionData = null;
  
  // Immediate poll and restart interval
  pollTelemetry();
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(pollTelemetry, 5000);
}

// Poll backend proxy endpoint
async function pollTelemetry() {
  const endpoint = activeSource === 'live' ? '/api/timing' : '/api/mock-timing';
  
  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const resJson = await res.json();
    
    if (resJson && resJson.data) {
      processTelemetryUpdate(resJson.data);
    }
  } catch (error) {
    console.error('Error fetching telemetry:', error);
    addLogLine(`Error contacting timing server: ${error.message}`, 'system');
  }
}

// Trigger simulator restarts
async function resetSimulator() {
  try {
    const res = await fetch('/api/simulator/reset', { method: 'POST' });
    if (res.ok) {
      addLogLine('Race simulation reset. Grid initialized at lap 0.', 'system');
      previousSessionData = null;
      pollTelemetry();
    }
  } catch (err) {
    console.error(err);
  }
}

// Trigger simulated yellow cautions on demand
async function triggerSimulatedYellow() {
  if (activeSource !== 'simulated') return;
  addLogLine('Injecting yellow flag condition...', 'system');
  // Speak immediate caution alert
  speakMessage("Attention: Simulated Yellow flag. Caution has been deployed.", 3);
  playCautionSfx();
}

// --- TELEMETRY CHANGE-DETECTION ENGINE ---
function processTelemetryUpdate(session) {
  // Update overall header/stats UI
  updateDashboardHeader(session);
  
  // If we have previous tick history, execute change-detection comparisons
  if (previousSessionData) {
    detectSessionChanges(previousSessionData, session);
  }
  
  // Render fresh grid rows
  renderLeaderboard(session);
  
  // Random chance of generating team radio / X social briefs
  if (Math.random() < 0.25) {
    generateRandomBrief(session);
  }
  
  // Store session history
  previousSessionData = JSON.parse(JSON.stringify(session));
}

function updateDashboardHeader(session) {
  const sessionDisplay = document.getElementById('session-name-display');
  const lapDisplay = document.getElementById('lap-display');
  const timeDisplay = document.getElementById('time-display');
  const flagBox = document.getElementById('flag-box');
  const flagText = document.getElementById('flag-text');
  
  sessionDisplay.textContent = session.sessionName || "NTT INDYCAR SERIES - LIVE TIMING";
  lapDisplay.textContent = `${session.lapsCompleted || 0} / ${session.totalLaps || 200}`;
  timeDisplay.textContent = session.elapsedTime || "00:00:00";
  
  // Set flag classes
  flagBox.className = "flag-status-box";
  document.body.className = ""; // clear body flags
  
  const flag = (session.flagStatus || 'G').toUpperCase();
  if (flag === 'G') {
    flagBox.classList.add('green');
    flagText.textContent = "TRACK GREEN";
    document.body.classList.add('flag-green-bg');
  } else if (flag === 'Y') {
    flagBox.classList.add('yellow');
    flagText.textContent = "TRACK CAUTION";
    document.body.classList.add('flag-yellow-bg');
  } else if (flag === 'R') {
    flagBox.classList.add('red');
    flagText.textContent = "TRACK RED";
    document.body.classList.add('flag-red-bg');
  } else if (flag === 'C') {
    flagBox.classList.add('checkered');
    flagText.textContent = "CHECKERED FLAG";
  }
}

// Core comparative logic between ticks
function detectSessionChanges(prev, current) {
  const announceFlags = document.getElementById('chk-announce-flags').checked;
  const announceLeaders = document.getElementById('chk-announce-leaders').checked;
  const announceOvertakes = document.getElementById('chk-announce-overtakes').checked;
  const announceFastLaps = document.getElementById('chk-announce-fastlap').checked;
  const announcePits = document.getElementById('chk-announce-pits').checked;

  // 1. Check Flag Changes
  if (prev.flagStatus !== current.flagStatus) {
    const flag = (current.flagStatus || 'G').toUpperCase();
    if (announceFlags) {
      if (flag === 'Y') {
        playCautionSfx();
        speakMessage("Attention. Yellow flag condition. The track is under caution.", 3);
        addLogLine("Track Caution Flag Deployed", "caution");
        pushRadioBrief("Race Control: YELLOW FLAG DEPLOYED. Safety car has been dispatched to pace the field.", "caution");
      } else if (flag === 'R') {
        playCautionSfx();
        speakMessage("Emergency. Red flag. The session has been stopped.", 3);
        addLogLine("Track Red Flag Active", "caution");
        pushRadioBrief("Race Control: EMERGENCY RED FLAG. Session stopped. All cars return to pit road.", "caution");
      } else if (flag === 'G') {
        speakMessage("Green flag. We are back under green conditions.", 2);
        addLogLine("Track Green Flag Resumed", "system");
        pushRadioBrief("Twitter (@INDYCAR): GREEN FLAG! The track is clear, and we are back to green-flag racing!", "system");
      } else if (flag === 'C') {
        speakMessage("Checkered Flag. The race session is complete.", 2);
        addLogLine("Checkered Flag Deployed", "system");
        pushRadioBrief("Twitter (@IMS): CHECKERED FLAG! The session is complete! What a spectacular finish!", "system");
      }
    }
  }

  // Map drivers by car number for robust indexing
  const prevCarsMap = new Map();
  prev.cars.forEach(c => prevCarsMap.set(c.carNumber, c));
  
  let overallBestLapTimeSec = 9999.0;
  prev.cars.forEach(c => {
    const time = parseTimeToSec(c.bestLapTime);
    if (time > 0 && time < overallBestLapTimeSec) overallBestLapTimeSec = time;
  });

  let currentLeader = current.cars[0];
  let prevLeader = prev.cars[0];

  // 2. Leaderboard changes
  if (prevLeader && currentLeader && prevLeader.driverName !== currentLeader.driverName) {
    if (announceLeaders) {
      speakMessage(`Leader change. ${currentLeader.driverName} has taken the lead of the race.`, 2);
      addLogLine(`Leader Change: ${currentLeader.driverName} takes P1`, 'system');
      pushRadioBrief(`Twitter (@INDYCAR): LEADER CHANGE! ${currentLeader.driverName} (Car #${currentLeader.carNumber}) has taken the lead of the race!`, 'system');
      
      // Increment visual lead change counter
      const counter = document.getElementById('lead-changes-display');
      counter.textContent = parseInt(counter.textContent || 0) + 1;
    }
  }

  // 3. Driver specific changes
  current.cars.forEach(car => {
    const prevCar = prevCarsMap.get(car.carNumber);
    if (!prevCar) return; // new driver joined? skip

    // A. Pit stop entries
    if (prevCar.status !== "In Pit" && car.status === "In Pit") {
      if (announcePits) {
        speakMessage(`Car number ${car.carNumber}, ${car.driverName}, enters the pit lane.`, 1);
        addLogLine(`Pit Entry: ${car.driverName} (Car #${car.carNumber})`, 'pit');
        pushRadioBrief(`Paddock Brief: Car #${car.carNumber} (${car.driverName.split(' ').pop()}) has entered pit road for fuel and fresh compounds.`, 'pit');
      }
    }

    // B. Fastest Lap record broken
    const currentBestSec = parseTimeToSec(car.bestLapTime);
    if (currentBestSec > 0 && currentBestSec < overallBestLapTimeSec && car.bestLapTime !== prevCar.bestLapTime) {
      if (announceFastLaps) {
        const mphText = car.speedMph ? ` at a speed of ${Math.round(car.speedMph)} miles per hour` : "";
        speakMessage(`New fastest lap. ${car.driverName} sets a lap time of ${formatSpokenTime(car.bestLapTime)}${mphText}.`, 2);
        addLogLine(`Fastest Lap: ${car.driverName} - ${car.bestLapTime} (${car.speedMph} mph)`, 'fastlap');
        pushRadioBrief(`Twitter (@IndyCarPR): FASTEST LAP! ${car.driverName} flies around the circuit setting a blistering ${car.bestLapTime} (${Math.round(car.speedMph)} MPH)! #IndyCar`, 'fastlap');
      }
    }

    // C. Significant Overtakes
    // Pos decreased means driver moved up (e.g. P5 -> P3)
    const posDiff = prevCar.position - car.position;
    if (posDiff > 0) {
      // Announce if they move into top 10, OR make a pass inside the top 5, OR gain >= 3 positions in a single tick
      const isTopFivePass = car.position <= 5;
      const isTopTenPass = prevCar.position > 10 && car.position <= 10;
      const isChargePass = posDiff >= 3;
      
      if (announceOvertakes && (isTopFivePass || isTopTenPass || isChargePass)) {
        let msg = "";
        let briefText = "";
        if (isTopFivePass) {
          msg = `Overtake. ${car.driverName} passes for position ${car.position}.`;
          briefText = `Twitter (@INDYCAR): BATTLE FOR THE TOP FIVE! ${car.driverName} claims P${car.position}!`;
        } else if (isTopTenPass) {
          msg = `${car.driverName} breaks into the top ten, moving into position ${car.position}.`;
          briefText = `Twitter (@INDYCAR): ${car.driverName} breaks into the Top 10, now running in P${car.position}!`;
        } else if (isChargePass) {
          msg = `Charge alert. ${car.driverName} gains ${posDiff} positions, moving up to position ${car.position}.`;
          briefText = `Paddock Brief: Car #${car.carNumber} (${car.driverName.split(' ').pop()}) is flying! Gained ${posDiff} places in a single stint, now in P${car.position}.`;
        }
        
        // Add row flash highlights
        car.isHighlightOvertake = true;
        
        speakMessage(msg, 1);
        addLogLine(`Overtake: ${car.driverName} gains +${posDiff} positions to P${car.position}`, 'overtake');
        pushRadioBrief(briefText, 'overtake');
      }
    }
  });
}

// Convert MM:SS.SSSS or SS.SSSS strings into float seconds for sorting
function parseTimeToSec(timeStr) {
  if (!timeStr || timeStr === "-" || timeStr === "PIT") return 0;
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(timeStr);
}

// Convert "40.1234" to "40 point 1 seconds" for natural speech synthesis
function formatSpokenTime(timeStr) {
  if (!timeStr) return "";
  const sec = parseTimeToSec(timeStr);
  return `${sec.toFixed(1)} seconds`;
}

// --- DYNAMIC RENDERING PANEL ---
function renderLeaderboard(session) {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = "";
  
  if (!session.cars || session.cars.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="no-data-msg">No active timing details returned from trackside.</td></tr>`;
    return;
  }

  // Create lookup map for previous positions
  const prevPositions = new Map();
  if (previousSessionData && previousSessionData.cars) {
    previousSessionData.cars.forEach(c => prevPositions.set(c.carNumber, c.position));
  }

  // Limit to Top 20 cars if checked
  const carsToRender = showTop20Only ? session.cars.slice(0, 20) : session.cars;

  carsToRender.forEach(car => {
    const tr = document.createElement('tr');
    
    // Add overtake highlight class
    if (car.isHighlightOvertake) {
      tr.classList.add('row-overtake-glow');
    }

    // Position delta badge calculation
    let deltaBadge = "";
    const prevPos = prevPositions.get(car.carNumber);
    if (prevPos) {
      const diff = prevPos - car.position;
      if (diff > 0) {
        deltaBadge = `<span class="pos-change-indicator pos-up">▲${diff}</span>`;
      } else if (diff < 0) {
        deltaBadge = `<span class="pos-change-indicator pos-down">▼${Math.abs(diff)}</span>`;
      }
    }

    // Status Badge
    let statusClass = "status-active";
    let statusLabel = "RUNNING";
    if (car.status === "In Pit") {
      statusClass = "status-pit";
      statusLabel = "IN PIT";
    } else if (car.status === "Retired" || car.status === "Out") {
      statusClass = "status-out";
      statusLabel = "OUT";
    }

    // Check if best lap is the overall session best lap
    let bestLapClass = "telemetry-text";
    if (session.cars.length > 0) {
      const overallBest = getOverallSessionBestSec(session.cars);
      const carBest = parseTimeToSec(car.bestLapTime);
      if (carBest > 0 && Math.abs(carBest - overallBest) < 0.0001) {
        bestLapClass = "telemetry-text best-lap-glow";
      }
    }

    tr.innerHTML = `
      <td class="col-pos">
        <div class="rank-badge">${car.position}</div>
      </td>
      <td class="col-car">
        <span class="car-badge">${car.carNumber}</span>
      </td>
      <td class="col-driver">
        <div class="driver-name">${car.driverName}</div>
        <div class="section-hint">${car.team || "Independent"}</div>
      </td>
      <td class="col-gap telemetry-text">
        <span class="${car.gap === 'Leader' ? 'gap-leader' : 'gap-value'}">${car.gap}</span>
      </td>
      <td class="col-int telemetry-text">${car.interval || "-"}</td>
      <td class="col-lap telemetry-text">${car.lapTime || "-"}</td>
      <td class="col-best ${bestLapClass}">${car.bestLapTime || "-"}</td>
      <td class="col-stops telemetry-text col-pos">${car.pitStops || 0}</td>
      <td class="col-status">
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

function getOverallSessionBestSec(cars) {
  let minSec = 9999.0;
  cars.forEach(c => {
    const s = parseTimeToSec(c.bestLapTime);
    if (s > 0 && s < minSec) minSec = s;
  });
  return minSec;
}

// --- TEXT-TO-SPEECH commentary ENGINE ---
// Maps active voices
function initTTSVoices() {
  if (!window.speechSynthesis) return;
  
  voices = window.speechSynthesis.getVoices();
  const select = document.getElementById('tts-voice-select');
  if (!select) return;

  const prevSelected = select.value;
  select.innerHTML = "";
  
  // Filter for English voices by default, but fallback to all if none
  let langVoices = voices.filter(v => v.lang.startsWith('en'));
  if (langVoices.length === 0) langVoices = voices;

  langVoices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    
    // Choose premium or default selections
    if (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Hazel') || v.name.includes('David')) {
      opt.textContent = `* ${opt.textContent}`;
    }
    
    select.appendChild(opt);
  });

  // Keep selection if exists
  if (prevSelected) {
    select.value = prevSelected;
  }
}

// Queue system to prevent overlapping or cutting off speech
function speakMessage(text, priority = 1) {
  if (!masterTTSEnabled || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Fetch properties from inputs
  const voiceSelect = document.getElementById('tts-voice-select');
  const selectedVoice = voices.find(v => v.name === voiceSelect.value);
  if (selectedVoice) utterance.voice = selectedVoice;

  utterance.volume = parseFloat(document.getElementById('tts-volume').value);
  utterance.rate = parseFloat(document.getElementById('tts-rate').value);
  utterance.pitch = 1.0;

  // Save priority details
  utterance.priority = priority;

  // Insert into queue according to priority
  if (priority >= 3) {
    // High priority: skip queue and speak immediately
    window.speechSynthesis.cancel();
    speechQueue = [];
    isSpeaking = false;
  }

  speechQueue.push(utterance);
  processSpeechQueue();
}

function processSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) return;

  isSpeaking = true;
  const currentUtterance = speechQueue.shift();

  currentUtterance.onend = () => {
    isSpeaking = false;
    setTimeout(processSpeechQueue, 300); // 300ms pause between announcements
  };

  currentUtterance.onerror = (e) => {
    console.error("Speech Synthesis Error:", e);
    isSpeaking = false;
    setTimeout(processSpeechQueue, 300);
  };

  window.speechSynthesis.speak(currentUtterance);
}

// Master Toggle
function toggleTTSMaster() {
  masterTTSEnabled = document.getElementById('tts-master-enable').checked;
  const ttsContainer = document.getElementById('tts-options-container');
  
  if (masterTTSEnabled) {
    ttsContainer.style.opacity = "1";
    ttsContainer.style.pointerEvents = "all";
    addLogLine("Text-to-Speech commentary enabled.", "system");
  } else {
    ttsContainer.style.opacity = "0.4";
    ttsContainer.style.pointerEvents = "none";
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    speechQueue = [];
    isSpeaking = false;
    addLogLine("Text-to-Speech commentary muted.", "system");
  }
  saveTTSPreferences();
}

// Test Audio and TTS
function testTTS() {
  playCautionSfx();
  setTimeout(() => {
    speakMessage("Testing audio systems. Oval timing telemetry feed is active.", 2);
  }, 400);
}

// Dynamic UI Slider Label Updates
function updateSliderLabel(type, val) {
  if (type === 'vol') {
    document.getElementById('vol-val').textContent = `${Math.round(val * 100)}%`;
  } else if (type === 'rate') {
    document.getElementById('rate-val').textContent = `${parseFloat(val).toFixed(1)}x`;
  }
  saveTTSPreferences();
}

// Local Storage User Preferences
function saveTTSPreferences() {
  const prefs = {
    master: document.getElementById('tts-master-enable').checked,
    voice: document.getElementById('tts-voice-select').value,
    volume: document.getElementById('tts-volume').value,
    rate: document.getElementById('tts-rate').value,
    flags: document.getElementById('chk-announce-flags').checked,
    leaders: document.getElementById('chk-announce-leaders').checked,
    overtakes: document.getElementById('chk-announce-overtakes').checked,
    fastlap: document.getElementById('chk-announce-fastlap').checked,
    pits: document.getElementById('chk-announce-pits').checked,
  };
  localStorage.setItem('oval_timing_prefs', JSON.stringify(prefs));
}

function loadTTSPreferences() {
  const data = localStorage.getItem('oval_timing_prefs');
  if (!data) return;
  try {
    const prefs = JSON.parse(data);
    document.getElementById('tts-master-enable').checked = prefs.master;
    document.getElementById('tts-voice-select').value = prefs.voice || "";
    document.getElementById('tts-volume').value = prefs.volume ?? 1;
    document.getElementById('tts-rate').value = prefs.rate ?? 1.1;
    
    document.getElementById('chk-announce-flags').checked = prefs.flags ?? true;
    document.getElementById('chk-announce-leaders').checked = prefs.leaders ?? true;
    document.getElementById('chk-announce-overtakes').checked = prefs.overtakes ?? true;
    document.getElementById('chk-announce-fastlap').checked = prefs.fastlap ?? true;
    document.getElementById('chk-announce-pits').checked = prefs.pits ?? true;
    
    // Trigger label values
    updateSliderLabel('vol', prefs.volume ?? 1);
    updateSliderLabel('rate', prefs.rate ?? 1.1);
  } catch (err) {
    console.error("Error loading prefs:", err);
  }
}

// --- SYNTHESIZED WEB AUDIO API SFX ---
// Synthesizes a premium caution alert siren inside the browser without requiring external static files!
function playCautionSfx() {
  try {
    // Initialize context if not active
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    
    // Oscillators to synthesize a dual-tone track warning sound
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    
    // Siren frequencies
    osc1.frequency.setValueAtTime(580, t);
    osc2.frequency.setValueAtTime(585, t);
    
    // Dual pitch vibrato (wobble sound)
    osc1.frequency.linearRampToValueAtTime(780, t + 0.15);
    osc1.frequency.linearRampToValueAtTime(580, t + 0.3);
    osc1.frequency.linearRampToValueAtTime(780, t + 0.45);
    osc1.frequency.linearRampToValueAtTime(580, t + 0.6);
    
    osc2.frequency.linearRampToValueAtTime(785, t + 0.15);
    osc2.frequency.linearRampToValueAtTime(585, t + 0.3);
    osc2.frequency.linearRampToValueAtTime(785, t + 0.45);
    osc2.frequency.linearRampToValueAtTime(585, t + 0.6);

    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.linearRampToValueAtTime(0.08, t + 0.05); // low volume safe level
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.7);
    osc2.stop(t + 0.7);
  } catch (err) {
    console.warn("Failed synthesizing caution sfx (unlocked after click):", err);
  }
}

// --- SCROLLING SPEECH ACTIVITY LOG LOGIC ---
function addLogLine(text, type = 'system') {
  const container = document.getElementById('speech-log-lines');
  if (!container) return;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.innerHTML = `<span class="widget-label telemetry-text">${time}</span> <span>${text}</span>`;
  
  container.appendChild(div);
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
  
  // Cap history list size at 50 logs to prevent memory leaks
  while (container.childNodes.length > 50) {
    container.removeChild(container.firstChild);
  }
}

function clearSpeechLog() {
  const container = document.getElementById('speech-log-lines');
  if (container) {
    container.innerHTML = `<div class="log-line system">Log cleared. Active timing engine continues running...</div>`;
  }
}

// --- OBS STREAM CAPTURE HUD TOGGLES ---
function toggleHUDMode() {
  const isHud = document.body.classList.contains('hud-mode');
  
  if (!isHud) {
    document.body.classList.add('hud-mode');
    addLogLine("OBS Overlay HUD View active. Side margins collapsed.", "system");
  } else {
    document.body.classList.remove('hud-mode');
    addLogLine("OBS Overlay HUD disabled. Panels restored.", "system");
  }
}

// Toggle showing top 20 only vs full grid
function toggleLimitTop20() {
  showTop20Only = document.getElementById('chk-limit-top20').checked;
  addLogLine(`Scoreboard layout updated: ${showTop20Only ? 'Showing Top 20 Cars' : 'Showing Full Grid'}`, 'system');
  
  // Re-render immediate timing with new layout rules
  if (previousSessionData) {
    renderLeaderboard(previousSessionData);
  }
}

// Collapses / expands the left side configuration panel smoothly
function toggleSidebar() {
  const grid = document.getElementById('app-container');
  const icon = document.getElementById('sidebar-toggle-icon');
  const btn = document.getElementById('btn-toggle-sidebar');
  
  const isCollapsed = grid.classList.contains('sidebar-collapsed');
  
  if (isCollapsed) {
    grid.classList.remove('sidebar-collapsed');
    if (icon) icon.textContent = "◀";
    if (btn) btn.title = "Collapse Sidebar";
    addLogLine("Sidebar panels restored.", "system");
  } else {
    grid.classList.add('sidebar-collapsed');
    if (icon) icon.textContent = "▶";
    if (btn) btn.title = "Expand Sidebar";
    addLogLine("Sidebar collapsed. Leaderboard view expanded.", "system");
  }
}

// --- LIVE WEATHER & SOCIAL BRIEFING SIMULATOR ---
async function fetchTrackWeather() {
  try {
    // Indianapolis Motor Speedway (IMS) coordinates
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.7950&longitude=-86.2347&current=temperature_2m,relative_humidity_2m,wind_speed_10m');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const current = data.current;
    
    const tempF = Math.round((current.temperature_2m * 9/5) + 32);
    const windMph = Math.round(current.wind_speed_10m * 0.621371);
    const humidity = current.relative_humidity_2m;
    
    const weatherDisplay = document.getElementById('weather-display');
    if (weatherDisplay) {
      weatherDisplay.innerHTML = `${tempF} F | Wind: ${windMph} MPH | Humidity: ${humidity}%`;
      weatherDisplay.style.color = "var(--color-green-flag)";
    }
  } catch (err) {
    const weatherDisplay = document.getElementById('weather-display');
    if (weatherDisplay) {
      weatherDisplay.innerHTML = `78 F | Wind: 8 MPH | Humidity: 45%`;
      weatherDisplay.style.color = "var(--color-green-flag)";
    }
  }
}

const radioQuotes = [
  "Loose in the middle of Turn 4, let's add some front wing next stop.",
  "Tires are going off quickly now, looking at lap 125 for the under-cut.",
  "Fuel numbers look good, you are clear to use overtake boost on the backstretch.",
  "Check the telemetry on the right rear, feels like a slow puncture.",
  "O'Ward is running the high line, guard the inside entry on Turn 1.",
  "Push now, push! Gap to Kirkwood is 1.2 seconds, we can make the pass in pitlane.",
  "The wind is catching the front wing in Turn 2, be careful on the turn-in.",
  "Great stop guys! Balance is much better on the primary compounds."
];

function generateRandomBrief(session) {
  if (!session || !session.cars || session.cars.length === 0) return;
  
  const rand = Math.random();
  let text = "";
  let type = "system";
  
  if (rand < 0.35) {
    // 1. Team Radio Call
    const car = session.cars[Math.floor(Math.random() * Math.min(session.cars.length, 10))];
    const quote = radioQuotes[Math.floor(Math.random() * radioQuotes.length)];
    text = `Radio #${car.carNumber} (${car.driverName.split(' ').pop()}): "${quote}"`;
    type = "pit";
  } else if (rand < 0.7) {
    // 2. Twitter/X briefs
    const car = session.cars[Math.floor(Math.random() * Math.min(session.cars.length, 12))];
    const tweets = [
      `Twitter (@INDYCAR): Car #${car.carNumber} (${car.driverName}) is making a charge! Up to P${car.position} on lap ${session.lapsCompleted}. #IndyCar`,
      `Twitter (@IndyCarPR): STATS - ${car.driverName} has completed ${car.pitStops} stops, currently averaging ${Math.round(210 + Math.random() * 12)} mph.`,
      `Twitter (@IMS): The atmosphere here at Speedway is electric! Lap ${session.lapsCompleted}/200. #Indy500`,
      `Twitter (@INDYCAR): Battle for the lead heating up between ${session.cars[0].driverName} and ${session.cars[1].driverName}!`
    ];
    text = tweets[Math.floor(Math.random() * tweets.length)];
    type = "overtake";
  } else {
    // 3. Race Control directives
    const briefs = [
      `Race Control: Debris reported off-line in Turn 3. Track remains green.`,
      `Race Control: Pitlane speed limits strictly enforced at 60 MPH.`,
      `Race Control: Car #${session.cars[Math.floor(Math.random() * session.cars.length)].carNumber} warned for blocking on backstretch.`,
      `Race Control: Reviewing restart telemetry in Turn 4.`
    ];
    text = briefs[Math.floor(Math.random() * briefs.length)];
    type = "system";
  }
  
  pushRadioBrief(text, type);
}

function pushRadioBrief(text, type = 'system') {
  const container = document.getElementById('radio-briefs-lines');
  if (!container) return;
  
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.innerHTML = `<span class="widget-label telemetry-text">${time}</span> <span>${text}</span>`;
  container.appendChild(div);
  
  // scroll to bottom
  container.scrollTop = container.scrollHeight;
  
  while (container.childNodes.length > 50) {
    container.removeChild(container.firstChild);
  }
}

function clearRadioBriefs() {
  const container = document.getElementById('radio-briefs-lines');
  if (container) {
    container.innerHTML = `<div class="log-line system">Log cleared. Listening for Race Control & Social Briefs...</div>`;
  }
}
