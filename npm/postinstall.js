#!/usr/bin/env node
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { createHash } = require("crypto");

const REPO = "test-mesh/testmesh";
const BIN_DIR = path.join(__dirname, "bin");

function getPlatform() {
  const platform = os.platform();
  const arch = os.arch();

  let os_name;
  switch (platform) {
    case "linux": os_name = "linux"; break;
    case "darwin": os_name = "macOS"; break;
    default:
      console.error(`Unsupported platform: ${platform}`);
      process.exit(1);
  }

  let arch_name;
  switch (arch) {
    case "x64": arch_name = "amd64"; break;
    case "arm64": arch_name = "arm64"; break;
    default:
      console.error(`Unsupported architecture: ${arch}`);
      process.exit(1);
  }

  return { os_name, arch_name };
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "testmesh-npm-installer" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function getLatestVersion() {
  const data = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  const json = JSON.parse(data.toString());
  return json.tag_name;
}

async function main() {
  const { version } = require("./package.json");
  const tag = `v${version}`;

  const { os_name, arch_name } = getPlatform();
  const ver = tag.replace(/^v/, "");
  const archive = `testmesh_${ver}_${os_name}_${arch_name}.tar.gz`;
  const baseUrl = `https://github.com/${REPO}/releases/download/${tag}`;

  console.log(`Downloading testmesh ${tag} (${os_name}/${arch_name})...`);

  const [archiveBuf, checksumsBuf] = await Promise.all([
    fetch(`${baseUrl}/${archive}`),
    fetch(`${baseUrl}/checksums.txt`),
  ]);

  // Verify checksum
  const expected = checksumsBuf
    .toString()
    .split("\n")
    .find((line) => line.includes(archive));
  if (expected) {
    const expectedHash = expected.split(/\s+/)[0];
    const actualHash = createHash("sha256").update(archiveBuf).digest("hex");
    if (expectedHash !== actualHash) {
      console.error("Checksum verification failed");
      process.exit(1);
    }
  }

  // Extract binary from tar.gz
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testmesh-"));
  const archivePath = path.join(tmpDir, archive);
  fs.writeFileSync(archivePath, archiveBuf);

  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  execSync(`tar -xzf "${archivePath}" -C "${BIN_DIR}" testmesh`);
  fs.chmodSync(path.join(BIN_DIR, "testmesh"), 0o755);
  fs.rmSync(tmpDir, { recursive: true });

  console.log("testmesh installed successfully.");
  registerMCP();
}

function registerMCP() {
  const mcpEntry = {
    command: "testmesh",
    args: ["mcp"],
    description: "TestMesh MCP server — analyze services, generate/run/validate E2E flows",
  };

  const targets = [
    // Claude Code
    path.join(os.homedir(), ".claude", "mcp.json"),
    // Claude Desktop (macOS)
    path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
  ];

  for (const configPath of targets) {
    if (!fs.existsSync(path.dirname(configPath))) continue;

    let config = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (!config.mcpServers) config.mcpServers = {};
      } catch {
        continue;
      }
    }

    config.mcpServers.testmesh = mcpEntry;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`Registered TestMesh MCP server in ${configPath}`);
  }
}

main().catch((err) => {
  console.error("Installation failed:", err.message);
  process.exit(1);
});
