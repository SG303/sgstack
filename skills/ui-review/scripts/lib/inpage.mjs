// Functions that run inside the page via page.evaluate / addInitScript.
// They must be self-contained: no closures over Node-side variables.

// Installed before any page script runs. Collects Web Vitals style metrics.
export function perfObserverInit() {
  const perf = { fcp: null, lcp: null, lcpElement: null, cls: 0, longtasks: [], events: [] };
  window.__uiPerf = perf;
  let session = 0;
  let sessionStart = 0;
  let last = 0;
  const safe = (type, cb, extra = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra });
    } catch {
      /* entry type not supported */
    }
  };
  safe("paint", (e) => {
    if (e.name === "first-contentful-paint") perf.fcp = e.startTime;
  });
  safe("largest-contentful-paint", (e) => {
    perf.lcp = e.startTime;
    const el = e.element;
    perf.lcpElement = el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}` : null;
  });
  // CLS = largest session window (gap < 1 s, window < 5 s), as defined by web.dev.
  safe("layout-shift", (e) => {
    if (e.hadRecentInput) return;
    if (session && (e.startTime - last > 1000 || e.startTime - sessionStart > 5000)) session = 0;
    if (!session) sessionStart = e.startTime;
    session += e.value;
    last = e.startTime;
    perf.cls = Math.max(perf.cls, session);
  });
  safe("longtask", (e) => perf.longtasks.push({ start: e.startTime, duration: e.duration }));
  safe(
    "event",
    (e) => {
      if (e.interactionId) perf.events.push({ name: e.name, duration: e.duration, interactionId: e.interactionId });
    },
    { durationThreshold: 16 },
  );
}

export function readPerf() {
  const p = window.__uiPerf || {};
  const fcp = p.fcp ?? 0;
  const tbt = (p.longtasks || []).filter((t) => t.start >= fcp).reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
  const byInteraction = {};
  for (const e of p.events || []) byInteraction[e.interactionId] = Math.max(byInteraction[e.interactionId] || 0, e.duration);
  const durations = Object.values(byInteraction);
  return {
    fcpMs: p.fcp,
    lcpMs: p.lcp,
    lcpElement: p.lcpElement,
    cls: p.cls,
    tbtMs: tbt,
    longTasks: (p.longtasks || []).length,
    interactions: durations.length,
    inpMs: durations.length ? Math.max(...durations) : null,
  };
}

// Builds a short, reasonably stable CSS selector for an element.
export function selectorHelperSource() {
  return `window.__uiSel = function (el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id;
    const parts = [];
    let cur = el;
    for (let depth = 0; cur && cur.nodeType === 1 && depth < 4; depth++) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && /^[A-Za-z][\\w-]*$/.test(cur.id)) { parts.unshift('#' + cur.id); break; }
      const cls = typeof cur.className === 'string' ? cur.className.trim().split(/\\s+/).filter(c => c && !/[:\\[\\]\\/]/.test(c)).slice(0, 2) : [];
      if (cls.length) part += '.' + cls.join('.');
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter(c => c.tagName === cur.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  };`;
}

// Static page checks that need no interaction.
export function pageChecks({ isMobile }) {
  const sel = window.__uiSel;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const textOf = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();

  // Small text and long lines.
  const textEls = [...document.querySelectorAll("p, li, td, span, a, label, small, dd, dt, figcaption, button")].filter(
    (el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3),
  );
  const smallText = textEls
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
    .slice(0, 15)
    .map((el) => ({ selector: sel(el), fontSize: getComputedStyle(el).fontSize, text: textOf(el).slice(0, 60) }));
  const longLines = [...document.querySelectorAll("p")]
    .filter(visible)
    .map((el) => {
      const cs = getComputedStyle(el);
      const chars = Math.round(el.getBoundingClientRect().width / (parseFloat(cs.fontSize) * 0.5));
      return { selector: sel(el), approxCharsPerLine: chars };
    })
    .filter((x) => x.approxCharsPerLine > 90)
    .slice(0, 10);

  // Touch targets (mobile): WCAG 2.5.8 minimum is 24px, platform guidelines ask for 44-48px.
  const interactive = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [tabindex]:not([tabindex="-1"])')].filter(visible);
  const smallTargets = isMobile
    ? interactive
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .slice(0, 25)
        .map(({ el, r }) => ({ selector: sel(el), width: Math.round(r.width), height: Math.round(r.height), below24: r.width < 24 || r.height < 24, text: textOf(el).slice(0, 40) }))
    : [];

  // Elements that look clickable but cannot be reached with the keyboard.
  const natural = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL", "OPTION"]);
  const clickableNotFocusable = [...document.querySelectorAll("body *")]
    .filter((el) => {
      if (natural.has(el.tagName) || el.closest("a, button, label, summary")) return false;
      if (el.tabIndex >= 0) return false;
      const handler = el.hasAttribute("onclick") || el.getAttribute("role") === "button";
      const pointer = getComputedStyle(el).cursor === "pointer" && getComputedStyle(el.parentElement || el).cursor !== "pointer";
      return (handler || pointer) && visible(el);
    })
    .slice(0, 20)
    .map((el) => ({ selector: sel(el), text: textOf(el).slice(0, 60) }));

  // Images without intrinsic size are a common CLS source.
  const imgNoDims = [...document.querySelectorAll("img")]
    .filter((img) => !img.getAttribute("width") || !img.getAttribute("height"))
    .filter((img) => !getComputedStyle(img).aspectRatio || getComputedStyle(img).aspectRatio === "auto")
    .slice(0, 15)
    .map((img) => ({ selector: sel(img), src: (img.currentSrc || img.src || "").slice(-80) }));

  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => ({ level: Number(h.tagName[1]), text: textOf(h).slice(0, 80) }));
  const skipped = headings.filter((h, i) => i > 0 && h.level > headings[i - 1].level + 1).map((h) => h.text);
  const landmarks = {
    main: document.querySelectorAll("main, [role=main]").length,
    nav: document.querySelectorAll("nav, [role=navigation]").length,
    header: document.querySelectorAll("header, [role=banner]").length,
    footer: document.querySelectorAll("footer, [role=contentinfo]").length,
  };

  // Readability: Amstad (German) or Flesch reading ease (English). Rough syllable heuristic.
  const lang = (document.documentElement.lang || "").toLowerCase();
  const root = document.querySelector("main, [role=main]") || document.body;
  const text = (root.innerText || "").replace(/\s+/g, " ");
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().split(/\s+/).length >= 3);
  const words = text.match(/\p{L}+/gu) || [];
  const syllables = words.reduce((s, w) => s + Math.max(1, (w.toLowerCase().match(/[aeiouyäöüàâéèêëîïôûù]+/g) || []).length), 0);
  let readability = null;
  if (sentences.length >= 3 && words.length >= 60) {
    const asl = words.length / sentences.length;
    const asw = syllables / words.length;
    const sample = ` ${text.toLowerCase().slice(0, 4000)} `;
    const hits = (ws) => ws.reduce((n, w) => n + (sample.split(` ${w} `).length - 1), 0);
    const de = lang ? lang.startsWith("de") : hits(["der", "die", "und", "ist", "nicht", "sie", "wir", "mit"]) > hits(["the", "and", "is", "not", "you", "we", "with", "of"]);
    const score = de ? 180 - asl - 58.5 * asw : 206.835 - 1.015 * asl - 84.6 * asw;
    readability = { formula: de ? "Amstad" : "Flesch", langGuessed: !lang, score: Math.round(score), avgSentenceWords: Math.round(asl * 10) / 10, words: words.length };
  }

  const darkModeCss = (() => {
    try {
      return [...document.styleSheets].some((s) => {
        try {
          return [...s.cssRules].some((r) => r.media && /prefers-color-scheme:\s*dark/.test(r.media.mediaText));
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  })();

  return {
    title: document.title,
    lang,
    metaViewport: document.querySelector('meta[name=viewport]')?.content || null,
    documentHeight: document.documentElement.scrollHeight,
    smallText,
    longLines,
    smallTargets,
    clickableNotFocusable,
    imgNoDims,
    headings: headings.slice(0, 40),
    skippedHeadingLevels: skipped,
    h1Count: headings.filter((h) => h.level === 1).length,
    landmarks,
    readability,
    darkModeCss,
  };
}

// WCAG 1.4.10: content must reflow at 320 CSS px without horizontal scrolling.
export function reflowCheck() {
  const sel = window.__uiSel;
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const offenders = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed";
    })
    .filter((el, _, arr) => !arr.some((o) => o !== el && o.contains(el)))
    .slice(0, 10)
    .map((el) => ({ selector: sel(el), right: Math.round(el.getBoundingClientRect().right) }));
  return { viewportWidth: vw, scrollWidth: sw, horizontalScroll: sw > vw + 1, offenders };
}

// Records the focused element and its focus styling. The style of the previously
// focused element is compared with its unfocused style to detect a missing indicator.
export function focusProbe() {
  const sel = window.__uiSel;
  const props = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "borderColor", "backgroundColor", "color", "textDecorationLine"];
  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    return props.map((p) => cs[p]).join("|");
  };
  const result = {};
  const prev = window.__uiFocusPrev;
  // Tab can move inside one element (date/time input segments, some custom widgets):
  // the element stays focused, so there is nothing to compare yet.
  if (prev && prev.el === document.activeElement) return { same: true, selector: prev.selector };
  if (prev && prev.el.isConnected) {
    result.prevSelector = prev.selector;
    result.prevIndicator = styleOf(prev.el) !== prev.style;
  }
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    window.__uiFocusPrev = null;
    return { ...result, selector: null };
  }
  const r = el.getBoundingClientRect();
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
  const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(cx, cy);
  const obscured = !!top && !el.contains(top) && !top.contains(el);
  const selector = sel(el);
  window.__uiFocusPrev = { el, selector, style: styleOf(el) };
  return {
    ...result,
    selector,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role"),
    name: (el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.innerText || el.placeholder || el.value || "").replace(/\s+/g, " ").trim().slice(0, 50),
    obscured,
    obscuredBy: obscured ? sel(top) : null,
  };
}

// Detects front-end frameworks, UI kits and CMS from the live DOM.
export function detectRuntimeStack() {
  const has = (s) => {
    try {
      return !!document.querySelector(s);
    } catch {
      return false;
    }
  };
  const classes = new Set();
  for (const el of [...document.querySelectorAll("[class]")].slice(0, 4000)) {
    if (typeof el.className === "string") el.className.split(/\s+/).forEach((c) => c && classes.add(c));
  }
  const anyClass = (re) => [...classes].some((c) => re.test(c));
  const countClass = (re) => [...classes].filter((c) => re.test(c)).length;
  const attrPrefix = (prefix) => [...document.querySelectorAll("body *")].slice(0, 3000).some((el) => [...el.attributes].some((a) => a.name.startsWith(prefix)));
  const generator = document.querySelector('meta[name=generator]')?.content || "";
  const reactFiber = [...document.querySelectorAll("body, body *")].slice(0, 300).some((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactContainer") || k === "_reactRootContainer"));
  const cssText = (() => {
    try {
      return [...document.styleSheets]
        .map((s) => {
          try {
            return [...s.cssRules].slice(0, 400).map((r) => r.cssText).join("\n");
          } catch {
            return "";
          }
        })
        .join("\n");
    } catch {
      return "";
    }
  })();

  const found = [];
  const add = (name, kind, evidence) => found.push({ name, kind, evidence });
  if (window.__NEXT_DATA__ || has("#__next") || has('script[src*="/_next/"]')) add("Next.js", "meta-framework", "__NEXT_DATA__/_next");
  if (window.__NUXT__ || has("#__nuxt")) add("Nuxt", "meta-framework", "__NUXT__");
  if (window.__remixContext) add("Remix / React Router", "meta-framework", "__remixContext");
  if (has("#___gatsby")) add("Gatsby", "meta-framework", "#___gatsby");
  if (has("astro-island") || /astro/i.test(generator)) add("Astro", "meta-framework", "astro-island");
  if (window.__sveltekit || has("[data-sveltekit-preload-data]") || attrPrefix("data-sveltekit")) add("SvelteKit", "meta-framework", "data-sveltekit");
  if (reactFiber || has("[data-reactroot]")) add("React", "framework", "React fiber on DOM nodes");
  if (window.__VUE__ || has("[data-v-app]") || attrPrefix("data-v-")) add("Vue", "framework", "data-v-*");
  if (has("[ng-version]")) add(`Angular ${document.querySelector("[ng-version]").getAttribute("ng-version")}`, "framework", "ng-version");
  if (anyClass(/^svelte-[a-z0-9]+$/)) add("Svelte", "framework", "svelte-* classes");
  if (window._$HY) add("Solid", "framework", "_$HY");
  if (window.jQuery) add(`jQuery ${window.jQuery.fn?.jquery || ""}`.trim(), "library", "window.jQuery");
  if (window.Alpine || has("[x-data]")) add("Alpine.js", "library", "x-data");
  if (window.htmx || has("[hx-get],[hx-post]")) add("htmx", "library", "hx-*");
  if (/wordpress/i.test(generator) || has('link[href*="wp-content"],script[src*="wp-content"]')) add("WordPress", "cms", "wp-content");
  if (window.Shopify) add("Shopify", "cms", "window.Shopify");
  if (has("html[data-wf-site]")) add("Webflow", "cms", "data-wf-site");
  if (/wix/i.test(generator)) add("Wix", "cms", "generator");
  if (/squarespace/i.test(generator)) add("Squarespace", "cms", "generator");
  if (/drupal/i.test(generator)) add("Drupal", "cms", "generator");
  if (/typo3/i.test(generator)) add("TYPO3", "cms", "generator");

  const twCount = countClass(/^(?:[a-z]+:)*(?:-?m[trblxy]?-\d|p[trblxy]?-\d|gap-\d|text-(?:xs|sm|base|lg|[2-9]?xl)|bg-[a-z]+-\d{2,3}|text-[a-z]+-\d{2,3}|rounded(?:-[a-z]+)?|flex|grid-cols-\d|w-\d+|h-\d+|items-center|justify-between)$/);
  if (twCount > 15 || /--tw-/.test(cssText)) add("Tailwind CSS", "css", twCount > 15 ? `${twCount} utility classes` : "--tw-* CSS variables in the stylesheets");
  if (window.bootstrap || (anyClass(/^col-(?:sm|md|lg|xl)-\d+$/) && classes.has("row")) || (classes.has("btn") && anyClass(/^btn-(?:primary|secondary|outline-)/))) add("Bootstrap", "ui-kit", "btn-*/col-*");
  if (anyClass(/^Mui[A-Z]/)) add("Material UI (MUI)", "ui-kit", "Mui* classes");
  if (anyClass(/^chakra-/)) add("Chakra UI", "ui-kit", "chakra-*");
  if (anyClass(/^mantine-/)) add("Mantine", "ui-kit", "mantine-*");
  if (anyClass(/^ant-/)) add("Ant Design", "ui-kit", "ant-*");
  if (attrPrefix("data-radix") || has("[data-slot]")) add("Radix UI / shadcn/ui", "ui-kit", "data-radix-*/data-slot");
  if (has("[data-headlessui-state]")) add("Headless UI", "ui-kit", "data-headlessui-state");
  if (classes.has("v-application") || anyClass(/^v-btn/)) add("Vuetify", "ui-kit", "v-application");
  if (anyClass(/^mat-mdc-|^mat-/)) add("Angular Material", "ui-kit", "mat-*");
  if (anyClass(/^mdc-/) && !anyClass(/^mat-/)) add("Material Components Web", "ui-kit", "mdc-*");
  if (has("md-filled-button,md-outlined-button,md-text-button")) add("Material Web", "ui-kit", "md-* elements");
  if (anyClass(/^p-(?:button|component|inputtext)/)) add("PrimeReact/PrimeVue/PrimeNG", "ui-kit", "p-component");
  if (anyClass(/^fui-/)) add("Fluent UI", "ui-kit", "fui-*");
  if (anyClass(/^(?:cds|bx)--/)) add("IBM Carbon", "ui-kit", "cds--*");
  if (anyClass(/^govuk-/)) add("GOV.UK Design System", "ui-kit", "govuk-*");
  if (anyClass(/^usa-/)) add("U.S. Web Design System", "ui-kit", "usa-*");
  if (has("ion-app")) add("Ionic", "ui-kit", "ion-app");
  if (anyClass(/^q-(?:btn|page|layout)/)) add("Quasar", "ui-kit", "q-*");
  if (classes.has("button") && anyClass(/^is-(?:primary|link|info)$/) && classes.has("columns")) add("Bulma", "ui-kit", "is-*/columns");
  if (has("[data-theme]") && classes.has("btn") && anyClass(/^btn-(?:primary|ghost)$/) && /--tw-/.test(cssText)) add("daisyUI", "ui-kit", "btn + data-theme + tailwind");
  if (has("sl-button, sl-input")) add("Shoelace / Web Awesome", "ui-kit", "sl-* elements");
  return { generator: generator || null, detected: found };
}
