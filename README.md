# 🏎️ OvalTiming Live - IndyCar Streamer Dashboard & Telemetry TTS

A high-fidelity, stream-ready live timing and scoring dashboard optimized for NTT INDYCAR SERIES races. The application features a real-time, priority-queued **Text-to-Speech (TTS) Race Commentator** that automatically reads cautions, shuffles, pits, and fastest lap alerts out loud, a **transparent OBS HUD Overlay** for YouTube streams, and a fully simulated 33-car oval race engine for offline streamer tests.

---

## ⚡ Deployment Channels (Deploy Anywhere!)

This folder is uniquely structured to deploy instantly on Vercel, Render, Netlify, or your local machine with **zero code modifications**.

### 1. 🔺 Deploying to Vercel (Recommended - Free & Fast)
Vercel is ideal because it hosts the frontend statically and automatically executes the CORS telemetry proxy as a Serverless function.
1. Install the Vercel CLI (`npm install -g vercel`) or sign in on [vercel.com](https://vercel.com).
2. Open a terminal in this directory and type:
   ```bash
   vercel
   ```
3. Follow the CLI prompts. Vercel automatically finds the root `index.html` as the static frontend, and handles `api/timing.js` as the serverless timing endpoint `/api/timing` using the `vercel.json` rewrites.
4. Promote to production using `vercel --prod` to get a permanent live timing URL!

### 2. 🟢 Deploying to Render.com (Supports Active Simulator)
Render hosts the Node.js Express server (`server.js`) natively. **This is the best option if you want to use the active 33-car grid simulator on the web**, as Render supports persistent intervals.
1. Commit this folder to a GitHub repository.
2. Sign in to [Render.com](https://render.com) and click **New** -> **Web Service**.
3. Link your GitHub repository.
4. Configure the build parameters:
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
5. Render will build the server, host the static files, run the background simulator, and go live!

### 3. 🌐 Deploying to Netlify (Frontend Only)
Netlify provides instant global CDN hosting for frontends.
1. Connect your GitHub repository to [Netlify.com](https://netlify.com) or drag-and-drop this folder directly into the Netlify Web UI.
2. Set the **Build Command** to: *Leave blank*
3. Set the **Publish Directory** to: `.` (representing the root folder)
4. Click **Deploy**.
*(Note: Netlify deployments will fetch telemetry directly from IndyCar's public Azure blob. If the browser encounters CORS blocks, launch the Node.js server locally or use Vercel/Render!)*

### 💻 4. Running Locally
To run and test the timing dashboard on your own machine:
1. Open a terminal inside this directory.
2. Install packages:
   ```bash
   npm install
   ```
3. Start the Express timing proxy and simulator:
   ```bash
   npm start
   ```
4. Navigate to: **[http://localhost:3000](http://localhost:3000)**

---

## 🎙️ Telemetry TTS Alerts & Customizations
OvalTiming translates raw timing arrays into natural spoken sentences. You can select local voices (Google Natural or standard OS systems) and select what categories should trigger spoken announcements:
*   🏁 **Cautions & Red Flags**: Plays a synthesized track caution double-beep alarm and alerts the stream: *"Attention. Track caution. Yellow flag has been deployed."*
*   🏆 **Leaderboard Shifts**: Speaks: *"Leader change! Scott Dixon has taken P1."*
*   🏎️ **Top-Grid Overtakes**: Speaks: *"Overtake! Pato O'ward passes Scott Dixon for P2."*
*   ⏱️ **Fastest Lap Records**: Tracks overall record: *"New fastest lap! Josef Newgarden sets a 40 point 1234 seconds lap time at 224 miles per hour."*
*   🔧 **Pit Lane Entries**: Speaks: *"Alexander Rossi enters the pit lane."*

---

## 🎥 OBS Studio Overlay Setup
1. Load **OBS Studio**.
2. Click **`+`** under the *Sources* dock and select **Browser**.
3. Set the URL to your deployed website (e.g. `http://localhost:3000` or `your-app.vercel.app`) and configure dimensions to **1920 x 1080**.
4. Check **Control Audio via OBS** to control alert beep volumes.
5. Right-click the Browser source and select **Interact** (or load the page in a normal browser tab).
6. Press the **ESCAPE** key (or click **🎥 Toggle OBS Overlay Mode**).
7. **The screen transforms into a gorgeous, semi-transparent timing tower on the left margin, showing only the Top 20 drivers!** The backgrounds dissolve into a translucent glass backdrop with a glowing NTT Blue frame—ready for seamless stream integration.
