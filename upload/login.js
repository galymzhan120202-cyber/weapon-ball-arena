#!/usr/bin/env node
"use strict";
/* =====================================================================
   Weapon Ball Arena — one-time OAuth login
   ---------------------------------------------------------------------
   Run this ONCE on your machine, signed into the NEW "Weapon Ball
   Arena" channel, to mint youtube_token.json. It does not upload
   anything — it only grants and then verifies which channel the token
   belongs to.

     cd upload && npm install
     node login.js

   Opens a loopback redirect on 127.0.0.1:<port>. If a browser doesn't
   open automatically, copy the printed URL. After you approve, the
   token is written to ../youtube_token.json and the channel it maps to
   is printed — check it's the new channel, not weapon-ball-bot.
   ===================================================================== */

const http = require("http");
const { spawn } = require("child_process");
const { google } = require("googleapis");
const { makeOAuth, saveToken, SCOPES } = require("./lib");

function openBrowser(url) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref(); } catch {}
}

(async () => {
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}`;
  const oauth = makeOAuth(google, redirectUri);

  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",                 // force a refresh_token every time
    scope: SCOPES,
  });

  console.log("\n  Open this URL and approve access for the NEW channel:\n");
  console.log("    " + authUrl + "\n");
  openBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for the redirect")), 5 * 60 * 1000);
    server.on("request", (req, res) => {
      const u = new URL(req.url, redirectUri);
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<body style="font:16px system-ui;padding:40px;background:#0a0b10;color:#e8e8ef">
        ${c ? "Authorized. You can close this tab and return to the terminal." : "No code received: " + (err || "unknown error")}
      </body>`);
      clearTimeout(timer);
      c ? resolve(c) : reject(new Error(err || "no code"));
    });
  });

  server.close();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    console.error("\n✗ no refresh_token in the response. Revoke prior access at");
    console.error("  https://myaccount.google.com/permissions and run login.js again.\n");
    process.exit(1);
  }
  oauth.setCredentials(tokens);

  const yt = google.youtube({ version: "v3", auth: oauth });
  const me = await yt.channels.list({ part: "snippet,contentDetails", mine: true });
  const ch = me.data.items && me.data.items[0];

  const saved = saveToken(tokens);
  console.log(`\n✓ token written to ${saved}`);
  if (ch) {
    console.log(`✓ channel: ${ch.snippet.title}   (id ${ch.id})`);
    console.log("  → make sure this is the NEW Weapon Ball Arena channel.\n");
  } else {
    console.log("  (could not read channel info, but the token is saved)\n");
  }
})().catch((e) => { console.error("\n✗ login failed:", e && e.message || e, "\n"); process.exit(1); });
