#!/usr/bin/env node
// Captures everything the reviewers need for one UI state.
//
//   node capture.mjs capture --url URL --out DIR [--config FILE] [--tasks FILE] [--skip-cwv] [--only tasks|views|tasks,views]
//   node capture.mjs crop    --url URL --plan FILE --phase before|after --out DIR [--config FILE]
//
// `capture` writes into DIR: <viewport>.png (first screen), <viewport>-full.png,
// aria-<viewport>.txt, reflow-320.png, <viewport>-view-<id>[-full].png for the configured
// views (capture.views), tasks/<id>/<n>.png, tasks.json (the task definitions used) and
// capture.json with axe-core results, lab Web Vitals, reflow, focus, page checks and the
// detected stack. `crop` is documented above the crop() function.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { parseArgs, loadConfig, writeJSON, readJSON, die, log, round } from "./lib/common.mjs";
import { perfObserverInit, readPerf, selectorHelperSource, pageChecks, reflowCheck, focusProbe, detectRuntimeStack } from "./lib/inpage.mjs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa", "best-practice"];

const args = parseArgs();
const cmd = args._[0];
if (!["capture", "crop"].includes(cmd)) die("usage: capture.mjs capture|crop --url URL --out DIR ...");
if (!args.url) die("--url is required");
if (!args.out) die("--out is required");
const cfg = loadConfig(args.config);
const outDir = path.resolve(args.out);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  if (cmd === "capture") await capture();
  else await crop();
} finally {
  await browser.close();
}

async function newPage(vp, extra = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.isMobile,
    reducedMotion: "reduce",
    ...extra,
  });
  await context.addInitScript(selectorHelperSource());
  const page = await context.newPage();
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(cfg.capture.settleMs);
}

async function goto(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await settle(page);
  return res;
}

async function fullScreenshot(page, file) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const max = cfg.capture.maxFullPageHeight;
  if (height <= max) await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  else {
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    await page.screenshot({ path: file, fullPage: true, animations: "disabled", clip: { x: 0, y: 0, width, height: max } });
  }
  return { height, truncated: height > max };
}

function summarizeAxe(results, viewport) {
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    wcag: v.tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, "$1.$2.$3")),
    viewport,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary || "").split("\n").slice(1, 3).join(" ").trim(), html: n.html.slice(0, 160) })),
  }));
}

function mergeAxe(lists) {
  const map = new Map();
  for (const v of lists.flat()) {
    const prev = map.get(v.id);
    if (!prev) map.set(v.id, { ...v, viewports: [v.viewport] });
    else {
      prev.viewports.push(v.viewport);
      prev.nodes = Math.max(prev.nodes, v.nodes);
    }
  }
  return [...map.values()].map(({ viewport, ...rest }) => rest);
}

async function focusWalk(page) {
  await page.evaluate(() => {
    window.__uiFocusPrev = null;
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  const stops = [];
  const seen = new Set();
  let sameRun = 0;
  for (let i = 0; i < cfg.capture.focusStops + 20; i++) {
    if (stops.length >= cfg.capture.focusStops) break;
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const probe = await page.evaluate(focusProbe);
    if (probe.same) {
      if (++sameRun > 8) break;
      continue;
    }
    sameRun = 0;
    if (probe.prevSelector && stops.length) stops[stops.length - 1].indicator = probe.prevIndicator;
    if (!probe.selector || seen.has(probe.selector)) break;
    seen.add(probe.selector);
    stops.push({ selector: probe.selector, tag: probe.tag, role: probe.role, name: probe.name, obscured: probe.obscured, obscuredBy: probe.obscuredBy, indicator: null });
  }
  // Final comparison for the last stop.
  await page.evaluate(() => document.activeElement?.blur?.());
  const last = await page.evaluate(focusProbe);
  if (last.prevSelector && stops.length && stops[stops.length - 1].indicator === null) stops[stops.length - 1].indicator = last.prevIndicator;
  return {
    stops,
    reached: stops.length,
    withoutIndicator: stops.filter((s) => s.indicator === false).map((s) => ({ selector: s.selector, name: s.name })),
    obscured: stops.filter((s) => s.obscured).map((s) => ({ selector: s.selector, by: s.obscuredBy })),
  };
}

async function measureCwv(url) {
  const c = cfg.cwv;
  const vp = c.profile === "desktop" ? cfg.viewports.desktop : cfg.viewports.mobile;
  const runs = [];
  for (let i = 0; i < Math.max(1, c.runs); i++) {
    const { context, page } = await newPage(vp, { reducedMotion: "no-preference" });
    await context.addInitScript(perfObserverInit);
    const cdp = await context.newCDPSession(page);
    if (c.cpuSlowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: c.cpuSlowdown });
    if (c.latencyMs || c.downloadKbps) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: c.latencyMs,
        downloadThroughput: (c.downloadKbps * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
    }
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 90000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    // Scroll through the page so lazy content and late shifts are included.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const m = await page.evaluate(readPerf);
    m.loadMs = Date.now() - t0;
    runs.push(m);
    await context.close();
  }
  const median = (k) => {
    const xs = runs.map((r) => r[k]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  };
  return {
    profile: c.profile,
    throttling: { cpuSlowdown: c.cpuSlowdown, latencyMs: c.latencyMs, downloadKbps: c.downloadKbps },
    lcpMs: round(median("lcpMs"), 0),
    lcpElement: runs[0].lcpElement,
    cls: round(median("cls"), 3),
    tbtMs: round(median("tbtMs"), 0),
    fcpMs: round(median("fcpMs"), 0),
    longTasks: median("longTasks"),
    runs: runs.length,
    note: "Lab measurement with throttling. INP needs interactions: see tasks[].inpMs.",
  };
}

// ---------- task steps (shared by tasks, views and crop setup) ----------

// Builds the raw locator for one target description. `selector` + `text` narrows a CSS
// selector to elements containing the text (useful to assert a result value).
function baseLocator(page, t) {
  const text = t.text !== undefined && t.regex ? new RegExp(t.text, t.exact ? "" : "i") : t.text;
  if (t.role) return page.getByRole(t.role, { name: t.name, exact: !!t.exact });
  if (t.label) return page.getByLabel(t.label, { exact: !!t.exact });
  if (t.placeholder) return page.getByPlaceholder(t.placeholder);
  if (t.selector && text !== undefined) return page.locator(t.selector).filter({ hasText: text });
  if (text !== undefined) return page.getByText(text, { exact: !!t.exact });
  if (t.selector) return page.locator(t.selector);
  return null;
}

function alternatives(step) {
  return Array.isArray(step.any) ? step.any : [step];
}

// Resolves a step target to { loc, used }. Alternatives are tried in order, and a visible
// match always wins over a hidden one (getByText and CSS also match hidden nodes such as
// <option> or collapsed panels). If nothing is visible yet, waits briefly for any alternative.
async function locate(page, step, timeout = 5000) {
  const alts = alternatives(step);
  const pick = async () => {
    let hidden = null;
    for (const alt of alts) {
      const loc = baseLocator(page, alt);
      if (!loc) continue;
      const visible = loc.filter({ visible: true });
      if ((await visible.count()) > 0) return { loc: visible.first(), used: alt };
      if (!hidden && (await loc.count()) > 0) hidden = { loc: loc.first(), used: alt };
    }
    return hidden;
  };
  const first = await pick();
  if (first && first.loc && (await first.loc.isVisible())) return first;
  const locs = alts.map((a) => baseLocator(page, a)).filter(Boolean);
  if (!locs.length) return { loc: null, used: alts[alts.length - 1] };
  const combined = locs.reduce((a, b) => a.or(b));
  await combined.filter({ visible: true }).first().waitFor({ state: "visible", timeout }).catch(() => {});
  return (await pick()) || { loc: baseLocator(page, alts[alts.length - 1])?.first() ?? null, used: alts[alts.length - 1] };
}

function describeTarget(t) {
  const base = t.role ? `${t.role} "${t.name}"` : t.label ? `label "${t.label}"` : t.placeholder ? `placeholder "${t.placeholder}"` : t.selector || "";
  const text = t.text !== undefined ? `${t.regex ? "pattern" : "text"} "${t.text}"` : "";
  return [base, text].filter(Boolean).join(" with ") || t.key || t.url || "";
}

// Executes one step. Throws on failure. Returns the target that was used.
async function runStep(page, step, url) {
  const needsTarget = !["press", "goto", "wait"].includes(step.action);
  const { loc, used } = needsTarget ? await locate(page, step) : { loc: null, used: step };
  if (needsTarget && !loc) throw new Error("no target described");
  switch (step.action) {
    case "click":
      await loc.click({ timeout: 5000 });
      break;
    case "fill":
      await loc.fill(String(step.value ?? ""), { timeout: 5000 });
      break;
    case "select":
      await loc.selectOption(String(step.value), { timeout: 5000 });
      break;
    case "check":
      await loc.check({ timeout: 5000 });
      break;
    case "uncheck":
      await loc.uncheck({ timeout: 5000 });
      break;
    case "focus":
      await loc.focus({ timeout: 5000 });
      break;
    case "hover":
      await loc.hover({ timeout: 5000 });
      break;
    case "press":
      await page.keyboard.press(step.key);
      break;
    case "goto":
      await page.goto(new URL(step.url, url).href);
      break;
    case "scroll":
      await page.evaluate((y) => window.scrollTo(0, y), Number(step.y) || 0);
      break;
    case "expect":
      await loc.waitFor({ state: "visible", timeout: 5000 });
      break;
    case "wait":
      await page.waitForTimeout(step.ms || 500);
      break;
    default:
      throw new Error(`unknown action ${step.action}`);
  }
  await page.waitForTimeout(350);
  return used;
}

async function runSteps(page, steps, url) {
  for (const step of steps || []) await runStep(page, step, url);
}

async function runTasks(url, tasksFile) {
  const tasks = readJSON(tasksFile);
  // Keep the exact task definitions with the iteration, so baseline and final runs can be compared.
  writeJSON(path.join(outDir, "tasks.json"), tasks);
  const results = [];
  for (const task of tasks) {
    const vp = cfg.viewports[task.viewport || "desktop"] || cfg.viewports.desktop;
    const { context, page } = await newPage(vp);
    await context.addInitScript(perfObserverInit);
    const dir = path.join(outDir, "tasks", task.id);
    fs.mkdirSync(dir, { recursive: true });
    const steps = [];
    let ok = true;
    let nonAccessibleLocators = 0;
    try {
      await goto(page, new URL(task.start || "", url).href);
      await page.screenshot({ path: path.join(dir, "0.png"), animations: "disabled" });
      for (const [i, step] of (task.steps || []).entries()) {
        const n = i + 1;
        const rec = { n, action: step.action, target: step.any ? step.any.map(describeTarget).join(" or ") : describeTarget(step), ok: true };
        try {
          const used = await runStep(page, step, url);
          // Interactive steps that only work through placeholder, visible text or CSS hint at missing names/roles.
          if (["click", "fill", "select", "check", "uncheck"].includes(step.action) && !used.role && !used.label) {
            rec.accessibleLocator = false;
            nonAccessibleLocators++;
          }
        } catch (err) {
          rec.ok = false;
          rec.error = err.message.split("\n")[0].slice(0, 200);
          ok = false;
        }
        await page.screenshot({ path: path.join(dir, `${n}.png`), animations: "disabled" });
        steps.push(rec);
        if (!rec.ok) break;
      }
    } catch (err) {
      ok = false;
      steps.push({ n: steps.length + 1, action: "start", ok: false, error: err.message.split("\n")[0] });
    }
    const perf = await page.evaluate(readPerf).catch(() => ({}));
    const outcomeChecks = (task.steps || []).filter((s) => s.action === "expect").length;
    results.push({ id: task.id, goal: task.goal, viewport: task.viewport || "desktop", success: ok, steps, inpMs: perf.inpMs ?? null, nonAccessibleLocators, outcomeChecks, screenshots: path.relative(outDir, dir) });
    await context.close();
  }
  return results;
}

// Extra UI states (tabs, accordions, wizard steps) that the default page load does not show.
// Each view is captured per viewport as <viewport>-view-<id>.png and <viewport>-view-<id>-full.png.
async function captureViews(url) {
  const out = [];
  for (const view of cfg.capture.views || []) {
    const vps = !view.viewport || view.viewport === "both" ? Object.keys(cfg.viewports) : [view.viewport];
    for (const name of vps) {
      const vp = cfg.viewports[name];
      if (!vp) continue;
      const { context, page } = await newPage(vp);
      const slot = `${name}-view-${view.id}`;
      try {
        await goto(page, new URL(view.start || "", url).href);
        await runSteps(page, view.steps, url);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(outDir, `${slot}.png`), animations: "disabled" });
        await fullScreenshot(page, path.join(outDir, `${slot}-full.png`));
        out.push({ id: view.id, viewport: name, slot, label: view.label || view.id, ok: true });
      } catch (err) {
        out.push({ id: view.id, viewport: name, slot, ok: false, error: err.message.split("\n")[0].slice(0, 200) });
      }
      await context.close();
    }
  }
  return out;
}

async function capture() {
  const url = args.url;
  if (args.only) {
    // Re-run only some parts (tasks, views) and merge them into an existing capture.json.
    const parts = String(args.only).split(",");
    if (parts.some((x) => !["tasks", "views"].includes(x))) die("--only takes tasks, views or tasks,views");
    if (parts.includes("tasks") && !args.tasks) die("--only tasks needs --tasks FILE");
    const file = path.join(outDir, "capture.json");
    const existing = readJSON(file);
    if (parts.includes("views")) existing.views = await captureViews(url);
    if (parts.includes("tasks")) {
      fs.rmSync(path.join(outDir, "tasks"), { recursive: true, force: true });
      existing.tasks = await runTasks(url, args.tasks);
    }
    existing.summary = summarize(existing);
    writeJSON(file, existing);
    console.log(JSON.stringify(existing.summary, null, 2));
    return;
  }
  const out = { url, capturedAt: new Date().toISOString(), viewports: {}, consoleErrors: [], axe: [], stack: null };
  const axeLists = [];
  let darkCss = false;

  for (const [name, vp] of Object.entries(cfg.viewports)) {
    log(`capture ${name} ${vp.width}x${vp.height}`);
    const { context, page } = await newPage(vp);
    page.on("console", (m) => m.type() === "error" && out.consoleErrors.length < 20 && out.consoleErrors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => out.consoleErrors.length < 20 && out.consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
    const res = await goto(page, url);
    if (!res || res.status() >= 400) log(`warning: ${url} answered ${res?.status()}`);
    await page.screenshot({ path: path.join(outDir, `${name}.png`), animations: "disabled" });
    const full = await fullScreenshot(page, path.join(outDir, `${name}-full.png`));
    const aria = await page.locator("body").ariaSnapshot().catch((e) => `aria snapshot failed: ${e.message}`);
    fs.writeFileSync(path.join(outDir, `aria-${name}.txt`), aria.slice(0, 60000));
    const checks = await page.evaluate(pageChecks, { isMobile: !!vp.isMobile });
    darkCss ||= checks.darkModeCss;
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    axeLists.push(summarizeAxe(axe, name));
    const v = { width: vp.width, height: vp.height, status: res?.status() ?? null, fullPage: full, checks };
    if (!vp.isMobile) {
      v.focus = await focusWalk(page);
      if (!out.stack) out.stack = await page.evaluate(detectRuntimeStack);
    }
    out.viewports[name] = v;
    await context.close();
  }
  out.axe = mergeAxe(axeLists);

  const darkMode = cfg.capture.darkMode;
  if (darkMode === true || (darkMode === "auto" && darkCss)) {
    log("capture dark mode");
    const { context, page } = await newPage(cfg.viewports.desktop, { colorScheme: "dark" });
    await goto(page, url);
    await page.screenshot({ path: path.join(outDir, "desktop-dark.png"), animations: "disabled" });
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    out.darkMode = { screenshot: "desktop-dark.png", contrastViolations: summarizeAxe(axe, "desktop-dark") };
    await context.close();
  }

  log("reflow 320");
  {
    // 1280 px at 400 % zoom = 320 CSS px. Desktop emulation so a missing viewport meta does not hide the problem.
    const { context, page } = await newPage({ width: 320, height: 640, isMobile: false });
    await goto(page, url);
    out.reflow320 = await page.evaluate(reflowCheck);
    await page.screenshot({ path: path.join(outDir, "reflow-320.png"), animations: "disabled" });
    await context.close();
  }

  if (!args["skip-cwv"]) {
    log(`web vitals (${cfg.cwv.profile}, throttled)`);
    out.cwv = await measureCwv(url).catch((e) => ({ error: e.message }));
  }

  if (cfg.capture.views?.length) {
    log(`views: ${cfg.capture.views.map((v) => v.id).join(", ")}`);
    out.views = await captureViews(url);
  }

  if (args.tasks) {
    log("task walkthroughs");
    out.tasks = await runTasks(url, args.tasks);
  }

  out.summary = summarize(out);
  writeJSON(path.join(outDir, "capture.json"), out);
  console.log(JSON.stringify(out.summary, null, 2));
}

function summarize(c) {
  const count = (impact) => c.axe.filter((v) => v.impact === impact).length;
  const d = c.viewports.desktop || Object.values(c.viewports)[0];
  return {
    stack: (c.stack?.detected || []).map((s) => s.name),
    axe: { critical: count("critical"), serious: count("serious"), moderate: count("moderate"), minor: count("minor") },
    reflow320HorizontalScroll: c.reflow320?.horizontalScroll ?? null,
    focusStops: d?.focus?.reached ?? null,
    focusWithoutIndicator: d?.focus?.withoutIndicator.length ?? null,
    focusObscured: d?.focus?.obscured.length ?? null,
    clickableNotFocusable: Math.max(0, ...Object.values(c.viewports).map((v) => v.checks.clickableNotFocusable.length)),
    cwv: c.cwv && !c.cwv.error ? { lcpMs: c.cwv.lcpMs, cls: c.cwv.cls, tbtMs: c.cwv.tbtMs } : c.cwv,
    tasks: c.tasks
      ? {
          total: c.tasks.length,
          succeeded: c.tasks.filter((t) => t.success).length,
          maxInpMs: Math.max(0, ...c.tasks.map((t) => t.inpMs || 0)),
          withoutOutcomeCheck: c.tasks.filter((t) => t.outcomeChecks === 0).map((t) => t.id),
        }
      : null,
    views: c.views ? c.views.map((v) => `${v.slot}${v.ok ? "" : " (failed)"}`) : undefined,
    consoleErrors: c.consoleErrors.length,
  };
}

// Element crops for each planned change, taken before and after the edit.
//
// Plan entries (changes.json): { id, selector, viewport, width?, setup?, anchor? }
// - Every crop gets a fresh page load, so scroll position and observers from an earlier
//   crop cannot hide the element (sticky bars, "show while out of view" widgets).
// - `width` overrides the viewport width (for example 320 for changes below a breakpoint).
// - `setup` is a list of task steps run before the crop (focus, click, press Tab ...), so
//   states like focus rings, open menus or an undo bar are visible.
// - `anchor` is used when `selector` does not exist (yet), typically for the before crop of a
//   new element: it crops the region where the element will appear.
// - Elements that fit on the screen are cropped from the viewport, so position: fixed and
//   sticky elements are captured where users see them. Taller elements use a full-page clip.
// - The accessibility tree of the element is saved next to the crop (<id>-<phase>.aria.txt),
//   so changes to names, roles and live regions can be compared too.
async function crop() {
  const plan = readJSON(args.plan);
  const phase = args.phase || "before";
  const results = [];
  for (const item of plan) {
    if (!item.selector && !item.anchor && !item.setup) continue;
    const base = cfg.viewports[item.viewport || "desktop"] || cfg.viewports.desktop;
    const vp = item.width ? { ...base, width: Number(item.width) } : base;
    const file = path.join(outDir, `${item.id}-${phase}.png`);
    const rec = { id: item.id, phase, viewport: item.viewport || "desktop", width: vp.width, ok: false };
    const { context, page } = await newPage(vp);
    try {
      await goto(page, args.url);
      if (item.setup?.length) await runSteps(page, item.setup, args.url);
      const target = [item.selector, item.anchor].filter(Boolean);
      let used = null;
      let box = null;
      for (const sel of target) {
        box = await page.evaluate((s) => {
          const el = [...document.querySelectorAll(s)].find((e) => {
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
          });
          if (!el) return null;
          let fixed = false;
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const pos = getComputedStyle(n).position;
            if (pos === "fixed" || pos === "sticky") fixed = true;
          }
          if (!fixed) el.scrollIntoView({ block: "center", inline: "nearest" });
          return { fixed };
        }, sel);
        if (box) {
          used = sel === item.selector ? "selector" : "anchor";
          // Let scroll handlers and IntersectionObservers settle before measuring.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await page.waitForTimeout(150);
          Object.assign(
            box,
            await page.evaluate((s) => {
              const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0);
              const r = el.getBoundingClientRect();
              return { x: r.left, y: r.top, width: r.width, height: r.height, sx: scrollX, sy: scrollY, vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight };
            }, sel),
          );
          if (used === "selector") {
            const aria = await page.locator(sel).filter({ visible: true }).first().ariaSnapshot().catch(() => null);
            if (aria !== null) {
              fs.writeFileSync(path.join(outDir, `${item.id}-${phase}.aria.txt`), aria.slice(0, 20000));
              rec.aria = path.basename(file, ".png") + ".aria.txt";
            }
          }
          break;
        }
      }
      if (!box) {
        // Nothing to point at: keep the first screen, so the report still shows the state.
        await page.screenshot({ path: file, animations: "disabled" });
        Object.assign(rec, { ok: true, file: path.basename(file), used: "viewport", note: `${item.selector || item.anchor} not found or invisible; first screen shown` });
      } else {
        const pad = 24;
        const sel = used === "selector" ? item.selector : item.anchor;
        if (box.vw !== vp.width) {
          // Zoomed-out layout (no viewport meta on a phone): page coordinates do not map to
          // screen pixels, so let Playwright crop the element itself.
          await page.locator(sel).filter({ visible: true }).first().screenshot({ path: file, animations: "disabled" });
        } else if (box.height + pad * 2 <= box.vh) {
          const x = Math.max(0, box.x - pad);
          const y = Math.max(0, box.y - pad);
          const width = Math.min(Math.max(box.width + pad * 2, 200), box.vw - x);
          const height = Math.min(Math.max(box.height + pad * 2, 80), box.vh - y);
          await page.screenshot({ path: file, animations: "disabled", clip: { x, y, width, height } });
        } else {
          const x = Math.max(0, box.x + box.sx - pad);
          const y = Math.max(0, box.y + box.sy - pad);
          const width = Math.min(Math.max(box.width + pad * 2, 200), 1400, box.docW - x);
          const height = Math.min(box.height + pad * 2, 1600, box.docH - y);
          await page.screenshot({ path: file, fullPage: true, animations: "disabled", clip: { x, y, width, height } });
        }
        Object.assign(rec, { ok: true, file: path.basename(file), used, fixed: box.fixed });
      }
    } catch (err) {
      rec.error = err.message.split("\n")[0].slice(0, 200);
    }
    await context.close();
    results.push(rec);
  }
  const indexFile = path.join(outDir, "crops.json");
  const index = readJSON(indexFile, []);
  writeJSON(indexFile, [...index.filter((r) => !(r.phase === phase && results.some((n) => n.id === r.id))), ...results]);
  console.log(JSON.stringify(results.map(({ id, phase: ph, ok, used, error, note }) => ({ id, phase: ph, ok, used, error, note })), null, 2));
}
