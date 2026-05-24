# OvalTiming Live - IndyCar Dashboard

A high-fidelity, stream-ready live timing and scoring dashboard optimized for NTT INDYCAR SERIES races. Features a Text-to-Speech (TTS) Race Commentator, a transparent OBS HUD Overlay, and a simulated 33-car oval race engine for offline testing.

## Deployment Channels

This directory is ready to deploy on Vercel, Render, Netlify, or locally with zero code modifications.

### 1. Vercel (Recommended - Free & Fast)
Hosts frontend statically and executes the CORS telemetry proxy as a Serverless function.
1. Install Vercel CLI: `npm install -g vercel`
2. Run command: `vercel`
3. Follow prompts. Use `vercel --prod` to deploy to production.

### 2. Supports Active Simulator
Hosts the Node.js Express server (server.js) natively.
1. Commit this folder to GitHub.
2. Create a new Web Service on Render.
3. Configure Build Settings:
   - Runtime: Node
   - Build Command: npm install
   - Start Command: npm start
4. Deploy the service.

### 3. Netlify (Frontend Only)
1. Deploy this folder via Netlify Web UI or CLI.
2. Build Command: Leave blank
3. Publish Directory: . (Root directory)

### 4. Running Locally
1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open in browser: http://localhost:3000

## OBS Studio Overlay Setup
1. Add a Browser Source in OBS.
2. Set URL to your deployed app or http://localhost:3000.
3. Set dimensions to 1920x1080.
4. Press ESCAPE (or click "Toggle OBS Overlay Mode") to switch to a semi-transparent left timing tower showing the Top 20 drivers.
