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

// ═══════════════════════════════
// DATA FETCHING
// ═══════════════════════════════
async function getAllCategories() {
  const q = query(collection(db, "categories"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getFeaturedProducts() {
  const q = query(collection(db, "products"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.featured === true);
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

// Hero
function renderHero(settings) {
  const hero = settings.heroSection || {};
  const eyebrow = $(".hero-eyebrow");
  const title = $(".hero-title");
  const subtitle = $(".hero-subtitle");
  const heroImg = $("#hero .hero-img-wrap img");

  if (eyebrow && hero.eyebrow) eyebrow.textContent = hero.eyebrow;
  if (title && hero.title) title.innerHTML = hero.title.replace(/(que|hablan|de|para|tu|con|un|una|el|la|los|las)\b/gi, "<em>$1</em>");
  if (subtitle && hero.description) subtitle.textContent = hero.description;
  if (heroImg && hero.bgImage) heroImg.src = hero.bgImage;
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
  if (!homeCats.length) return;

  const grid = $(".cat-grid");
  if (!grid) return;

  grid.innerHTML = homeCats.map(c => `
    <a href="catalogo.html?cat=${slugify(c.name)}" class="cat-card">
      <div class="cat-img">
        <img src="${c.imageUrl || c.coverImage || 'https://via.placeholder.com/800'}" alt="${c.name}" />
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

// Featured products
function renderFeaturedProducts(products) {
  const track = $("#productsTrack");
  if (!track) return;
  if (!products.length) return;

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
    <div class="product-card">
      <div class="product-img-wrap">
        <img src="${p.primaryImage || 'https://via.placeholder.com/500'}" alt="${p.name}" />
        ${badge ? `<span class="${badgeClass}">${badge}</span>` : ""}
        <div class="product-actions">
          <button class="btn-cart btn-add-cart-grid" data-id="${p.id}" data-name="${p.name.replace(/\"/g, '&quot;')}" data-price="${p.price}" data-image="${p.imageUrl || p.primaryImage || (p.images && p.images.length ? p.images[0] : '')}">Agregar al carrito</button>
          <button class="btn-wish" data-id="${p.id}" aria-label="Favorito">
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
}

// Promo banner
function renderBanner(settings) {
  const img = $("#full-banner img");
  const overlay = $("#full-banner .sec-label");
  const title = $("#full-banner .full-banner-title");
  const subtitle = $("#full-banner .full-banner-sub");
  const cta = $("#full-banner .btn-primary");
  const pill = $("#full-banner .banner-pill");

  if (img && settings?.promoBanner?.image) img.src = settings.promoBanner.image;
  
  // HARDCODED TEXT FOR CREDIT
  if (overlay) overlay.textContent = "Facilidades de pago";
  if (title) title.innerHTML = "Accede a<br><em style=\"color:var(--copper-lt);font-style:italic\">Credito Directo</em>";
  if (subtitle) subtitle.textContent = "Divide tus compras hasta en 12 meses sin intereses. Y si prefieres pagar en efectivo, disfruta de hasta 30% de descuento en categorias y productos seleccionados.";
  
  if (cta) {
    cta.innerHTML = "Consultar financiamiento <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke-width=\"1.5\" stroke-linecap=\"round\" width=\"16\" height=\"16\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/><polyline points=\"12 5 19 12 12 19\"/></svg>";
    cta.href = "contacto.html";
  }
  
  if (pill) {
    pill.innerHTML = "<span class=\"pill-pct\" style=\"font-size:32px;margin-bottom:2px\">12</span><span class=\"pill-off\" style=\"font-size:10px\">MESES SIN<br>INTERESES</span>";
  }
}

// Lifestyle section — configurable
function renderLifestyle(settings) {
  const lifestyle = settings.lifestyle;
  if (!lifestyle) return; // keep hardcoded defaults

  const img = $("#lifestyle .lifestyle-img img");
  const bigNum = $(".lifestyle-big-num");
  const title = $("#lifestyle .sec-heading");
  const desc = $("#lifestyle p");
  const cta = $("#lifestyle .btn-primary");

  if (img && lifestyle.imageUrl) img.src = lifestyle.imageUrl;
  if (bigNum && lifestyle.highlightNumber) bigNum.textContent = lifestyle.highlightNumber;
  if (title && lifestyle.heading) {
    const eyebrow = $("#lifestyle .sec-label");
    if (lifestyle.eyebrow && eyebrow) eyebrow.textContent = lifestyle.eyebrow;
    title.innerHTML = lifestyle.heading.replace(/(para|noches|decidir)\b/gi, "<em>$1</em>");
  }
  if (desc && lifestyle.description) desc.textContent = lifestyle.description;

  if (lifestyle.features && lifestyle.features.length) {
    const featuresEl = $(".lifestyle-features");
    if (featuresEl) {
      featuresEl.innerHTML = lifestyle.features.map((f, i) => `
        <div class="lifestyle-feat">
          <span class="feat-num">${String(i + 1).padStart(2, "0")}</span>
          <p class="feat-text">${f.text}</p>
        </div>
      `).join("");
    }
  }

  if (cta && lifestyle.ctaText) {
    cta.childNodes[0].textContent = lifestyle.ctaText + " ";
  }
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
    renderHero(settings);
    renderMarquee(categories);
    renderCategories(categories);
    renderFeaturedProducts(products);
    // renderBanner(settings); // Disable JS rendering for this section, keep HTML
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
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-add-cart-grid");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  
  const id = btn.getAttribute("data-id");
  if (!id) return;
  
  // Find product in ALL_PRODUCTS
  const p = window.ALL_PRODUCTS ? window.ALL_PRODUCTS.find(x => x.id === id) : null;
  if (!p) return;
  
  if (typeof addToCart === "function") {
    addToCart({
      id: p.id,
      name: p.name,
      price: p.price,
      qty: 1,
      image: p.images && p.images.length ? p.images[0] : ""
    });
  }
});
