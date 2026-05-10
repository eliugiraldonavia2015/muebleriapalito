/**
 * Renders categorias.html sections dynamically from Firestore
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy, doc, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = (s) => document.querySelector(s);

// ─── FETCH ───
async function getCategories() {
  const q = query(collection(db, "categories"), orderBy("displayOrder", "asc"));
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

function getSubList(cat) {
  return (cat.subcategoryList || []).map(s => typeof s === "string" ? s : s.name);
}

// ─── RENDER NAV ───
function renderNav(categories) {
  const navList = $(".nav-links");
  if (!navList) return;
  const top = categories.filter(c => c.showOnHomepage).slice(0, 5);
  navList.innerHTML = top.map(c => `<li><a href="catalogo.html?cat=${slugify(c.name)}">${c.name}</a></li>`).join("");
}

// ─── RENDER HERO ───
function renderHero(categories) {
  const total = categories.length;
  const totalProducts = categories.reduce((sum, c) => sum + (c.productCount || 0), 0);

  const watermark = $(".cats-hero-watermark");
  if (watermark) watermark.textContent = total;

  const badge = $(".cats-num-badge");
  if (badge) badge.textContent = total;

  // Update stats
  const stats = document.querySelectorAll(".cats-stat");
  if (stats[0]) stats[0].querySelector(".cats-stat-num").textContent = total;
  if (stats[1]) stats[1].querySelector(".cats-stat-num").textContent = totalProducts + "+";
}

// ─── RENDER FEATURED CATEGORIES (with subcategories) ───
function renderFeaturedCategories(categories) {
  const grid = $("#featuredGrid");
  if (!grid) return;

  const featured = categories.filter(c => c.subcategoryList && c.subcategoryList.length > 0);

  if (!featured.length) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = featured.map(c => {
    const subs = getSubList(c);
    return `
    <a href="catalogo.html?cat=${slugify(c.name)}" class="feat-card">
      <div class="feat-card-img">
        <img src="${c.imageUrl || c.coverImage || 'https://via.placeholder.com/800'}" alt="${c.name}"/>
      </div>
      <div class="feat-card-overlay"></div>
      <div class="feat-card-info">
        <div class="feat-card-name">${c.name}</div>
        <div class="sub-pills">
          ${subs.map(s => `<span class="sub-pill" onclick="event.preventDefault();location.href='catalogo.html?cat=${slugify(c.name)}&sub=${slugify(s)}'">${s}</span>`).join("")}
        </div>
        <div class="feat-card-foot">
          <span class="feat-card-count">${c.productCount || 0} productos</span>
          <div class="feat-card-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </div>
      </div>
    </a>`;
  }).join("");
}

// ─── RENDER ALL CATEGORIES (no subcategories) ───
function renderRegularCategories(categories) {
  const grid = $("#regularGrid");
  if (!grid) return;

  const regular = categories.filter(c => !c.subcategoryList || c.subcategoryList.length === 0);

  if (!regular.length) {
    $("#cats-all")?.remove();
    return;
  }

  grid.innerHTML = regular.map(c => `
    <a href="catalogo.html?cat=${slugify(c.name)}" class="reg-card">
      <div class="reg-card-img">
        <img src="${c.imageUrl || c.coverImage || 'https://via.placeholder.com/600'}" alt="${c.name}"/>
      </div>
      <div class="reg-card-overlay"></div>
      <div class="reg-card-info">
        <div>
          <div class="reg-card-name">${c.name}</div>
          <div class="reg-card-count">${c.productCount || 0} productos</div>
        </div>
        <div class="reg-card-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>
      </div>
    </a>
  `).join("");
}

// ─── MAIN INIT ───
async function init() {
  try {
    const [categories, settings] = await Promise.all([
      getCategories(),
      getSettings()
    ]);

    renderNav(categories);
    renderHero(categories);
    renderFeaturedCategories(categories);
    renderRegularCategories(categories);

    // Refresh ScrollTrigger if GSAP is loaded
    if (window.gsap && window.ScrollTrigger) {
      setTimeout(() => window.ScrollTrigger.refresh(), 200);
    }
  } catch (err) {
    console.error("[categorias-renderer] Error:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
