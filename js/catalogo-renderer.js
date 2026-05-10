/**
 * Renders catalogo.html dynamically from Firestore.
 * Replaces all inline product data, category sidebar, hero, chips, pagination
 * while preserving the existing GSAP animations.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy, doc, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = s => document.querySelector(s);

// ─── URL PARAMS ─── normalize to lowercase to handle ?cat=Salas and ?cat=salas
const params = new URLSearchParams(window.location.search);
const activeCat = (params.get('cat') || '').toLowerCase();
const activeSub = (params.get('sub') || '').toLowerCase();

// ─── FETCH ───
async function getCategories() {
  const q = query(collection(db, "categories"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getProducts() {
  let q = collection(db, "products");
  q = query(q, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

// ─── RENDER HERO ───
function renderHero(categories) {
  let target = null;
  if (activeCat) {
    // activeCat already lowercased; slugify(c.name) also lowercases → safe match
    target = categories.find(c => slugify(c.name) === activeCat || slugify(c.id) === activeCat);
  }
  if (!target && categories.length) {
    // Default to first category
    target = categories[0];
  }
  if (!target) return;

  const label = target.name;
  const img = target.heroImage || target.imageUrl || "";
  const count = target.productCount || 0;
  const subLabel = activeSub || (target.subcategoryList && target.subcategoryList[0] ? target.subcategoryList[0].name || target.subcategoryList[0] : "");

  // Update DOM
  $("#hero-title").innerHTML = label;
  $("#bc-cat").textContent = label;
  $("#page-title").textContent = label + " — Muebleria Palito Outlet";
  $("#hero-count").textContent = count + " productos";
  $("#result-count").textContent = count;
  if (img) $("#hero-img").src = img;
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
  // Re-attach accordion events (copied from inline script logic)
  reinitAccordion();
}

// ─── RENDER PRODUCT GRID ───
function renderProductsGrid(products) {
  const grid = $("#product-grid");
  if (!grid) return;

  // Filter by category — match against category name slug OR categoryId slug
  let filtered = products;
  if (activeCat) {
    filtered = products.filter(p => {
      const byCatName = slugify(p.category || "");
      const byCatId   = slugify(p.categoryId || "");
      return byCatName === activeCat || byCatId === activeCat;
    });
    if (activeSub && filtered.length) {
      filtered = filtered.filter(p => slugify(p.subcategory || "") === activeSub);
    }
  }

  $("#result-count").textContent = filtered.length;
  $("#hero-count").textContent = filtered.length + " productos";

  if (!filtered.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--cream-dim)">No se encontraron productos en esta categoría.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card">
      <div class="product-img-wrap">
        <img src="${p.imageUrl || 'https://via.placeholder.com/500'}" alt="${p.name}"/>
        ${badgeHTML(p)}
        <div class="product-actions">
          <button class="btn-cart">Agregar al carrito</button>
          <button class="btn-wish" aria-label="Favorito"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
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
    </div>
  `).join("");
}

// ─── ACCORDION REINIT (from inline script) ───
function reinitAccordion() {
  // Accordion: categories with subcategories
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
    const [categories, products, settings] = await Promise.all([
      getCategories(),
      getProducts(),
      getSettings()
    ]);

    renderNav(categories);
    renderHero(categories);
    renderSidebar(categories);
    renderProductsGrid(products);

    // Re-initialize GSAP ScrollTrigger animations after DOM swap
    if (window.gsap && window.ScrollTrigger) {
      setTimeout(() => {
        window.ScrollTrigger.batch('.product-card', {
          onEnter: els => window.gsap.to(els, { autoAlpha: 1, y: 0, duration: .65, stagger: .08, ease: 'power3.out', clearProps: 'transform' }),
          start: 'top 88%'
        });
        window.ScrollTrigger.refresh();
      }, 250);
    }
  } catch (err) {
    console.error("[catalogo-renderer] Error:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
