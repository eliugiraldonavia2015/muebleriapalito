/**
 * Renders index.html sections dynamically from Firestore data
 * Initializes Firebase, fetches data, and replaces hardcoded content
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ─── INIT FIREBASE ───
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const PLACEHOLDER_IMG = "assets/placeholder.svg";

// Set <img> src ONLY if a real URL is provided. If url is empty, leave the
// element untouched — preserving whatever the HTML already shipped with.
// The placeholder is only used as a last-resort fallback when an actual load fails.
function setImageWithFallback(imgEl, url) {
  if (!imgEl) return;
  if (url && url.trim()) {
    imgEl.src = url.trim();
  }
  // Always wire onerror so a broken URL (Bunny down, dead link) shows the
  // branded placeholder instead of a busted img icon.
  imgEl.onerror = () => { imgEl.src = PLACEHOLDER_IMG; imgEl.onerror = null; };
}

// ═══════════════════════════════
// DATA FETCHING
// ═══════════════════════════════
async function getAllCategories() {
  const q = query(collection(db, "categories"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getFeaturedProducts() {
  const q = query(collection(db, "products"), where("featured", "==", true));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ao = (a.featuredOrder ?? Number.MAX_SAFE_INTEGER);
      const bo = (b.featuredOrder ?? Number.MAX_SAFE_INTEGER);
      if (ao !== bo) return ao - bo;
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });
}

async function getSettings() {
  const snap = await getDoc(doc(db, "settings", "store"));
  return snap.exists() ? snap.data() : {};
}

// ═══════════════════════════════
// HELPERS
// ═══════════════════════════════
function formatPrice(n) {
  if (n == null) return "";
  return "$" + Math.round(n).toLocaleString();
}

function calcDiscount(price, original) {
  if (!original || original <= price) return null;
  return "-" + Math.round((1 - price / original) * 100) + "%";
}

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ═══════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════

// Nav — show top 5 homepage categories
function renderNav(categories) {
  const navList = $(".nav-links");
  if (!navList) return;
  const topCats = categories.filter(c => c.showOnHomepage).slice(0, 5);
  navList.innerHTML = topCats.map(c =>
    `<li><a href="catalogo.html?cat=${slugify(c.name)}">${c.name}</a></li>`
  ).join("");
  // Add Ubicaciones button via safe DOM
  const liLoc = document.createElement("li");
  const aLoc = document.createElement("a");
  aLoc.href = "contacto.html";
  aLoc.className = "nav-link-btn";
  const svgNS2 = "http://www.w3.org/2000/svg";
  const navSvg = document.createElementNS(svgNS2, "svg");
  navSvg.setAttribute("viewBox", "0 0 24 24");
  navSvg.setAttribute("fill", "none");
  navSvg.setAttribute("stroke-width", "1.8");
  navSvg.setAttribute("stroke-linecap", "round");
  navSvg.setAttribute("stroke-linejoin", "round");
  navSvg.style.cssText = "width:11px;height:11px;stroke:currentColor";
  const navPath = document.createElementNS(svgNS2, "path");
  navPath.setAttribute("d", "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z");
  const navCircle = document.createElementNS(svgNS2, "circle");
  navCircle.setAttribute("cx", "12"); navCircle.setAttribute("cy", "10"); navCircle.setAttribute("r", "3");
  navSvg.appendChild(navPath); navSvg.appendChild(navCircle);
  aLoc.appendChild(navSvg);
  aLoc.appendChild(document.createTextNode(" Ubicaciones"));
  liLoc.appendChild(aLoc);
  navList.appendChild(liLoc);
}

// Hero — slider with images and/or videos (texts stay hardcoded in HTML)
function renderHero(settings) {
  const hero = settings.heroSection || {};
  let slides = Array.isArray(hero.slides) ? hero.slides.filter(s => s && s.url) : [];
  // Backward compat: if no slides defined but legacy bgImage exists, build one
  if (!slides.length && hero.bgImage) {
    slides = [{ type: "image", url: hero.bgImage }];
  }
  setupHeroSlider(slides);
}

const HERO_IMAGE_MS = 5000;
let _heroSliderState = null;

function setupHeroSlider(slides) {
  const wrap = $("#hero .hero-img-wrap");
  const counter = $("#hero .hero-counter");
  if (!wrap) return;

  // Tear down any previous slider state
  if (_heroSliderState && _heroSliderState.advanceTimer) {
    clearTimeout(_heroSliderState.advanceTimer);
  }
  if (_heroSliderState && _heroSliderState.currentVideo) {
    _heroSliderState.currentVideo.pause();
  }
  wrap.replaceChildren();
  _heroSliderState = null;

  if (!slides.length) {
    // Fallback placeholder image
    const ph = document.createElement("img");
    ph.src = PLACEHOLDER_IMG;
    ph.alt = "";
    wrap.appendChild(ph);
    if (counter) counter.textContent = "00";
    return;
  }

  // Build slide elements
  const slideEls = slides.map((s, i) => {
    const div = document.createElement("div");
    div.className = "hero-slide" + (i === 0 ? " active" : "");
    div.dataset.idx = String(i);
    if (s.type === "video") {
      const v = document.createElement("video");
      v.src = s.url;
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.preload = "metadata";
      v.onerror = () => { console.warn("[hero] video failed:", s.url); };
      div.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = s.url;
      img.alt = "";
      img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };
      div.appendChild(img);
    }
    wrap.appendChild(div);
    return div;
  });

  // Controls only when 2+ slides
  let prevBtn = null, nextBtn = null, dotsEl = null;
  if (slides.length > 1) {
    prevBtn = buildHeroNavBtn("prev");
    nextBtn = buildHeroNavBtn("next");
    dotsEl = document.createElement("div");
    dotsEl.className = "hero-dots";
    slides.forEach((_, i) => {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "hero-dot" + (i === 0 ? " active" : "");
      d.setAttribute("aria-label", "Slide " + (i + 1));
      d.addEventListener("click", () => manualNav(i));
      dotsEl.appendChild(d);
    });
    wrap.append(prevBtn, nextBtn, dotsEl);
    prevBtn.addEventListener("click", () => manualNav(currentIdx() - 1));
    nextBtn.addEventListener("click", () => manualNav(currentIdx() + 1));
  }

  const state = {
    slides,
    slideEls,
    dotsEl,
    counter,
    idx: 0,
    advanceTimer: null,
    currentVideo: null,
  };
  _heroSliderState = state;

  function currentIdx() { return state.idx; }

  function clearTimers() {
    if (state.advanceTimer) { clearTimeout(state.advanceTimer); state.advanceTimer = null; }
    if (state.currentVideo) {
      state.currentVideo.onended = null;
      try { state.currentVideo.pause(); state.currentVideo.currentTime = 0; } catch (e) {}
      state.currentVideo = null;
    }
  }

  function show(targetIdx) {
    const n = state.slides.length;
    const idx = ((targetIdx % n) + n) % n;
    clearTimers();

    state.slideEls.forEach((el, i) => el.classList.toggle("active", i === idx));
    if (state.dotsEl) {
      [...state.dotsEl.children].forEach((d, i) => d.classList.toggle("active", i === idx));
    }
    if (state.counter) {
      state.counter.textContent = String(idx + 1).padStart(2, "0");
    }
    state.idx = idx;

    if (n <= 1) return; // no auto-advance for single slide

    const slide = state.slides[idx];
    if (slide.type === "video") {
      const v = state.slideEls[idx].querySelector("video");
      if (v) {
        state.currentVideo = v;
        try { v.currentTime = 0; } catch (e) {}
        v.onended = () => { v.onended = null; show(state.idx + 1); };
        const playPromise = v.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(() => {
            // Autoplay blocked — fall back to fixed timer so the slider keeps moving
            state.advanceTimer = setTimeout(() => show(state.idx + 1), HERO_IMAGE_MS);
          });
        }
      } else {
        state.advanceTimer = setTimeout(() => show(state.idx + 1), HERO_IMAGE_MS);
      }
    } else {
      state.advanceTimer = setTimeout(() => show(state.idx + 1), HERO_IMAGE_MS);
    }
  }

  function manualNav(targetIdx) { show(targetIdx); }

  show(0);
}

function buildHeroNavBtn(dir) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "hero-nav " + dir;
  b.setAttribute("aria-label", dir === "prev" ? "Anterior" : "Siguiente");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  poly.setAttribute("points", dir === "prev" ? "15 6 9 12 15 18" : "9 6 15 12 9 18");
  svg.appendChild(poly);
  b.appendChild(svg);
  return b;
}

// Preload the hero image as soon as we know its URL so it overlaps with the JS
// boot and renderer; keeps perceived load time identical even after the swap.
function preloadHeroImage(url) {
  if (!url) return;
  if (document.head.querySelector(`link[rel="preload"][href="${url}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  document.head.appendChild(link);
}

// Marquee — show homepage category names
function renderMarquee(categories) {
  const track = $(".marquee-track");
  if (!track) return;
  const items = categories.filter(c => c.showOnHomepage).map(c => c.name);
  if (!items.length) return;
  // Duplicate for seamless loop
  const html = [...items, ...items].map(name =>
    `<span class="marquee-item">${name.toUpperCase()} <span class="marquee-dot"></span></span>`
  ).join("");
  track.innerHTML = html;
}

// Categories grid
function renderCategories(categories) {
  const section = $("#categories");
  if (!section) return;
  const homeCats = categories.filter(c => c.showOnHomepage);
  const grid = $(".cat-grid");
  if (!grid) return;
  if (!homeCats.length) {
    // No data → hide the whole section (don't leave an empty grid behind)
    section.style.display = "none";
    grid.replaceChildren();
    return;
  }
  section.style.display = "";

  grid.innerHTML = homeCats.map(c => `
    <a href="catalogo.html?cat=${slugify(c.name)}" class="cat-card">
      <div class="cat-img">
        <img src="${c.imageUrl || c.coverImage || PLACEHOLDER_IMG}" alt="${c.name}" />
      </div>
      <div class="cat-overlay"></div>
      <div class="cat-info">
        <div>
          <div class="cat-name">${c.name}</div>
          <div class="cat-count">${c.productCount || 0} productos</div>
        </div>
        <div class="cat-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>
      </div>
    </a>
  `).join("");

  // Attach placeholder fallback for any image that fails to load
  grid.querySelectorAll(".cat-img img").forEach(img => {
    img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };
  });

  // Add "Ver más" button if more categories exist
  const allCats = categories.length;
  if (allCats > homeCats.length) {
    const existing = $(".cat-footer");
    if (!existing) {
      const footer = document.createElement("div");
      footer.className = "cat-footer";
      footer.innerHTML = `
        <a href="categorias.html" class="btn-ver-mas">
          <div class="btn-ver-mas-inner">
            <div class="btn-ver-mas-fill"></div>
            <span class="btn-ver-mas-count">${allCats - homeCats.length}</span>
            <div class="btn-ver-mas-copy">
              <span class="btn-ver-mas-label">Ver más categorías</span>
              <span class="btn-ver-mas-sub">Explora nuestro catálogo completo</span>
            </div>
            <div class="btn-ver-mas-divider"></div>
            <div class="btn-ver-mas-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
          </div>
        </a>
      `;
      section.appendChild(footer);
    }
  }
}

// Featured products — hide entire section when admin hasn't selected any
function renderFeaturedProducts(products) {
  const track = $("#productsTrack");
  const section = $("#featured");
  if (!track || !section) return;

  if (!products.length) {
    section.style.display = "none";
    track.replaceChildren();
    return;
  }
  section.style.display = "";

  // Map Firestore categoryId back to category name
  const categoryNames = {};
  $$("#categories .cat-card").forEach(card => {
    const nameEl = card.querySelector(".cat-name");
    if (nameEl) {
      const href = card.getAttribute("href");
      const match = href?.match(/cat=(.+)/);
      if (match) categoryNames[match[1]] = nameEl.textContent.trim();
    }
  });

  track.innerHTML = products.map(p => {
    const catName = categoryNames[p.categoryId] || p.categoryId || "";
    const discount = calcDiscount(p.price, p.originalPrice);
    const badge = p.isNew ? "Nuevo" : p.onSale ? (discount || "Oferta") : "";
    const badgeClass = p.onSale ? "product-badge" : (p.isNew ? "product-badge sale" : "product-badge sale");

    return `
    <div class="product-card" data-id="${p.id}" style="cursor:pointer">
      <div class="product-img-wrap">
        <img src="${p.primaryImage || PLACEHOLDER_IMG}" alt="${p.name}" />
        ${badge ? `<span class="${badgeClass}">${badge}</span>` : ""}
        <div class="product-actions">
          <button class="btn-cart btn-add-cart-grid" data-id="${p.id}" data-name="${p.name.replace(/\"/g, '&quot;')}" data-price="${p.price}" data-image="${p.imageUrl || p.primaryImage || (p.images && p.images.length ? p.images[0] : '')}">Agregar al carrito</button>
          <button class="btn-wish${typeof window.isInWishlist === 'function' && window.isInWishlist(p.id) ? ' active' : ''}" data-id="${p.id}" aria-label="Favorito">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="product-info">
        <div class="product-cat">${catName}</div>
        <div class="product-name">${p.name}</div>
        ${p.colors && p.colors.length > 0 ? `<div class="product-colors">
          ${p.colors.map((c, i) => `<div class="color-swatch${i === 0 ? " active" : ""}" style="background:${c}"></div>`).join("")}
        </div>` : ""}
        <div class="product-price">
          <span class="price-current">${formatPrice(p.price)}</span>
          ${p.originalPrice ? `<span class="price-original">${formatPrice(p.originalPrice)}</span>` : ""}
          ${discount ? `<span class="price-off">${discount}</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  // Attach placeholder fallback for any product image that fails to load
  track.querySelectorAll(".product-img-wrap img").forEach(img => {
    img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };
  });

  // Make the whole card clickable — navigates to producto.html?id=<id>.
  // Clicks on inner buttons/links (cart, wish, etc.) do NOT trigger navigation.
  track.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      const id = card.dataset.id;
      if (id) window.location.href = "producto.html?id=" + encodeURIComponent(id);
    });
  });
}

// Promo banner — image only (texts stay hardcoded in HTML)
function renderBanner(settings) {
  setImageWithFallback($("#full-banner img"), settings?.promoBanner?.image);
}

// Lifestyle section — image only (texts stay hardcoded in HTML)
function renderLifestyle(settings) {
  setImageWithFallback($("#lifestyle .lifestyle-img img"), settings?.lifestyle?.imageUrl);
}

// Stats
function renderStats(settings) {
  const statsData = settings.stats;
  if (!statsData) return; // keep hardcoded defaults

  const grid = $(".stats-grid");
  if (!grid) return;

  grid.innerHTML = statsData.map(s => `
    <div class="stat-cell">
      <div class="stat-num">
        <span class="count-num" data-target="${s.value}">0</span>${s.suffix ? `<em>${s.suffix}</em>` : ""}
      </div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join("");
}

// Newsletter
function renderNewsletter(settings) {
  const nl = settings.newsletter;
  if (!nl) return; // keep hardcoded defaults

  const eyebrow = $("#newsletter .sec-label");
  const title = $(".nl-title");
  const sub = $(".nl-sub");
  const input = $(".nl-input");
  const btn = $(".nl-btn");

  if (eyebrow && nl.eyebrow) eyebrow.textContent = nl.eyebrow;
  if (title && nl.heading) title.innerHTML = nl.heading.replace(/(tu|hogar|el|la|de|del)\b/gi, "<em style=\"font-style:italic;color:var(--copper-lt)\">$1</em>");
  if (sub && nl.description) sub.textContent = nl.description;
  if (input && nl.placeholder) input.placeholder = nl.placeholder;
  if (btn && nl.ctaText) btn.textContent = nl.ctaText;
}

// Footer
function renderFooter(settings) {
  const footer = settings.footer || {};
  const tagline = $(".footer-tagline");
  if (tagline && footer.tagline) tagline.textContent = footer.tagline;

  // Social links
  if (footer.socials && footer.socials.length) {
    const socialsEl = $(".footer-socials");
    if (socialsEl) {
      const icons = {
        facebook: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>`,
        instagram: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".5" fill="currentColor"/></svg>`,
        youtube: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>`,
        whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`
      };

      socialsEl.innerHTML = footer.socials.map(s =>
        `<a href="${s.url}" class="social-link" aria-label="${s.name}">
          ${icons[s.name.toLowerCase()] || icons.facebook}
        </a>`
      ).join("");

      // Force WhatsApp social link to use hardcoded number; ignore Firestore.
      const WA_URL = "https://wa.me/593959667093?text=ESTOY%20INTERESADO%20EN%20MUEBLERIA%20PALITO%20PARA%20COMPRAR%20UN%20MUEBLE%2C%20ME%20PODRIAN%20ASESORAR%3F%20VENGO%20DE%20LA%20PAGINA";
      socialsEl.querySelectorAll('a[aria-label]').forEach(a => {
        if (a.getAttribute('aria-label').toLowerCase() === 'whatsapp') a.href = WA_URL;
      });
    }
  }

  // Payment methods
  if (footer.paymentMethods && footer.paymentMethods.length) {
    const payEl = $(".footer-payments");
    if (payEl) {
      payEl.innerHTML = footer.paymentMethods.map(m =>
        `<span class="payment-badge">${m}</span>`
      ).join("");
    }
  }
}

// WhatsApp float button — href is hardcoded in HTML; do not override from Firestore.
function renderWhatsApp(_settings) {}

// ═══════════════════════════════
// MAIN INIT
// ═══════════════════════════════
// Expose a ready promise so the inline loader can await Firestore before
// running entrance/scroll animations. Prevents the "render-twice" flash where
// hardcoded HTML is animated by GSAP and then replaced by Firestore content.
let _rendererResolve;
window.__indexRendererReady = new Promise(r => { _rendererResolve = r; });

// Wait for above-the-fold images to load (or timeout) so the loader does not
// fade onto half-loaded image swaps. This kills the perceived "re-render".
function waitAboveFoldImages(timeoutMs = 2500) {
  const selectors = [
    "#hero .hero-img-wrap img",
    "#categories .cat-card img"
  ];
  const imgs = [];
  selectors.forEach(sel => document.querySelectorAll(sel).forEach(i => imgs.push(i)));
  const pending = imgs.filter(i => i && !(i.complete && i.naturalWidth > 0));
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending.map(i => new Promise(r => {
      i.addEventListener("load", r, { once: true });
      i.addEventListener("error", r, { once: true });
    }))),
    new Promise(r => setTimeout(r, timeoutMs))
  ]);
}

async function init() {
  try {
    const [categories, products, settings] = await Promise.all([
      getAllCategories(),
      getFeaturedProducts(),
      getSettings()
    ]);

    // Nav stays as the static HTML so it doesn't flicker on page nav (matches catalogo.html).
    // renderNav(categories);
    preloadHeroImage(settings?.heroSection?.bgImage);
    renderHero(settings);
    renderMarquee(categories);
    renderCategories(categories);
    renderFeaturedProducts(products);
    renderBanner(settings);
    renderLifestyle(settings);
    renderStats(settings);
    renderNewsletter(settings);
    renderFooter(settings);
    renderWhatsApp(settings);

    await waitAboveFoldImages();

  } catch (err) {
    console.error("[index-renderer] Error initializing:", err);
    // Page keeps hardcoded content as fallback
  } finally {
    _rendererResolve();
  }
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Add to cart delegation for index
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-add-cart-grid");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  
  const id = btn.getAttribute("data-id");
  const name = btn.getAttribute("data-name");
  const price = parseFloat(btn.getAttribute("data-price")) || 0;
  const image = btn.getAttribute("data-image") || "";
  
  console.log("Intentando añadir al carrito:", { id, name, price, image });
  
  if (!id || !name) {
    console.error("Faltan datos en el boton:", btn);
    return;
  }
  
  if (typeof window.addToCart === "function") {
    window.addToCart({
      id: id,
      name: name,
      price: price,
      qty: 1,
      image: image
    });
    console.log("Añadido con exito via window.addToCart");
  } else {
    console.error("No se encontro window.addToCart. Verifica que cart-system.js este cargado.");
  }
});
// Wishlist (favoritos) — click on the heart toggles + persists in localStorage
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-wish");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const id = btn.getAttribute("data-id");
  if (!id) return;
  if (typeof window.toggleWishlist === "function") {
    const nowSaved = window.toggleWishlist(id);
    btn.classList.toggle("active", nowSaved);
  }
});
