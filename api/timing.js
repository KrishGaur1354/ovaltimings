const axios = require('axios');

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

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      return res.status(200).json({
        status: "live",
        source: "timingscoring-ris",
        data: normalized
      });
    }
  } catch (error) {
    // Silent fail
  }

  // Pipeline Attempt 2: Fetch timingscoring.json
  try {
    const response = await axios.get(stdUrl, { headers, timeout: 3500 });
    if (response.data && response.data.timing_results) {
      const normalized = normalizeLiveTiming(response.data);
      return res.status(200).json({
        status: "live",
        source: "timingscoring",
        data: normalized
      });
    }
  } catch (error) {
    // Silent fail
  }

  // Pipeline Fallback
  return res.status(200).json({
    status: "offline",
    message: "Feeds offline. Deploy on Render/Node or run locally to use simulated race engine.",
    data: {
      sessionName: "NTT INDYCAR SERIES (API OFFLINE)",
      flagStatus: "Y",
      flagColor: "Yellow",
      lapsCompleted: 0,
      totalLaps: 200,
      elapsedTime: "00:00:00",
      cars: []
    }
  });
};
