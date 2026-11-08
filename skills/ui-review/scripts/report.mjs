#!/usr/bin/env node
// Builds the before/after report for a run.
//
//   node report.mjs --run RUN_DIR [--final iter-N] [--config FILE]
//
// Writes RUN_DIR/report/: index.html (interactive comparison), compare-<viewport>.png
// (side-by-side images for chat), changes.png (crop sheet), diff-<viewport>.png and summary.md.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { parseArgs, loadConfig, readJSON, writeJSON, die, listIterations } from "./lib/common.mjs";
import { readPng, writePng, padPng } from "./lib/images.mjs";

const args = parseArgs();
if (!args.run) die("usage: report.mjs --run RUN_DIR [--final iter-N]");
const cfg = loadConfig(args.config);
const runDir = path.resolve(args.run);
const iters = listIterations(runDir).filter((d) => fs.existsSync(path.join(d, "capture.json")));
if (!iters.length) die(`no captured iterations in ${runDir}`);
const baseDir = iters[0];
const finalDir = args.final ? path.join(runDir, args.final) : iters[iters.length - 1];
const outDir = path.join(runDir, "report");
fs.mkdirSync(outDir, { recursive: true });
const run = readJSON(path.join(runDir, "run.json"), {});
const viewports = Object.keys(cfg.viewports);
const rel = (p) => path.relative(outDir, p).split(path.sep).join("/");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function load(dir) {
  return {
    dir,
    name: path.basename(dir),
    capture: readJSON(path.join(dir, "capture.json")),
    gates: readJSON(path.join(dir, "gates.json"), null),
    personas: readJSON(path.join(dir, "jury/personas.json"), null),
    experts: readJSON(path.join(dir, "jury/experts.json"), null),
    pairwise: readJSON(path.join(dir, "jury/pairwise.json"), null),
    changes: readJSON(path.join(dir, "changes.json"), []),
    patch: fs.existsSync(path.join(dir, "changes.patch")) ? fs.readFileSync(path.join(dir, "changes.patch"), "utf8") : "",
  };
}
const all = iters.filter((d) => Number(path.basename(d).slice(5)) <= Number(path.basename(finalDir).slice(5))).map(load);
const base = all[0];
const fin = all[all.length - 1];
const sameState = base.dir === fin.dir;

// Comparison slots: every viewport, plus every extra view (capture.views) captured in both states.
const viewSlots = (it) => new Map((it.capture.views || []).filter((v) => v.ok).map((v) => [v.slot, v]));
const slots = [
  ...viewports.map((vp) => ({ id: vp, label: vp[0].toUpperCase() + vp.slice(1), mobile: vp === "mobile" })),
  ...[...viewSlots(fin).values()]
    .filter((v) => sameState || viewSlots(base).has(v.slot))
    .map((v) => ({ id: v.slot, label: `${v.viewport[0].toUpperCase() + v.viewport.slice(1)}: ${v.label || v.id}`, mobile: v.viewport === "mobile" })),
];

// Did the task definitions change between baseline and final? (capture.mjs stores them per iteration)
const taskDefs = (it) => readJSON(path.join(it.dir, "tasks.json"), null);
const taskChanges = (() => {
  const a = taskDefs(base);
  const b = taskDefs(fin);
  if (!a || !b || sameState) return [];
  const byId = new Map(a.map((t) => [t.id, JSON.stringify(t)]));
  return b.filter((t) => byId.get(t.id) !== JSON.stringify(t)).map((t) => (byId.has(t.id) ? `${t.id} (changed)` : `${t.id} (new)`)).concat(a.filter((t) => !b.some((x) => x.id === t.id)).map((t) => `${t.id} (removed)`));
})();

// ---------- pixel diff ----------
function diffImages(vp) {
  const a = path.join(base.dir, `${vp}-full.png`);
  const b = path.join(fin.dir, `${vp}-full.png`);
  if (sameState || !fs.existsSync(a) || !fs.existsSync(b)) return null;
  const ia = readPng(a);
  const ib = readPng(b);
  const w = Math.max(ia.width, ib.width);
  const h = Math.max(ia.height, ib.height);
  const pa = padPng(ia, w, h);
  const pb = padPng(ib, w, h);
  const out = new PNG({ width: w, height: h });
  const changed = pixelmatch(pa.data, pb.data, out.data, w, h, { threshold: 0.12, alpha: 0.25, diffColor: [214, 40, 40], includeAA: false });
  const file = path.join(outDir, `diff-${vp}.png`);
  writePng(file, out);
  return { file, changedPct: Math.round((changed / (w * h)) * 1000) / 10 };
}
const diffs = Object.fromEntries(slots.map((sl) => [sl.id, diffImages(sl.id)]));

// ---------- data for the page ----------
function samePixels(a, b) {
  try {
    const ia = readPng(a);
    const ib = readPng(b);
    if (ia.width !== ib.width || ia.height !== ib.height) return false;
    return pixelmatch(ia.data, ib.data, null, ia.width, ia.height, { threshold: 0.05 }) === 0;
  } catch {
    return false;
  }
}
const allChanges = all.slice(1).flatMap((it) => {
  const index = readJSON(path.join(it.dir, "crops", "crops.json"), []);
  return (it.changes || []).map((c) => {
    const rec = (phase) => index.find((r) => r.id === c.id && r.phase === phase) || null;
    const file = (phase, ext) => {
      const f = path.join(it.dir, "crops", `${c.id}-${phase}${ext}`);
      return fs.existsSync(f) ? f : null;
    };
    const before = file("before", ".png");
    const after = file("after", ".png");
    const ariaBefore = file("before", ".aria.txt");
    const ariaAfter = file("after", ".aria.txt");
    const aria = ariaBefore || ariaAfter ? { before: ariaBefore ? fs.readFileSync(ariaBefore, "utf8") : "", after: ariaAfter ? fs.readFileSync(ariaAfter, "utf8") : "" } : null;
    const ariaChanged = !!aria && aria.before !== aria.after;
    const identical = !!before && !!after && samePixels(before, after);
    const notes = [];
    for (const phase of ["before", "after"]) {
      const r = rec(phase);
      if (!c.selector && !c.anchor && !c.setup) continue;
      if (!r) notes.push(`No ${phase} crop was taken.`);
      else if (!r.ok) notes.push(`${phase[0].toUpperCase() + phase.slice(1)} crop failed: ${r.error}`);
      else if (r.used === "anchor") notes.push(`${phase[0].toUpperCase() + phase.slice(1)}: the element did not exist, the crop shows the area around ${c.anchor}.`);
      else if (r.used === "viewport") notes.push(`${phase[0].toUpperCase() + phase.slice(1)}: ${r.note}.`);
    }
    if (identical) notes.push(ariaChanged ? "The crops look the same: the change is in the accessibility tree (see below)." : "The crops look the same in this state. The change needs an interaction (focus, click) or a screen reader to show.");
    return { ...c, iteration: it.name, before, after, aria: ariaChanged ? aria : null, identical, notes, width: rec("after")?.width || rec("before")?.width };
  });
});

const gateRows = (() => {
  const bg = base.gates?.gates || [];
  const fg = fin.gates?.gates || [];
  const ids = [...new Set([...bg.map((g) => g.id), ...fg.map((g) => g.id)])];
  return ids.map((id) => ({ id, before: bg.find((g) => g.id === id), after: fg.find((g) => g.id === id) }));
})();

function scoreTable() {
  const key = (j) => `${j.persona}|${j.provider}`;
  const b = new Map((base.personas?.jurors || []).map((j) => [key(j), j]));
  const f = new Map((fin.personas?.jurors || []).map((j) => [key(j), j]));
  return [...new Set([...b.keys(), ...f.keys()])].map((k) => ({ key: k, before: b.get(k), after: f.get(k) }));
}

const fmt = (v) => (v === null || v === undefined ? "–" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
// Count only gates that were evaluated in both states, so "before" and "after" use the same set.
const comparable = (() => {
  if (sameState) return new Set((base.gates?.gates || []).filter((x) => x.status !== "skip").map((x) => x.id));
  const b = new Set((base.gates?.gates || []).filter((x) => x.status !== "skip").map((x) => x.id));
  return new Set((fin.gates?.gates || []).filter((x) => x.status !== "skip" && b.has(x.id)).map((x) => x.id));
})();
const passed = (g) => (g?.gates || []).filter((x) => comparable.has(x.id) && x.status === "pass").length;
const counted = (g) => (g?.gates || []).filter((x) => comparable.has(x.id)).length;
const finalPass = !!fin.gates?.pass;
const iterationsDone = all.length - 1;
const remaining = (fin.experts?.findings || []).filter((f) => f.severity >= 2);
const waivers = readJSON(path.join(runDir, "waivers.json"), []);

const verdict = sameState
  ? `Audit only: ${passed(base.gates)} of ${counted(base.gates)} gates pass.`
  : `${finalPass ? "All gates pass" : `${passed(fin.gates)} of ${counted(fin.gates)} gates pass`} after ${iterationsDone} iteration${iterationsDone === 1 ? "" : "s"} (before: ${passed(base.gates)} of ${counted(base.gates)})${fin.pairwise ? `, blind comparison: ${fin.pairwise.verdict}` : ""}.`;
const borderline = (fin.gates?.gates || []).filter((g) => g.borderline).map((g) => g.label);

// ---------- HTML ----------
function imgPair(vp) {
  // vp is a slot id: a viewport name or <viewport>-view-<id>.
  const a = path.join(base.dir, `${vp}-full.png`);
  const b = path.join(fin.dir, `${vp}-full.png`);
  return { a: fs.existsSync(a) ? rel(a) : null, b: fs.existsSync(b) ? rel(b) : null, d: diffs[vp] ? rel(diffs[vp].file) : null, pct: diffs[vp]?.changedPct };
}

const statusMark = (g) =>
  (!g ? "" : g.status === "pass" ? '<span class="st pass">pass</span>' : g.status === "fail" ? '<span class="st fail">fail</span>' : '<span class="st skip">n/a</span>') +
  (g?.borderline ? ' <span class="st skip" title="Within one standard error of the target: not a reliable result">borderline</span>' : "");
const gateValue = (g) => (g ? `${fmt(g.value)}${g.se ? ` ±${fmt(g.se)}` : ""}` : "–");
const ariaPre = (txt) => `<pre class="aria">${esc(txt || "(nothing)")}</pre>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI review: ${esc(base.capture.url)}</title>
<style>
:root {
  --canvas: #dfe2e6;
  --paper: #ffffff;
  --ink: #16202a;
  --muted: #56606b;
  --rule: #c5cad1;
  --before: #5d636b;
  --after: #0f5fd7;
  --pass: #1a7f45;
  --fail: #c0362c;
  --skip: #7a6a2a;
  --radius-panel: 10px;
  --radius-chip: 4px;
}
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; background: var(--canvas); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-variant-numeric: tabular-nums; }
a { color: var(--after); }
:focus-visible { outline: 3px solid var(--after); outline-offset: 2px; }
.wrap { max-width: 1480px; margin: 0 auto; padding: 28px 28px 80px; }
header.top { display: grid; gap: 6px; margin-bottom: 22px; }
header.top .url { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
h1 { font-size: 28px; line-height: 1.2; margin: 0; font-weight: 650; letter-spacing: -0.01em; max-width: 60ch; }
h2 { font-size: 20px; margin: 44px 0 14px; font-weight: 650; }
h3 { font-size: 15px; margin: 0; font-weight: 650; }
.meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px 18px; }

/* Comparison viewer: the one loud element. */
.viewer { background: var(--paper); border-radius: var(--radius-panel); padding: 14px; }
.controls { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; margin-bottom: 12px; }
.seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; }
.seg button { font: inherit; font-size: 14px; border: 0; background: transparent; color: var(--ink); padding: 6px 14px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--rule); }
.seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
.legend { font-size: 13px; color: var(--muted); }
.legend b.b { color: var(--before); }
.legend b.a { color: var(--after); }
.stage { max-height: 78vh; overflow: auto; border: 1px solid var(--rule); border-radius: 6px; background: #f4f5f7; }
.sbs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.sbs figure { margin: 0; border-right: 1px solid var(--rule); }
.sbs figure:last-child { border-right: 0; }
.sbs figcaption, .cap { position: sticky; top: 0; z-index: 2; font-size: 13px; font-weight: 600; padding: 6px 10px; color: #fff; }
.cap.b, .sbs figure:first-child figcaption { background: var(--before); }
.cap.a, .sbs figure:last-child figcaption { background: var(--after); }
.stage img { display: block; width: 100%; height: auto; }
.mobile .sbs { grid-template-columns: repeat(2, minmax(0, 420px)); justify-content: center; }
.slider { position: relative; margin: 0 auto; }
.mobile .slider, .mobile .diff { max-width: 420px; }
.slider .over { position: absolute; inset: 0; overflow: hidden; clip-path: inset(0 calc(100% - var(--pos, 50%)) 0 0); }
.slider .handle { position: absolute; top: 0; bottom: 0; left: var(--pos, 50%); width: 3px; background: var(--after); transform: translateX(-1px); pointer-events: none; }
.reveal { position: sticky; top: 0; z-index: 3; display: block; width: 100%; margin: 0; accent-color: var(--after); background: #fff; padding: 8px 0; }
.diff { margin: 0 auto; }
.diff p { margin: 8px 10px; font-size: 13px; color: var(--muted); }
[hidden] { display: none !important; }

/* Changes */
.changes { display: grid; gap: 14px; }
.change { background: var(--paper); border-radius: var(--radius-panel); padding: 16px 18px; display: grid; gap: 10px; }
.change .head { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
.change .id { color: var(--muted); font-size: 13px; }
.refs { display: flex; flex-wrap: wrap; gap: 6px; }
.ref { font-size: 12px; padding: 2px 7px; border-radius: var(--radius-chip); background: #eef1f5; color: #2c3640; border: 1px solid #d9dee5; }
.change p { margin: 0; max-width: 80ch; }
.files { font-size: 13px; color: var(--muted); }
.crops { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.crops figure { margin: 0; border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; background: #f4f5f7; }
.crops img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.crops .none { padding: 18px; color: var(--muted); font-size: 13px; }
.cropnotes { margin: 0; padding-left: 18px; color: var(--skip); font-size: 13px; }
.ariadiff { padding: 6px 0 0; margin: 0; }
pre.aria { max-height: 320px; margin: 6px 0 0; white-space: pre-wrap; }

/* Tables */
.panel { background: var(--paper); border-radius: var(--radius-panel); padding: 6px 4px; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e7e9ec; vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: 13px; }
tr:last-child td { border-bottom: 0; }
td.num { text-align: right; white-space: nowrap; }
.st { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 7px; border-radius: var(--radius-chip); }
.st.pass { color: var(--pass); background: #e3f3ea; }
.st.fail { color: var(--fail); background: #fbe7e5; }
.st.skip { color: var(--skip); background: #f4efdc; }
.up { color: var(--pass); }
.down { color: var(--fail); }
details { background: var(--paper); border-radius: var(--radius-panel); padding: 10px 16px; margin-top: 10px; }
summary { cursor: pointer; font-weight: 600; }
pre { overflow: auto; font-size: 12px; line-height: 1.45; background: #f4f5f7; padding: 12px; border-radius: 6px; max-height: 60vh; }
.add { color: #116d38; } .del { color: #a3271e; } .hunk { color: #6b4fa1; }
.note { color: var(--muted); font-size: 13px; max-width: 90ch; }
@media (max-width: 760px) {
  .wrap { padding: 16px 12px 60px; }
  .sbs, .crops { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <span class="url">${esc(base.capture.url)}</span>
  <h1>${esc(verdict)}</h1>
  <div class="meta">
    <span>Run ${esc(path.basename(runDir))}</span>
    <span>Stack: ${esc((fin.capture.stack?.detected || []).map((s) => s.name).join(", ") || "no framework detected")}</span>
    ${fin.pairwise ? `<span>Blind comparison, last iteration: ${esc(fin.pairwise.verdict)} (${fin.pairwise.tally.after} for new, ${fin.pairwise.tally.before} for old, ${fin.pairwise.tally.tie} tie)</span>` : ""}
    ${run.mode ? `<span>Mode: ${esc(run.mode)}</span>` : ""}
    ${cfg.jury.audience ? `<span>Audience: ${esc(cfg.jury.audience)}</span>` : ""}
  </div>
  ${borderline.length ? `<p class="note">Within noise (closer to the target than one standard error): ${esc(borderline.join(", "))}. Treat these results as uncertain.</p>` : ""}
  ${taskChanges.length ? `<p class="note">Task definitions changed between ${esc(base.name)} and ${esc(fin.name)}: ${esc(taskChanges.join(", "))}. Compare the task results with care (tasks.json in each iteration).</p>` : ""}
</header>

<section class="viewer" aria-label="Before and after comparison">
  <div class="controls">
    <div class="seg" role="group" aria-label="Viewport">
      ${slots.map((sl, i) => `<button type="button" data-vp="${sl.id}" aria-pressed="${i === 0}">${esc(sl.label)}</button>`).join("")}
    </div>
    <div class="seg" role="group" aria-label="Comparison mode">
      <button type="button" data-mode="sbs" aria-pressed="true">Side by side</button>
      <button type="button" data-mode="slider" aria-pressed="false"${sameState ? " disabled" : ""}>Slider</button>
      <button type="button" data-mode="diff" aria-pressed="false"${sameState ? " disabled" : ""}>Difference</button>
    </div>
    <span class="legend"><b class="b">Before</b> is ${esc(base.name)}, <b class="a">after</b> is ${esc(fin.name)}. Full-page screenshots.</span>
  </div>
  ${slots
    .map((sl, i) => {
      const vp = sl.id;
      const p = imgPair(vp);
      return `<div class="vp ${sl.mobile ? "mobile" : ""}" data-vp="${vp}"${i ? " hidden" : ""}>
    <div class="stage" data-mode="sbs"><div class="sbs">
      <figure><figcaption>Before</figcaption>${p.a ? `<img src="${p.a}" alt="${vp} before">` : ""}</figure>
      <figure><figcaption>After</figcaption>${p.b ? `<img src="${p.b}" alt="${vp} after">` : ""}</figure>
    </div></div>
    <div class="stage" data-mode="slider" hidden>
      <input class="reveal" type="range" min="0" max="100" value="50" aria-label="Before on the left of the line, after on the right">
      <div class="slider" style="--pos:50%">
      <img src="${p.b ?? ""}" alt="${vp} after">
      <div class="over"><img src="${p.a ?? ""}" alt="${vp} before"></div>
      <div class="handle"></div>
    </div></div>
    <div class="stage" data-mode="diff" hidden><div class="diff">
      <p>Red pixels changed between before and after${p.pct !== undefined ? ` (${p.pct} % of the page area)` : ""}. Content that moved shows up as changed too.</p>
      ${p.d ? `<img src="${p.d}" alt="${vp} pixel difference">` : "<p>No difference image.</p>"}
    </div></div>
  </div>`;
    })
    .join("\n")}
</section>

<h2>Changes (${allChanges.length})</h2>
${
  allChanges.length
    ? `<div class="changes">${allChanges
        .map(
          (c) => `<article class="change">
  <div class="head"><h3>${esc(c.title)}</h3><span class="id">${esc(c.id)}, ${esc(c.iteration)}${c.viewport ? `, ${esc(c.viewport)}` : ""}</span></div>
  ${c.why ? `<p>${esc(c.why)}</p>` : ""}
  ${c.what ? `<p><strong>Changed:</strong> ${esc(c.what)}</p>` : ""}
  <div class="refs">${[...(c.frameworks || []), ...(c.findings || [])].map((r) => `<span class="ref">${esc(r)}</span>`).join("")}</div>
  ${c.files?.length ? `<div class="files">Files: ${c.files.map(esc).join(", ")}</div>` : ""}
  ${c.width && c.width !== cfg.viewports[c.viewport || "desktop"]?.width ? `<div class="files">Cropped at ${esc(c.width)} px width.</div>` : ""}
  ${
    c.before || c.after
      ? `<div class="crops">
    <figure><figcaption class="cap b">Before</figcaption>${c.before ? `<img src="${rel(c.before)}" alt="Before: ${esc(c.title)}">` : '<div class="none">No before crop.</div>'}</figure>
    <figure><figcaption class="cap a">After</figcaption>${c.after ? `<img src="${rel(c.after)}" alt="After: ${esc(c.title)}">` : '<div class="none">No after crop.</div>'}</figure>
  </div>`
      : c.selector || c.anchor || c.setup
        ? ""
        : '<p class="files">No element selector: see the full-page comparison above.</p>'
  }
  ${c.notes.length ? `<ul class="cropnotes">${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
  ${c.aria ? `<details class="ariadiff"><summary>Accessibility tree of the element, before and after</summary><div class="crops"><div>${ariaPre(c.aria.before)}</div><div>${ariaPre(c.aria.after)}</div></div></details>` : ""}
</article>`,
        )
        .join("\n")}</div>`
    : '<p class="note">No changes were made in this run (audit mode or nothing to fix).</p>'
}

<h2>Gates</h2>
<div class="panel"><table>
<thead><tr><th>Gate</th><th>Target</th><th class="num">Before</th><th></th><th class="num">After</th><th></th></tr></thead>
<tbody>
${gateRows
  .map(
    (r) => `<tr><td>${esc((r.after || r.before).label)}</td><td>${esc((r.after || r.before).target)}</td><td class="num">${esc(gateValue(r.before))}</td><td>${statusMark(r.before)}</td><td class="num">${sameState ? "" : esc(gateValue(r.after))}</td><td>${sameState ? "" : statusMark(r.after)}</td></tr>`,
  )
  .join("\n")}
</tbody></table></div>

<h2>Jury</h2>
<p class="note">${(fin.personas?.rounds || 1) > 1 ? `The final iteration was rated in ${fin.personas.rounds} rounds; each row shows the mean of its rounds. ` : ""}Each row is an independent headless session (provider and persona). "requested" or "unverified" next to a model means the CLI did not confirm that value. UEQ-S scales run from −3 to +3, SUS from 0 to 100, VisAWI-S from 1 to 7. LLM ratings are a proxy for user experience, not a substitute for testing with people.</p>
<div class="panel"><table>
<thead><tr><th>Persona</th><th>Provider</th><th class="num">Pragmatic</th><th class="num">Hedonic</th><th class="num">SUS</th><th class="num">VisAWI</th></tr></thead>
<tbody>
${scoreTable()
  .map((r) => {
    const j = r.after || r.before;
    const cell = (k) => {
      const b = r.before?.scores?.[k];
      const a = r.after?.scores?.[k];
      if (sameState || !r.after) return esc(fmt(b));
      const delta = typeof a === "number" && typeof b === "number" ? a - b : null;
      return `${esc(fmt(b))} → <strong>${esc(fmt(a))}</strong>${delta ? ` <span class="${delta > 0 ? "up" : "down"}">(${delta > 0 ? "+" : ""}${fmt(Math.round(delta * 100) / 100)})</span>` : ""}`;
    };
    return `<tr><td>${esc(j.persona)}</td><td>${esc(j.provider)}${j.model ? `<br><span class="note">${esc(j.model)}</span>` : ""}${j.advisory ? '<br><span class="note">advisory, not counted</span>' : ""}${j.ok === false ? `<br><span class="note">failed: ${esc(j.error)}</span>` : ""}</td><td class="num">${cell("ueqsPragmatic")}</td><td class="num">${cell("ueqsHedonic")}</td><td class="num">${cell("sus")}</td><td class="num">${cell("visawi")}</td></tr>`;
  })
  .join("\n")}
</tbody></table></div>
${(fin.personas?.jurors || [])
  .filter((j) => j.ok)
  .map((j) => `<details><summary>${esc(j.persona)} (${esc(j.provider)}): rationale${sameState ? "" : " after the changes"}</summary><p><strong>Pragmatic.</strong> ${esc(j.rationale?.pragmatic)}</p><p><strong>Hedonic.</strong> ${esc(j.rationale?.hedonic)}</p><p><strong>Visual.</strong> ${esc(j.rationale?.visual)}</p>${(j.top_issues || []).length ? `<ul>${j.top_issues.map((i) => `<li>[${esc(i.severity)}] ${esc(i.title)}: ${esc(i.evidence)}</li>`).join("")}</ul>` : ""}</details>`)
  .join("\n")}

<h2>Open findings (${remaining.length})</h2>
${
  remaining.length
    ? `<div class="panel"><table><thead><tr><th class="num">Severity</th><th>Finding</th><th>Framework</th><th>Suggested fix</th></tr></thead><tbody>${remaining
        .map((f) => `<tr><td class="num">${esc(f.severity)}</td><td>${esc(f.title)}<br><span class="note">${esc(f.evidence)}</span></td><td>${esc(f.framework)}</td><td>${esc(f.fix)}</td></tr>`)
        .join("")}</tbody></table></div>`
    : '<p class="note">No expert finding with severity 2 or higher is open.</p>'
}
${waivers.length ? `<h2>Waived findings (${waivers.length})</h2><div class="panel"><table><thead><tr><th>Finding</th><th>Reason</th></tr></thead><tbody>${waivers.map((w) => `<tr><td>${esc(w.title)}</td><td>${esc(w.reason)}</td></tr>`).join("")}</tbody></table></div>` : ""}

${
  all.slice(1).some((it) => it.patch)
    ? `<h2>Code changes</h2>${all
        .slice(1)
        .filter((it) => it.patch)
        .map(
          (it) =>
            `<details><summary>${esc(it.name)}: ${it.patch.split("\n").filter((l) => l.startsWith("diff --git")).length} files</summary><pre>${it.patch
              .split("\n")
              .map((l) => {
                const e = esc(l);
                return l.startsWith("+") && !l.startsWith("+++") ? `<span class="add">${e}</span>` : l.startsWith("-") && !l.startsWith("---") ? `<span class="del">${e}</span>` : l.startsWith("@@") ? `<span class="hunk">${e}</span>` : e;
              })
              .join("\n")}</pre></details>`,
        )
        .join("\n")}`
    : ""
}
</div>
<script>
const state = { vp: ${JSON.stringify(viewports[0])}, mode: "sbs" };
function render() {
  document.querySelectorAll(".vp").forEach((el) => (el.hidden = el.dataset.vp !== state.vp));
  document.querySelectorAll(".vp .stage").forEach((el) => (el.hidden = el.dataset.mode !== state.mode));
  document.querySelectorAll("[data-vp][aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vp === state.vp)));
  document.querySelectorAll("[data-mode][aria-pressed]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
}
document.querySelectorAll("button[data-vp]").forEach((b) => b.addEventListener("click", () => { state.vp = b.dataset.vp; render(); }));
document.querySelectorAll("button[data-mode]").forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.mode; render(); }));
document.querySelectorAll(".reveal").forEach((r) => r.addEventListener("input", () => r.nextElementSibling.style.setProperty("--pos", r.value + "%")));
</script>
</body>
</html>`;
fs.writeFileSync(path.join(outDir, "index.html"), html);

// ---------- static images for chat ----------
const browser = await chromium.launch();
async function renderPng(file, body, width) {
  const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1 });
  const toData = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
  await page.setContent(
    `<!doctype html><html><head><style>body{margin:0;background:#dfe2e6;font:600 16px system-ui,sans-serif;color:#16202a}.row{display:grid;gap:14px;padding:14px}.cap{color:#fff;padding:6px 10px}.b{background:#5d636b}.a{background:#0f5fd7}figure{margin:0;background:#fff}img{display:block;width:100%}h1{font-size:18px;margin:14px 14px 0}p{margin:4px 14px 0;font-weight:400;font-size:14px}</style></head><body>${body(toData)}</body></html>`,
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}
const outputs = { html: path.join(outDir, "index.html"), compare: {}, changes: null, diff: {} };
if (!sameState) {
  for (const sl of slots) {
    const vp = sl.id;
    const a = path.join(base.dir, `${vp}.png`);
    const b = path.join(fin.dir, `${vp}.png`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
    const file = path.join(outDir, `compare-${vp}.png`);
    const width = sl.mobile ? 900 : 1600;
    await renderPng(
      file,
      (d) => `<div class="row" style="grid-template-columns:1fr 1fr"><figure><div class="cap b">Before (${esc(base.name)})</div><img src="${d(a)}"></figure><figure><div class="cap a">After (${esc(fin.name)})</div><img src="${d(b)}"></figure></div>`,
      width,
    );
    outputs.compare[vp] = file;
    if (diffs[vp]) outputs.diff[vp] = diffs[vp].file;
  }
  // One image per change, so each fits on a screen in chat.
  const withCrops = allChanges.filter((c) => c.before || c.after || c.aria);
  outputs.changes = [];
  fs.rmSync(path.join(outDir, "changes"), { recursive: true, force: true });
  for (const c of withCrops) {
    const file = path.join(outDir, "changes", `${c.id}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await renderPng(
      file,
      (d) =>
        `<h1>${esc(c.id)}: ${esc(c.title)}</h1>${c.why ? `<p>${esc(c.why)}</p>` : ""}${c.what ? `<p><b>Changed:</b> ${esc(c.what)}</p>` : ""}${c.notes.map((n) => `<p style="color:#7a6a2a">${esc(n)}</p>`).join("")}${
          c.before || c.after
            ? `<div class="row" style="grid-template-columns:1fr 1fr"><figure><div class="cap b">Before</div>${c.before ? `<img src="${d(c.before)}" style="width:auto;max-width:100%;max-height:900px;object-fit:contain">` : ""}</figure><figure><div class="cap a">After</div>${c.after ? `<img src="${d(c.after)}" style="width:auto;max-width:100%;max-height:900px;object-fit:contain">` : ""}</figure></div>`
            : ""
        }${
          c.aria
            ? `<div class="row" style="grid-template-columns:1fr 1fr"><figure><div class="cap b">Before: accessibility tree</div><pre style="margin:0;padding:10px;font:12px/1.4 monospace;white-space:pre-wrap">${esc(c.aria.before.slice(0, 2500))}</pre></figure><figure><div class="cap a">After: accessibility tree</div><pre style="margin:0;padding:10px;font:12px/1.4 monospace;white-space:pre-wrap">${esc(c.aria.after.slice(0, 2500))}</pre></figure></div>`
            : ""
        }`,
      1400,
    );
    outputs.changes.push(file);
  }
}
await browser.close();

// ---------- markdown summary ----------
const md = [];
md.push(`# UI review: ${base.capture.url}`, "", verdict, "");
if (!sameState) for (const [vp, f] of Object.entries(outputs.compare)) md.push(`![${vp} before and after](${path.basename(f)})`, "");
md.push(sameState ? "| Gate | Target | Value |" : "| Gate | Target | Before | After |", sameState ? "| --- | --- | --- |" : "| --- | --- | --- | --- |");
for (const r of gateRows) {
  const g = r.after || r.before;
  const b = `${fmt(r.before?.value)}${r.before ? ` (${r.before.status})` : ""}`;
  md.push(sameState ? `| ${g.label} | ${g.target} | ${b} |` : `| ${g.label} | ${g.target} | ${b} | ${gateValue(r.after)} (${r.after?.status ?? "n/a"}${r.after?.borderline ? ", borderline" : ""}) |`);
}
if (borderline.length) md.push("", `Within noise: ${borderline.join(", ")}.`);
if (taskChanges.length) md.push("", `Task definitions changed after the baseline: ${taskChanges.join(", ")}.`);
if (allChanges.length) {
  md.push("", "## Changes", "");
  for (const c of allChanges) md.push(`- **${c.id} ${c.title}**${c.before || c.after || c.aria ? ` ([image](changes/${c.id}.png))` : " (no image)"}${c.notes.length ? ` _${c.notes.join(" ")}_` : ""} (${c.iteration}): ${c.why || ""} ${[...(c.frameworks || [])].length ? `[${c.frameworks.join("; ")}]` : ""}${c.files?.length ? ` Files: ${c.files.join(", ")}` : ""}`);
}
if (remaining.length) {
  md.push("", "## Open findings", "");
  for (const f of remaining) md.push(`- [${f.severity}] ${f.title} (${f.framework})`);
}
fs.writeFileSync(path.join(outDir, "summary.md"), md.join("\n") + "\n");
outputs.summary = path.join(outDir, "summary.md");
writeJSON(path.join(outDir, "outputs.json"), outputs);
console.log(JSON.stringify(outputs, null, 2));
