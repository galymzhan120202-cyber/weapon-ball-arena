#!/usr/bin/env node
/* =====================================================================
   Weapon Ball Arena — channel branding renderer
   ---------------------------------------------------------------------
   Loads ../branding.html headlessly and writes the two canvases to PNG
   at the exact sizes YouTube wants:
     branding_banner.png   2560 x 1440  (safe area 1546 x 423)
     branding_avatar.png     800 x  800
   These filenames are whitelisted in .gitignore so they can be committed.

   Usage:  node record/branding-shot.js [--seed=N] [--out=DIR]
   ===================================================================== */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "..");

/* Reuse an installed Chrome rather than requiring `puppeteer browsers install`.
   PUPPETEER_EXECUTABLE_PATH wins; otherwise try the usual Windows locations. */
function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const home = os.homedir();
  const candidates = [
    path.join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["LOCALAPPDATA"] || path.join(home, "AppData/Local"), "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  ];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

function arg(name, def) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(name.length + 3) : def;
}

(async () => {
  const seed = arg("seed", "7");
  const outDir = path.resolve(ROOT, arg("out", "."));
  const url = "file://" + path.join(ROOT, "branding.html").replace(/\\/g, "/") + `?seed=${seed}`;

  const executablePath = findChrome();
  if (!executablePath) {
    console.error("No Chrome/Edge found. Set PUPPETEER_EXECUTABLE_PATH to a browser binary.");
    process.exit(1);
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--force-device-scale-factor=1", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction("window.__WBA_BRANDING_READY__ === true", { timeout: 15000 });

    for (const [id, name] of [["banner", "branding_banner.png"], ["avatar", "branding_avatar.png"], ["cover", "branding_cover.png"]]) {
      const dataUrl = await page.$eval("#" + id, (c) => c.toDataURL("image/png"));
      const buf = Buffer.from(dataUrl.split(",")[1], "base64");
      const dest = path.join(outDir, name);
      fs.writeFileSync(dest, buf);
      console.log(`wrote ${dest}  (${buf.length.toLocaleString()} bytes)`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
