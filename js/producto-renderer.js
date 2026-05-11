import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy, doc, getDoc, where, limit
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = s => document.querySelector(s);
function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

const params = new URLSearchParams(window.location.search);
const prodId = params.get("id") || "";

let qty = 1;
let selectedPayment = "efectivo";
let selectedColor = "";
let currentProduct = null;

function slugify(t) {
  return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function priceFmt(n) {
  return "$" + Number(n).toLocaleString("en-US");
}
function setText(sel, val) {
  const el = $(sel);
  if (el) el.textContent = val || "";
}

// ─── LOUPE ───
function initLoupe(imageUrl) {
  const wrap = $("#img-wrap");
  const loupe = $("#loupe");
  const mainImg = $("#main-img");
  if (!wrap || !loupe) return;

  loupe.style.backgroundImage = "url(" + imageUrl + ")";
  gsap.set(loupe, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.7 });

  const xTo = gsap.quickTo(loupe, "x", { duration: 0.07, ease: "none" });
  const yTo = gsap.quickTo(loupe, "y", { duration: 0.07, ease: "none" });

  function onMove(e) {
    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    xTo(px);
    yTo(py);
    const bpx = Math.max(0, Math.min(100, (px / rect.width) * 100 + (px / rect.width - 0.5) * 80));
    const bpy = Math.max(0, Math.min(100, (py / rect.height) * 100 + (py / rect.height - 0.5) * 80));
    loupe.style.backgroundPosition = bpx + "% " + bpy + "%";
  }

  wrap.addEventListener("mouseenter", () => {
    gsap.to(loupe, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.4)" });
  });
  wrap.addEventListener("mouseleave", () => {
    gsap.to(loupe, { opacity: 0, scale: 0.7, duration: 0.25, ease: "power2.in" });
  });
  wrap.addEventListener("mousemove", onMove);
}

// ─── THUMBNAILS ───
function buildThumbs(images) {
  const strip = $("#thumb-strip");
  if (!strip) return;
  clear(strip);
  if (images.length <= 1) { strip.style.display = "none"; return; }

  images.forEach((src, i) => {
    const div = document.createElement("div");
    div.className = "thumb" + (i === 0 ? " active" : "");
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    div.appendChild(img);
    div.addEventListener("click", () => {
      strip.querySelectorAll(".thumb").forEach(t => t.classList.remove("active"));
      div.classList.add("active");
      const mainImg = $("#main-img");
      gsap.to(mainImg, { opacity: 0, duration: 0.18, onComplete: () => {
        mainImg.src = src;
        const loupe = $("#loupe");
        if (loupe) loupe.style.backgroundImage = "url(" + src + ")";
        gsap.to(mainImg, { opacity: 1, duration: 0.25 });
      }});
    });
    strip.appendChild(div);
  });
}

// ─── COLOR SWATCHES ───
function buildColors(colors) {
  const wrap = $("#prod-colors-wrap");
  const container = $("#prod-colors");
  if (!colors || !colors.length) { if (wrap) wrap.style.display = "none"; return; }

  selectedColor = colors[0];
  colors.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "cswatch" + (i === 0 ? " active" : "");
    div.style.background = c;
    div.title = c;
    div.addEventListener("click", () => {
      container.querySelectorAll(".cswatch").forEach(s => s.classList.remove("active"));
      div.classList.add("active");
      selectedColor = c;
    });
    container.appendChild(div);
  });
}

// ─── QUANTITY ───
function initQty(price) {
  const valEl = $("#qty-val");
  function update() {
    if (valEl) valEl.textContent = qty;
    setText("#s-qty", String(qty));
    setText("#s-total", priceFmt(price * qty));
  }
  const minus = $("#qty-minus");
  const plus = $("#qty-plus");
  if (minus) minus.addEventListener("click", () => { if (qty > 1) { qty--; update(); } });
  if (plus) plus.addEventListener("click", () => { qty++; update(); });
  update();
}

// ─── PAYMENT ───
function initPayment() {
  document.querySelectorAll(".pay-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".pay-opt").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      selectedPayment = opt.dataset.pay || "efectivo";
    });
  });
}

// ─── SPECS ───
function buildSpecs(product) {
  const grid = $("#specs-grid");
  const section = $("#specs-section");
  if (!grid || !section) return;

  const fields = [
    ["Categoria", product.category],
    ["Subcategoria", product.subcategory],
    ["SKU", product.id],
    ["Disponibilidad", product.available !== false ? "Disponible" : "Agotado"],
  ].filter(([, v]) => v);

  if (!fields.length) { section.style.display = "none"; return; }

  fields.forEach(([label, val]) => {
    const item = document.createElement("div");
    item.className = "spec-item";
    const lEl = document.createElement("div");
    lEl.className = "spec-label";
    lEl.textContent = label;
    const vEl = document.createElement("div");
    vEl.className = "spec-val";
    vEl.textContent = val;
    item.appendChild(lEl);
    item.appendChild(vEl);
    grid.appendChild(item);
  });

  const toggle = $("#specs-toggle");
  const body = $("#specs-body");
  const chevron = $("#specs-chevron");
  let open = false;

  if (toggle) toggle.addEventListener("click", () => {
    open = !open;
    if (open) {
      body.classList.add("open");
      gsap.fromTo(body, { height: 0 }, { height: body.scrollHeight, duration: 0.4, ease: "power3.out" });
      gsap.to(chevron, { rotation: 90, duration: 0.35, ease: "power2.out" });
    } else {
      gsap.to(body, { height: 0, duration: 0.35, ease: "power2.inOut", onComplete: () => body.classList.remove("open") });
      gsap.to(chevron, { rotation: 0, duration: 0.3, ease: "power2.out" });
    }
  });
}

// ─── ORDER PANEL ───
function initOrderPanel(product) {
  const btn = $("#btn-order");
  const panel = $("#order-panel");
  const addEl = (sel, val) => { const e = $(sel); if (e) e.textContent = val; };

  addEl("#s-prod-name", product.name);
  addEl("#s-unit-price", priceFmt(product.price));

  let panelOpen = false;

  if (btn) btn.addEventListener("click", () => {
    panelOpen = !panelOpen;
    if (panelOpen) {
      panel.classList.add("open");
      gsap.to(window, { duration: 0.7, scrollTo: { y: panel, offsetY: -80 }, ease: "power3.out" });
      gsap.from("#order-panel .order-inner > *", { y: 28, opacity: 0, duration: 0.6, stagger: 0.09, ease: "power3.out" });
      btn.textContent = "Cerrar formulario";
    } else {
      panel.classList.remove("open");
      btn.textContent = "Hacer pedido por WhatsApp";
    }
  });

  const waBtn = $("#btn-whatsapp");
  if (waBtn) waBtn.addEventListener("click", () => sendWhatsApp(product));
}

function sendWhatsApp(product) {
  const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const parts = [
    "Hola! Quiero hacer un pedido:",
    "",
    "*Producto:* " + product.name,
    product.category ? "*Categoria:* " + product.category : "",
    selectedColor ? "*Color:* " + selectedColor : "",
    "*Cantidad:* " + qty,
    "*Total estimado:* " + priceFmt(product.price * qty),
    "",
    "*Pago:* " + selectedPayment,
    "",
    v("o-name") ? "*Nombre:* " + v("o-name") : "",
    v("o-phone") ? "*Telefono:* " + v("o-phone") : "",
    v("o-address") ? "*Entrega:* " + v("o-address") : "",
    v("o-ref") ? "*Referencia:* " + v("o-ref") : "",
    v("o-notes") ? "*Notas:* " + v("o-notes") : "",
  ].filter(Boolean).join("\n");

  const waNum = (window._storePhone || "50499999999").replace(/\D/g, "");
  window.open("https://wa.me/" + waNum + "?text=" + encodeURIComponent(parts), "_blank");
}

// ─── RELATED ───
async function loadRelated(product) {
  const section = $("#related-section");
  const grid = $("#related-grid");
  if (!section || !grid) return;

  try {
    const catId = product.categoryId || slugify(product.category || "");
    const q = query(
      collection(db, "products"),
      where("categoryId", "==", catId),
      orderBy("displayOrder", "asc"),
      limit(8)
    );
    const snap = await getDocs(q);
    const related = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.id !== product.id)
      .slice(0, 4);

    if (!related.length) return;
    section.style.display = "";

    related.forEach(p => {
      const card = document.createElement("div");
      card.className = "rel-card";
      card.addEventListener("click", () => { window.location.href = "producto.html?id=" + p.id; });

      const imgWrap = document.createElement("div");
      imgWrap.className = "rel-img";
      const img = document.createElement("img");
      img.src = p.imageUrl || "";
      img.alt = p.name;
      imgWrap.appendChild(img);

      if (p.badgeText || p.discountPct) {
        const badge = document.createElement("div");
        badge.className = "rel-badge";
        badge.textContent = p.badgeText || ("-" + Math.abs(p.discountPct) + "%");
        imgWrap.appendChild(badge);
      }

      const info = document.createElement("div");
      info.className = "rel-info";

      const cat = document.createElement("div");
      cat.className = "rel-cat";
      cat.textContent = p.category || "";

      const name = document.createElement("div");
      name.className = "rel-name";
      name.textContent = p.name;

      const price = document.createElement("div");
      price.className = "rel-price";
      price.textContent = priceFmt(p.price);

      info.appendChild(cat);
      info.appendChild(name);
      info.appendChild(price);
      card.appendChild(imgWrap);
      card.appendChild(info);
      grid.appendChild(card);
    });

    if (window.gsap && window.ScrollTrigger) {
      gsap.set(".rel-card", { autoAlpha: 0, y: 40 });
      ScrollTrigger.batch(".rel-card", {
        onEnter: els => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "power3.out" }),
        start: "top 88%"
      });
    }
  } catch (e) {
    console.warn("[producto] related:", e.message);
  }
}

// ─── ENTRANCE ANIMATION ───
function playEntrance() {
  gsap.set(["#prod-category","#prod-name","#prod-subcategory","#prod-price-row",
    "#prod-desc","#prod-colors-wrap","#prod-qty-wrap","#prod-cta"], { y: 24 });

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from("#img-panel", { x: -60, opacity: 0, duration: 0.9 }, 0)
    .to("#prod-category",    { opacity: 1, y: 0, duration: 0.5 }, 0.3)
    .to("#prod-name",        { opacity: 1, y: 0, duration: 0.6 }, 0.42)
    .to("#prod-subcategory", { opacity: 1, y: 0, duration: 0.5 }, 0.52)
    .to("#prod-price-row",   { opacity: 1, y: 0, duration: 0.5 }, 0.6)
    .to("#prod-desc",        { opacity: 1, y: 0, duration: 0.5 }, 0.68)
    .to("#prod-colors-wrap", { opacity: 1, y: 0, duration: 0.45 }, 0.76)
    .to("#prod-qty-wrap",    { opacity: 1, y: 0, duration: 0.45 }, 0.82)
    .to("#prod-cta",         { opacity: 1, y: 0, duration: 0.5 }, 0.9)
    .to("#specs-section",    { opacity: 1, duration: 0.4 }, 1.0);
}

// ─── NAV ───
async function renderNav() {
  try {
    const q = query(collection(db, "categories"), orderBy("displayOrder", "asc"));
    const snap = await getDocs(q);
    const ul = $("#nav-links");
    if (!ul) return;
    snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.showOnHomepage).slice(0, 5)
      .forEach(c => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "catalogo.html?cat=" + slugify(c.name);
        a.textContent = c.name;
        li.appendChild(a);
        ul.appendChild(li);
      });
  } catch { /* silent */ }
}

// ─── NOT FOUND ───
function showNotFound() {
  const detail = $("#product-detail");
  if (!detail) return;
  clear(detail);

  const wrap = document.createElement("div");
  wrap.className = "not-found";
  wrap.style.gridColumn = "1 / -1";

  const title = document.createElement("div");
  title.className = "not-found-title";
  title.textContent = "404";

  const sub = document.createElement("div");
  sub.className = "not-found-sub";
  sub.textContent = "Producto no encontrado";

  const link = document.createElement("a");
  link.href = "catalogo.html";
  link.className = "btn-secondary";
  link.style.cssText = "padding:12px 28px;border:1px solid var(--rule);color:var(--cream-dim);font-size:11px;letter-spacing:.2em;text-transform:uppercase;display:inline-flex;margin-top:16px";
  link.textContent = "Ver catalogo";

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(link);
  detail.appendChild(wrap);
}

// ─── MAIN ───
async function init() {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  if (!prodId) { showNotFound(); return; }

  try {
    const [snap, settingsSnap] = await Promise.all([
      getDoc(doc(db, "products", prodId)),
      getDoc(doc(db, "settings", "store"))
    ]);

    if (!snap.exists()) { showNotFound(); return; }

    const product = { id: snap.id, ...snap.data() };
    currentProduct = product;

    if (settingsSnap.exists()) {
      const s = settingsSnap.data();
      window._storePhone = s.whatsappNumber || s.phone || "";
    }

    // Populate page
    document.title = product.name + " — Muebleria Palito Outlet";
    setText("#bc-name", product.name);
    setText("#bc-cat", product.category || "Catalogo");

    const bcCat = $("#bc-cat");
    if (bcCat) bcCat.href = "catalogo.html?cat=" + slugify(product.category || "");

    setText("#prod-category", product.category || "");
    setText("#prod-name", product.name);
    setText("#prod-subcategory", product.subcategory || "");
    setText("#prod-price", priceFmt(product.price));

    if (product.originalPrice) {
      const orig = $("#prod-price-orig");
      if (orig) { orig.textContent = priceFmt(product.originalPrice); orig.style.display = ""; }
    }
    if (product.discountPct) {
      const disc = $("#prod-discount");
      if (disc) { disc.textContent = "-" + Math.abs(product.discountPct) + "%"; disc.style.display = ""; }
    }

    setText("#prod-desc", product.description || "");

    // Collect images
    const images = [];
    if (product.imageUrl) images.push(product.imageUrl);
    if (product.primaryImage && product.primaryImage !== product.imageUrl) images.push(product.primaryImage);
    if (Array.isArray(product.images)) {
      product.images.forEach(u => { if (u && !images.includes(u)) images.push(u); });
    }
    if (!images.length) images.push("https://via.placeholder.com/800x900");

    const mainImg = $("#main-img");
    if (mainImg) { mainImg.src = images[0]; mainImg.alt = product.name; }

    buildThumbs(images);
    buildColors(product.colors);
    initQty(product.price);
    initPayment();
    buildSpecs(product);
    initOrderPanel(product);

    const afterLoad = () => initLoupe(images[0]);
    if (mainImg) {
      if (mainImg.complete) afterLoad();
      else mainImg.addEventListener("load", afterLoad, { once: true });
    }

    await renderNav();
    playEntrance();
    await loadRelated(product);

  } catch (err) {
    console.error("[producto-renderer]", err);
    showNotFound();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
