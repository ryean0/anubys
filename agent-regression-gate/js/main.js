import { BRAND } from "./brand.js";
import { CANDIDATES, SCENARIO_SETS, buildRun } from "./demo-data.js";
import {
  WIDE_LAYOUT_MIN,
  createFlowState,
  flowScrollState,
  methodConnectorPaths,
  placeFlowCard,
  flowEscapeApplies,
  presentationForMotion,
  reduceFlow,
} from "./method.js";
import { RESULTS_PATH, RUN_SUMMARY_PATH, parseResults, parseResultsV2, parseRunSummary, summaryRows } from "./results.js";
import { TIMING_SAMPLE_PATH, readTiming, renderTimingHtml } from "./timing.js";
import { bindFilm, bindStory, renderFilmHtml, renderStoryHtml } from "./story.js";
import { METHOD_NOTES, armMissExceeds, formatPercent, formatPoints, formatSignedNumber, scoreRun } from "./verdict.js";
import { renderFoundersHtml } from "./founders.js";

const LINKEDIN = "https://www.linkedin.com/in/rphua-dev";
const SLOT_LABEL = {
  pass: "Pass",
  fail: "Fail",
  agent_timeout: "Step-budget timeout, scored 0",
  infra_timeout: "Infrastructure timeout, excluded",
  missing: "Missing result, excluded",
};

function asset(path) {
  const base = document.documentElement.dataset.base || "./";
  return new URL(path, new URL(base, window.location.href)).href;
}

function siteFile(path) {
  return asset(path);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function initFlow(flow, reduceMotion, bindPlace) {
  flow.dataset.cardMotion = presentationForMotion(reduceMotion).cardMotion;
  let state = createFlowState();
  const wideQuery = window.matchMedia(`(min-width: ${WIDE_LAYOUT_MIN}px)`);
  const coarseQuery = window.matchMedia("(pointer: coarse)");
  let blockHoverUntil = 0;
  let lastPointer = "mouse";
  const wraps = () => [...flow.querySelectorAll(".flow-step-wrap")];

  function boxWithin(element, ancestor) {
    let x = 0;
    let y = 0;
    let node = element;
    while (node && node !== ancestor) {
      x += node.offsetLeft;
      y += node.offsetTop;
      const parent = node.offsetParent;
      if (!parent || (parent !== ancestor && !ancestor.contains(parent))) {
        const boardRect = ancestor.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left - boardRect.left,
          y: rect.top - boardRect.top,
          w: element.offsetWidth,
          h: element.offsetHeight,
        };
      }
      node = parent;
    }
    return { x, y, w: element.offsetWidth, h: element.offsetHeight };
  }

  function layoutConnectors() {
    const board = flow.querySelector(".flow-board");
    const svg = board.querySelector(".flow-svg");
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (width < 2 || height < 2) return;
    svg.setAttribute("viewBox", `0 0 ${Math.round(width)} ${Math.round(height)}`);
    const boxes = {};
    for (const wrap of wraps()) {
      boxes[wrap.dataset.stepId] = boxWithin(wrap.querySelector(".flow-step"), board);
    }
    const paths = methodConnectorPaths(boxes, wideQuery.matches ? "wide" : "narrow");
    const els = [...svg.querySelectorAll(".draw")];
    paths.forEach((d, index) => {
      if (els[index]) els[index].setAttribute("d", d);
    });
  }

  function placeOpenCards() {
    const narrow = !wideQuery.matches;
    for (const wrap of wraps()) {
      const card = wrap.querySelector(".flow-card");
      const show = wrap.classList.contains("is-open") && !wrap.classList.contains("is-dismissed");
      if (narrow || !show) {
        card.classList.remove("is-fixed");
        card.style.top = "";
        card.style.bottom = "";
        card.style.left = "";
        card.style.width = "";
        card.style.removeProperty("--caret");
        if (!show) card.removeAttribute("data-placement");
        continue;
      }
      const anchor = wrap.getBoundingClientRect();
      const width = Math.min(304, Math.max(220, window.innerWidth - 24));
      card.style.width = `${Math.round(width)}px`;
      const height = card.offsetHeight;
      const obstacles = wraps()
        .filter((other) => other !== wrap)
        .map((other) => {
          const rect = other.querySelector(".flow-step").getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        });
      const place = placeFlowCard(
        {
          left: anchor.left,
          top: anchor.top,
          width: anchor.width,
          height: anchor.height,
          right: anchor.right,
          bottom: anchor.bottom,
        },
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
        wrap.dataset.pop === "down" ? "below" : "above",
        { margin: 12, topInset: 72, obstacles },
      );
      card.style.bottom = "auto";
      card.style.top = `${place.top - anchor.top}px`;
      card.style.left = `${place.left - anchor.left}px`;
      card.dataset.placement = place.placement;
      card.style.setProperty("--caret", `${place.caret}px`);
    }
  }

  function apply() {
    for (const wrap of wraps()) {
      const id = wrap.dataset.stepId;
      const open = state.openId === id;
      wrap.classList.toggle("is-open", open);
      wrap.classList.toggle("is-dismissed", state.dismissedId === id);
    }
    layoutConnectors();
    placeOpenCards();
  }

  bindPlace(placeOpenCards);

  for (const wrap of wraps()) {
    const id = wrap.dataset.stepId;
    const button = wrap.querySelector(".flow-step");
    wrap.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch" || coarseQuery.matches || Date.now() < blockHoverUntil) return;
      state = reduceFlow(state, { type: "pointerenter", id, pointerType: event.pointerType || "mouse" });
      apply();
    });
    wrap.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      state = reduceFlow(state, { type: "pointerleave", id });
      apply();
    });
    wrap.addEventListener("focusin", () => {
      state = reduceFlow(state, { type: "focus", id });
      apply();
    });
    wrap.addEventListener("focusout", (event) => {
      if (wrap.contains(event.relatedTarget)) return;
      state = reduceFlow(state, { type: "blur", id });
      apply();
    });
    button.addEventListener("pointerdown", (event) => {
      lastPointer = event.pointerType || "mouse";
      if (lastPointer === "touch" || lastPointer === "pen") blockHoverUntil = Date.now() + 800;
    });
    button.addEventListener("click", (event) => {
      state = reduceFlow(state, {
        type: "activate",
        id,
        pointerType: lastPointer,
        coarse: coarseQuery.matches || lastPointer === "touch" || lastPointer === "pen",
        keyboard: event.detail === 0,
      });
      apply();
    });
  }

  flow.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" && event.key !== "Esc") return;
    if (!flowEscapeApplies(state, flow.contains(event.target))) return;
    state = reduceFlow(state, { type: "escape" });
    apply();
  });

  document.addEventListener("pointerdown", (event) => {
    if (flow.contains(event.target)) return;
    if (!state.pinnedId && !state.openId) return;
    state = reduceFlow(state, { type: "outside" });
    apply();
  });

  wideQuery.addEventListener("change", apply);
  window.addEventListener("resize", () => {
    layoutConnectors();
    placeOpenCards();
  });
  window.addEventListener("load", layoutConnectors);
  layoutConnectors();
}

function initChrome() {
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");
  const progress = document.getElementById("progress");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canAnimate = !reduceMotion && typeof IntersectionObserver === "function";
  if (canAnimate) document.documentElement.classList.add("motion");
  const flow = document.querySelector(".flow");
  const trust = document.querySelector(".trust-stage");
  let placeFlowCards = () => {};
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
      if (!reduceMotion && canAnimate && flow) {
        const rect = flow.getBoundingClientRect();
        const { drawn, step } = flowScrollState(rect.top, window.innerHeight);
        flow.style.setProperty("--draw", drawn.toFixed(3));
        flow.dataset.step = String(step);
      }
      placeFlowCards();
      if (!reduceMotion && trust && trust.offsetHeight > window.innerHeight + 80) {
        const start = trust.getBoundingClientRect().top + window.scrollY;
        const span = trust.offsetHeight - window.innerHeight;
        const progressTrust = Math.min(1, Math.max(0, (window.scrollY - start) / span));
        trust.dataset.step = String(Math.min(3, Math.floor(progressTrust * 4)));
      }
    });
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  if (reduceMotion) {
    document.documentElement.classList.remove("motion");
    if (flow) {
      const presentation = presentationForMotion(true);
      flow.classList.add("is-settled");
      flow.dataset.step = String(presentation.step);
      flow.style.setProperty("--draw", String(presentation.drawn));
      flow.dataset.cardMotion = presentation.cardMotion;
    }
    if (trust) trust.dataset.step = "3";
    document.querySelectorAll(".reveal").forEach((node) => node.classList.add("is-in"));
  } else if (canAnimate) {
    const revealNodes = [...document.querySelectorAll(".reveal")];
    let sawObserver = false;
    let revealObserver;
    try {
      revealObserver = new IntersectionObserver((entries) => {
        sawObserver = true;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      }, { threshold: 0.12, rootMargin: "0px 0px -4% 0px" });
    } catch {
      document.documentElement.classList.remove("motion");
      revealObserver = null;
    }
    if (revealObserver) {
      const revealVisible = () => {
        for (const node of revealNodes) {
          const rect = node.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) node.classList.add("is-in");
        }
      };
      revealNodes.forEach((node) => revealObserver.observe(node));
      revealVisible();
      window.addEventListener("scroll", revealVisible, { passive: true });
      window.setTimeout(() => {
        if (!sawObserver) {
          document.documentElement.classList.remove("motion");
          revealNodes.forEach((node) => node.classList.add("is-in"));
        }
      }, 1000);
    }
  }

  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close" : "Menu";
    if (open) menu.querySelector("a")?.focus();
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
      toggle.focus();
    }
  });

  const sections = [...document.querySelectorAll("main section[id]")];
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    for (const link of menu.querySelectorAll("a[href^='#']")) {
      link.toggleAttribute("aria-current", link.getAttribute("href") === `#${visible.target.id}`);
      if (link.getAttribute("href") === `#${visible.target.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }, { rootMargin: "-45% 0px -45% 0px", threshold: [0.2, 0.5] });
  sections.forEach((section) => observer.observe(section));

  const placeTip = (button) => {
    const tip = button.parentElement.querySelector(".term-tip");
    const rect = button.getBoundingClientRect();
    const margin = 16;
    const width = Math.min(288, window.innerWidth - margin * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    if (left < margin) left = margin;
    let top = rect.bottom + 8;
    if (top + 96 > window.innerHeight) top = Math.max(margin, rect.top - 8 - 96);
    tip.style.width = `${width}px`;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  for (const term of document.querySelectorAll(".term")) {
    const button = term.querySelector("button");
    const place = () => placeTip(button);
    term.addEventListener("mouseenter", place);
    term.addEventListener("focusin", place);
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      for (const other of document.querySelectorAll(".term.is-open")) {
        if (other === term) continue;
        other.classList.remove("is-open");
        other.querySelector("button").setAttribute("aria-expanded", "false");
      }
      place();
      button.setAttribute("aria-expanded", String(!open));
      term.classList.toggle("is-open", !open);
    });
  }

  const dialog = document.getElementById("pilot");
  for (const button of document.querySelectorAll("[data-pilot]")) {
    button.addEventListener("click", () => dialog.showModal());
  }
  document.getElementById("pilot-cancel").addEventListener("click", () => dialog.close());
  if (flow) initFlow(flow, reduceMotion, (place) => { placeFlowCards = place; });
  bindStory(document);

  document.getElementById("pilot-form").addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.href = LINKEDIN;
    document.getElementById("pilot-note").textContent = `If LinkedIn did not open, use ${LINKEDIN}.`;
  });
}

function renderTeaser(view) {
  const teaser = document.getElementById("results-teaser");
  if (!teaser) return;
  const status = teaser.querySelector(".teaser-status");
  if (status) {
    status.textContent = view.headline;
    status.dataset.verdict = view.verdict;
  }
  const meta = teaser.querySelector(".teaser-meta");
  if (meta) meta.textContent = view.status === "preliminary" ? "Preliminary" : "Final";
}

function renderBanner(banner) {
  const host = document.getElementById("status-banner");
  if (!host) return;
  host.replaceChildren(el("div", { class: "banner", "data-tone": banner.tone, role: "status" }, [
    el("div", { class: "wrap banner-inner" }, [
      el("strong", {}, banner.title),
      el("span", {}, banner.body),
    ]),
  ]));
}

function missLine(counts) {
  return Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ");
}

function measure(value) {
  const text = String(value);
  if (!/\d/.test(text)) return text;
  return [text, el("span", { class: "example-tag" }, "Example")];
}

function renderResults(view) {
  renderBanner(view.banner);
  const root = document.getElementById("results-root");
  const harness = view.shape === "harness";
  const armRows = harness
    ? [
        ["Model", view.modelIds.baseline, view.modelIds.candidate],
        ["Scheduled rollouts", view.arms.baseline.scheduled, view.arms.candidate.scheduled],
        ["Environment misses", view.arms.baseline.environmentMisses, view.arms.candidate.environmentMisses],
        ["Miss rate", view.arms.baseline.rateText, view.arms.candidate.rateText],
        ["Over the 5% miss line", view.arms.baseline.overMissLimit ? "Yes" : "No", view.arms.candidate.overMissLimit ? "Yes" : "No"],
      ]
    : [
        ["Scheduled rollouts", view.arms.baseline.scheduled, view.arms.candidate.scheduled],
        ["Environment misses", view.arms.baseline.environmentMisses, view.arms.candidate.environmentMisses],
        ["Miss counts", missLine(view.arms.baseline.missCounts), missLine(view.arms.candidate.missCounts)],
        ["Pass rate", view.arms.baseline.passRateText, view.arms.candidate.passRateText],
        ["Over the 5% miss line", view.arms.baseline.overMissLimit ? "Yes" : "No", view.arms.candidate.overMissLimit ? "Yes" : "No"],
      ];
  if (!harness && (view.arms.baseline.modelId || view.arms.candidate.modelId)) {
    armRows.unshift(["Model", view.arms.baseline.modelId || "n/a", view.arms.candidate.modelId || "n/a"]);
  }
  const meta = [view.runKind, harness ? view.baselinePoolModelId : "", view.suiteId, view.interval.text].filter(Boolean).join(" · ");

  const diagnosticRows = view.diagnostics.length
    ? view.diagnostics.map((row) => ({
        name: row.scenarioId,
        caption: row.familyId,
        baselineText: row.baselineText,
        candidateText: row.candidateText,
      }))
    : view.scenarios;

  root.replaceChildren(el("div", { class: "panel" }, [
    el("p", { class: "kicker" }, "Suite check"),
    el("article", { class: "verdict", "data-verdict": view.verdict }, [
      el("p", { class: "kicker" }, view.status === "preliminary" ? "Preliminary" : "Final"),
      el("h3", {}, view.headline),
      el("p", { class: "why" }, view.why),
    ]),
    el("p", {
      class: "fine",
      "data-interval": view.interval.fromFile ? "file" : "fallback",
    }, [
      meta,
      /\d/.test(meta) ? el("span", { class: "example-tag" }, "Example") : null,
    ]),
    harness ? el("p", { class: "fine" }, [
      "Reported cost ",
      el("strong", {}, measure(`$${view.costUsd}`)),
    ]) : null,
    renderRunSummary(view.runSummary),
    el("div", { class: "sheet sheet-head" }, [
      el("span", {}, "Recorded"),
      armHead("Baseline", view.arms.baseline.caption),
      armHead("Candidate", view.arms.candidate.caption),
    ]),
    ...armRows.map(([label, base, cand]) => el("div", { class: "sheet" }, [
      el("span", {}, label),
      el("strong", {}, harness ? measure(base) : String(base)),
      el("strong", {}, harness ? measure(cand) : String(cand)),
    ])),
    el("p", { class: "fine" }, "Environment misses may equal 5% of scheduled rollouts. Above that, on either arm, is over the cap. The check fails on Block. An invalid run isn't scored."),
    el("h3", { class: "block-title" }, "Scenario diagnostics"),
    el("table", { class: "diag" }, [
      el("caption", {}, "Diagnostics only. These rates do not pass or block a scenario."),
      el("thead", {}, el("tr", {}, [el("th", { scope: "col" }, "Scenario"), el("th", { scope: "col" }, "Baseline rate"), el("th", { scope: "col" }, "Candidate rate")])),
      el("tbody", {}, diagnosticRows.map((row) => el("tr", {}, [
        el("th", { scope: "row", ...(row.caption ? { title: row.caption } : {}) }, [
          row.name,
          row.caption ? el("span", { class: "subtitle" }, row.caption) : null,
        ]),
        el("td", {}, harness ? measure(row.baselineText) : row.baselineText),
        el("td", {}, harness ? measure(row.candidateText) : row.candidateText),
      ]))),
    ]),
    el("div", { class: "charts" }, [renderChart(view.charts.mde), renderChart(view.charts.aa)]),
    view.summaryNote ? el("p", { class: "file-note" }, view.summaryNote) : null,
    el("p", { class: "file-note" }, [
      "Loaded from ",
      el("a", { href: asset(RESULTS_PATH) }, RESULTS_PATH),
      ". level 0.9.",
      el("span", { class: "example-tag" }, "Example"),
    ]),
  ]));
}

function renderRunSummary(summary) {
  const rows = summaryRows(summary);
  if (rows.length === 0) return null;
  return el("section", { class: "run-summary", "aria-label": "Run summary" }, [
    el("h3", { class: "block-title" }, "Run summary"),
    ...rows.map((row) => el("p", {}, [
      el("span", {}, row.label),
      el("strong", {}, row.text),
      row.example ? el("span", { class: "example-tag" }, "Example") : null,
    ])),
  ]);
}

function armHead(label, caption) {
  return el("strong", caption ? { title: caption } : {}, [
    label,
    caption ? el("span", { class: "subtitle" }, caption) : null,
  ]);
}

function renderChart(chart) {
  const body = chart.status === "coming_soon"
    ? el("div", { class: "chart-frame" }, "No series. This check is not in the file yet.")
    : chart.points.length
      ? mdeSvg(chart)
      : el("div", { class: "chart-frame" }, [
          el("p", {}, `${chart.yLabel || chart.title} · ${chart.xLabel || "rollout budget"}`),
          el("p", {}, "No series in this file."),
        ]);
  return el("figure", { class: "chart" }, [
    el("header", {}, [
      el("h3", {}, chart.title),
      el("span", { class: "pill", "data-status": chart.status }, chart.status === "coming_soon" ? "Coming soon" : chart.status),
    ]),
    body,
    el("figcaption", {}, chart.caption || "No caption in this results file."),
  ]);
}

function mdeSvg(chart) {
  const width = 520;
  const height = 220;
  const pad = 36;
  const budgets = chart.points.map((point) => point.budget);
  const maxBudget = Math.max(...budgets, 1);
  const coords = chart.points.map((point, index) => {
    const x = pad + (point.budget / maxBudget) * (width - pad * 2);
    const y = pad + index * 8;
    return `${x},${height - y}`;
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${chart.title}. ${chart.points.map((point) => `${point.budget} rollouts, drop ${point.dropText}`).join(". ")}`);
  svg.innerHTML = `<line x1="${pad}" y1="${height - pad}" x2="${width - 16}" y2="${height - pad}" stroke="#a1a1aa"/><line x1="${pad}" y1="16" x2="${pad}" y2="${height - pad}" stroke="#a1a1aa"/><polyline fill="none" stroke="#f4f4f5" stroke-width="1.5" points="${coords.join(" ")}"/>`;
  return el("div", { class: "chart-frame" }, svg);
}

function renderResultsError(error) {
  if (!document.getElementById("results-root")) return;
  const message = error.message || "Could not read results.json";
  const unsupported = message.startsWith("unsupported results version ");
  renderBanner({
    tone: unsupported ? "unsupported" : "error",
    title: unsupported ? "Unsupported results" : "Results file could not be read",
    body: message,
  });
  document.getElementById("results-root").replaceChildren(
    el("div", { class: "panel" }, [
      el("h3", {}, unsupported ? message : "The results file could not be read"),
      el("p", { class: "why" }, unsupported ? "Supported files are results version 1, 2.0.0, and 2.1.0." : message),
    ]),
  );
}

let recorded = null;

function renderDemo() {
  const root = document.getElementById("demo-root");
  let setId = SCENARIO_SETS[0].id;
  let candidateId = "stable";
  let phase = "idle";
  let result = null;
  let input = null;
  let token = 0;
  const timers = [];

  const live = el("div", { "aria-live": "polite", "aria-atomic": "true" });
  const stage = el("div");
  const shell = el("div", { class: "console" }, [
    el("div", { class: "console-bar" }, [
      el("strong", {}, "Sample run"),
      el("span", {}, "Local configuration. Not results.json. Not a customer benchmark."),
    ]),
    el("div", { class: "console-body" }, [
      el("div", { class: "pickers" }, [
        fieldset("Suite", "scenario-set", SCENARIO_SETS, setId, (id) => { setId = id; reset(); paint(); }),
        fieldset("Configuration", "candidate", CANDIDATES, candidateId, (id) => { candidateId = id; reset(); paint(); }),
      ]),
      el("div", { class: "runbar" }, [
        el("button", { type: "button", class: "btn btn-primary", id: "run-btn", onclick: run }, "Run"),
        el("p", {}, "Repeated rollouts per arm · paired by scenario"),
      ]),
      el("ul", { class: "legend" }, [
        legendItem("pass", "Pass"),
        legendItem("fail", "Fail"),
        legendItem("agent_timeout", "Step-budget timeout"),
        legendItem("infra_timeout", "Excluded"),
      ]),
    ]),
    stage,
    live,
    el("details", { class: "math" }, [
      el("summary", {}, "Scoring notes"),
      ...Object.values(METHOD_NOTES).map((text) => el("p", {}, text)),
    ]),
  ]);
  root.replaceChildren(shell);

  function fieldset(legend, name, options, current, onChange) {
    return el("fieldset", {}, [
      el("legend", {}, legend),
      el("div", { class: "choices" }, options.map((option) => el("label", { class: "choice" }, [
        el("input", {
          type: "radio",
          name,
          value: option.id,
          checked: option.id === current,
          onchange: () => onChange(option.id),
        }),
        el("span", { class: "choice-name" }, option.name),
        el("span", { class: "choice-summary" }, option.summary),
      ]))),
    ]);
  }

  function legendItem(kind, label) {
    return el("li", {}, [el("i", { class: "cell", "data-kind": kind, "aria-hidden": "true" }), label]);
  }

  function clearTimers() {
    while (timers.length) window.clearTimeout(timers.pop());
  }

  function reset() {
    token += 1;
    clearTimers();
    phase = "idle";
    result = null;
    input = null;
  }

  function run() {
    const mine = ++token;
    clearTimers();
    input = buildRun(setId, candidateId);
    result = scoreRun(input);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      phase = "done";
      paint();
      return;
    }
    phase = "running";
    paint();
    const fill = stage.querySelector(".timeline-fill");
    requestAnimationFrame(() => {
      if (token !== mine || !fill) return;
      fill.dataset.on = "1";
    });
    timers.push(window.setTimeout(() => {
      if (token !== mine) return;
      phase = "done";
      paint();
    }, 720));
  }

  function paint() {
    const button = document.getElementById("run-btn");
    if (button) {
      button.disabled = phase === "running";
      button.textContent = phase === "running" ? "Running" : phase === "done" ? "Run again" : "Run";
    }
    const set = SCENARIO_SETS.find((item) => item.id === setId);
    const show = phase !== "idle" && input && result;
    stage.replaceChildren(
      el("div", { class: "console-body" }, [
        timelineBlock(),
        show ? gridBlock(set) : el("p", { class: "fine" }, phase === "idle" ? "Select a configuration and run." : ""),
        show && phase === "done" ? rateBlock(result) : null,
        show && phase === "done" ? missBlock(result) : null,
      ].filter(Boolean)),
    );
    if (phase === "done" && result) live.replaceChildren(verdictCard(result));
    else if (phase === "running") live.replaceChildren(el("p", { class: "fine" }, "Run in progress."));
    else live.replaceChildren();
  }

  function timelineBlock() {
    return el("div", { class: "dash-block", style: "border-top:0;padding-top:0" }, [
      el("div", { class: "timeline-meta" }, [
        el("span", {}, "Run timeline"),
        el("span", { class: "mono" }, phase === "idle" ? "idle" : phase === "running" ? "scoring" : "complete"),
      ]),
      el("div", { class: "timeline-track", "aria-hidden": "true" }, el("i", {
        class: "timeline-fill",
        "data-on": phase === "done" ? "1" : "0",
      })),
    ]);
  }

  function gridBlock(set) {
    const baselineCaption = recorded?.arms?.baseline?.caption || "";
    const candidateCaption = recorded?.arms?.candidate?.caption || "";
    const baselineModel = recorded?.arms?.baseline?.modelId || "";
    const candidateModel = recorded?.arms?.candidate?.modelId || "";
    const baselineNote = armNote(baselineCaption, baselineModel);
    const candidateNote = armNote(candidateCaption, candidateModel);
    return el("div", { class: "dash-block" }, [
      el("h3", {}, "Rollouts"),
      baselineNote || candidateNote ? el("div", { class: "arm-notes" }, [
        captionNote("Baseline", baselineNote),
        captionNote("Candidate", candidateNote),
      ]) : null,
      ...set.scenarios.map((scenario) => {
        const raw = input.find((row) => row.id === scenario.id);
        const scored = result.scenarios.find((row) => row.id === scenario.id);
        const settled = phase === "done";
        const caption = recordedCaption(scenario.id);
        return el("article", { class: "scenario" }, [
          el("h3", caption ? { title: caption } : {}, scenario.name),
          caption ? el("p", { class: "subtitle" }, caption) : null,
          el("p", { class: "hash" }, scenario.id),
          el("div", { class: "arms" }, [
            armGrid("Baseline", raw.baseline, settled ? scored.baseline : null, baselineNote),
            armGrid("Candidate", raw.candidate, settled ? scored.candidate : null, candidateNote),
          ]),
        ]);
      }),
    ]);
  }

  function captionNote(label, caption) {
    if (!caption) return null;
    return el("p", { class: "subtitle", title: caption }, [
      el("span", { class: "note-label" }, label),
      " ",
      caption,
    ]);
  }

  function armNote(caption, modelId) {
    if (modelId && caption) return `${modelId}: ${caption}`;
    return modelId || caption || "";
  }

  function armGrid(name, arm, official, caption) {
    const label = official
      ? formatPercent(official.passes, official.valid)
      : `${arm.scheduled} scheduled`;
    return el("div", {}, [
      el("p", { class: "arm-label", ...(caption ? { title: caption } : {}) }, [name, el("b", {}, label)]),
      el("div", { class: "cells", "aria-hidden": "true" }, arm.slots.slice(0, arm.scheduled).map((slot) => el("i", {
        class: "cell",
        "data-kind": official ? slot : "",
        title: official ? SLOT_LABEL[slot] : "Pending",
      }))),
    ]);
  }

  function rateBlock(scored) {
    const rows = [
      rateRow("Baseline", scored.baseline),
      rateRow("Candidate", scored.candidate),
    ];
    return el("div", { class: "dash-block" }, [
      el("h3", {}, "Pass rate"),
      ...rows,
      scored.meanDelta == null ? el("p", { class: "fine" }, "No interval. The run is invalid.") : interval(scored),
    ]);
  }

  function rateRow(name, arm) {
    const text = arm.passRate == null ? "n/a" : formatPercent(arm.passes, arm.valid);
    const width = arm.passRate == null ? 0 : Math.round(arm.passRate * 1000) / 10;
    return el("div", { class: "rate-row" }, [
      el("span", {}, name),
      el("span", { class: "mono" }, text),
      el("span", { class: "rate-track", "aria-hidden": "true" }, el("i", { style: `width:${width}%` })),
    ]);
  }

  function interval(scored) {
    const pad = Math.max(0.02, (scored.upper - scored.lower) * 0.35);
    let min = Math.min(scored.lower, scored.meanDelta, 0) - pad;
    let max = Math.max(scored.upper, scored.meanDelta, 0) + pad;
    if (max - min < 0.05) max = min + 0.05;
    const x = (value) => ((value - min) / (max - min)) * 100;
    const start = x(scored.lower);
    return el("div", { style: "margin-top:0.7rem" }, [
      el("div", { class: "timeline-meta" }, [
        el("span", {}, "90% interval on the gap"),
        el("span", { class: "mono" }, `${formatSignedNumber(scored.lower)} to ${formatSignedNumber(scored.upper)} pp`),
      ]),
      el("div", { class: "ci-scale", "aria-hidden": "true" }, [
        el("i", { class: "ci-zero", style: `left:${x(0)}%` }),
        el("i", { class: "ci-band", style: `left:${start}%;width:${Math.max(0.8, x(scored.upper) - start)}%` }),
        el("i", { class: "ci-mean", style: `left:${x(scored.meanDelta)}%` }),
      ]),
      el("div", { class: "ci-labels mono" }, [
        el("span", {}, formatSignedNumber(min)),
        el("span", {}, "0"),
        el("span", {}, formatSignedNumber(max)),
      ]),
    ]);
  }

  function missBlock(scored) {
    return el("div", { class: "dash-block" }, [
      el("h3", {}, "Miss rate · 5% cap"),
      missMeter("Baseline", scored.baseline),
      missMeter("Candidate", scored.candidate),
    ]);
  }

  function missMeter(name, arm) {
    const over = armMissExceeds(arm.excluded, arm.scheduled);
    const rate = arm.scheduled ? arm.excluded / arm.scheduled : 0;
    const fill = Math.min(100, (rate / 0.2) * 100);
    return el("div", { style: "margin-top:0.55rem" }, [
      el("div", { class: "meter-top" }, [
        el("span", {}, name),
        el("span", { class: "mono" }, formatPercent(arm.excluded, arm.scheduled)),
        el("span", {}, over ? "Over cap" : "Within cap"),
      ]),
      el("div", { class: "meter-track", "aria-hidden": "true" }, [
        el("i", { class: "meter-fill", "data-over": over ? "1" : "0", style: `width:${fill}%` }),
        el("i", { class: "meter-cap", style: "left:25%" }),
      ]),
    ]);
  }

  function verdictCard(scored) {
    const rows = [];
    if (scored.meanDelta != null) rows.push(["Gap", formatPoints(scored.meanDelta)]);
    if (scored.candidate.agentTimeouts > 0) rows.push(["Step-budget timeouts", `${scored.candidate.agentTimeouts} scored 0`]);
    return el("div", { class: "console-body", style: "padding-top:0" }, [
      el("article", { class: "verdict", "data-verdict": scored.verdict }, [
        el("p", { class: "kicker" }, "Suite check"),
        el("h3", {}, scored.headline),
        rows.length ? el("dl", { class: "statline" }, rows.map(([label, value]) => el("div", {}, [el("dt", {}, label), el("dd", {}, value)]))) : null,
        el("p", { class: "why" }, scored.why),
      ]),
    ]);
  }

  paint();
  repaintConsole = paint;
}

function recordedCaption(id) {
  const row = recorded?.scenarios?.find((item) => item.id === id);
  return row?.caption || "";
}

let repaintConsole = () => {};

const founderList = document.getElementById("founder-list");
if (founderList) founderList.innerHTML = renderFoundersHtml();

const howRoot = document.getElementById("how-root");
if (howRoot) howRoot.innerHTML = renderStoryHtml();

const filmRoot = document.getElementById("film-root");
if (filmRoot) {
  filmRoot.innerHTML = renderFilmHtml();
  bindFilm(filmRoot);
}

initChrome();
initCodeCopy();
initOsTabs();
if (document.getElementById("demo-root")) renderDemo();

function loadJson(path) {
  return fetch(asset(path)).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return response.json();
  });
}

if (document.getElementById("results-root") || document.getElementById("results-teaser")) {
  const summaryPromise = document.getElementById("results-root")
    ? loadJson(RUN_SUMMARY_PATH).catch(() => null)
    : Promise.resolve(null);
  Promise.all([loadJson(RESULTS_PATH), summaryPromise])
    .then(([doc, summaryDoc]) => {
      const view = doc && doc.version === 1 ? parseResults(doc) : parseResultsV2(doc);
      if (summaryDoc) view.runSummary = parseRunSummary(summaryDoc);
      recorded = view;
      if (document.getElementById("results-root")) renderResults(view);
      renderTeaser(view);
      repaintConsole();
    })
    .catch((error) => {
      const meta = document.querySelector("#results-teaser .teaser-meta");
      if (meta) meta.textContent = "Results file could not be read";
      renderResultsError(error instanceof Error ? error : new Error("Could not read results.json"));
    });
}

const timingRoot = document.getElementById("timing-root");
if (timingRoot) {
  const rel = timingRoot.getAttribute("data-timing") || TIMING_SAMPLE_PATH;
  fetch(siteFile(rel))
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load timing sample (${response.status}).`);
      return response.json();
    })
    .then((doc) => {
      timingRoot.innerHTML = renderTimingHtml(readTiming(doc));
    })
    .catch(() => {
      timingRoot.innerHTML = renderTimingHtml(readTiming(undefined));
    });
}

function initCodeCopy() {
  for (const block of document.querySelectorAll(".docs-code")) {
    const button = block.querySelector(".code-copy");
    const code = block.querySelector("code");
    if (!button || !code) continue;
    button.addEventListener("click", async () => {
      const text = code.textContent ?? "";
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied";
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        button.textContent = "Selected";
      }
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1600);
    });
  }
}

function initOsTabs() {
  const root = document.querySelector("[data-os-switch]");
  if (!root) return;
  const tablist = root.querySelector('[role="tablist"]');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const status = document.getElementById("os-status");
  const labels = {
    mac: "macOS",
    windows: "Windows (PowerShell)",
    linux: "Linux",
  };

  function select(os, shouldFocus) {
    if (!labels[os]) return;
    root.dataset.os = os;
    for (const tab of tabs) {
      const on = tab.dataset.os === os;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      if (on && shouldFocus) tab.focus();
    }
    if (status) status.textContent = `Showing steps for ${labels[os]}.`;
  }

  tablist.addEventListener("keydown", (event) => {
    const index = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    let next = index < 0 ? 0 : index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (next + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (next - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(tabs[next].dataset.os, true);
  });

  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab.dataset.os, false));
  }
}
