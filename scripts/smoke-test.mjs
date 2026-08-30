#!/usr/bin/env node
// Smoke test: spawns the built server, performs the MCP initialize handshake,
// lists tools, and (with --call) makes one real generate call against the API.
//
//   node scripts/smoke-test.mjs          # handshake + tools/list
//   node scripts/smoke-test.mjs --call   # also calls generate_privacy_policy (hits production, counts against rate limit)

import { spawn } from "node:child_process";

const doCall = process.argv.includes("--call");
const child = spawn("node", ["dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });

let buffer = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 150_000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.0" },
  });
  console.log(`initialize -> server: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  notify("notifications/initialized", {});

  const list = await rpc("tools/list", {});
  const tools = list.result.tools;
  console.log(`tools/list -> ${tools.length} tools:`);
  for (const t of tools) console.log(`  - ${t.name}`);

  const expected = [
    "generate_privacy_policy",
    "generate_terms_of_service",
    "generate_eula",
    "generate_cookie_policy",
    "generate_disclaimer",
    "get_full_document",
  ];
  const missing = expected.filter((n) => !tools.some((t) => t.name === n));
  if (missing.length) throw new Error(`missing tools: ${missing.join(", ")}`);
  console.log("PASS: all 6 expected tools present");

  if (doCall) {
    console.log("\nCalling generate_privacy_policy against production…");
    const call = await rpc("tools/call", {
      name: "generate_privacy_policy",
      arguments: {
        appName: "SmokeTest Demo",
        platform: "Web App",
        companyName: "PrivacyPage MCP Smoke Test",
        contactEmail: "hello@privacypage.io",
        dataCollected: ["Usage Analytics"],
        thirdPartyServices: ["None"],
        childrenUnder13: false,
      },
    });
    const text = call.result.content?.[0]?.text ?? "";
    console.log(`isError: ${call.result.isError ?? false}`);
    console.log("--- first 12 lines of tool result ---");
    console.log(text.split("\n").slice(0, 12).join("\n"));
    console.log("--- tail of tool result ---");
    console.log(text.split("\n").slice(-3).join("\n"));
    if (call.result.isError) throw new Error("generate call returned an error");
    if (!/documentId: \S+/.test(text)) throw new Error("no documentId in response");
    console.log("PASS: real generate call returned a preview and documentId");
  }

  console.log("\nSmoke test passed.");
  child.kill();
  process.exit(0);
} catch (e) {
  console.error("SMOKE TEST FAILED:", e.message);
  child.kill();
  process.exit(1);
}
