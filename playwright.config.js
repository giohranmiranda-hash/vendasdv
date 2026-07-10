// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8123",
    headless: true,
    // usa o Chromium pré-instalado do ambiente (evita download)
    launchOptions: { executablePath: process.env.ICE_CHROMIUM || "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "python3 -m http.server 8123 --bind 127.0.0.1",
    url: "http://127.0.0.1:8123/index.html",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
