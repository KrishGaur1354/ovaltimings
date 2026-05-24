const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname)); // Serves root static files for easy static CDN hosting!

// List of authentic IndyCar drivers for the mock simulator
const INDY_DRIVERS = [
  { carNumber: "2", driverName: "Josef Newgarden", team: "Team Penske" },
  { carNumber: "5", driverName: "Pato O'Ward", team: "Arrow McLaren" },
  { carNumber: "9", driverName: "Scott Dixon", team: "Chip Ganassi Racing" },
  { carNumber: "10", driverName: "Alex Palou", team: "Chip Ganassi Racing" },
  { carNumber: "12", driverName: "Will Power", team: "Team Penske" },
  { carNumber: "26", driverName: "Colton Herta", team: "Andretti Global" },
  { carNumber: "7", driverName: "Alexander Rossi", team: "Arrow McLaren" },
  { carNumber: "28", driverName: "Marcus Ericsson", team: "Andretti Global" },
  { carNumber: "8", driverName: "Marcus Armstrong", team: "Chip Ganassi Racing" },
  { carNumber: "15", driverName: "Graham Rahal", team: "Rahal Letterman Lanigan" },
  { carNumber: "27", driverName: "Kyle Kirkwood", team: "Andretti Global" },
  { carNumber: "3", driverName: "Scott McLaughlin", team: "Team Penske" },
  { carNumber: "6", driverName: "Nolan Siegel", team: "Arrow McLaren" },
  { carNumber: "14", driverName: "Santino Ferrucci", team: "A.J. Foyt Enterprises" },
  { carNumber: "20", driverName: "Christian Rasmussen", team: "Ed Carpenter Racing" },
  { carNumber: "21", driverName: "Rinus VeeKay", team: "Ed Carpenter Racing" },
  { carNumber: "30", driverName: "Pietro Fittipaldi", team: "Rahal Letterman Lanigan" },
  { carNumber: "45", driverName: "Christian Lundgaard", team: "Rahal Letterman Lanigan" },
  { carNumber: "60", driverName: "Felix Rosenqvist", team: "Meyer Shank Racing" },
  { carNumber: "66", driverName: "Helio Castroneves", team: "Meyer Shank Racing" },
  { carNumber: "77", driverName: "Romain Grosjean", team: "Juncos Hollinger Racing" },
  { carNumber: "78", driverName: "Conor Daly", team: "Juncos Hollinger Racing" },
  { carNumber: "4", driverName: "Kyffin Simpson", team: "Chip Ganassi Racing" },
  { carNumber: "11", driverName: "Marcus Armstrong", team: "Chip Ganassi Racing" },
  { carNumber: "18", driverName: "Jack Harvey", team: "Dale Coyne Racing" },
  { carNumber: "51", driverName: "Katherine Legge", team: "Dale Coyne Racing" },
  { carNumber: "33", driverName: "Marco Andretti", team: "Andretti Herta Autosport" },
  { carNumber: "98", driverName: "Marco Andretti", team: "Andretti Herta Autosport" },
  { carNumber: "24", driverName: "Sage Karam", team: "Dreyer & Reinbold Racing" },
  { carNumber: "23", driverName: "Ryan Hunter-Reay", team: "Dreyer & Reinbold Racing" }
];

// Helper to keep unique list of drivers
const uniqueDrivers = [];
const seenCars = new Set();
INDY_DRIVERS.forEach(d => {
  if (!seenCars.has(d.carNumber)) {
    seenCars.add(d.carNumber);
    uniqueDrivers.push(d);
  }
});
// Ensure we have at least 25 drivers in our mock grid
while (uniqueDrivers.length < 25) {
  const newNum = String(Math.floor(Math.random() * 99) + 1);
  if (!seenCars.has(newNum)) {
    seenCars.add(newNum);
    uniqueDrivers.push({ carNumber: newNum, driverName: `Driver #${newNum}`, team: "Independent" });
  }
}

// Global state for simulator
let simSession = {
  sessionName: "NTT INDYCAR SERIES - 110th Indianapolis 500 (Simulated)",
  flagStatus: "G", // G = Green, Y = Yellow, R = Red, C = Checkered
  flagColor: "Green",
  lapsCompleted: 0,
  totalLaps: 200,
  elapsedTime: "00:00:00",
  startTime: Date.now(),
  cars: []
};

// Initialize simulator cars
function initSimulator() {
  simSession.startTime = Date.now();
  simSession.lapsCompleted = 0;
  simSession.flagStatus = "G";
  simSession.flagColor = "Green";
  simSession.cars = uniqueDrivers.map((driver, index) => {
    // Generate simulated baseline lap speed (oval pacing is around 38-41 seconds at Indy)
    const baseLapSec = 39.5 + Math.random() * 1.5;
    return {
      position: index + 1,
      carNumber: driver.carNumber,
      driverName: driver.driverName,
      team: driver.team,
      baseLapSec: baseLapSec,
      lastLapSec: baseLapSec,
      bestLapSec: baseLapSec + 0.5, // starts slower
      laps: 0,
      gap: "0.0000",
      interval: "0.0000",
      pitStops: 0,
      status: "Active",
      lastPitLap: 0,
      speedMph: (2.5 / (baseLapSec / 3600)).toFixed(3), // Speed = Distance (2.5 miles) / Time (hours)
      totalTimeSec: 0,
      personalBestLapSec: 999.9
    };
  });
}

initSimulator();

// Simulator Update Loop (runs on the server every 5 seconds)
setInterval(() => {
  if (simSession.flagStatus === "R") {
    // Red flag - race stopped
    return;
  }

  // Track elapsed time
  const elapsedMs = Date.now() - simSession.startTime;
  const h = String(Math.floor(elapsedMs / 3600000)).padStart(2, '0');
  const m = String(Math.floor((elapsedMs % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');
  simSession.elapsedTime = `${h}:${m}:${s}`;

  const isYellow = simSession.flagStatus === "Y";

  // Simulate lap progress for each active car
  simSession.cars.forEach(car => {
    if (car.status !== "Active" && car.status !== "In Pit") return;

    if (car.status === "In Pit") {
      // Pit stop logic: spend 1 tick (5s) in pit, then return
      car.status = "Active";
      car.lastPitLap = car.laps;
      return;
    }

    // Normal active racing
    // Random chance of entering pit (every 25-35 laps typically)
    const lapsSincePit = car.laps - car.lastPitLap;
    if (lapsSincePit > 20 && Math.random() < 0.05 && !isYellow && simSession.lapsCompleted < simSession.totalLaps - 5) {
      car.status = "In Pit";
      car.pitStops++;
      // Set very slow pit lap time
      car.lastLapSec = 85.0 + Math.random() * 5.0;
      car.speedMph = (2.5 / (car.lastLapSec / 3600)).toFixed(3);
      car.totalTimeSec += car.lastLapSec;
      car.laps++;
      return;
    }

    // Normal lap timing
    let variance = (Math.random() - 0.5) * 0.4; // +/- 0.2s variance
    if (isYellow) {
      // Cautions are slow!
      car.lastLapSec = 65.0 + Math.random() * 2.0;
    } else {
      car.lastLapSec = car.baseLapSec + variance;
    }

    car.speedMph = (2.5 / (car.lastLapSec / 3600)).toFixed(3);
    car.totalTimeSec += car.lastLapSec;
    car.laps++;

    // Track personal best lap
    if (car.lastLapSec < car.personalBestLapSec && !isYellow) {
      car.personalBestLapSec = car.lastLapSec;
      car.bestLapSec = car.lastLapSec;
    }
  });

  // Sort by laps (highest first), then by total time (lowest first)
  simSession.cars.sort((a, b) => {
    if (b.laps !== a.laps) {
      return b.laps - a.laps;
    }
    return a.totalTimeSec - b.totalTimeSec;
  });

  // Re-assign positions and calculate gaps
  const leaderLaps = simSession.cars[0].laps;
  simSession.lapsCompleted = leaderLaps;

  // Check if race completed
  if (simSession.lapsCompleted >= simSession.totalLaps) {
    simSession.flagStatus = "C";
    simSession.flagColor = "Checkered";
  }

  const leaderTime = simSession.cars[0].totalTimeSec;

  simSession.cars.forEach((car, index) => {
    car.position = index + 1;
    
    if (index === 0) {
      car.gap = "Leader";
      car.interval = "Leader";
    } else {
      const aheadCar = simSession.cars[index - 1];
      if (car.laps === leaderLaps) {
        // Gap in seconds
        car.gap = (car.totalTimeSec - leaderTime).toFixed(4);
        car.interval = (car.totalTimeSec - aheadCar.totalTimeSec).toFixed(4);
      } else {
        // Lap gaps
        const lapDiff = leaderLaps - car.laps;
        car.gap = `+${lapDiff} Lap${lapDiff > 1 ? 's' : ''}`;
        
        if (car.laps === aheadCar.laps) {
          car.interval = (car.totalTimeSec - aheadCar.totalTimeSec).toFixed(4);
        } else {
          const aheadLapDiff = aheadCar.laps - car.laps;
          car.interval = `+${aheadLapDiff} Lap${aheadLapDiff > 1 ? 's' : ''}`;
        }
      }
    }
  });

  // Random flag state changes (rare yellow flags for realism)
  if (simSession.flagStatus === "G" && Math.random() < 0.015 && simSession.lapsCompleted > 5 && simSession.lapsCompleted < simSession.totalLaps - 10) {
    simSession.flagStatus = "Y";
    simSession.flagColor = "Yellow";
  } else if (simSession.flagStatus === "Y" && Math.random() < 0.15) {
    // Yellow ends
    simSession.flagStatus = "G";
    simSession.flagColor = "Green";
  }

}, 5000);

// Normalizes official IndyCar Azure Blob schemas (from timingscoring-ris.json or timingscoring.json)
// into our standard, clean dashboard format.
function normalizeLiveTiming(rawData) {
  if (!rawData || !rawData.timing_results) {
    throw new Error("Invalid telemetry payload structure: missing timing_results");
  }
  
  const tr = rawData.timing_results;
  const hb = tr.heartbeat || {};
  const items = tr.Item || [];
  
  // Normalize flagStatus: "G" (Green), "Y" (Yellow), "R" (Red), "C" (Checkered)
  let flagStatus = "G";
  const rawFlag = (hb.currentFlag || hb.SessionStatus || "GREEN").toUpperCase();
  if (rawFlag.includes("YELLOW") || rawFlag === "Y") {
    flagStatus = "Y";
  } else if (rawFlag.includes("RED") || rawFlag === "R") {
    flagStatus = "R";
  } else if (rawFlag.includes("CHECK") || rawFlag === "C" || rawFlag === "CHECKERED") {
    flagStatus = "C";
  }
  
  let flagColor = "Green";
  if (flagStatus === "Y") flagColor = "Yellow";
  else if (flagStatus === "R") flagColor = "Red";
  else if (flagStatus === "C") flagColor = "Checkered";

  // Attempt to extract elapsed time
  let elapsedTime = "00:00:00";
  if (items.length > 0 && items[0].totalTime) {
    elapsedTime = items[0].totalTime;
  } else if (hb.overallTimeToGo) {
    elapsedTime = hb.overallTimeToGo;
  }

  const cars = items.map(item => {
    // Determine status: "Active", "In Pit", "Out"
    let status = "Active";
    if (item.marker === "InPit" || item.status === "In Pit" || item.onTrack === "False") {
      status = "In Pit";
    } else if (item.status === "Retired" || item.status === "Out") {
      status = "Out";
    }
    
    // Normalize driver's name
    let driverName = item.driverName || "";
    if (!driverName) {
      driverName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
    }
    if (!driverName) {
      driverName = `Car #${item.no || ""}`;
    }
    
    // Normalize gaps and intervals
    let gap = item.gap || item.diff || "0.0000";
    if (gap === "0.0000" && parseInt(item.rank) === 1) {
      gap = "Leader";
    }
    
    let interval = item.diff || item.gap || "0.0000";
    if (interval === "0.0000" && parseInt(item.rank) === 1) {
      interval = "Leader";
    }

    return {
      position: parseInt(item.rank) || parseInt(item.overallRank) || 1,
      carNumber: String(item.no || ""),
      driverName: driverName,
      team: item.team || "",
      lapTime: item.marker === "InPit" ? "PIT" : (item.lastLapTime || "-"),
      bestLapTime: item.bestLapTime || "-",
      laps: parseInt(item.laps) || 0,
      gap: gap,
      interval: interval,
      pitStops: parseInt(item.pitStops) || 0,
      status: status,
      speedMph: String(item.LastSpeed || item.BestSpeed || item.speedMph || "0")
    };
  });

  // Sort cars in descending rank order
  cars.sort((a, b) => a.position - b.position);

  return {
    sessionName: hb.eventName || hb.SessionName || "NTT INDYCAR SERIES Live Telemetry",
    flagStatus: flagStatus,
    flagColor: flagColor,
    lapsCompleted: parseInt(hb.lapNumber) || 0,
    totalLaps: parseInt(hb.totalLaps) || 200,
    elapsedTime: elapsedTime,
    cars: cars
  };
}

// Proxy Route to query the actual IndyCar JSON feed
app.get('/api/timing', async (req, res) => {
  const cacheBuster = Date.now();
  const risUrl = `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json?${cacheBuster}`;
  const stdUrl = `https://indycar.blob.core.windows.net/racecontrol/timingscoring.json?${cacheBuster}`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.indycar.com/',
    'Origin': 'https://www.indycar.com'
  };

  // Pipeline Attempt 1: Fetch timingscoring-ris.json
  try {
    const response = await axios.get(risUrl, { headers, timeout: 3500 });
    if (response.data && response.data.timing_results) {
      const normalized = normalizeLiveTiming(response.data);
      return res.json({
        status: "live",
        source: "timingscoring-ris",
        data: normalized
      });
    }
  } catch (error) {
    console.log(`WARNING: timingscoring-ris.json query failed or empty. Trying standard timingscoring.json...`);
  }

  // Pipeline Attempt 2: Fetch timingscoring.json
  try {
    const response = await axios.get(stdUrl, { headers, timeout: 3500 });
    if (response.data && response.data.timing_results) {
      const normalized = normalizeLiveTiming(response.data);
      return res.json({
        status: "live",
        source: "timingscoring",
        data: normalized
      });
    }
  } catch (error) {
    console.log(`WARNING: timingscoring.json query failed too.`);
  }

  // Pipeline Fallback: Serve our rich simulated race data
  res.json({
    status: "simulated_fallback",
    message: "Active timing feeds offline. Serving fallback race simulator.",
    data: getMockSessionFormat()
  });
});

// Explicit Mock Timing endpoint
app.get('/api/mock-timing', (req, res) => {
  res.json({
    status: "simulated",
    data: getMockSessionFormat()
  });
});

// Route to restart simulator
app.post('/api/simulator/reset', (req, res) => {
  initSimulator();
  res.json({ success: true, message: "Simulator restarted." });
});

// Format our local simulation into a format closely matching the timingscoring-ris.json structures
function getMockSessionFormat() {
  return {
    sessionName: simSession.sessionName,
    flagStatus: simSession.flagStatus,
    flagColor: simSession.flagColor,
    lapsCompleted: simSession.lapsCompleted,
    totalLaps: simSession.totalLaps,
    elapsedTime: simSession.elapsedTime,
    cars: simSession.cars.map(c => ({
      position: c.position,
      carNumber: c.carNumber,
      driverName: c.driverName,
      team: c.team,
      lapTime: c.status === "In Pit" ? "PIT" : formatLapTime(c.lastLapSec),
      bestLapTime: c.bestLapSec > 500 ? "-" : formatLapTime(c.bestLapSec),
      laps: c.laps,
      gap: c.gap,
      interval: c.interval,
      pitStops: c.pitStops,
      status: c.status,
      speedMph: c.speedMph
    }))
  };
}

function formatLapTime(seconds) {
  if (!seconds || seconds > 300) return "-";
  if (seconds < 60) {
    return seconds.toFixed(4);
  }
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(4);
  return `${m}:${s.padStart(7, '0')}`;
}

app.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`  IndyCar Live timing dashboard proxy server running!`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Fallback simulator is active in case live API is offline.`);
  console.log(`=============================================================`);
});
