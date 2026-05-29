import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, getDocs, query, orderBy, doc, getDoc, where, limit
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { normalizeColor, normalizeMaterials } from "./product-normalizers.js";

const app = initializeApp(firebaseConfig);
// IndexedDB cache — second visit serves docs from local cache (sub-50ms) before network confirms.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
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
// Uses left/top CSS positioning (centered via transform:translate(-50%,-50%) in CSS).
// background-image mirrors the main image at 320% size; background-position
// tracks the cursor percentage so the zoomed area stays under the loupe center.
function initLoupe(imageUrl) {
  const wrap = $("#img-wrap");
  const loupe = $("#loupe");
  if (!wrap || !loupe) return;

  loupe.style.backgroundImage = "url(" + imageUrl + ")";

  wrap.addEventListener("mouseenter", () => { loupe.style.opacity = "1"; });
  wrap.addEventListener("mouseleave", () => { loupe.style.opacity = "0"; });

  wrap.addEventListener("mousemove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Position the loupe — CSS transform:translate(-50%,-50%) centers it on cursor
    loupe.style.left = px + "px";
    loupe.style.top  = py + "px";

    // Zoom area: map cursor position (0-1) directly to background-position (0%-100%)
    loupe.style.backgroundPosition =
      ((px / rect.width) * 100).toFixed(2) + "% " +
      ((py / rect.height) * 100).toFixed(2) + "%";
  });
}

// ─── QR (opcional, debajo de las miniaturas) ───
let __qrLibPromise = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (__qrLibPromise) return __qrLibPromise;
  __qrLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => reject(new Error("qr lib"));
    document.head.appendChild(s);
  });
  return __qrLibPromise;
}

// Muestra el QR del producto debajo de las miniaturas. Si no hay qrUrl, oculta.
// Crea el contenedor si el HTML estuviera cacheado viejo (sin #prod-qr).
function buildQr(qrUrl) {
  let box = $("#prod-qr");
  if (!box) {
    // Sobrepuesto dentro de la imagen (esquina superior derecha).
    const wrap = $("#img-wrap") || $("#img-panel");
    if (!wrap) return;
    box = document.createElement("div");
    box.className = "prod-qr";
    box.id = "prod-qr";
    wrap.appendChild(box);
  }
  if (!qrUrl) { box.classList.remove("show"); box.replaceChildren(); return; }
  loadQrLib().then(qrcode => {
    const qr = qrcode(0, "M");
    qr.addData(qrUrl);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    box.classList.add("show");
  }).catch(() => { box.classList.remove("show"); });
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

// ─── COLOR SWATCHES (variaciones) ───
// Cada color es una variación {hex, image}. Clic en un cuadrito cambia la foto
// principal (mismo fade que las miniaturas) a la foto de esa variación.
function buildColors(colors) {
  const wrap = $("#prod-colors-wrap");
  const container = $("#prod-colors");
  if (!colors || !colors.length) { if (wrap) wrap.style.display = "none"; return; }
  if (!container) return;

  const norm = colors.map(normalizeColor).filter(c => c.hex);
  if (!norm.length) { if (wrap) wrap.style.display = "none"; return; }

  selectedColor = norm[0].hex;
  norm.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "cswatch" + (i === 0 ? " active" : "");
    div.style.background = c.hex;
    div.title = c.hex;
    div.addEventListener("click", () => {
      container.querySelectorAll(".cswatch").forEach(s => s.classList.remove("active"));
      div.classList.add("active");
      selectedColor = c.hex;
      if (!c.image) return;
      const mainImg = $("#main-img");
      if (!mainImg) return;
      gsap.to(mainImg, { opacity: 0, duration: 0.18, onComplete: () => {
        mainImg.src = c.image;
        const loupe = $("#loupe");
        if (loupe) loupe.style.backgroundImage = "url(" + c.image + ")";
        gsap.to(mainImg, { opacity: 1, duration: 0.25 });
      }});
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
  const panels = {
    efectivo: document.getElementById("pay-cash"),
    transferencia: document.getElementById("pay-transfer"),
    tarjeta: document.getElementById("pay-card"),
  };

  function showPanel(key) {
    Object.entries(panels).forEach(([k, el]) => {
      if (!el) return;
      if (k === key) {
        el.style.display = "";
        // Re-trigger animation
        el.style.animation = "none";
        el.offsetHeight; // reflow
        el.style.animation = "";
      } else {
        el.style.display = "none";
      }
    });
    // Show efectivo panel by default on load (already selected)
    if (key === "tarjeta") initCardInteractivity();
    if (key === "transferencia") initCopyBtn();
  }

  document.querySelectorAll(".pay-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".pay-opt").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      selectedPayment = opt.dataset.pay || "efectivo";
      showPanel(selectedPayment);
    });
  });

  // Show default panel
  showPanel("efectivo");
}

// ─── CARD INTERACTIVITY ───
let cardInitialized = false;
function initCardInteractivity() {
  if (cardInitialized) return;
  cardInitialized = true;

  const card3d   = document.getElementById("card-3d");
  const numDisp  = document.getElementById("card-num");
  const nameDisp = document.getElementById("card-holder");
  const expDisp  = document.getElementById("card-exp");
  const cvvDisp  = document.getElementById("card-cvv-disp");
  const netDisp  = document.getElementById("card-net");

  const numIn  = document.getElementById("c-number");
  const nameIn = document.getElementById("c-name");
  const expIn  = document.getElementById("c-exp");
  const cvvIn  = document.getElementById("c-cvv");

  if (!card3d || !numIn) return;

  // Format card number as groups of 4
  numIn.addEventListener("input", () => {
    let v = numIn.value.replace(/\D/g, "").slice(0, 16);
    numIn.value = v.replace(/(.{4})/g, "$1 ").trim();
    const masked = v.padEnd(16, "•");
    const parts = [masked.slice(0,4), masked.slice(4,8), masked.slice(8,12), masked.slice(12,16)];
    numDisp.textContent = parts.join("  ");
    // Detect network
    const first = v[0];
    if (first === "4") netDisp.textContent = "VISA";
    else if (first === "5") netDisp.textContent = "MASTERCARD";
    else if (first === "3") netDisp.textContent = "AMEX";
    else netDisp.textContent = "VISA";
  });

  nameIn.addEventListener("input", () => {
    const v = nameIn.value.toUpperCase() || "TU NOMBRE";
    nameDisp.textContent = v;
  });

  expIn.addEventListener("input", () => {
    let v = expIn.value.replace(/\D/g, "").slice(0, 4);
    if (v.length >= 3) v = v.slice(0,2) + "/" + v.slice(2);
    expIn.value = v;
    expDisp.textContent = v || "MM/AA";
  });

  cvvIn.addEventListener("input", () => {
    const v = cvvIn.value.replace(/\D/g, "");
    cvvDisp.textContent = v.length ? v.replace(/./g, "•") : "•••";
  });

  // Flip card on CVV focus/blur
  cvvIn.addEventListener("focus", () => { card3d.classList.add("flipped"); });
  cvvIn.addEventListener("blur",  () => { card3d.classList.remove("flipped"); });
  [numIn, nameIn, expIn].forEach(el => {
    el.addEventListener("focus", () => { card3d.classList.remove("flipped"); });
  });
}

// ─── COPY BUTTON ───
function initCopyBtn() {
  const btn  = document.getElementById("copy-acct");
  const acct = document.getElementById("bank-acct");
  if (!btn || !acct) return;
  btn.addEventListener("click", () => {
    const txt = acct.textContent.trim();
    navigator.clipboard.writeText(txt).then(() => {
      const orig = btn.textContent.trim();
      btn.classList.add("done");
      const span = document.createTextNode(" Copiado!");
      btn.appendChild(span);
      setTimeout(() => {
        btn.classList.remove("done");
        btn.removeChild(span);
      }, 2200);
    }).catch(() => {});
  });
}

// ─── PAGAR BUTTON ───
function initPayButton(product) {
  const btn = document.getElementById("btn-pagar");
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.classList.add("loading");
    btn.textContent = "Procesando…";
    setTimeout(() => {
      btn.classList.remove("loading");
      btn.querySelector ? null : null;
      showReceipt(product);
    }, 900);
  });
}

// ─── GENERIC QR (SVG, no library) ───
function drawGenericQR(svg) {
  const NS  = "http://www.w3.org/2000/svg";
  const N   = 21;
  const C   = 6; // cell px
  const SZ  = N * C;
  const DK  = "#0c1f14";
  const LT  = "#f5f0e6";

  svg.setAttribute("viewBox", "0 0 " + SZ + " " + SZ);
  svg.setAttribute("width",  "128");
  svg.setAttribute("height", "128");

  // clear previous
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const r = (x, y, w, h, fill) => {
    const el = document.createElementNS(NS, "rect");
    el.setAttribute("x", x * C); el.setAttribute("y", y * C);
    el.setAttribute("width", w * C); el.setAttribute("height", h * C);
    el.setAttribute("fill", fill);
    svg.appendChild(el);
  };

  // background
  r(0, 0, N, N, LT);

  // finder pattern helper: outer 7×7 dark, inner 5×5 light, core 3×3 dark
  const finder = (ox, oy) => {
    r(ox,   oy,   7, 7, DK);
    r(ox+1, oy+1, 5, 5, LT);
    r(ox+2, oy+2, 3, 3, DK);
  };
  finder(0, 0);       // top-left
  finder(N-7, 0);     // top-right
  finder(0, N-7);     // bottom-left

  // timing strips (row 6, col 6, between finders)
  for (let i = 8; i <= N-9; i++) {
    if (i % 2 === 0) {
      r(i, 6, 1, 1, DK);
      r(6, i, 1, 1, DK);
    }
  }

  // data modules — deterministic pseudo-random pattern
  const bits = [
    1,0,1,1,0,1,0,0,1,0,1,0,1,1,
    0,1,0,1,1,0,1,1,0,1,0,1,0,0,
    1,1,0,0,1,0,1,0,1,1,0,0,1,1,
    0,0,1,1,0,1,0,1,0,0,1,1,0,1,
    1,0,0,1,1,0,0,1,1,0,1,0,1,0,
    0,1,1,0,1,1,0,0,1,1,0,1,0,1,
    1,0,1,0,0,1,1,0,0,1,1,0,1,1,
    0,1,0,1,1,0,1,1,0,0,1,0,0,1,
    1,1,1,0,0,1,0,1,1,0,0,1,1,0,
    0,0,1,1,0,0,1,0,1,1,0,1,0,1,
  ];

  let bi = 0;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      // skip finder zones + separator
      if (row < 8 && col < 8) continue;
      if (row < 8 && col >= N-8) continue;
      if (row >= N-8 && col < 8) continue;
      // skip timing
      if (row === 6 || col === 6) continue;
      if (bits[bi % bits.length]) r(col, row, 1, 1, DK);
      bi++;
    }
  }
}

// ─── RECEIPT ───
function showReceipt(product) {
  const overlay = document.getElementById("receipt-overlay");
  if (!overlay) return;

  const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const name    = v("o-name")    || "Cliente";
  const phone   = v("o-phone")   || "—";
  const address = v("o-address") || "—";
  const notes   = v("o-notes");
  const total   = priceFmt(product.price * qty);
  const orderId = "ORD-" + Date.now().toString(36).toUpperCase().slice(-8);
  const date    = new Date().toLocaleDateString("es-HN", { day:"2-digit", month:"long", year:"numeric" });

  // Populate static slots
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("r-thanks",  "Gracias, " + name + "!");
  set("r-prod",    product.name);
  set("r-qty",     qty);
  set("r-total",   total);
  set("r-name",    name);
  set("r-phone",   phone);
  set("r-addr",    address);
  set("r-orderid", "Orden: " + orderId);
  set("r-date",    date);

  if (selectedColor) {
    const crow = document.getElementById("r-color-row");
    if (crow) { crow.style.display = ""; set("r-color", selectedColor); }
  }
  if (notes) {
    const nrow = document.getElementById("r-notes-row");
    if (nrow) { nrow.style.display = ""; set("r-notes", notes); }
  }

  // Generic QR — drawn with SVG, no external library
  const qrSvg = document.getElementById("qr-svg");
  if (qrSvg) drawGenericQR(qrSvg);

  overlay.style.display = "flex";

  // Set initial states
  gsap.set("#receipt-wrap",    { y: 70, autoAlpha: 0, scale: 0.97 });
  gsap.set("#receipt-overlay", { autoAlpha: 0 });
  gsap.set("#r-check-circle",  { scale: 0 });
  gsap.set(".r-title, .r-thanks", { autoAlpha: 0, y: 12 });
  gsap.set(".r-dash",          { autoAlpha: 0, scaleX: 0, transformOrigin: "left center" });
  gsap.set(".r-row",           { autoAlpha: 0, x: -14 });
  gsap.set(".r-qr-wrap",       { autoAlpha: 0, scale: 0.85 });
  gsap.set(".r-orderid, .r-date, #receipt-close", { autoAlpha: 0, y: 8 });

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.to("#receipt-overlay", { autoAlpha: 1, duration: 0.38 })
    .to("#receipt-wrap",    { y: 0, autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(1.35)" }, "-=0.15")
    .to("#r-check-circle",  { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.5)" }, "-=0.2")
    .to(".r-title",         { autoAlpha: 1, y: 0, duration: 0.4 }, "-=0.1")
    .to(".r-thanks",        { autoAlpha: 1, y: 0, duration: 0.38 }, "-=0.22")
    .to(".r-dash",          { autoAlpha: 1, scaleX: 1, duration: 0.45, ease: "power2.out", stagger: 0.18 }, "-=0.1")
    .to(".r-row",           { autoAlpha: 1, x: 0, duration: 0.38, stagger: 0.07 }, "-=0.35")
    .to(".r-qr-wrap",       { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(1.5)" }, "-=0.15")
    .to(".r-orderid, .r-date, #receipt-close", { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08 }, "-=0.2");

  document.getElementById("receipt-close").onclick = () => {
    gsap.timeline()
      .to("#receipt-wrap",    { y: -40, autoAlpha: 0, scale: 0.96, duration: 0.38, ease: "power2.in" })
      .to("#receipt-overlay", { autoAlpha: 0, duration: 0.3, ease: "power2.in" }, "-=0.15")
      .call(() => {
        overlay.style.display = "none";
        const btn = document.getElementById("btn-pagar");
        if (btn) {
          btn.classList.remove("loading");
          btn.textContent = "";
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 24 24");
          svg.setAttribute("stroke-width", "1.5");
          svg.setAttribute("stroke-linecap", "round");
          svg.setAttribute("stroke-linejoin", "round");
          svg.style.cssText = "width:15px;height:15px;stroke:currentColor;fill:none;flex-shrink:0";
          const rect1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect1.setAttribute("x","3"); rect1.setAttribute("y","11");
          rect1.setAttribute("width","18"); rect1.setAttribute("height","11");
          rect1.setAttribute("rx","2"); rect1.setAttribute("ry","2");
          const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path1.setAttribute("d","M7 11V7a5 5 0 0110 0v4");
          svg.appendChild(rect1); svg.appendChild(path1);
          btn.appendChild(svg);
          btn.appendChild(document.createTextNode(" Confirmar pago"));
        }
      });
  };
}

// ─── SPECS — always visible, no accordion ───
function buildSpecs(product) {
  const grid = $("#specs-grid");
  const section = $("#specs-section");
  if (!grid || !section) return;

  const materials = normalizeMaterials(product);
  const fields = [
    ["Categoria", product.category],
    ["Subcategoria", product.subcategory],
    ["Material", materials.join(", ")],
    ["Disponibilidad", "Verificar disponibilidad con asesor"],
  ].filter(([, v]) => v);

  if (!fields.length) return;

  section.style.display = "";
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
}

// ─── ORDER PANEL — always visible, btn scrolls to it ───
function initOrderPanel(product) {
  const btn = $("#btn-order");
  const panel = $("#order-panel");
  const addEl = (sel, val) => { const e = $(sel); if (e) e.textContent = val; };

  addEl("#s-prod-name", product.name);
  addEl("#s-unit-price", priceFmt(product.price));

  // Scroll to the always-visible order form
  if (btn) btn.addEventListener("click", () => {
    gsap.to(window, { duration: 0.75, scrollTo: { y: panel, offsetY: -80 }, ease: "power3.out" });
    const inputs = panel.querySelectorAll(".form-input");
    if (inputs.length) setTimeout(() => inputs[0].focus(), 800);
  });

  const waBtn = $("#btn-whatsapp");
  const waHint = $("#wa-hint");
  if (waBtn) {
    var val = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; };
    var checkOrder = function () {
      var n = val("o-name"), p = val("o-phone");
      if (n && p && /\d/.test(p)) {
        waBtn.disabled = false;
        if (waHint) waHint.style.opacity = "0";
      } else {
        waBtn.disabled = true;
        if (waHint) waHint.style.opacity = "1";
      }
    };
    // Check immediately
    checkOrder();
    // Listen on name + phone
    ["o-name","o-phone"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener("input", checkOrder); el.addEventListener("change", checkOrder); }
    });
    setInterval(checkOrder, 500);

    // Phone: strip non-numeric chars in real-time
    var phoneEl = document.getElementById("o-phone");
    if (phoneEl) {
      phoneEl.addEventListener("input", function() {
        phoneEl.value = phoneEl.value.replace(/[^\d\s\+\-\(\)]/g, "");
      });
    }

    waBtn.addEventListener("click", function () {
      if (waBtn.disabled) return;
      sendWhatsApp(product);
    });
  }
}

function sendWhatsApp(product) {
  const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const parts = [
    "Hola! Quiero hacer un pedido:",
    "",
    "Producto: " + product.name,
    product.category ? "Categoria: " + product.category : "",
    selectedColor ? "Color: " + selectedColor : "",
    "Cantidad: " + qty,
    "Total estimado: " + priceFmt(product.price * qty),
    "",
    v("o-name") ? "Nombre: " + v("o-name") : "",
    v("o-phone") ? "Telefono: " + v("o-phone") : "",
    v("o-address") ? "Entrega: " + v("o-address") : "",
    v("o-ref") ? "Referencia: " + v("o-ref") : "",
    v("o-notes") ? "Notas: " + v("o-notes") : "",
  ].filter(Boolean).join("\n");

  const waNum = (window._storePhone || "593959667093").replace(/\D/g, "");
  window.open("https://wa.me/" + waNum + "?text=" + encodeURIComponent(parts), "_blank");
}

// ─── RELATED ───
async function loadRelated(product) {
  const section = $("#related-section");
  const grid = $("#related-grid");
  if (!section || !grid) return;

  try {
    const catId = product.categoryId || slugify(product.category || "");
    // No orderBy here — that combined with `where` requires a composite index. Sort client-side.
    const q = query(
      collection(db, "products"),
      where("categoryId", "==", catId),
      limit(8)
    );
    const snap = await getDocs(q);
    const related = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.id !== product.id)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
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
// Elements are visible in CSS; GSAP sets initial invisible state then animates in.
function playEntrance() {
  const infoEls = ["#prod-category","#prod-name","#prod-subcategory","#prod-price-row",
    "#prod-desc","#prod-colors-wrap","#prod-qty-wrap","#prod-cta","#specs-section"];

  gsap.set(infoEls, { autoAlpha: 0, y: 24 });
  // #img-panel is intentionally not animated here. It is left visible from first paint
  // so the preloaded image bytes (from ?img= URL param / localStorage / manifest) can
  // show up immediately, without waiting for Firestore + entrance animation.

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.to("#prod-category",    { autoAlpha: 1, y: 0, duration: 0.5 }, 0.28)
    .to("#prod-name",        { autoAlpha: 1, y: 0, duration: 0.6 }, 0.38)
    .to("#prod-subcategory", { autoAlpha: 1, y: 0, duration: 0.5 }, 0.48)
    .to("#prod-price-row",   { autoAlpha: 1, y: 0, duration: 0.5 }, 0.56)
    .to("#prod-desc",        { autoAlpha: 1, y: 0, duration: 0.5 }, 0.64)
    .to("#prod-colors-wrap", { autoAlpha: 1, y: 0, duration: 0.45 }, 0.72)
    .to("#prod-qty-wrap",    { autoAlpha: 1, y: 0, duration: 0.45 }, 0.78)
    .to("#prod-cta",         { autoAlpha: 1, y: 0, duration: 0.5 }, 0.86)
    .to("#specs-section",    { autoAlpha: 1, y: 0, duration: 0.4 }, 0.94);
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
    // Add Ubicaciones button
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
    const pinPath = document.createElementNS(svgNS, "path");
    pinPath.setAttribute("d", "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z");
    const pinCircle = document.createElementNS(svgNS, "circle");
    pinCircle.setAttribute("cx", "12");
    pinCircle.setAttribute("cy", "10");
    pinCircle.setAttribute("r", "3");
    locSvg.appendChild(pinPath);
    locSvg.appendChild(pinCircle);
    aLoc.appendChild(locSvg);
    aLoc.appendChild(document.createTextNode(" Ubicaciones"));
    liLoc.appendChild(aLoc);
    ul.appendChild(liLoc);
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

// Populate every visible piece of the page from a product object. Used by both
// the cache fast-path and the Firestore path. Idempotent — safe to call twice.
function populateFromProduct(product) {
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

  // Collect images: fotos de las variaciones de color primero, luego las
  // imágenes sueltas legacy. Dedupe por URL.
  const images = [];
  const pushImg = (u) => { if (u && !images.includes(u)) images.push(u); };
  (product.colors || []).forEach(c => pushImg(normalizeColor(c).image));
  pushImg(product.imageUrl);
  pushImg(product.primaryImage);
  if (Array.isArray(product.images)) product.images.forEach(pushImg);
  if (!images.length) images.push("https://via.placeholder.com/800x900");

  const mainImg = $("#main-img");
  if (mainImg) {
    const markLoaded = () => mainImg.classList.add('loaded');
    if (!mainImg.getAttribute('src')) {
      mainImg.src = images[0];
      if (mainImg.complete) markLoaded();
      else mainImg.addEventListener('load', markLoaded, { once: true });
    }
    mainImg.alt = product.name;
  }

  buildThumbs(images);
  buildColors(product.colors);
  buildQr(product.qrUrl);
  initQty(product.price);
  initPayment();
  buildSpecs(product);
  initAddToCart(product);
  initPayButton(product);

  if (mainImg) {
    const afterLoad = () => initLoupe(images[0]);
    if (mainImg.complete) afterLoad();
    else mainImg.addEventListener("load", afterLoad, { once: true });
  }
}

// Override CSS pre-hide instantly (no animation). Used by the cache fast-path so
// the page feels instant when product data is already in localStorage.
function revealInfoInstantly() {
  const sels = ['#prod-category','#prod-name','#prod-subcategory','#prod-price-row',
    '#prod-desc','#prod-colors-wrap','#prod-qty-wrap','#prod-cta','#specs-section'];
  sels.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) { el.style.opacity = '1'; el.style.visibility = 'visible'; }
  });
}

// ─── MAIN ───
async function init() {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  if (!prodId) { showNotFound(); return; }

  // Fast-path: cache populated by the catalog. The inline script at the end of
  // producto.html already rendered text+image and revealed info elements before
  // this module loaded — we just need to finish wiring up thumbs/colors/specs
  // and attach event listeners against the same cached product.
  let usedCache = false;
  let cached = window.__cacheHitProduct || null;
  if (!cached) {
    try {
      const raw = localStorage.getItem('product:' + prodId);
      if (raw) cached = JSON.parse(raw);
    } catch (_) {}
  }
  if (cached) {
    currentProduct = cached;
    populateFromProduct(cached);
    revealInfoInstantly();
    usedCache = true;
  }

  try {
    // Fire both requests in parallel but don't wait for settings to render the product.
    const productPromise  = getDoc(doc(db, "products", prodId));
    const settingsPromise = getDoc(doc(db, "settings", "store"));

    settingsPromise.then(settingsSnap => {
      if (settingsSnap.exists()) {
        const s = settingsSnap.data();
        window._storePhone = "593959667093";
      }
    });

    const snap = await productPromise;
    if (!snap.exists()) {
      if (!usedCache) showNotFound();
      return;
    }

    const product = { id: snap.id, ...snap.data() };
    currentProduct = product;

    // Keep cache fresh for next visit
    try { localStorage.setItem('product:' + product.id, JSON.stringify(product)); } catch (_) {}
    if (product.imageUrl) {
      try { localStorage.setItem('img:' + product.id, product.imageUrl); } catch (_) {}
    }

    // On cache hit, the page is already fully populated and interactive. Skip
    // re-population to avoid duplicating event listeners (initOrderPanel,
    // initLoupe, etc. add handlers each time). The localStorage cache was just
    // refreshed above, so the next visit will see any data changes.
    if (!usedCache) {
      populateFromProduct(product);
      playEntrance();
    } else {
      // En cache-hit no re-poblamos todo (evita duplicar listeners), pero el QR
      // puede haberse agregado/cambiado: refrescarlo con el dato fresco.
      buildQr(product.qrUrl);
    }

    await renderNav();
    await loadRelated(product);

  } catch (err) {
    console.error("[producto-renderer]", err);
    if (!usedCache) showNotFound();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
