#!/usr/bin/env node
// Detects the project's front-end stack and how to serve it, from the repository.
//
//   node detect.mjs [--dir PROJECT_DIR]
//
// Prints JSON: frameworks, UI kits, package manager, candidate start commands with
// the expected port, and a suggested URL. The agent decides; this only proposes.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseArgs } from "./lib/common.mjs";

const args = parseArgs();
const root = path.resolve(args.dir || ".");
const exists = (...p) => fs.existsSync(path.join(root, ...p));
const readJ = (...p) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8"));
  } catch {
    return null;
  }
};

// Look for package.json in the root and in common front-end sub-directories.
const candidates = [".", "frontend", "web", "client", "app", "ui", "site", "apps/web", "packages/web"];
const pkgDirs = candidates.filter((d) => exists(d, "package.json"));
const result = { root, packages: [], static: [], python: null, notes: [] };

const FRAMEWORKS = [
  ["next", "Next.js", 3000],
  ["nuxt", "Nuxt", 3000],
  ["@remix-run/react", "Remix", 3000],
  ["react-router", "React Router", 5173],
  ["gatsby", "Gatsby", 8000],
  ["astro", "Astro", 4321],
  ["@sveltejs/kit", "SvelteKit", 5173],
  ["svelte", "Svelte", 5173],
  ["@angular/core", "Angular", 4200],
  ["vue", "Vue", 5173],
  ["solid-js", "Solid", 3000],
  ["preact", "Preact", 5173],
  ["react", "React", 5173],
  ["@11ty/eleventy", "Eleventy", 8080],
  ["vite", "Vite", 5173],
  ["react-scripts", "Create React App", 3000],
];
const KITS = [
  ["tailwindcss", "Tailwind CSS"],
  ["@mui/material", "Material UI (MUI)"],
  ["@angular/material", "Angular Material"],
  ["vuetify", "Vuetify"],
  ["@chakra-ui/react", "Chakra UI"],
  ["@mantine/core", "Mantine"],
  ["antd", "Ant Design"],
  ["@radix-ui/react-slot", "Radix UI / shadcn/ui"],
  ["@headlessui/react", "Headless UI"],
  ["bootstrap", "Bootstrap"],
  ["react-bootstrap", "Bootstrap"],
  ["daisyui", "daisyUI"],
  ["@fluentui/react-components", "Fluent UI"],
  ["@carbon/react", "IBM Carbon"],
  ["primereact", "PrimeReact/PrimeVue/PrimeNG"],
  ["primevue", "PrimeReact/PrimeVue/PrimeNG"],
  ["quasar", "Quasar"],
  ["@ionic/react", "Ionic"],
  ["@ionic/vue", "Ionic"],
  ["bulma", "Bulma"],
  ["govuk-frontend", "GOV.UK Design System"],
  ["@uswds/uswds", "U.S. Web Design System"],
  ["styled-components", "styled-components"],
  ["@emotion/react", "Emotion"],
];

for (const dir of pkgDirs) {
  const pkg = readJ(dir, "package.json");
  if (!pkg) continue;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const frameworks = FRAMEWORKS.filter(([d]) => deps[d]).map(([d, name, port]) => ({ name, version: deps[d], port }));
  const kits = KITS.filter(([d]) => deps[d]).map(([d, name]) => ({ name, version: deps[d] }));
  if (exists(dir, "components.json")) kits.push({ name: "Radix UI / shadcn/ui", version: "components.json" });
  const pm = exists(dir, "pnpm-lock.yaml") ? "pnpm" : exists(dir, "yarn.lock") ? "yarn" : exists(dir, "bun.lockb") || exists(dir, "bun.lock") ? "bun" : "npm";
  const scripts = pkg.scripts || {};
  const port = frameworks[0]?.port ?? 5173;
  const run = (s) => (pm === "npm" ? `npm run ${s}` : `${pm} ${s}`);
  const commands = [];
  // A production build is closer to what users get (Web Vitals on dev servers are pessimistic).
  if (scripts.build && scripts.preview) commands.push({ kind: "preview", cmd: `${run("build")} && ${run("preview")}`, port: frameworks.some((f) => f.name === "Vite" || f.name === "SvelteKit") ? 4173 : port });
  if (scripts.dev) commands.push({ kind: "dev", cmd: run("dev"), port });
  else if (scripts.start) commands.push({ kind: "start", cmd: run("start"), port });
  if (scripts.serve) commands.push({ kind: "serve", cmd: run("serve"), port });
  result.packages.push({
    dir,
    name: pkg.name,
    packageManager: pm,
    installed: exists(dir, "node_modules"),
    frameworks: frameworks.map(({ name, version }) => ({ name, version })),
    uiKits: [...new Map(kits.map((k) => [k.name, k])).values()],
    scripts: Object.keys(scripts),
    commands,
  });
}

// First free TCP port from `start`, so parallel runs never review each other's server.
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer().once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}
async function freePort(start) {
  for (let p = start; p < start + 50; p++) if (await portFree(p)) return p;
  return start;
}

const staticPort = await freePort(8080);
for (const dir of [".", "public", "docs", "site", "src"]) if (exists(dir, "index.html") && !pkgDirs.includes(dir)) result.static.push({ dir, cmd: `python3 -m http.server ${staticPort} --bind 127.0.0.1 --directory ${dir}`, port: staticPort });

if (exists("manage.py")) result.python = { framework: "Django", cmd: "python manage.py runserver 127.0.0.1:8000", port: 8000 };
else if (exists("pyproject.toml") || exists("requirements.txt")) {
  const txt = ["pyproject.toml", "requirements.txt"].filter((f) => exists(f)).map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  if (/fastapi/i.test(txt)) result.python = { framework: "FastAPI", cmd: "uvicorn <module>:app --port 8000", port: 8000 };
  else if (/flask/i.test(txt)) result.python = { framework: "Flask", cmd: "flask run --port 5000", port: 5000 };
}
if (exists("docker-compose.yml") || exists("compose.yaml") || exists("docker-compose.yaml")) result.notes.push("docker compose file present: the UI may be served by a container");
if (exists("wp-content") || exists("wp-config.php")) result.notes.push("WordPress installation");
if (exists("theme.liquid") || exists("layout", "theme.liquid")) result.notes.push("Shopify theme");

const first = result.packages.find((p) => p.commands.length);
result.suggested = first
  ? { dir: first.dir, cmd: first.commands.find((c) => c.kind === "dev")?.cmd ?? first.commands[0].cmd, url: `http://127.0.0.1:${first.commands.find((c) => c.kind === "dev")?.port ?? first.commands[0].port}/`, needsInstall: !first.installed }
  : result.static[0]
    ? { dir: result.static[0].dir, cmd: result.static[0].cmd, url: `http://127.0.0.1:${result.static[0].port}/` }
    : result.python
      ? { dir: ".", cmd: result.python.cmd, url: `http://127.0.0.1:${result.python.port}/` }
      : null;
for (const pkg of result.packages) for (const c of pkg.commands) c.portBusy = !(await portFree(c.port));
result.stack = [...new Set(result.packages.flatMap((p) => [...p.frameworks.map((f) => f.name), ...p.uiKits.map((k) => k.name)]))];
console.log(JSON.stringify(result, null, 2));
