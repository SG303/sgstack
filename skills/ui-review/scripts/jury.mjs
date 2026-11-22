#!/usr/bin/env node
// Runs independent LLM jurors through the claude / codex / opencode CLIs.
//
//   node jury.mjs personas --iter DIR [--config FILE] [--append]   (--append adds a repeat round)
//   node jury.mjs experts  --iter DIR [--config FILE] [--waivers FILE]
//   node jury.mjs pairwise --iter DIR --before DIR [--config FILE] [--tag NAME]
//   node jury.mjs providers                      # list usable providers
//   --dry-run (any mode) writes the prompts to DIR/jury/raw/ without calling a juror CLI
//
// Each juror is a fresh headless session with no project context. Raw answers go to
// DIR/jury/raw/, the aggregate to DIR/jury/<mode>.json.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { parseArgs, loadConfig, readJSON, writeJSON, die, log, mean, round, SKILL_DIR } from "./lib/common.mjs";
import { tilePngInfo } from "./lib/images.mjs";

const args = parseArgs();
const mode = args._[0];
const cfg = loadConfig(args.config);
const Q = readJSON(path.join(SKILL_DIR, "data/questionnaires.json"));

const PROVIDERS = {
  claude: { bin: "claude", attach: "read" },
  codex: { bin: "codex", attach: "flag" },
  opencode: { bin: "opencode", attach: "flag" },
};

function available(bin) {
  return spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).status === 0;
}

function resolveProviders() {
  const wanted = args.providers
    ? String(args.providers).split(",")
    : cfg.jury.providers === "auto"
      ? ["claude", "codex", ...(cfg.jury.opencode ? ["opencode"] : [])]
      : cfg.jury.providers;
  const list = wanted.filter((p) => PROVIDERS[p] && available(PROVIDERS[p].bin));
  if (!list.length) die(`no juror CLI available (wanted: ${wanted.join(", ")}). Install claude, codex or opencode, or run the jurors as subagents (see SKILL.md).`);
  return list;
}

if (mode === "providers") {
  console.log(JSON.stringify(resolveProviders()));
  process.exit(0);
}
if (!["personas", "experts", "pairwise"].includes(mode)) die("usage: jury.mjs personas|experts|pairwise|providers --iter DIR");
if (!args.iter) die("--iter is required");
const iterDir = path.resolve(args.iter);
const capture = readJSON(path.join(iterDir, "capture.json"));
const juryDir = path.join(iterDir, "jury");
const rawDir = path.join(juryDir, "raw");
const tileDir = path.join(juryDir, "tiles");
fs.mkdirSync(rawDir, { recursive: true });
const providers = resolveProviders();

// ---------- evidence ----------

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? "").toString());
}

function taskLog(c, dir) {
  if (!c.tasks?.length) return "(No scripted tasks were run. Judge from the screenshots: imagine trying to find the main offer and take the primary action.)";
  return c.tasks
    .map((t) => {
      const steps = t.steps
        .map((s) => `  ${s.n}. ${s.action} ${s.target ?? ""}: ${s.ok ? "ok" : `FAILED (${s.error})`}${s.accessibleLocator === false ? " [not reachable by accessible role/label; a screen reader user would struggle here]" : ""}`)
        .join("\n");
      return `Task "${t.id}" (${t.viewport}): ${t.goal}\n  Result: ${t.success ? "completed" : "NOT completed"}\n${steps}`;
    })
    .join("\n\n");
}

function taskImages(c, dir, limit) {
  const files = [];
  for (const t of c.tasks || []) {
    const tdir = path.join(dir, t.screenshots);
    const n = t.steps.length;
    // First, last and the failing step are the most informative.
    const picks = [...new Set([0, n, ...t.steps.filter((s) => !s.ok).map((s) => s.n)])];
    for (const i of picks) {
      const f = path.join(tdir, `${i}.png`);
      if (fs.existsSync(f)) files.push({ file: f, label: `task "${t.id}" after step ${i}${i === 0 ? " (start)" : ""}` });
    }
  }
  return files.slice(0, limit);
}

function screenshotSet(dir, viewports, { tiles = 2, dpr = 1 } = {}) {
  const images = [];
  const truncated = [];
  const tdir = path.join(dir, "jury", "tiles");
  for (const vp of viewports) {
    const fold = path.join(dir, `${vp}.png`);
    if (fs.existsSync(fold)) images.push({ file: fold, label: `${vp}, first screen` });
    const info = tilePngInfo(path.join(dir, `${vp}-full.png`), tdir, { tileHeight: (vp === "mobile" ? 1400 : 1600) * dpr, maxTiles: tiles });
    info.files.forEach((f, i) => images.push({ file: f, label: `${vp}, full page part ${i + 1}${info.totalTiles > 1 ? ` of ${info.totalTiles}` : ""}` }));
    if (info.truncated) truncated.push(`${vp} (first ${info.files.length} of ${info.totalTiles} sections)`);
  }
  return { images, truncated };
}

function truncationNote(truncated) {
  if (!truncated.length) return "";
  return `\nNote: full-page screenshots were capped (${truncated.join("; ")}). Do not report elements further down the page (such as a footer or imprint) as missing.`;
}

// First screens of the extra views (tabs, panels) captured for the given viewports.
function viewShots(dir, viewports, label = "") {
  const c = readJSON(path.join(dir, "capture.json"), {});
  return (c.views || [])
    .filter((v) => v.ok && viewports.includes(v.viewport))
    .map((v) => ({ file: path.join(dir, `${v.slot}.png`), label: `${label}${v.viewport}, view "${v.label || v.id}", first screen` }))
    .filter((im) => fs.existsSync(im.file));
}

const audienceText = () => cfg.jury.audience || "not stated; infer it from the page";
const profileText = () => {
  const p = cfg.profile || {};
  const parts = [`kind: ${p.kind || "auto"}`, `density: ${p.density || "standard"}`];
  if (p.notes) parts.push(`notes: ${p.notes}`);
  return parts.join("; ");
};

function imageList(images, provider) {
  if (!images.length) return "No screenshots provided (you navigate by screen reader and keyboard only).";
  if (PROVIDERS[provider].attach === "read")
    return "Open every image below with your Read tool before answering:\n" + images.map((im, i) => `${i + 1}. ${im.file} (${im.label})`).join("\n");
  return "The images are attached in this order:\n" + images.map((im, i) => `${i + 1}. ${path.basename(im.file)} (${im.label})`).join("\n");
}

function measurements(c) {
  const d = c.viewports.desktop || Object.values(c.viewports)[0];
  const m = c.viewports.mobile;
  const lines = [];
  lines.push(`Summary: ${JSON.stringify(c.summary)}`);
  lines.push(`axe-core violations (${c.axe.length}):`);
  for (const v of c.axe) lines.push(`- [${v.impact}] ${v.id} (WCAG ${v.wcag.join(", ") || "best practice"}; ${v.nodes} nodes; ${v.viewports.join("+")}): ${v.help}. Examples: ${v.targets.map((t) => t.target).join(" | ")}`);
  if (d?.focus) {
    lines.push(`Keyboard focus walk: ${d.focus.reached} stops; without visible indicator: ${d.focus.withoutIndicator.length}; obscured: ${d.focus.obscured.length}.`);
    if (d.focus.withoutIndicator.length) lines.push(`  No indicator: ${d.focus.withoutIndicator.slice(0, 8).map((s) => `${s.name || s.selector}`).join("; ")}`);
    if (d.focus.obscured.length) lines.push(`  Obscured: ${d.focus.obscured.slice(0, 5).map((s) => `${s.selector} by ${s.by}`).join("; ")}`);
  }
  const ck = (v) => v?.checks;
  const cnf = ck(d)?.clickableNotFocusable || [];
  if (cnf.length) lines.push(`Clickable but not keyboard-focusable: ${cnf.map((x) => `${x.selector} "${x.text}"`).join("; ")}`);
  if (c.reflow320) lines.push(`Reflow at 320 CSS px: ${c.reflow320.horizontalScroll ? `horizontal scrolling (content ${c.reflow320.scrollWidth}px wide), offenders: ${c.reflow320.offenders.map((o) => o.selector).join("; ")}` : "ok"}`);
  if (m) {
    lines.push(`Mobile viewport meta: ${ck(m).metaViewport ?? "MISSING"}`);
    const st = ck(m).smallTargets;
    if (st.length) lines.push(`Mobile targets under 24px (WCAG 2.5.8, excluding inline links): ${st.length}, e.g. ${st.slice(0, 5).map((t) => `"${t.text}" ${t.width}x${t.height}`).join("; ")}`);
  }
  const small = ck(d)?.smallText || [];
  if (small.length) lines.push(`Text under 12px: ${small.slice(0, 6).map((t) => `"${t.text}" ${t.fontSize}`).join("; ")}`);
  if (ck(d)?.longLines.length) lines.push(`Paragraphs over ~90 characters per line: ${ck(d).longLines.length}`);
  if (ck(d)?.imgNoDims.length) lines.push(`Images without width/height (CLS risk): ${ck(d).imgNoDims.length}`);
  if (d) {
    lines.push(`Headings: ${ck(d).headings.map((h) => `h${h.level} "${h.text}"`).join(", ") || "none"}; h1 count ${ck(d).h1Count}; skipped levels: ${ck(d).skippedHeadingLevels.join(", ") || "none"}`);
    lines.push(`Landmarks: ${JSON.stringify(ck(d).landmarks)}; lang="${ck(d).lang}"; title="${ck(d).title}"`);
    if (ck(d).readability) lines.push(`Readability: ${JSON.stringify(ck(d).readability)}`);
  }
  if (c.cwv) lines.push(`Lab Web Vitals (${c.cwv.profile}, CPU x${c.cwv.throttling?.cpuSlowdown}): ${JSON.stringify({ lcpMs: c.cwv.lcpMs, lcpElement: c.cwv.lcpElement, cls: c.cwv.cls, tbtMs: c.cwv.tbtMs })}`);
  if (c.darkMode) lines.push(`Dark mode contrast violations: ${c.darkMode.contrastViolations.reduce((s, v) => s + v.nodes, 0)}`);
  if (c.consoleErrors.length) lines.push(`Console errors: ${c.consoleErrors.slice(0, 5).join(" | ")}`);
  return lines.join("\n");
}

function designSystemGuidance(c) {
  const text = fs.readFileSync(path.join(SKILL_DIR, "references/design-systems.md"), "utf8");
  const names = (c.stack?.detected || []).map((s) => s.name.toLowerCase());
  if (!names.length) names.push("static");
  const sections = text.split(/\n(?=## )/).slice(1);
  const picked = sections.filter((s) => {
    const m = s.match(/^Matches:\s*(.+)$/m);
    if (!m) return false;
    const aliases = m[1].split(",").map((a) => a.trim().toLowerCase());
    return aliases.some((a) => names.some((n) => n.includes(a) || a.includes(n.split(" ")[0])));
  });
  return picked.length ? `## Guidance for the detected stack\n\n${picked.join("\n")}` : "";
}

function aria(dir, max) {
  const f = path.join(dir, "aria-desktop.txt");
  if (!fs.existsSync(f)) return "";
  const t = fs.readFileSync(f, "utf8");
  return t.length > max ? t.slice(0, max) + "\n... (truncated)" : t;
}

// ---------- questionnaires (randomised item order and pole side, to counter position bias) ----------

function shuffle(xs, rnd = Math.random) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionnaires({ includeVisawi = true } = {}) {
  const ueqs = shuffle(Q.ueqs.items).map((it) => ({ ...it, flipped: Math.random() < 0.5 }));
  const lines = [];
  lines.push("### Questionnaire 1 (UEQ-S)");
  lines.push("For each pair of opposite terms, rate the website from 1 to 7: 1 means the LEFT term fully applies, 7 means the RIGHT term fully applies, 4 is neutral.");
  for (const it of ueqs) lines.push(`- ${it.id}: ${it.flipped ? it.positive : it.negative} (1) ... (7) ${it.flipped ? it.negative : it.positive}`);
  lines.push("\n### Questionnaire 2 (SUS)");
  lines.push("Rate each statement from 1 (strongly disagree) to 5 (strongly agree).");
  for (const it of Q.sus.items) lines.push(`- ${it.id}: ${it.text}`);
  if (includeVisawi) {
    lines.push("\n### Questionnaire 3 (VisAWI-S)");
    lines.push("Rate each statement about the visual design from 1 (strongly disagree) to 7 (strongly agree).");
    for (const it of Q.visawi.items) lines.push(`- ${it.id}: ${it.text}`);
  }
  return { text: lines.join("\n"), ueqsLayout: ueqs.map(({ id, flipped }) => ({ id, flipped })) };
}

function scorePersona(answer, layout, { includeVisawi = true } = {}) {
  const num = (v) => (typeof v === "number" ? v : Number(v));
  const ue = {};
  for (const { id, flipped } of layout) {
    const raw = num(answer.ueqs?.[id]);
    if (!(raw >= 1 && raw <= 7)) throw new Error(`UEQ-S item ${id} missing or out of range`);
    ue[id] = flipped ? 4 - raw : raw - 4; // -3..+3, positive pole = +3
  }
  const scaleMean = (scale) => mean(Q.ueqs.items.filter((i) => i.scale === scale).map((i) => ue[i.id]));
  let sus = 0;
  for (const it of Q.sus.items) {
    const v = num(answer.sus?.[it.id]);
    if (!(v >= 1 && v <= 5)) throw new Error(`SUS item ${it.id} missing or out of range`);
    sus += it.positive ? v - 1 : 5 - v;
  }
  let visawi = null;
  if (includeVisawi) {
    const vis = Q.visawi.items.map((it) => num(answer.visawi?.[it.id]));
    if (vis.some((v) => !(v >= 1 && v <= 7))) throw new Error("VisAWI-S item missing or out of range");
    visawi = round(mean(vis));
  }
  return {
    ueqsPragmatic: round(scaleMean("pragmatic")),
    ueqsHedonic: round(scaleMean("hedonic")),
    ueqsOverall: round(mean(Object.values(ue))),
    sus: sus * 2.5,
    visawi,
    items: { ueqs: ue },
  };
}

// ---------- running CLIs ----------

function extractJSON(text) {
  if (!text) throw new Error("empty answer");
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1)].filter(Boolean);
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  throw new Error(`no JSON object in answer: ${clean.slice(0, 200)}`);
}

function runCli(provider, prompt, images, tag) {
  const model = cfg.jury.models?.[provider];
  const effort = cfg.jury.effort?.[provider];
  const outFile = path.join(rawDir, `${tag}.last.txt`);
  let argv;
  if (provider === "claude") {
    argv = ["-p", "--output-format", "json", "--tools", "Read", "--allowedTools", "Read", "--add-dir", iterDir, "--disable-slash-commands", "--no-session-persistence", "--strict-mcp-config"];
    for (const im of images) if (!im.file.startsWith(iterDir)) argv.push("--add-dir", path.dirname(im.file));
    if (model) argv.push("--model", model);
    if (effort) argv.push("--effort", effort);
  } else if (provider === "codex") {
    argv = ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", iterDir, "-o", outFile];
    if (model) argv.push("-m", model);
    if (effort) argv.push("-c", `model_reasoning_effort="${effort}"`);
    for (const im of images) argv.push("-i", im.file);
    argv.push("--", "-");
  } else {
    argv = ["run"];
    if (model) argv.push("-m", model);
    for (const im of images) argv.push("-f", im.file);
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(PROVIDERS[provider].bin, argv, { cwd: iterDir, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), cfg.jury.timeoutSec * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let text = stdout;
      let meta = {};
      // meta.model / meta.effort hold what the CLI reports it actually used (null if it does not say).
      if (provider === "claude") {
        try {
          const j = JSON.parse(stdout);
          text = j.result;
          // The main model is the one that produced most output (helpers may appear in modelUsage too).
          const usage = Object.entries(j.modelUsage || {}).sort((a, b) => (b[1]?.outputTokens || 0) - (a[1]?.outputTokens || 0));
          meta = { model: usage[0]?.[0] || null, effort: null, costUsd: j.total_cost_usd, isError: j.is_error };
        } catch {
          /* keep raw */
        }
      } else if (provider === "codex") {
        if (fs.existsSync(outFile)) text = fs.readFileSync(outFile, "utf8");
        // Codex prints a header (model, reasoning effort) before echoing the prompt on stderr.
        const head = stderr.slice(0, 6000);
        meta = { model: (head.match(/^model:\s*(\S+)/m) || [])[1] || null, effort: (head.match(/^reasoning effort:\s*(\S+)/m) || [])[1] || null };
      } else if (provider === "opencode") meta = { model: (stdout.match(/>\s*\w+\s*·\s*(\S+)/) || [])[1] || null, effort: null };
      const errText = stderr.length > 8000 ? `${stderr.slice(0, 3000)}\n[... ${stderr.length - 7000} characters cut ...]\n${stderr.slice(-4000)}` : stderr;
      fs.writeFileSync(path.join(rawDir, `${tag}.txt`), `exit ${code}\n--- stdout ---\n${stdout}\n--- stderr ---\n${errText}`);
      resolve({ code, text, meta, seconds: Math.round((Date.now() - started) / 1000) });
    });
    child.stdin.end(prompt);
  });
}

// Label for reports: "<model> (<effort>)". Values the CLI did not confirm are marked, so a
// pinned model that silently fell back to another one does not go unnoticed.
function modelLabel(provider, meta) {
  const wantModel = cfg.jury.models?.[provider] || null;
  const wantEffort = cfg.jury.effort?.[provider] || null;
  const model = meta.model || (wantModel ? `${wantModel}, unverified` : `${provider} default`);
  const effort = meta.effort || (wantEffort ? `${wantEffort}, requested` : null);
  if (meta.model && wantModel && meta.model !== wantModel) log(`warning: ${provider} ran ${meta.model} instead of the pinned ${wantModel}`);
  if (meta.effort && wantEffort && meta.effort !== wantEffort) log(`warning: ${provider} ran with effort ${meta.effort} instead of ${wantEffort}`);
  return {
    label: `${model}${effort ? ` (${effort})` : ""}`,
    verified: { model: meta.model ? meta.model === (wantModel || meta.model) : false, effort: meta.effort ? meta.effort === (wantEffort || meta.effort) : false },
  };
}

async function ask(provider, prompt, images, tag, validate, maxImages = cfg.jury.maxImages) {
  const all = images.slice(0, maxImages);
  if (images.length > all.length) log(`${tag}: ${images.length - all.length} images over the limit of ${maxImages} were left out`);
  const full = prompt.replace("{{images_list}}", imageList(all, provider));
  fs.writeFileSync(path.join(rawDir, `${tag}.prompt.md`), full);
  // --dry-run writes the prompts (with the image lists) and calls no CLI: for tests.
  if (args["dry-run"]) return { ok: false, provider, error: "dry run" };
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await runCli(provider, full, all, attempt === 1 ? tag : `${tag}.retry`);
    try {
      if (res.code !== 0 && !res.text) throw new Error(`exit ${res.code}`);
      const json = extractJSON(res.text);
      const extra = validate ? validate(json) : {};
      log(`${tag}: ok (${res.seconds}s)`);
      const m = modelLabel(provider, res.meta);
      return { ok: true, provider, model: m.label, verified: m.verified, seconds: res.seconds, costUsd: res.meta.costUsd, answer: json, ...extra };
    } catch (err) {
      lastErr = err;
      log(`${tag}: attempt ${attempt} failed: ${err.message.slice(0, 160)}`);
    }
  }
  return { ok: false, provider, error: lastErr.message.slice(0, 300) };
}

async function pool(jobs, limit) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]();
      }
    }),
  );
  return results;
}

function stats(xs) {
  const v = xs.filter((x) => typeof x === "number");
  if (!v.length) return null;
  const m = mean(v);
  const sd = Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
  // Standard error of the mean (sample SD). Used by gates.mjs to flag results within noise.
  const se = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / Math.sqrt(v.length) : null;
  return { mean: round(m), min: round(Math.min(...v)), max: round(Math.max(...v)), sd: round(sd), se: round(se), n: v.length };
}

// ---------- modes ----------

async function personas() {
  const template = fs.readFileSync(path.join(SKILL_DIR, "prompts/persona.md"), "utf8");
  const ps = cfg.jury.personas;
  const pairs = cfg.jury.matrix === "round-robin" ? ps.map((p, i) => [providers[i % providers.length], p]) : providers.flatMap((pr) => ps.map((p) => [pr, p]));
  const file = path.join(juryDir, "personas.json");
  const previous = args.append ? readJSON(file, null) : null;
  const round_ = (previous?.rounds || 1) + (previous ? 1 : 0);
  const dpr = capture.deviceScaleFactor || cfg.capture.deviceScaleFactor || 1;
  const jobs = pairs.map(([provider, persona]) => async () => {
    const visual = persona.visual !== false;
    const q = buildQuestionnaires({ includeVisawi: visual });
    let images = [];
    if (visual) {
      const set = screenshotSet(iterDir, [persona.viewport || "desktop"], { dpr });
      const shots = [...set.images, ...viewShots(iterDir, [persona.viewport || "desktop"]).slice(0, 2)];
      images = [...shots, ...taskImages(capture, iterDir, Math.max(0, cfg.jury.maxImages - shots.length))];
    }
    const prompt = fill(template, {
      persona: cfg.jury.audience ? `${persona.description}\n\nThe site's audience: ${cfg.jury.audience}. You are one of them.` : persona.description,
      url: capture.url,
      title: capture.viewports.desktop?.checks.title ?? "",
      tasks: taskLog(capture, iterDir),
      aria: persona.aria ? `## What your screen reader announced (accessibility tree)\n\n\`\`\`\n${aria(iterDir, 12000)}\n\`\`\`\n\nKeyboard focus walk: ${JSON.stringify(capture.summary)}` : "",
      images: "{{images_list}}",
      questionnaires: q.text,
      rationale_keys: visual
        ? '"pragmatic": "<2-4 sentences>", "hedonic": "<2-4 sentences>", "visual": "<2-4 sentences>"'
        : '"pragmatic": "<2-4 sentences>", "hedonic": "<2-4 sentences>"',
      ueqs_keys: Q.ueqs.items.map((i) => `"${i.id}": 0`).join(", "),
      sus_keys: Q.sus.items.map((i) => `"${i.id}": 0`).join(", "),
      visawi_field: visual ? `,\n  "visawi": { ${Q.visawi.items.map((i) => `"${i.id}": 0`).join(", ")} }` : "",
    });
    const tag = `persona-${provider}-${persona.id}${round_ > 1 ? `-r${round_}` : ""}`;
    const res = await ask(provider, prompt, images, tag, (a) => ({ scores: scorePersona(a, q.ueqsLayout, { includeVisawi: visual }) }));
    return { persona: persona.id, round: round_, ...res };
  });
  const advisory = new Set(cfg.jury.advisory || []);
  const fresh = (await pool(jobs, cfg.jury.concurrency)).map((j) => ({ persona: j.persona, provider: j.provider, round: j.round, model: j.model, verified: j.verified, advisory: advisory.has(j.provider), ok: j.ok, error: j.error, seconds: j.seconds, scores: j.scores, rationale: j.answer?.rationale, top_issues: j.answer?.top_issues }));
  // A repeat round adds independent ratings, so the means become more stable (see gates.mjs: borderline).
  const jurors = [...(previous?.jurors || []), ...fresh];
  // Advisory providers (default: opencode free models) are reported but do not count towards the gates.
  const okJ = jurors.filter((j) => j.ok && !j.advisory);
  // One value per juror (persona x provider): repeat rounds are averaged first, so a repeat
  // stabilises each juror's rating instead of counting as extra jurors. Non-numeric values
  // (such as visawi for a non-visual persona) are skipped.
  const perJuror = (k) => {
    const by = new Map();
    for (const j of okJ) {
      const v = j.scores?.[k];
      if (typeof v !== "number") continue;
      by.set(`${j.persona}|${j.provider}`, [...(by.get(`${j.persona}|${j.provider}`) || []), v]);
    }
    return [...by.values()].map((xs) => mean(xs));
  };
  const aggregate = {
    ueqsPragmatic: stats(perJuror("ueqsPragmatic")),
    ueqsHedonic: stats(perJuror("ueqsHedonic")),
    ueqsOverall: stats(perJuror("ueqsOverall")),
    sus: stats(perJuror("sus")),
    visawi: stats(perJuror("visawi")),
  };
  const out = {
    mode: "personas",
    ranAt: new Date().toISOString(),
    rounds: round_,
    jurors,
    aggregate,
    failed: jurors.filter((j) => !j.ok && !j.advisory).length,
    counted: okJ.length,
  };
  writeJSON(file, out);
  console.log(JSON.stringify({ aggregate, failed: out.failed, jurors: out.jurors.map((j) => ({ persona: j.persona, provider: j.provider, ok: j.ok, scores: j.scores && { p: j.scores.ueqsPragmatic, h: j.scores.ueqsHedonic, sus: j.scores.sus, vis: j.scores.visawi } })) }, null, 2));
}

async function experts() {
  const template = fs.readFileSync(path.join(SKILL_DIR, "prompts/expert.md"), "utf8");
  const checklist = fs.readFileSync(path.join(SKILL_DIR, "references/expert-checklist.md"), "utf8");
  const waivers = args.waivers && fs.existsSync(args.waivers) ? readJSON(args.waivers, []) : [];
  const who = cfg.jury.experts === "all" ? providers : providers.slice(0, Number(cfg.jury.experts) || 1);
  const dpr = capture.deviceScaleFactor || cfg.capture.deviceScaleFactor || 1;
  const set = screenshotSet(iterDir, Object.keys(cfg.viewports), { tiles: 2, dpr });
  const images = [...set.images];
  if (fs.existsSync(path.join(iterDir, "reflow-320.png"))) images.push({ file: path.join(iterDir, "reflow-320.png"), label: "320 CSS px wide (400 % zoom)" });
  if (fs.existsSync(path.join(iterDir, "desktop-dark.png"))) images.push({ file: path.join(iterDir, "desktop-dark.png"), label: "desktop, dark colour scheme" });
  images.push(...viewShots(iterDir, Object.keys(cfg.viewports)).slice(0, 3));
  const prompt = fill(template, {
    audience: audienceText(),
    profile: profileText(),
    url: capture.url,
    title: capture.viewports.desktop?.checks.title ?? "",
    stack: (capture.stack?.detected || []).map((s) => s.name).join(", ") || "none detected (static HTML?)",
    measurements: measurements(capture),
    tasks: taskLog(capture, iterDir),
    aria: aria(iterDir, 15000),
    images: "{{images_list}}",
    screenshot_note: truncationNote(set.truncated),
    checklist,
    design_system: designSystemGuidance(capture),
    waivers: waivers.length
      ? `## Waived findings\n\nThe site owner reviewed and rejected these findings. Do not report them again unless the evidence contradicts the stated reason:\n${waivers.map((w) => `- ${w.title}: ${w.reason}`).join("\n")}`
      : "",
  });
  const jobs = who.map((provider) => () =>
    ask(provider, prompt, images, `expert-${provider}`, (a) => {
      if (!Array.isArray(a.findings)) throw new Error("findings array missing");
      return {};
    }),
  );
  const reviews = await pool(jobs, cfg.jury.concurrency);
  const advisory = new Set(cfg.jury.advisory || []);
  const findings = reviews.flatMap((r) =>
    r.ok
      ? r.answer.findings.map((f) => ({
          ...f,
          kind: f.kind === "defect" || f.kind === "suggestion" ? f.kind : null,
          tradeoff: f.tradeoff || "",
          severity: Number(f.severity) || 0,
          source: r.provider,
          advisory: advisory.has(r.provider),
        }))
      : [],
  );
  findings.sort((a, b) => b.severity - a.severity);
  findings.forEach((f, i) => (f.id = `F${i + 1}`));
  const out = {
    mode: "experts",
    ranAt: new Date().toISOString(),
    reviews: reviews.map((r) => ({
      provider: r.provider,
      model: r.model,
      verified: r.verified,
      advisory: advisory.has(r.provider),
      ok: r.ok,
      error: r.error,
      seconds: r.seconds,
      strengths: Array.isArray(r.answer?.strengths) ? r.answer.strengths : [],
      count: r.answer?.findings?.length,
    })),
    findings,
  };
  writeJSON(path.join(juryDir, "experts.json"), out);
  const bySev = [4, 3, 2, 1, 0].map((s) => `${s}:${findings.filter((f) => f.severity === s).length}`).join(" ");
  console.log(JSON.stringify({ reviews: out.reviews.map(({ provider, ok, error, count }) => ({ provider, ok, error, count })), severities: bySev, findings: findings.map((f) => `${f.id} [${f.severity}] ${f.category}: ${f.title} (${f.source})`) }, null, 2));
}

async function pairwise() {
  if (!args.before) die("--before DIR is required for pairwise");
  const beforeDir = path.resolve(args.before);
  const template = fs.readFileSync(path.join(SKILL_DIR, "prompts/pairwise.md"), "utf8");
  const tagSuffix = args.tag ? `-${String(args.tag).replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
  const maxImages = cfg.jury.maxImagesPairwise || 16;
  const perSide = Math.max(1, Math.floor(maxImages / 2));
  // Same order and symmetric count in both versions, so both sides are compared fairly
  // without detail crops spotlighting local patches over overall visual harmony.
  const shotsFor = (dir, label) => {
    const c = readJSON(path.join(dir, "capture.json"), {});
    const dpr = c.deviceScaleFactor || cfg.capture.deviceScaleFactor || 1;
    const set = [];
    const truncated = [];
    for (const vp of Object.keys(cfg.viewports)) {
      const f = path.join(dir, `${vp}.png`);
      if (fs.existsSync(f)) set.push({ file: f, label: `version ${label}, ${vp}, first screen` });
    }
    for (const vp of Object.keys(cfg.viewports)) {
      const info = tilePngInfo(path.join(dir, `${vp}-full.png`), path.join(dir, "jury", "tiles"), { tileHeight: (vp === "mobile" ? 1400 : 1600) * dpr, maxTiles: 1 });
      info.files.forEach((f, i) => set.push({ file: f, label: `version ${label}, ${vp}, full page part ${i + 1}${info.totalTiles > 1 ? ` of ${info.totalTiles}` : ""}` }));
      if (info.truncated) truncated.push(`${vp} (first ${info.files.length} of ${info.totalTiles} sections)`);
    }
    const reflow = path.join(dir, "reflow-320.png");
    if (fs.existsSync(reflow)) set.push({ file: reflow, label: `version ${label}, 320 CSS px` });
    set.push(...viewShots(dir, Object.keys(cfg.viewports), `version ${label}, `).slice(0, 2));
    return { images: set.slice(0, perSide), truncated };
  };
  // File names and folders would reveal the versions (iter-3/..., etc.), and Claude
  // sees full paths, Codex the file names. So every image is copied to a neutral name in a
  // folder with a random name: A-01.png, B-01.png ...
  const blindCopies = (images) => {
    const dir = path.join(juryDir, `blind-${randomBytes(4).toString("hex")}`);
    fs.mkdirSync(dir, { recursive: true });
    const count = { A: 0, B: 0 };
    return images.map((im) => {
      const v = im.label.startsWith("version A") ? "A" : "B";
      const file = path.join(dir, `${v}-${String(++count[v]).padStart(2, "0")}.png`);
      fs.copyFileSync(im.file, file);
      return { ...im, file };
    });
  };
  const orders = cfg.jury.pairwiseBothOrders ? ["before-first", "after-first"] : [Math.random() < 0.5 ? "before-first" : "after-first"];
  const jobs = providers.flatMap((provider) =>
    orders.map((order) => async () => {
      const [aDir, bDir] = order === "before-first" ? [beforeDir, iterDir] : [iterDir, beforeDir];
      const shotsA = shotsFor(aDir, "A");
      const shotsB = shotsFor(bDir, "B");
      const limit = Math.min(shotsA.images.length, shotsB.images.length);
      const images = blindCopies([...shotsA.images.slice(0, limit), ...shotsB.images.slice(0, limit)]);
      const truncated = [...new Set([...shotsA.truncated, ...shotsB.truncated])];
      const prompt = fill(template, {
        url: capture.url,
        purpose: capture.viewports.desktop?.checks.title ?? "",
        audience: audienceText(),
        profile: profileText(),
        images: "{{images_list}}",
        screenshot_note: truncationNote(truncated),
      });
      const res = await ask(
        provider,
        prompt,
        images,
        `pairwise${tagSuffix}-${provider}-${order}`,
        (a) => {
          if (!["A", "B", "tie"].includes(a.winner)) throw new Error("winner must be A, B or tie");
          return {};
        },
        limit * 2,
      );
      if (!res.ok) return { provider, order, ok: false, error: res.error };
      const unblind = (w) => (w === "tie" ? "tie" : (w === "A") === (order === "before-first") ? "before" : "after");
      const dims = Object.fromEntries(Object.entries(res.answer.dimensions || {}).map(([k, v]) => [k, unblind(v)]));
      const regressions = { before: res.answer.regressions?.[order === "before-first" ? "A" : "B"] || [], after: res.answer.regressions?.[order === "before-first" ? "B" : "A"] || [] };
      return { provider, model: res.model, verified: res.verified, images: images.length, order, ok: true, winner: unblind(res.answer.winner), confidence: res.answer.confidence, dimensions: dims, regressions, reasons: res.answer.reasons };
    }),
  );
  const votes = await pool(jobs, cfg.jury.concurrency);
  const advisory = new Set(cfg.jury.advisory || []);
  votes.forEach((v) => (v.advisory = advisory.has(v.provider)));
  const ok = votes.filter((v) => v.ok && !v.advisory);
  const count = (w) => ok.filter((v) => v.winner === w).length;
  const byProvider = new Map();
  for (const v of ok) {
    const rec = byProvider.get(v.provider) || { after: 0, before: 0, tie: 0 };
    if (v.winner === "after" || v.winner === "before" || v.winner === "tie") rec[v.winner]++;
    byProvider.set(v.provider, rec);
  }
  const providerSummary = Object.fromEntries(byProvider);
  const providerAgainst = [...byProvider.entries()].filter(([, r]) => r.before > r.after).map(([p]) => p);
  const verdict = !ok.length
    ? "unknown"
    : count("before") > count("after")
      ? "before"
      : providerAgainst.length > 0
        ? "contested"
        : count("after") > count("before") && count("before") === 0
          ? "after"
          : count("after") > count("before")
            ? "after-mixed"
            : "tie";
  const out = {
    mode: "pairwise",
    tag: args.tag || null,
    ranAt: new Date().toISOString(),
    before: beforeDir,
    after: iterDir,
    votes,
    tally: { after: count("after"), before: count("before"), tie: count("tie"), failed: votes.length - ok.length },
    providerSummary,
    providerAgainst,
    verdict,
  };
  writeJSON(path.join(juryDir, `pairwise${tagSuffix}.json`), out);
  console.log(JSON.stringify({ tally: out.tally, providerSummary, providerAgainst, verdict, votes: ok.map((v) => ({ provider: v.provider, order: v.order, winner: v.winner, confidence: v.confidence })) }, null, 2));
}

if (mode === "personas") await personas();
else if (mode === "experts") await experts();
else await pairwise();
