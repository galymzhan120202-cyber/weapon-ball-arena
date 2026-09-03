"use strict";
/* =====================================================================
   Weapon Ball Arena — shared upload helpers
   ---------------------------------------------------------------------
   Credential loading + a tiny dependency-free Telegram notifier, used
   by both login.js and upload.js.

   Files (all gitignored, all belong to the NEW channel — never the
   weapon-ball-bot channel):
     client_secrets.json   OAuth "Desktop app" client, downloaded from
                           the Google Cloud console
     youtube_token.json    written by login.js after the one-time grant

   Either file may instead be supplied as a full-JSON env var, which is
   how CI passes them:
     WBA_CLIENT_SECRETS_JSON
     WBA_YOUTUBE_TOKEN_JSON
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const SECRETS_PATH = path.join(ROOT, "client_secrets.json");
const TOKEN_PATH = path.join(ROOT, "youtube_token.json");

function readJsonMaybe(envName, filePath) {
  if (process.env[envName]) {
    try { return JSON.parse(process.env[envName]); }
    catch (e) { throw new Error(`${envName} is set but not valid JSON: ${e.message}`); }
  }
  if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
  return null;
}

// returns { clientId, clientSecret, redirectUris[] } or throws
function loadClientSecret() {
  const raw = readJsonMaybe("WBA_CLIENT_SECRETS_JSON", SECRETS_PATH);
  if (!raw) {
    throw new Error(
      "no client_secrets.json (and no WBA_CLIENT_SECRETS_JSON). Download the " +
      "OAuth Desktop-app client for the new channel and save it to " + SECRETS_PATH
    );
  }
  const c = raw.installed || raw.web || raw;
  if (!c.client_id || !c.client_secret) throw new Error("client_secrets.json missing client_id / client_secret");
  return {
    clientId: c.client_id,
    clientSecret: c.client_secret,
    redirectUris: c.redirect_uris || ["http://127.0.0.1"],
  };
}

function loadToken() {
  return readJsonMaybe("WBA_YOUTUBE_TOKEN_JSON", TOKEN_PATH);
}
function saveToken(tok) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tok, null, 2));
  return TOKEN_PATH;
}

// build an OAuth2 client; `redirectUri` matters only for the login flow
function makeOAuth(google, redirectUri) {
  const { clientId, clientSecret, redirectUris } = loadClientSecret();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri || redirectUris[0]);
}

// fire-and-forget Telegram message; silent no-op if creds aren't set
function telegramNotify(text) {
  const token = process.env.WBA_TELEGRAM_NOTIFY_TOKEN;
  const chat = process.env.WBA_TELEGRAM_NOTIFY_CHAT_ID;
  if (!token || !chat) return Promise.resolve(false);
  const body = JSON.stringify({ chat_id: chat, text, disable_web_page_preview: false });
  return new Promise((resolve) => {
    const req = https.request({
      method: "POST",
      hostname: "api.telegram.org",
      path: `/bot${token}/sendMessage`,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode === 200)); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.write(body); req.end();
  });
}

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

module.exports = {
  ROOT, SECRETS_PATH, TOKEN_PATH, SCOPES,
  loadClientSecret, loadToken, saveToken, makeOAuth, telegramNotify,
};
