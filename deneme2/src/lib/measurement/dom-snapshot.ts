/**
 * DOM snapshot - the backbone of evidence.
 *
 * Evidence coordinates never come from the model. The model reports a text it
 * read; we locate that text among the nodes collected here and compute the box
 * ourselves. No match means the observation becomes UNKNOWN, so a hallucinated
 * claim cannot pass silently.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextNode {
  id: number;
  text: string;
  selector: string;
  tag: string;
  box: Box;
  /**
   * Does the node fall inside the area the screenshot covers?
   *
   * Carousel slides and horizontally scrolled strips sit outside it (one bank
   * page produced x = -1304). Such nodes are NOT dropped - they answer "is it
   * on the page at all" - but they can never be evidence, because the user
   * does not see them and the coordinates land nowhere in the image.
   */
  onScreen: boolean;
}

export interface InteractiveElement {
  id: number;
  role: "link" | "button" | "input" | "form" | "select" | "textarea";
  text: string;
  /** aria-label / placeholder / title / name. Icon buttons have no text. */
  label: string;
  href: string | null;
  inputType: string | null;
  required: boolean;
  selector: string;
  box: Box;
  onScreen: boolean;
  buttonLike: boolean;
  /** Button-like AND contains an action verb AND outside menu/footer/cookie. */
  primaryCta: boolean;
  container: "menu" | "footer" | "cookie" | "body";
}

export interface CookieBanner {
  found: boolean;
  box: Box | null;
  coveragePercent: number;
}

export interface MenuMeasurement {
  itemCount: number;
  /** How the menu was found - needed to debug a zero result. */
  method: "nav-list" | "nav-links" | "menubar" | "header-list" | "top-row" | "not-found";
  selector: string | null;
  /** A collapsed (hamburger) menu is NOT an absent menu. */
  possiblyCollapsed: boolean;
}

/**
 * A named rectangle found in the DOM. This is what the report highlights when
 * the user hovers. The box always comes from a real element, never from a
 * model - the selector makes it re-verifiable.
 */
export interface RawRegion {
  type:
    | "MENU"
    | "HERO"
    | "CONTENT"
    | "CARD_LIST"
    | "CALCULATOR"
    | "FORM"
    | "TRUST"
    | "FOOTER"
    | "COOKIE";
  /** Provisional, structural name. A model may later give it a readable one. */
  name: string;
  box: Box;
  selector: string;
  /** Why this element was classified as this type - useful when debugging. */
  basis: string;
}

export interface DomSnapshot {
  url: string;
  title: string;
  lang: string | null;
  viewport: { w: number; h: number };
  pageHeight: number;
  pageWidth: number;
  textNodes: TextNode[];
  interactive: InteractiveElement[];
  visibleText: string;
  visibleTextLength: number;
  offScreenTextLength: number;
  offScreenNodeCount: number;
  cookieBanner: CookieBanner;
  menu: MenuMeasurement;
  regions: RawRegion[];
  /** Sorted on-screen text, hashed. See patterns.contentSimilarity for why. */
  contentSignature: string;
}

/**
 * Runs inside the page. Uses no closures - the source is handed to Playwright.
 */
export function collectDomSnapshot(): DomSnapshot {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = window.scrollX;
  const sy = window.scrollY;

  const pageWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
    vw,
  );

  function toBox(r: DOMRect): Box {
    return {
      x: Math.round(r.left + sx),
      y: Math.round(r.top + sy),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }

  function isOnScreen(b: Box): boolean {
    if (b.x + b.w <= 1) return false;
    if (b.x >= pageWidth - 1) return false;
    if (b.y + b.h <= 1) return false;
    return true;
  }

  function isVisible(el: Element): boolean {
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (Number(st.opacity) === 0) return false;
    return true;
  }

  /**
   * Turkish-safe lowercase, duplicated from lib/measurement/text.ts because
   * this function is serialised into the browser and cannot import.
   */
  function fold(s: string): string {
    return s
      .replace(/[İIı]/g, "i")
      .toLowerCase()
      .replace(/̇/g, "");
  }

  /** Height of the top strip, used only as a coarse hint. */
  const TOP_STRIP = Math.min(180, Math.round(vh * 0.2));

  function buildSelector(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 6) {
      let p = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(p + "#" + CSS.escape(cur.id));
        break;
      }
      const classes = (cur.getAttribute("class") || "")
        .trim()
        .split(/\s+/)
        .filter((c) => c && c.length < 30 && !/^\d/.test(c))
        .slice(0, 2);
      if (classes.length) p += "." + classes.map((c) => CSS.escape(c)).join(".");
      const parent = cur.parentElement;
      if (parent) {
        const self = cur;
        const siblings = Array.from(parent.children).filter(
          (k) => k.tagName === self.tagName,
        );
        if (siblings.length > 1) p += ":nth-of-type(" + (siblings.indexOf(self) + 1) + ")";
      }
      parts.unshift(p);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);

  /**
   * An element's visible text.
   *
   * `el.textContent` cannot be used: it swallows the body of nested <script>
   * tags. On one bank page that made a CDATA JavaScript block count as a menu
   * item.
   */
  function elementText(el: Element): string {
    let out = "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      if (!p || SKIP_TAGS.has(p.tagName)) continue;
      out += " " + (n.textContent || "");
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /** Language switchers and icon-only links are not menu items. */
  function countsAsMenuItem(text: string): boolean {
    const t = text.trim();
    if (t.length < 2 || t.length > 40) return false;
    if (/^(tr|en|de|ar|ru|fr)$/i.test(t)) return false;
    return true;
  }

  // ---- Cookie banner (found first; CTA counting must exclude it) ----
  const COOKIE_WORDS = [
    "çerez", "cerez", "cookie", "kvkk", "gizlilik",
    "kabul et", "accept", "consent", "onayla",
  ];
  let cookieEl: Element | null = null;
  let cookieBanner: CookieBanner = { found: false, box: null, coveragePercent: 0 };
  let largestArea = 0;
  document
    .querySelectorAll('div, section, aside, dialog, [role="dialog"]')
    .forEach((el) => {
      const st = window.getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "sticky") return;
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 40) return;
      const t = fold(el.textContent || "");
      if (t.length > 4000) return;
      if (!COOKIE_WORDS.some((w) => t.includes(fold(w)))) return;
      const area = r.width * r.height;
      if (area <= largestArea) return;
      largestArea = area;
      cookieEl = el;
      cookieBanner = {
        found: true,
        box: toBox(r),
        coveragePercent: Math.round((area / (vw * vh)) * 100),
      };
    });

  // ---- Text nodes ----
  const textNodes: TextNode[] = [];
  const onScreenParts: string[] = [];
  let offScreenTextLength = 0;
  let offScreenNodeCount = 0;
  let counter = 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const parent = node.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName)) continue;
    if (!isVisible(parent)) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const box = toBox(r);
    const onScreen = isOnScreen(box);
    if (onScreen) {
      onScreenParts.push(text);
    } else {
      offScreenTextLength += text.length;
      offScreenNodeCount++;
    }

    if (textNodes.length < 5000) {
      textNodes.push({
        id: counter++,
        text,
        selector: buildSelector(parent),
        tag: parent.tagName.toLowerCase(),
        box,
        onScreen,
      });
    }
  }

  // ---- Interactive elements ----
  // Compared against `fold`, so every entry is written folded. Turkish sites
  // are routinely bilingual, so English equivalents are included - university
  // and hospital sites often leave their buttons in English.
  const ACTION_WORDS = [
    "basvur", "hesapla", "incele", "kesfet", "satin al", "sepete", "randevu",
    "giris yap", "kayit ol", "uye ol", "indir", "teklif al", "hemen", "basla",
    "gonder", "abone ol", "rezervasyon", "siparis", "talep", "goruntule",
    "devam et", "sorgula", "alisveris", "detayli bilgi", "daha fazla", "satin",
    "apply", "learn more", "read more", "get started", "sign up", "log in",
    "discover", "explore", "buy now", "add to cart", "book now", "find out",
    "see more", "view all", "download", "subscribe", "request",
  ];

  /**
   * Which structural region an element sits in.
   *
   * Semantic tags first, then geometry. Some sites build the top menu out of
   * plain divs - one hospital page had no <nav> or <header> at all. Without a
   * geometric fallback, a site using semantic HTML excludes its menu links
   * from the CTA count while a site that does not keeps counting them, and
   * comparing those two in one cohort is invalid.
   */
  function findContainer(el: Element, box: Box): InteractiveElement["container"] {
    if (cookieEl !== null && (cookieEl as Element).contains(el)) return "cookie";
    if (el.closest('footer, [role="contentinfo"]')) return "footer";
    if (el.closest('nav, [role="navigation"], [role="menubar"], header')) return "menu";
    if (box.y < TOP_STRIP) return "menu";
    return "body";
  }

  const interactive: InteractiveElement[] = [];
  const SELECTOR =
    'a[href], button, input, select, textarea, form, [role="button"], [role="link"]';

  document.querySelectorAll(SELECTOR).forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const box = toBox(r);

    const tag = el.tagName.toLowerCase();
    const roleAttr = el.getAttribute("role");
    let role: InteractiveElement["role"];
    if (tag === "a" || roleAttr === "link") role = "link";
    else if (tag === "button" || roleAttr === "button") role = "button";
    else if (tag === "form") role = "form";
    else if (tag === "select") role = "select";
    else if (tag === "textarea") role = "textarea";
    else role = "input";

    const st = window.getComputedStyle(el);
    const hasBackground =
      st.backgroundColor !== "rgba(0, 0, 0, 0)" && st.backgroundColor !== "transparent";
    const hasBorder =
      parseFloat(st.borderTopWidth) > 0 || parseFloat(st.borderRadius) > 2;
    const buttonLike =
      (role === "button" || role === "link") &&
      st.display !== "inline" &&
      (hasBackground || hasBorder) &&
      r.height >= 28 &&
      r.height <= 80;

    const text = (elementText(el) || (el as HTMLInputElement).value || "").slice(0, 200);
    const label = [
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      el.getAttribute("title"),
      el.getAttribute("name"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    const container = findContainer(el, box);
    const folded = fold(text);

    const primaryCta =
      buttonLike &&
      container === "body" &&
      text.length >= 2 &&
      text.length <= 40 &&
      r.width >= 60 &&
      r.width <= vw * 0.95 &&
      ACTION_WORDS.some((w) => folded.includes(w));

    interactive.push({
      id: counter++,
      role,
      text,
      label,
      href: el.getAttribute("href"),
      inputType: el.getAttribute("type"),
      required:
        el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      selector: buildSelector(el),
      box,
      onScreen: isOnScreen(box),
      buttonLike,
      primaryCta,
      container,
    });
  });

  // ---- Main menu ----
  let menu: MenuMeasurement = {
    itemCount: 0,
    method: "not-found",
    selector: null,
    possiblyCollapsed: false,
  };

  function considerMenuCandidate(root: Element, method: MenuMeasurement["method"]): void {
    if (!isVisible(root)) return;
    const r = root.getBoundingClientRect();
    if (r.top + sy > vh * 1.5) return;

    const lists = Array.from(root.querySelectorAll('ul, ol, [role="menubar"]'));
    const candidates: Array<{ count: number; el: Element }> = [];

    for (const list of lists) {
      if (!isVisible(list)) continue;
      const lr = list.getBoundingClientRect();
      if (lr.top + sy > vh * 1.5) continue;
      const items = Array.from(list.children).filter((c) => {
        if (!isVisible(c)) return false;
        const cr = c.getBoundingClientRect();
        if (cr.width === 0 || cr.height === 0) return false;
        if (!isOnScreen(toBox(cr))) return false;
        if (c.querySelector('a, button, [role="link"]') === null) return false;
        return countsAsMenuItem(elementText(c));
      });
      if (items.length >= 2) candidates.push({ count: items.length, el: list });
    }

    if (candidates.length) {
      const best = candidates.reduce((a, b) => (b.count > a.count ? b : a));
      if (best.count > menu.itemCount) {
        menu = {
          itemCount: best.count,
          method,
          selector: buildSelector(best.el),
          possiblyCollapsed: false,
        };
      }
      return;
    }

    // No list: count distinct visible links. The same text twice is one item
    // (logo plus wordmark double markup is common).
    const texts = new Set<string>();
    for (const a of Array.from(root.querySelectorAll('a[href], [role="link"]'))) {
      if (!isVisible(a)) continue;
      const ar = a.getBoundingClientRect();
      if (ar.height === 0 || ar.width === 0) continue;
      if (!isOnScreen(toBox(ar))) continue;
      const t = elementText(a);
      if (!countsAsMenuItem(t)) continue;
      texts.add(fold(t));
    }
    if (texts.size >= 2 && texts.size > menu.itemCount) {
      menu = {
        itemCount: texts.size,
        method: "nav-links",
        selector: buildSelector(root),
        possiblyCollapsed: false,
      };
    }
  }

  document
    .querySelectorAll('nav, [role="navigation"]')
    .forEach((n) => considerMenuCandidate(n, "nav-list"));
  document
    .querySelectorAll('[role="menubar"]')
    .forEach((n) => considerMenuCandidate(n, "menubar"));
  if (menu.itemCount === 0) {
    document.querySelectorAll("header").forEach((n) => considerMenuCandidate(n, "header-list"));
  }

  // Geometric fallback: cluster the first-viewport links into rows and take the
  // busiest row. A fixed top-strip height does not work - on one site the first
  // interactive element sat at y=265, on others at y=24. Items in the winning
  // row are reclassified as menu so they cannot inflate the CTA count.
  if (menu.itemCount === 0) {
    const candidates = interactive
      .filter((e) => {
        if (!e.onScreen || e.container === "cookie") return false;
        if (e.role !== "link" && e.role !== "button") return false;
        if (e.box.y >= vh) return false;
        return countsAsMenuItem(e.text);
      })
      .sort((a, b) => a.box.y - b.box.y);

    const rows: InteractiveElement[][] = [];
    for (const c of candidates) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(c.box.y - last[0]!.box.y) <= 14) last.push(c);
      else rows.push([c]);
    }

    let bestRow: InteractiveElement[] | null = null;
    let bestCount = 0;
    for (const row of rows) {
      const distinct = new Set(row.map((e) => fold(e.text.trim())));
      if (distinct.size > bestCount) {
        bestCount = distinct.size;
        bestRow = row;
      }
    }

    if (bestRow && bestCount >= 3) {
      menu = {
        itemCount: bestCount,
        method: "top-row",
        selector: null,
        possiblyCollapsed: false,
      };
      for (const e of bestRow) {
        e.container = "menu";
        e.primaryCta = false;
      }
    }
  }

  // Collapsed-menu signal. This distinction is critical: a collapsed menu is
  // not "no menu". Conflating them makes U01 report ABSENT, which enters the
  // denominator and corrupts the benchmark. Thresholds are deliberately loose
  // because a false positive yields NOT_APPLICABLE (out of the denominator)
  // while a false negative yields ABSENT (inside it).
  if (menu.itemCount === 0) {
    menu.possiblyCollapsed = Array.from(
      document.querySelectorAll('button, [role="button"], a'),
    ).some((el) => {
      if (!isVisible(el)) return false;

      const label = fold(
        (el.getAttribute("aria-label") || "") +
          " " +
          (el.getAttribute("title") || "") +
          " " +
          (el.getAttribute("data-target") || "") +
          " " +
          (typeof el.className === "string" ? el.className : ""),
      );
      if (/menu|hamburger|toggle|burger|drawer|offcanvas/.test(label)) return true;
      if (el.hasAttribute("aria-expanded")) return true;
      if (el.hasAttribute("aria-controls") && elementText(el).length === 0) return true;

      const r = el.getBoundingClientRect();
      const box = toBox(r);
      if (elementText(el).length > 0) return false;
      if (!isOnScreen(box) || box.y > vh * 0.25) return false;
      const long = Math.max(r.width, r.height);
      const short = Math.min(r.width, r.height);
      return short > 0 && long / short <= 2 && long >= 12 && long <= 64;
    });
  }

  // ---- Regions (segmentation) ----
  // Everything here is DOM-anchored. A model may rename a region later, but it
  // never draws one: a box that is not backed by an element cannot be verified
  // and would not land correctly on the screenshot.
  const regions: RawRegion[] = [];
  const claimed = new Set<Element>();

  /** How much of `a` is covered by `b`, 0..1. */
  function overlapRatio(a: Box, b: Box): number {
    const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const area = a.w * a.h;
    return area === 0 ? 0 : (w * h) / area;
  }

  function addRegion(
    el: Element,
    type: RawRegion["type"],
    name: string,
    basis: string,
  ): boolean {
    if (claimed.has(el)) return false;
    if (!isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) return false;

    // A carousel's inner track is far wider than the page (one bank page had a
    // 10080px element holding seven 1440px slides). That is a scroll rail, not
    // something a user can point at, so it is not a region.
    if (r.width > pageWidth * 1.2) return false;

    const box = toBox(r);
    if (!isOnScreen(box)) return false;

    // Near-duplicate of a region we already have: keep the first one.
    if (regions.some((existing) => overlapRatio(box, existing.box) > 0.9)) return false;

    claimed.add(el);
    regions.push({ type, name, box, selector: buildSelector(el), basis });
    return true;
  }

  // Cookie dialog - already located above.
  if (cookieEl) addRegion(cookieEl as Element, "COOKIE", "Çerez bildirimi", "fixed consent dialog");

  // Menu.
  if (menu.selector) {
    const el = document.querySelector(menu.selector);
    if (el) addRegion(el, "MENU", "Ana menü", `menu detected via ${menu.method}`);
  }
  if (!regions.some((r) => r.type === "MENU")) {
    const nav = document.querySelector('nav, [role="navigation"], header');
    if (nav) addRegion(nav, "MENU", "Ana menü", "semantic nav/header");
  }

  // Footer: semantic first, then the widest tall block in the bottom fifth.
  const footerEl = document.querySelector('footer, [role="contentinfo"]');
  let footerAdded = footerEl
    ? addRegion(footerEl, "FOOTER", "Footer", "semantic footer")
    : false;
  if (!footerAdded) {
    // No <footer>: take the lowest sizeable block on the page.
    const pageBottom = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    );
    const candidates = Array.from(document.querySelectorAll("body > *, body > div > *"))
      .filter((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.height < 120 || r.width < vw * 0.5) return false;
        return toBox(r).y > pageBottom * 0.7;
      })
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    if (candidates[0]) {
      footerAdded = addRegion(candidates[0], "FOOTER", "Footer", "lowest large block");
    }
  }

  // Forms.
  document.querySelectorAll("form").forEach((f) => {
    const r = f.getBoundingClientRect();
    // A form wrapping the whole page (common in ASP.NET) is not a region.
    if (r.height > 60 && r.height < document.body.scrollHeight * 0.8) {
      addRegion(f, "FORM", "Form", "form element");
    }
  });

  // Calculator: a container holding at least two numeric-ish inputs.
  const NUMERIC_HINT = /tutar|vade|miktar|amount|term|month|ay|taksit|faiz|rate|adet/;
  const numericInputs = Array.from(
    document.querySelectorAll('input[type="number"], input[type="range"], select, input[type="text"]'),
  ).filter((el) => {
    if (!isVisible(el)) return false;
    const hint = fold(
      (el.getAttribute("name") || "") +
        " " +
        (el.getAttribute("id") || "") +
        " " +
        (el.getAttribute("placeholder") || "") +
        " " +
        (el.getAttribute("aria-label") || ""),
    );
    return (
      el.getAttribute("type") === "number" ||
      el.getAttribute("type") === "range" ||
      NUMERIC_HINT.test(hint)
    );
  });
  if (numericInputs.length >= 2) {
    let ancestor: Element | null = numericInputs[0]!.parentElement;
    let guard = 0;
    while (ancestor && guard < 8) {
      const inside = numericInputs.filter((i) => ancestor!.contains(i)).length;
      if (inside >= 2) break;
      ancestor = ancestor.parentElement;
      guard++;
    }
    if (ancestor) {
      addRegion(ancestor, "CALCULATOR", "Hesaplama aracı", `${numericInputs.length} numeric inputs`);
    }
  }

  // Card lists: three or more sibling elements sharing a class signature.
  const CARD_LIMIT = 6;
  let cardLists = 0;
  document.querySelectorAll("ul, div, section").forEach((parent) => {
    if (cardLists >= CARD_LIMIT) return;
    if (claimed.has(parent)) return;
    const children = Array.from(parent.children).filter((c) => {
      if (!isVisible(c)) return false;
      const cr = c.getBoundingClientRect();
      return cr.width > 80 && cr.height > 80;
    });
    if (children.length < 3) return;
    const signature = (c: Element) =>
      c.tagName + "|" + (c.getAttribute("class") || "").split(/\s+/).slice(0, 2).join(" ");
    const signatures = new Set(children.map(signature));
    if (signatures.size > 1) return; // not a uniform list
    const pr = parent.getBoundingClientRect();
    if (pr.height < 120) return;
    addRegion(parent, "CARD_LIST", `Kart listesi (${children.length})`, `${children.length} uniform siblings`);
    cardLists++;
  });

  // Hero: the first wide, tall block that starts inside the first screen and
  // is not already claimed as menu or cookie.
  const heroCandidates = Array.from(document.querySelectorAll("section, div, header > div"));
  for (const el of heroCandidates) {
    if (claimed.has(el)) continue;
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    const box = toBox(r);
    if (box.y > vh * 0.9) continue;
    if (r.width < vw * 0.8) continue;
    if (r.height < vh * 0.25 || r.height > vh * 1.6) continue;
    if (!isOnScreen(box)) continue;
    // Must contain some text, otherwise it is a layout wrapper.
    if (elementText(el).length < 10) continue;
    addRegion(el, "HERO", "Hero / ana teklif", "first wide block in viewport");
    break;
  }

  // Trust signals: a block whose text carries certification or award wording.
  const TRUST_HINT = /sertifika|akredit|odul|award|iso [0-9]|jci|bddk|guvenlik|security|lisans/;
  const trustEl = Array.from(document.querySelectorAll("section, div")).find((el) => {
    if (claimed.has(el) || !isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.height < 60 || r.height > vh) return false;
    const t = fold(elementText(el));
    return t.length > 10 && t.length < 600 && TRUST_HINT.test(t);
  });
  if (trustEl) addRegion(trustEl, "TRUST", "Güven sinyalleri", "certification/award wording");

  // Remaining large blocks become CONTENT, capped so the report stays legible.
  // Remaining large blocks become CONTENT. Candidates are drawn widely because
  // few sites use <main>; overlap with an existing region is what filters them.
  const CONTENT_LIMIT = 8;
  let contentCount = 0;
  const contentCandidates = Array.from(
    document.querySelectorAll("main > *, body > section, body > div > section, body > div > div, section"),
  )
    .filter((el) => {
      if (claimed.has(el) || !isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.height < 200 || r.height > vh * 3) return false;
      if (r.width < vw * 0.5 || r.width > pageWidth * 1.2) return false;
      return elementText(el).length >= 40;
    })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  for (const el of contentCandidates) {
    if (contentCount >= CONTENT_LIMIT) break;
    const r = el.getBoundingClientRect();
    const box = toBox(r);
    // Skip anything largely inside a region we already recorded.
    if (regions.some((existing) => overlapRatio(box, existing.box) > 0.6)) continue;
    if (addRegion(el, "CONTENT", "İçerik bölümü", "large block")) contentCount++;
  }

  regions.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  const visibleText = onScreenParts.join(" ");

  const signatureInput = onScreenParts.map((s) => s.toLowerCase()).sort().join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < signatureInput.length; i++) {
    h ^= signatureInput.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const contentSignature =
    h.toString(16).padStart(8, "0") + "-" + signatureInput.length.toString(16);

  return {
    url: location.href,
    title: document.title,
    lang: document.documentElement.getAttribute("lang"),
    viewport: { w: vw, h: vh },
    pageHeight: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    ),
    pageWidth,
    textNodes,
    interactive,
    visibleText: visibleText.slice(0, 200_000),
    visibleTextLength: visibleText.length,
    offScreenTextLength,
    offScreenNodeCount,
    cookieBanner,
    menu,
    regions,
    contentSignature,
  };
}
