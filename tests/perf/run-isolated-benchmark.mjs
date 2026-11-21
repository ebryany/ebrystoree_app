/**
 * Orkestrator benchmark terisolasi (mock-supabase + Nitro node-server + Grafana k6).
 *
 * Cara pakai:
 *   node tests/perf/run-isolated-benchmark.mjs --label baseline
 *   node tests/perf/run-isolated-benchmark.mjs --label optimized
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const labelIdx = args.indexOf("--label");
const LABEL = labelIdx >= 0 ? args[labelIdx + 1] : "run";
const APP_PORT = Number(process.env.BENCH_APP_PORT || "3099");
const DB_PORT = Number(process.env.BENCH_DB_PORT || "54329");
const DB_LATENCY = process.env.MOCK_DB_LATENCY_MS || "15";

function findK6() {
  const candidates = [
    process.env.K6_BIN,
    "k6",
    path.join(process.env.LOCALAPPDATA || "", "k6", "k6.exe"),
    "C:\\Program Files\\k6\\k6.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "k6.exe"),
  ].filter(Boolean);
  for (const bin of candidates) {
    const res = spawnSync(bin, ["version"], { encoding: "utf8" });
    if (res.status === 0) return bin;
  }
  throw new Error("Grafana k6 tidak ditemukan di PATH.");
}

async function waitForUrl(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout menunggu ${url}`);
}

function sampleProcessMemKb(pid) {
  if (process.platform === "win32") {
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`],
      { encoding: "utf8" },
    );
    const bytes = Number((r.stdout || "").trim());
    return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / 1024 / 1024) : 0;
  }
  return 0;
}

const k6Bin = findK6();
console.log(`Using k6: ${k6Bin}`);

const mockDb = spawn(process.execPath, ["tests/perf/mock-supabase.mjs"], {
  env: { ...process.env, MOCK_SUPABASE_PORT: String(DB_PORT), MOCK_DB_LATENCY_MS: DB_LATENCY },
  stdio: ["ignore", "pipe", "pipe"],
});
mockDb.stderr.on("data", (d) => process.stderr.write(`[mock-db] ${d}`));
await waitForUrl(`http://127.0.0.1:${DB_PORT}/__metrics`);

const appServer = spawn(process.execPath, [".output/server/index.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(APP_PORT),
    SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`,
    VITE_SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_perf_test_key",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_perf_test_key",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_perf_test_key",
    SITE_URL: `http://127.0.0.1:${APP_PORT}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let appErrCount = 0;
appServer.stderr.on("data", (d) => {
  const s = String(d);
  if (!s.includes("ExperimentalWarning")) {
    appErrCount += 1;
    if (appErrCount <= 5) process.stderr.write(`[app] ${s}`);
  }
});

await waitForUrl(`http://127.0.0.1:${APP_PORT}/api/health`);
console.log(`Isolated production server ready on http://127.0.0.1:${APP_PORT} (PID ${appServer.pid})`);

const scenarios = [
  { name: "smoke", script: "tests/perf/smoke.js", env: { VUS: "5", DURATION: "10s", THINK_SCALE: "0.3" } },
  { name: "load_1000", script: "tests/perf/load.js", env: { PEAK_VUS: "1000", FAST: "1", THINK_SCALE: "1" } },
  { name: "spike_1000", script: "tests/perf/spike.js", env: { PEAK_VUS: "1000", FAST: "1", THINK_SCALE: "1" } },
  { name: "stress_1500", script: "tests/perf/stress.js", env: { FAST: "1", THINK_SCALE: "1" } },
  { name: "soak_200", script: "tests/perf/soak.js", env: { VUS: "200", DURATION: "30s", THINK_SCALE: "0.8" } },
  { name: "breakpoint", script: "tests/perf/breakpoint.js", env: { FAST: "1", MAX_VUS: "600" } },
];

const results = [];
const outDir = path.join("tests", "perf", ".results");
fs.mkdirSync(outDir, { recursive: true });

try {
  for (const sc of scenarios) {
    await fetch(`http://127.0.0.1:${DB_PORT}/__reset`, { headers: { Connection: "close" } }).catch(() => {});
    const summaryPath = path.join(outDir, `${LABEL}-${sc.name}.json`);
    const rssBeforeMb = sampleProcessMemKb(appServer.pid);
    let peakRssMb = rssBeforeMb;
    const poller = setInterval(() => {
      const m = sampleProcessMemKb(appServer.pid);
      if (m > peakRssMb) peakRssMb = m;
    }, 2000);

    console.log(`\n=== RUNNING [${LABEL}] ${sc.name} ===`);
    const t0 = Date.now();
    const run = spawnSync(
      k6Bin,
      ["run", "--summary-export", summaryPath, "--summary-trend-stats", "avg,min,med,p(90),p(95),p(99),max", sc.script],
      {
        env: {
          ...process.env,
          BASE_URL: `http://127.0.0.1:${APP_PORT}`,
          ...sc.env,
        },
        encoding: "utf8",
      },
    );
    clearInterval(poller);
    const elapsedSec = (Date.now() - t0) / 1000;
    const rssAfterMb = sampleProcessMemKb(appServer.pid);
    await new Promise((r) => setTimeout(r, 400));
    let dbMetrics = { totalQueries: 0, peakInFlight: 0, byEndpoint: {} };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        dbMetrics = await (await fetch(`http://127.0.0.1:${DB_PORT}/__metrics`, { headers: { Connection: "close" } })).json();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    let summary = null;
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    }
    const m = summary?.metrics || {};
    const dur = m.http_req_duration || {};
    const reqs = m.http_reqs || {};
    const failed = m.http_req_failed || {};
    const checks = m.checks || {};
    const dropped = m.dropped_iterations || {};

    const row = {
      scenario: sc.name,
      exitCode: run.status,
      elapsedSec: Number(elapsedSec.toFixed(1)),
      totalReqs: reqs.count ?? 0,
      rps: Number((reqs.rate ?? 0).toFixed(1)),
      avgMs: Number((dur.avg ?? 0).toFixed(1)),
      p50Ms: Number((dur.med ?? 0).toFixed(1)),
      p90Ms: Number((dur["p(90)"] ?? 0).toFixed(1)),
      p95Ms: Number((dur["p(95)"] ?? 0).toFixed(1)),
      p99Ms: Number((dur["p(99)"] ?? 0).toFixed(1)),
      maxMs: Number((dur.max ?? 0).toFixed(1)),
      errorRatePct: Number(((failed.value ?? 0) * 100).toFixed(3)),
      checksPassPct: Number(((checks.value ?? 0) * 100).toFixed(2)),
      droppedIterations: dropped.count ?? 0,
      dbTotalQueries: dbMetrics.totalQueries,
      dbQps: Number((dbMetrics.totalQueries / Math.max(1, elapsedSec)).toFixed(1)),
      dbPeakInFlight: dbMetrics.peakInFlight,
      dbQueriesPerReq: Number((dbMetrics.totalQueries / Math.max(1, reqs.count ?? 1)).toFixed(2)),
      nodeRssBeforeMb: rssBeforeMb,
      nodeRssPeakMb: peakRssMb,
      nodeRssAfterMb: rssAfterMb,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  appServer.kill();
  mockDb.kill();
}

const reportPath = path.join(outDir, `${LABEL}-summary.json`);
fs.writeFileSync(reportPath, JSON.stringify({ label: LABEL, dbLatencyMs: Number(DB_LATENCY), results }, null, 2));
console.log(`\nSaved summary to ${reportPath}`);
