#!/usr/bin/env node
// Evaluates the acceptance gates for one iteration and writes the fixer's worklist.
//
//   node gates.mjs --iter DIR [--config FILE] [--waivers FILE]
//
// Writes DIR/gates.json (pass/fail per gate) and DIR/worklist.json (prioritised problems,
// without questionnaire scores, so the fixer works on problems and not on the ratings).
import fs from "node:fs";
import path from "node:path";
import { parseArgs, loadConfig, readJSON, writeJSON, die, round } from "./lib/common.mjs";

const args = parseArgs();
if (!args.iter) die("usage: gates.mjs --iter DIR [--config FILE] [--waivers FILE]");
const cfg = loadConfig(args.config);
const G = cfg.gates;
const iterDir = path.resolve(args.iter);
const cap = readJSON(path.join(iterDir, "capture.json"));
const personas = readJSON(path.join(iterDir, "jury/personas.json"), null);
const experts = readJSON(path.join(iterDir, "jury/experts.json"), null);
const pairwise = readJSON(path.join(iterDir, "jury/pairwise.json"), null);
const waivers = args.waivers && fs.existsSync(args.waivers) ? readJSON(args.waivers, []) : [];

const isWaived = (f) =>
  waivers.some((w) => {
    try {
      return new RegExp(w.match || w.title, "i").test(`${f.title} ${f.framework || ""}`);
    } catch {
      return (f.title || "").toLowerCase().includes((w.title || "").toLowerCase());
    }
  });

const gates = [];
// status: pass | fail | skip (no data or disabled)
function gate(id, label, value, target, pass, detail) {
  gates.push({ id, label, value, target, status: pass === null ? "skip" : pass ? "pass" : "fail", ...(detail ? { detail } : {}) });
}

// Juror means wobble between runs. A mean closer to its target than one standard error is
// flagged `borderline`: its pass or fail is not reliable. SKILL.md: repeat the personas once
// (jury.mjs personas --append) before deciding on such a gate.
// When `target` is null/undefined the metric is diagnostic (reported without failing).
function scoreGate(id, label, stat, target) {
  if (target === null || target === undefined) {
    gate(id, label, stat ? stat.mean : "n/a", "diagnostic", null, "diagnostic only");
    const g = gates[gates.length - 1];
    if (stat?.se !== null && stat?.se !== undefined) {
      g.se = stat.se;
      g.ci95 = [round(stat.mean - 1.96 * stat.se), round(stat.mean + 1.96 * stat.se)];
    }
    if (stat) g.n = stat.n;
    return;
  }
  if (!stat) return gate(id, label, "n/a", `>= ${target}`, null);
  gate(id, label, stat.mean, `>= ${target}`, stat.mean >= target);
  const g = gates[gates.length - 1];
  if (stat.se !== null && stat.se !== undefined) {
    g.se = stat.se;
    g.ci95 = [round(stat.mean - 1.96 * stat.se), round(stat.mean + 1.96 * stat.se)];
    g.borderline = Math.abs(stat.mean - target) < stat.se;
  }
  g.n = stat.n;
}

const s = cap.summary;
gate("axe-critical", "axe-core critical violations", s.axe.critical, `<= ${G.axe.critical}`, s.axe.critical <= G.axe.critical);
gate("axe-serious", "axe-core serious violations", s.axe.serious, `<= ${G.axe.serious}`, s.axe.serious <= G.axe.serious);
gate("reflow-320", "No horizontal scroll at 320 px (WCAG 1.4.10)", s.reflow320HorizontalScroll ? "scrolls" : "ok", "ok", G.reflow320 ? !s.reflow320HorizontalScroll : null);
gate(
  "focus-visible",
  "Focus visible and not obscured (WCAG 2.4.7, 2.4.11)",
  `${s.focusWithoutIndicator ?? "?"} without indicator, ${s.focusObscured ?? "?"} obscured`,
  "0 / 0",
  G.focusVisible ? s.focusWithoutIndicator === 0 && s.focusObscured === 0 && s.focusStops > 0 : null,
  s.focusStops === 0 ? "no focusable element was reached with Tab" : undefined,
);
gate("keyboard-reachable", "Clickable elements reachable by keyboard (WCAG 2.1.1)", s.clickableNotFocusable, `<= ${G.clickableNotFocusable}`, s.clickableNotFocusable <= G.clickableNotFocusable);

const cwv = cap.cwv && !cap.cwv.error ? cap.cwv : null;
const enforce = G.cwv.enforce;
gate("lcp", "Largest Contentful Paint (lab)", cwv ? `${cwv.lcpMs} ms` : "n/a", `<= ${G.cwv.lcpMs} ms`, cwv && cwv.lcpMs !== null && enforce ? cwv.lcpMs <= G.cwv.lcpMs : null);
gate("cls", "Cumulative Layout Shift (lab)", cwv ? cwv.cls : "n/a", `<= ${G.cwv.cls}`, cwv && enforce ? cwv.cls <= G.cwv.cls : null);
gate("tbt", "Total Blocking Time (lab proxy for INP)", cwv ? `${cwv.tbtMs} ms` : "n/a", `<= ${G.cwv.tbtMs} ms`, cwv && enforce ? cwv.tbtMs <= G.cwv.tbtMs : null);
const inp = cap.tasks?.length ? Math.max(0, ...cap.tasks.map((t) => t.inpMs || 0)) : null;
gate("inp", "Interaction to Next Paint (task walkthroughs)", inp === null ? "n/a" : `${inp} ms`, `<= ${G.cwv.inpMs} ms`, inp !== null && enforce ? inp <= G.cwv.inpMs : null);

if (cap.tasks?.length) {
  const rate = cap.tasks.filter((t) => t.success).length / cap.tasks.length;
  gate("tasks", "Task walkthroughs completed", `${round(rate * 100, 0)} %`, `>= ${G.tasks.successRate * 100} %`, rate >= G.tasks.successRate);
} else gate("tasks", "Task walkthroughs completed", "no tasks", "", null);

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "page", "user", "users", "element", "elements",
  "button", "buttons", "text", "should", "could", "would", "make", "more", "very", "only",
  "into", "when", "where", "does", "without", "lack", "lacks", "missing", "poor", "clear",
  "unclear", "using", "there", "their", "them", "they", "some", "many", "also", "needs",
]);

function findingSignals(f) {
  const raw = `${f.title || ""} ${f.framework || ""} ${f.where?.text || ""} ${f.where?.selector || ""}`.toLowerCase();
  const codes = new Set([...(raw.match(/\b\d+\.\d+\.\d+\b/g) || []), ...(raw.match(/\bh(?:10|[1-9])\b/g) || [])]);
  const tokens = new Set((raw.match(/[a-z]{4,}/g) || []).filter((t) => !STOP_WORDS.has(t)));
  const selector = f.where?.selector ? String(f.where.selector).trim().toLowerCase() : null;
  return { codes, tokens, selector };
}

function corroborates(a, b) {
  if (a.source === b.source || b.severity < 2) return false;
  const softCats = new Set(["usability", "visual", "content"]);
  const catMatch = a.category === b.category || (softCats.has(a.category) && softCats.has(b.category));
  if (!catMatch) return false;
  const sa = findingSignals(a);
  const sb = findingSignals(b);
  if (sa.selector && sb.selector && sa.selector === sb.selector) return true;
  for (const c of sa.codes) if (sb.codes.has(c)) return true;
  let overlap = 0;
  for (const t of sa.tokens) if (sb.tokens.has(t) && ++overlap >= 2) return true;
  return false;
}

const cwvFailed = !!(cwv && enforce && (cwv.lcpMs > G.cwv.lcpMs || cwv.cls > G.cwv.cls || cwv.tbtMs > G.cwv.tbtMs)) || !!(inp !== null && enforce && inp > G.cwv.inpMs);
const a11yProbeFailed =
  s.axe.critical > G.axe.critical ||
  s.axe.serious > G.axe.serious ||
  (G.reflow320 && !!s.reflow320HorizontalScroll) ||
  (G.focusVisible && (s.focusWithoutIndicator > 0 || s.focusObscured > 0 || s.focusStops === 0)) ||
  s.clickableNotFocusable > G.clickableNotFocusable;
const taskFailed = !!(cap.tasks?.length && cap.tasks.some((t) => !t.success));
const hasAutomatedBacking = (f) =>
  f.category === "deceptive-pattern" ||
  (f.category === "accessibility" && a11yProbeFailed) ||
  (f.category === "performance" && cwvFailed) ||
  (taskFailed && (f.category === "usability" || f.category === "accessibility"));

const advisorySet = new Set(cfg.jury.advisory || []);
let expertMeta = new Map();
if (experts) {
  const counted = experts.findings.filter((f) => !f.advisory && !isWaived(f));
  const okProviders = new Set(experts.reviews.filter((r) => r.ok && !r.advisory && !advisorySet.has(r.provider)).map((r) => r.provider)).size;
  const requireConsensus = G.experts.requireConsensus !== false && okProviders >= 2;
  for (const f of counted) {
    const corroborated = okProviders < 2 || counted.some((other) => corroborates(f, other));
    const blocks =
      f.severity > G.experts.maxSeverity &&
      (!requireConsensus || corroborated || hasAutomatedBacking(f) || (f.severity >= 4 && f.kind !== "suggestion"));
    expertMeta.set(f.id, { corroborated, blocks });
  }
  const blocking = counted.filter((f) => expertMeta.get(f.id)?.blocks);
  const uncorroboratedHigh = counted.filter((f) => f.severity > G.experts.maxSeverity && !expertMeta.get(f.id)?.blocks);
  const nonBlockingMax = counted.filter((f) => f.severity <= G.experts.maxSeverity).reduce((m, f) => Math.max(m, f.severity), 0);
  const maxSev = blocking.reduce((m, f) => Math.max(m, f.severity), nonBlockingMax);
  gate(
    "expert-severity",
    "Highest expert finding severity (Nielsen 0-4)",
    maxSev,
    `<= ${G.experts.maxSeverity}`,
    blocking.length === 0,
    `${blocking.length} blocking above threshold${uncorroboratedHigh.length ? `, ${uncorroboratedHigh.length} uncorroborated single-expert suggestion(s)` : ""}`,
  );
  const dp = counted.filter((f) => f.category === "deceptive-pattern" && f.severity >= 2).length;
  gate("deceptive-patterns", "Deceptive patterns", dp, `<= ${G.deceptivePatterns}`, dp <= G.deceptivePatterns);
  const okReviews = experts.reviews.filter((r) => r.ok && !r.advisory && !advisorySet.has(r.provider)).length;
  if (!okReviews) gate("expert-jury", "Expert reviews returned", 0, ">= 1", false);
} else gate("expert-severity", "Highest expert finding severity (Nielsen 0-4)", "not run", "", null);

if (personas) {
  const a = personas.aggregate;
  const counted = personas.jurors.filter((j) => j.ok && !j.advisory);
  const total = personas.jurors.filter((j) => !j.advisory).length;
  gate("jury-quorum", "Persona jurors that answered", `${counted.length}/${total}`, ">= 50 %", total ? counted.length / total >= 0.5 : false);
  // Lowest juror: per persona x provider, averaged over repeat rounds (see jury.mjs aggregate).
  // When hedonic is diagnostic-only, judge minJuror on pragmatic quality so neutral hedonic
  // ratings on utilitarian UIs do not fail the gate.
  const hedonicEnforced = G.ueqs.hedonicMean !== null && G.ueqs.hedonicMean !== undefined;
  const minUeqsStat = hedonicEnforced ? a.ueqsOverall : a.ueqsPragmatic;
  const minUeqsLabel = hedonicEnforced ? "UEQ-S overall, lowest single juror" : "UEQ-S pragmatic, lowest single juror";
  scoreGate("ueqs-pragmatic", "UEQ-S pragmatic quality (mean, -3..+3)", a.ueqsPragmatic, G.ueqs.pragmaticMean);
  scoreGate("ueqs-hedonic", "UEQ-S hedonic quality (mean, -3..+3)", a.ueqsHedonic, G.ueqs.hedonicMean);
  if (G.ueqs.minJuror === null || G.ueqs.minJuror === undefined) {
    gate("ueqs-min-juror", minUeqsLabel, minUeqsStat?.min ?? "n/a", "diagnostic", null, "diagnostic only");
  } else {
    gate("ueqs-min-juror", minUeqsLabel, minUeqsStat?.min ?? "n/a", `>= ${G.ueqs.minJuror}`, minUeqsStat ? minUeqsStat.min >= G.ueqs.minJuror : null);
  }
  scoreGate("sus", "SUS (mean, 0-100)", a.sus, G.sus.mean);
  if (G.sus.minJuror === null || G.sus.minJuror === undefined) {
    gate("sus-min-juror", "SUS, lowest single juror", a.sus?.min ?? "n/a", "diagnostic", null, "diagnostic only");
  } else {
    gate("sus-min-juror", "SUS, lowest single juror", a.sus?.min ?? "n/a", `>= ${G.sus.minJuror}`, a.sus ? a.sus.min >= G.sus.minJuror : null);
  }
  scoreGate("visawi", "VisAWI-S visual aesthetics (mean, 1-7)", a.visawi, G.visawi.mean);
  if ((personas.rounds || 1) > 1) gates[gates.length - 1].detail = `${personas.rounds} rating rounds averaged per juror`;
} else gate("ueqs-pragmatic", "UEQ-S pragmatic quality", "not run", "", null);

if (pairwise) {
  const noAgainst = G.pairwise.requireNoProviderAgainst !== false;
  const bad = noAgainst ? ["before", "contested", "unknown"] : ["before", "unknown"];
  const againstNote = pairwise.providerAgainst?.length ? `; against: ${pairwise.providerAgainst.join(", ")}` : "";
  gate(
    "pairwise",
    "Blind A/B: new version not worse than previous",
    `${pairwise.verdict} (after ${pairwise.tally.after}, before ${pairwise.tally.before}, tie ${pairwise.tally.tie}${againstNote})`,
    noAgainst ? "after or uncontested tie" : "after or tie",
    G.pairwise.requireWinOrTie ? !bad.includes(pairwise.verdict) : null,
  );
}

// ---------- worklist for the fixer (strengths + defects vs. suggestions) ----------
const strengths = [
  ...new Set(
    (experts?.reviews || [])
      .filter((r) => r.ok && !r.advisory && !advisorySet.has(r.provider))
      .flatMap((r) => (Array.isArray(r.strengths) ? r.strengths : []))
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  ),
];
const defects = [];
const suggestions = [];
for (const v of cap.axe.filter((v) => ["critical", "serious"].includes(v.impact)))
  defects.push({ source: "axe-core", priority: v.impact === "critical" ? 4 : 3, title: v.help, framework: `WCAG ${v.wcag.join(", ") || "best practice"} (${v.id})`, where: v.targets.map((t) => t.target).join(" | "), detail: v.targets[0]?.summary, helpUrl: v.helpUrl });
if (s.reflow320HorizontalScroll) defects.push({ source: "probe", priority: 3, title: "Content does not reflow at 320 CSS px", framework: "WCAG 1.4.10", where: cap.reflow320.offenders.map((o) => o.selector).join(" | ") });
const focus = cap.viewports.desktop?.focus;
if (focus?.withoutIndicator.length) defects.push({ source: "probe", priority: 3, title: `${focus.withoutIndicator.length} focus stops without visible indicator`, framework: "WCAG 2.4.7", where: focus.withoutIndicator.slice(0, 6).map((x) => x.selector).join(" | ") });
if (focus?.obscured.length) defects.push({ source: "probe", priority: 3, title: "Focused elements hidden behind other content", framework: "WCAG 2.4.11", where: focus.obscured.map((x) => `${x.selector} by ${x.by}`).join(" | ") });
const cnf = Object.values(cap.viewports).flatMap((v) => v.checks.clickableNotFocusable);
if (cnf.length) defects.push({ source: "probe", priority: 3, title: "Clickable elements that are not keyboard accessible", framework: "WCAG 2.1.1, 4.1.2", where: [...new Set(cnf.map((x) => x.selector))].join(" | ") });
if (cwv && enforce) {
  if (cwv.lcpMs > G.cwv.lcpMs) defects.push({ source: "probe", priority: 3, title: `LCP ${cwv.lcpMs} ms`, framework: "Core Web Vitals", where: cwv.lcpElement });
  if (cwv.cls > G.cwv.cls) defects.push({ source: "probe", priority: 3, title: `CLS ${cwv.cls}`, framework: "Core Web Vitals", where: "late inserted content, images without dimensions" });
  if (cwv.tbtMs > G.cwv.tbtMs) defects.push({ source: "probe", priority: 3, title: `TBT ${cwv.tbtMs} ms (long main-thread tasks)`, framework: "Core Web Vitals" });
}
if (inp !== null && inp > G.cwv.inpMs && enforce) defects.push({ source: "probe", priority: 3, title: `Slow interaction response (INP ${inp} ms)`, framework: "Core Web Vitals" });
for (const t of cap.tasks || []) if (!t.success) defects.push({ source: "task", priority: 4, title: `Task "${t.id}" could not be completed`, framework: "Cognitive walkthrough", detail: t.steps.filter((x) => !x.ok).map((x) => `${x.action} ${x.target}: ${x.error}`).join("; ") });
for (const f of experts?.findings || []) {
  if (f.severity < 2 || isWaived(f)) continue;
  const meta = expertMeta.get(f.id) || { corroborated: false, blocks: false };
  const item = {
    source: `expert:${f.source}`,
    priority: meta.blocks ? f.severity : Math.min(f.severity, 2),
    kind: f.kind || (meta.blocks ? "defect" : "suggestion"),
    corroborated: meta.corroborated,
    title: f.title,
    framework: f.framework,
    category: f.category,
    where: f.where,
    detail: f.evidence,
    fix: f.fix,
    tradeoff: f.tradeoff || undefined,
    findingId: f.id,
    advisory: f.advisory || undefined,
  };
  if (meta.blocks || (!f.advisory && f.category === "deceptive-pattern" && f.severity >= 2)) defects.push(item);
  else suggestions.push(item);
}
// Concrete problems the personas ran into (severity 2 = minor and up), excluding waived items.
for (const j of personas?.jurors || [])
  for (const i of j.top_issues || [])
    if (Number(i.severity) >= 2 && !isWaived(i))
      suggestions.push({ source: `persona:${j.persona}:${j.provider}`, priority: Math.min(Number(i.severity), 2), title: i.title, where: i.where, detail: i.evidence, advisory: j.advisory || undefined });
for (const v of pairwise?.votes || []) if (v.ok && !v.advisory && v.regressions?.after?.length) for (const r of v.regressions.after) defects.push({ source: `pairwise:${v.provider}`, priority: 3, title: `Regression: ${r}` });

const failed = gates.filter((g) => g.status === "fail");
const ranJury = !!personas && !!experts;
const perceptionIds = ["ueqs-pragmatic", "ueqs-hedonic", "ueqs-min-juror", "sus", "sus-min-juror", "visawi"];
// When enforced questionnaire gates fail, add the personas' own notes as context. No scores, no
// questionnaire wording and no per-scale titles, so the fixer looks for observable problems
// in them (cut-off text, hidden results, confusing labels) instead of tuning towards ratings.
if (failed.some((g) => perceptionIds.includes(g.id))) {
  const notes = (personas?.jurors || [])
    .filter((j) => j.ok && !j.advisory && j.rationale)
    .map((j) => `${j.persona} (${j.provider}): ${Object.values(j.rationale).filter(Boolean).join(" ")}`);
  if (notes.length) suggestions.push({ source: "personas", priority: 1, title: "Persona notes (context): look for concrete, observable problems in them", framework: "Persona walkthrough notes", detail: notes.join("\n") });
}
defects.sort((a, b) => b.priority - a.priority);
suggestions.sort((a, b) => b.priority - a.priority);
writeJSON(path.join(iterDir, "worklist.json"), { strengths, defects, suggestions });

const result = {
  iteration: path.basename(iterDir),
  evaluatedAt: new Date().toISOString(),
  pass: failed.length === 0 && ranJury,
  complete: ranJury,
  failed: failed.map((g) => g.id),
  borderline: gates.filter((g) => g.borderline).map((g) => g.id),
  // True when every failing gate is a questionnaire gate (the measurable problems are solved).
  onlyPerceptionFails: failed.length > 0 && failed.every((g) => perceptionIds.includes(g.id)),
  openDefectCount: defects.length,
  gates,
};
writeJSON(path.join(iterDir, "gates.json"), result);

const pad = (x, n) => String(x).padEnd(n);
console.log(`${result.pass ? "PASS" : "FAIL"} ${result.iteration}${ranJury ? "" : " (jury incomplete)"}`);
for (const g of gates) console.log(`${pad(g.status.toUpperCase(), 5)} ${pad(g.label, 52)} ${pad(`${g.value}${g.se ? ` ±${g.se}` : ""}`, 30)} ${g.target}${g.borderline ? "  (borderline: within one standard error)" : ""}`);
if (result.borderline.length) console.log(`borderline: ${result.borderline.join(", ")} (repeat the personas with --append before deciding)`);
if (result.onlyPerceptionFails) console.log("only questionnaire gates fail");
const noOutcome = (cap.tasks || []).filter((t) => t.outcomeChecks === 0).map((t) => t.id);
if (noOutcome.length) console.log(`warning: tasks without an expect step (success only means "no error"): ${noOutcome.join(", ")}`);
console.log(`worklist: ${defects.length} defects, ${suggestions.length} suggestions, ${strengths.length} strengths`);
