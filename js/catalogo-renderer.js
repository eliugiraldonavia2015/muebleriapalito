/**
 * Renders catalogo.html dynamically from Firestore.
 * Infinite scroll – products load in batches, not all at once.
 * Skeletons show while Firestore fetches, then cards appear in smooth batches.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, getDocs, query, orderBy, doc, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
// IndexedDB cache — second visit serves docs from local cache before network confirms.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const $ = s => document.querySelector(s);

const FIRST_BATCH = 3;
const PAGE_SIZE = 9;

// ─── URL PARAMS ─── normalize to lowercase
const params = new URLSearchParams(window.location.search);
const activeCat = (params.get('cat') || '').toLowerCase();
const activeSub = (params.get('sub') || '').toLowerCase();

// ─── STATE ───
let allProducts = [];
let filteredProducts = [];
let shownCount = 0;
let scrollObserver = null;
const hoverPreloaded = new Set();

// ─── FETCH ───
async function getCategories() {
  const q = query(collection(db, "categories"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getProducts() {
  const q = query(collection(db, "products"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Cache each product in localStorage so producto.html can render instantly
  // without waiting for its own Firestore round-trip.
  try {
    products.forEach(p => {
      localStorage.setItem('product:' + p.id, JSON.stringify(p));
    });
  } catch (_) {}
  return products;
}

async function getSettings() {
  const snap = await getDoc(doc(db, "settings", "store"));
  return snap.exists() ? snap.data() : {};
}

// ─── HELPERS ───
function slugify(t) {
  return (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function priceFmt(n) {
  return "$" + Number(n).toLocaleString("en-US");
}
function badgeHTML(product) {
  if (product.badgeText) {
    const cls = product.badgeText.toLowerCase().includes("nuevo") ? "product-badge new" : "product-badge";
    return `<span class="${cls}">${product.badgeText}</span>`;
  }
  if (product.discountPct) {
    return `<span class="product-badge">-${Math.abs(product.discountPct)}%</span>`;
  }
  return "";
}
function colorsHTML(colors) {
  if (!colors || !colors.length) return "";
  return `<div class="product-colors-mini">` + colors.map((c, i) =>
    `<div class="dot${i === 0 ? " active" : ""}" style="background:${c}"></div>`
  ).join("") + `</div>`;
}

// ─── RENDER NAV LINKS ───
function renderNav(categories) {
  const ul = $(".nav-links");
  if (!ul) return;
  const items = categories.filter(c => c.showOnHomepage).slice(0, 5);
  ul.innerHTML = items.map(c =>
    `<li><a href="catalogo.html?cat=${slugify(c.name)}">${c.name}</a></li>`
  ).join("");
}

function addUbicacionesBtn() {
  const ul = document.querySelector(".nav-links");
  if (!ul) return;
  const liLoc = document.createElement("li");
  const aLoc = document.createElement("a");
  aLoc.href = "contacto.html";
  aLoc.className = "nav-link-btn";
  const svgNS = "http://www.w3.org/2000/svg";
  const locSvg = document.createElementNS(svgNS, "svg");
  locSvg.setAttribute("viewBox", "0 0 24 24");
  locSvg.setAttribute("fill", "none");
  locSvg.setAttribute("stroke-width", "1.8");
  locSvg.setAttribute("stroke-linecap", "round");
  locSvg.setAttribute("stroke-linejoin", "round");
  locSvg.style.cssText = "width:11px;height:11px;stroke:currentColor";
  const locPath = document.createElementNS(svgNS, "path");
  locPath.setAttribute("d", "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z");
  const locCircle = document.createElementNS(svgNS, "circle");
  locCircle.setAttribute("cx", "12"); locCircle.setAttribute("cy", "10"); locCircle.setAttribute("r", "3");
  locSvg.appendChild(locPath); locSvg.appendChild(locCircle);
  aLoc.appendChild(locSvg);
  aLoc.appendChild(document.createTextNode(" Ubicaciones"));
  liLoc.appendChild(aLoc);
  ul.appendChild(liLoc);
}

// ─── RENDER HERO ───
function renderHero(categories) {
  let target = null;
  if (activeCat) {
    target = categories.find(c => slugify(c.name) === activeCat || slugify(c.id) === activeCat);
  }
  if (!target && categories.length) {
    target = categories[0];
  }
  if (!target) return;

  const label = target.name;
  const img = target.heroImage || target.imageUrl || "";

  $("#hero-title").innerHTML = label;
  $("#bc-cat").textContent = label;
  $("#page-title").textContent = label + " — Muebleria Palito Outlet";
  // hero-count stays empty until real products load (no flash)
  // Only set src if the inline-script preload hasn't already populated it (avoids re-fetch).
  const imgEl = $("#hero-img");
  if (img && imgEl && !imgEl.getAttribute('src')) imgEl.src = img;
}

// ─── RENDER SIDEBAR CATEGORIES ───
function renderSidebar(categories) {
  const container = $(".cat-links");
  if (!container) return;

  let html = "";
  categories.forEach(cat => {
    const slug = slugify(cat.name);
    const subs = (cat.subcategoryList || []).map(s => typeof s === "string" ? s : s.name);
    const hasSubs = subs.length > 0;
    const isActive = slug === activeCat;
    const isOpen = hasSubs && isActive;

    if (hasSubs) {
      html += `
      <div class="cat-link cat-has-sub${isOpen ? " open active" : ""}" data-cat="${cat.name}">${cat.name}
        <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="cat-sub-links" id="sub-${slugify(cat.name)}">`;
      subs.forEach(sub => {
        const subSlug = slugify(sub);
        html += `<a href="catalogo.html?cat=${slug}&sub=${subSlug}" class="cat-sub-link${sub === activeSub ? " active" : ""}">${sub}</a>`;
      });
      html += `</div>`;
    } else {
      html += `<a href="catalogo.html?cat=${slug}" class="cat-link${isActive ? " active" : ""}">${cat.name}</a>`;
    }
  });

  container.innerHTML = html;
  reinitAccordion();
}

// ─── RENDER PRODUCT GRID ───
function renderProductsGrid(products) {
  allProducts = products;
  applyFilters();
  shownCount = 0;
  loadNextBatch();
}

function applyFilters() {
  let result = [...allProducts];
  if (activeCat) {
    result = result.filter(p => {
      const byCatName = slugify(p.category || "");
      const byCatId   = slugify(p.categoryId || "");
      return byCatName === activeCat || byCatId === activeCat;
    });
    if (activeSub && result.length) {
      result = result.filter(p => slugify(p.subcategory || "") === activeSub);
    }
  }
  filteredProducts = result;
  shownCount = 0;

  // Update counts
  $("#result-count").textContent = filteredProducts.length;
  $("#hero-count").textContent = filteredProducts.length + " productos";
}

function loadNextBatch() {
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }

  const grid = $("#product-grid");
  if (!grid) return;

  // Remove existing sentinel
  const oldSentinel = grid.querySelector(".load-sentinel");
  if (oldSentinel) oldSentinel.remove();

  if (!filteredProducts.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--cream-dim)">No se encontraron productos en esta categoría.</p>`;
    return;
  }

  // First batch: drop skeletons in one frame (no staggered fade — it caused a perceived lag)
  // and immediately build cards so there's no empty-grid flash. The card entrance animation
  // alone provides the smooth transition.
  if (shownCount === 0) {
    grid.querySelectorAll('.skeleton-loader').forEach(s => s.remove());
  }
  buildCardsBatch(grid);
}

function buildCardsBatch(grid) {
  // First paint: only 3 cards so the user sees content as fast as possible.
  // Subsequent batches: 9 at a time.
  const size = shownCount === 0 ? FIRST_BATCH : PAGE_SIZE;
  const batch = filteredProducts.slice(shownCount, shownCount + size);
  if (!batch.length) return;

  const fragment = document.createDocumentFragment();

  batch.forEach((p, i) => {
    // Cache the image URL so deep-links to producto.html?id=<id> can preload it without
    // waiting for Firestore.
    if (p.imageUrl) {
      try { localStorage.setItem('img:' + p.id, p.imageUrl); } catch (_) {}
    }
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-img-wrap">
        <img src="${p.imageUrl || 'https://via.placeholder.com/500'}" alt="${p.name}"/>
        ${badgeHTML(p)}
        <div class="product-actions">
          <button class="btn-cart btn-add-cart-grid" data-id="${p.id}" data-name="${p.name.replace(/\"/g, '&quot;')}" data-price="${p.price}" data-image="${p.imageUrl || p.primaryImage || (p.images && p.images.length ? p.images[0] : '')}">Agregar al carrito</button>
          <button class="btn-wish" data-id="${p.id}" aria-label="Favorito"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
        </div>
      </div>
      <div class="product-info">
        <div class="product-cat">${p.category || ""}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description || ""}</div>
        <div class="product-foot">
          <div class="product-price">
            <span class="price-current">${priceFmt(p.price)}</span>
            ${p.originalPrice ? `<span class="price-original">${priceFmt(p.originalPrice)}</span>` : ""}
            ${p.discountPct ? `<span class="price-off">-${Math.abs(p.discountPct)}%</span>` : ""}
          </div>
          ${colorsHTML(p.colors)}
        </div>
      </div>
    `;
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-cart') || e.target.closest('.btn-wish')) return;
      const img = p.imageUrl ? '&img=' + encodeURIComponent(p.imageUrl) : '';
      window.location.href = 'producto.html?id=' + p.id + img;
    });

    // Hover-preload: si el usuario mantiene hover >150ms, preloadeamos la imagen del
    // producto en baja prioridad para que ya esté en cache al hacer click. Hovers
    // accidentales se cancelan; el browser maneja la limpieza del memory cache.
    if (p.imageUrl && !hoverPreloaded.has(p.imageUrl)) {
      let hoverTimer = null;
      card.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => {
          if (hoverPreloaded.has(p.imageUrl)) return;
          hoverPreloaded.add(p.imageUrl);
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = p.imageUrl;
          link.fetchPriority = 'low';
          document.head.appendChild(link);
        }, 150);
      });
      card.addEventListener('mouseleave', () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      });
    }

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
  shownCount += batch.length;

  // Animate new cards in — short distance + tight stagger so it reads as "settling in"
  // instead of a slow wave. Fallback: if GSAP is missing, make them visible immediately so
  // the CSS `opacity:0` doesn't leave the grid blank.
  // Cards appear immediately — the only "loading" delay is the real Firestore fetch.
  // Just flip opacity (CSS has opacity:0 baked in).
  const newCardArr = Array.from(grid.querySelectorAll('.product-card')).slice(-batch.length);
  newCardArr.forEach(c => { c.style.opacity = '1'; });

  // Setup scroll sentinel for next batch (no ScrollTrigger reinit - cards handle own animation)
  // Also reinit ScrollTrigger batch if available
  if (shownCount < filteredProducts.length) {
    const sentinel = document.createElement("div");
    sentinel.className = "load-sentinel";
    sentinel.style.cssText = "grid-column:1/-1;height:48px;display:flex;align-items:center;justify-content:center;";
    sentinel.innerHTML = `<div class="load-more-spinner" style="display:flex;align-items:center;gap:10px;font-size:12px;color:#7b7b70;"><span class="spinner" style="width:16px;height:16px;border:2px solid rgba(0,0,0,.1);border-top-color:var(--copper);border-radius:50%;animation:spin .8s linear infinite;"></span><span>Cargando más...</span></div>`;
    grid.appendChild(sentinel);

    // Arm the observer next paint — no artificial delay, just lets the just-appended
    // cards render before checking if the sentinel is in view.
    requestAnimationFrame(() => {
      scrollObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          scrollObserver.disconnect();
          scrollObserver = null;
          loadNextBatch();
        }
      }, { rootMargin: "120px" });
      scrollObserver.observe(sentinel);
    });
  }
  // No ScrollTrigger.refresh() here — it causes a layout jump by recalculating
  // all scroll positions simultaneously while cards are still animating.
  // Each batch of cards handles its own animation on creation.

  // Update pagination info
  const infoEl = document.getElementById("pagination-info");
  if (infoEl) {
    const total = filteredProducts.length;
    const pct = Math.min(shownCount, total);
    if (total === 0) {
      infoEl.textContent = "No se encontraron productos";
    } else if (shownCount >= total) {
      infoEl.textContent = `Mostrando ${total} producto${total !== 1 ? "s" : ""}`;
    } else {
      infoEl.textContent = `Mostrando ${pct} de ${total} producto${total !== 1 ? "s" : ""}`;
    }
  }
}

// ─── ACCORDION REINIT ───
function reinitAccordion() {
  document.querySelectorAll('.cat-has-sub').forEach(parent => {
    const catName = parent.dataset.cat;
    const subEl = document.getElementById('sub-' + slugify(catName));
    if (!subEl) return;

    parent.addEventListener('click', () => {
      const isOpen = parent.classList.contains('open');
      document.querySelectorAll('.cat-has-sub.open').forEach(p => {
        if (p !== parent) {
          p.classList.remove('open');
          gsap.to(document.getElementById('sub-' + slugify(p.dataset.cat)), { height: 0, duration: .3, ease: 'power2.inOut' });
        }
      });
      if (isOpen) {
        parent.classList.remove('open');
        gsap.to(subEl, { height: 0, duration: .3, ease: 'power2.inOut' });
      } else {
        parent.classList.add('open');
        gsap.set(subEl, { height: 'auto' });
        const h = subEl.offsetHeight;
        gsap.fromTo(subEl, { height: 0 }, { height: h, duration: .38, ease: 'power3.out' });
      }
    });
  });
}

// ─── MAIN INIT ───
async function init() {
  try {
    // Fire both Firestore queries in parallel — whichever lands first renders independently.
    // No artificial sequencing: products often arrive before categories and that's fine.
    const categoriesPromise = getCategories();
    const productsPromise = getProducts();

    categoriesPromise.then(categories => {
      renderHero(categories);
      renderSidebar(categories);
    });

    productsPromise.then(products => {
      renderProductsGrid(products);
    });

    // Surface any failure
    await Promise.all([categoriesPromise, productsPromise]);
  } catch (err) {
    console.error("[catalogo-renderer] Error:", err);
    // Hide skeletons on error
    const grid = $("#product-grid");
    if (grid) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--cream-dim)">Error al cargar el catálogo. Intenta de nuevo.</p>`;
      const errEl = document.createElement("div");
      errEl.style.cssText = "grid-column:1/-1;text-align:center;color:#c0392b;font-size:12px;";
      errEl.textContent = err.message;
      grid.appendChild(errEl);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Add to cart delegation for catalog
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
