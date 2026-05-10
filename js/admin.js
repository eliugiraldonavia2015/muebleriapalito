import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { CATEGORIES, PRODUCTS, SETTINGS } from "./seed-data.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Hardcoded admin credentials - change these if needed
const ADMIN_EMAIL = "admin@palito.com";
const ADMIN_PASSWORD = "admin2025";

const COL_CATEGORIES = "categories";
const COL_PRODUCTS = "products";
const COL_SETTINGS = "settings";

let categories = [];
let products = [];
let settings = {};
let editingCatSubs = [];
let editingProdColors = [];
let editingCatId = null;
let editingProdId = null;
let storeCount = 0;
let currentDetailCatId = null;
let currentDetailSubcategory = "all";
let catProductsAll = [];
let catProductsFiltered = [];
let catProductsShown = 0;
const CAT_PAGE_SIZE = 25;
let catScrollObserver = null;

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(t) {
  return (t || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── AUTH ───
function showLogin() {
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("adminApp").classList.add("hidden");
}

async function showApp() {
  document.getElementById("loginPage").classList.add("hidden");
  await runLoader();
}

document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    errEl.textContent = "Credenciales incorrectas.";
    errEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.querySelector("span").textContent = "Iniciando...";
  errEl.classList.add("hidden");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (signInErr) {
    // Si falla el login, intentar crear la cuenta (primera vez)
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (createErr) {
      // Si creation falla con email-already-in-use, la contrasena es incorrecta en Firebase
      const msg = createErr.code === "auth/email-already-in-use"
        ? "Contrasena incorrecta en Firebase. Resetea la cuenta en la consola."
        : createErr.message;
      errEl.textContent = "Error: " + msg;
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.querySelector("span").textContent = "Iniciar sesion";
      return;
    }
  }

  btn.disabled = false;
  btn.querySelector("span").textContent = "Iniciar sesion";
});

document.getElementById("logoutBtn").addEventListener("click", async e => {
  e.preventDefault();
  productsLoaded = false;
  categories = [];
  products = [];
  settings = {};
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  if (user) {
    showApp();
  } else {
    showLogin();
  }
});

// ─── GSAP LOADER ───
let productsLoaded = false;

async function runLoader() {
  const gsap = window.gsap;
  const loader = document.getElementById("adminLoader");
  const statusEl = document.getElementById("loaderStatus");
  const barEl = document.getElementById("loaderBar");
  const lettersContainer = document.getElementById("loaderLetters");

  // Build letter spans
  "PALITO".split("").forEach(ch => {
    const s = document.createElement("span");
    s.textContent = ch;
    lettersContainer.appendChild(s);
  });

  loader.style.display = "flex";

  // Animate in
  const tl = gsap.timeline();
  tl.to(".loader-logo", { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" })
    .to(".loader-name-inner span", {
      autoAlpha: 1, y: 0, duration: 0.05, stagger: 0.06, ease: "power2.out"
    }, "-=0.2")
    .to(".loader-sub", { autoAlpha: 1, duration: 0.5, ease: "power2.out" }, "-=0.1")
    .to(".loader-status", { autoAlpha: 1, duration: 0.4 }, "-=0.2")
    .to(barEl, { width: "20%", duration: 0.6, ease: "power1.out" }, "-=0.3");

  await tl;

  // Always sync seed-data.js catalog to Firestore on every admin load
  setLoaderStatus(statusEl, barEl, gsap, "Sincronizando catálogo...", "40%");
  await runSeed();

  setLoaderStatus(statusEl, barEl, gsap, "Cargando categorias...", "75%");
  await loadCategories();
  await loadProducts();

  setLoaderStatus(statusEl, barEl, gsap, "Preparando panel...", "95%");
  renderDashboard();
  renderCatCards();
  populateSettingsForm();
  document.getElementById("lastSync").textContent = "Sincronizado: " + new Date().toLocaleTimeString("es-EC");

  // Complete and reveal app
  await gsap.to(barEl, { width: "100%", duration: 0.3, ease: "power2.in" });
  await gsap.to(loader, { autoAlpha: 0, y: -16, duration: 0.55, ease: "power3.in", delay: 0.1 });
  loader.style.display = "none";
  gsap.set(loader, { clearProps: "all" });

  const app = document.getElementById("adminApp");
  app.classList.remove("hidden");
  gsap.fromTo(app, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out" });
}

function setLoaderStatus(el, bar, gsap, text, pct) {
  el.textContent = text;
  gsap.to(bar, { width: pct, duration: 0.5, ease: "power2.out" });
}

// ─── NAVIGATION ───
document.getElementById("adminNav").addEventListener("click", e => {
  const btn = e.target.closest("[data-section]");
  if (!btn) return;
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));
  const section = btn.dataset.section;
  document.getElementById("sec-" + section).classList.add("active");
  // When returning to categories, ensure list view is visible
  if (section === "categories" && !currentDetailCatId) {
    document.getElementById("catListView").style.display = "block";
    document.getElementById("catDetailView").style.display = "none";
  }
});

// ─── ALERT ───
function showAlert(msg, type = "success") {
  const box = document.getElementById("alertBox");
  const div = document.createElement("div");
  div.className = `alert alert-${type}`;
  div.textContent = msg;
  box.replaceChildren(div);
  setTimeout(() => { box.replaceChildren(); }, 3500);
}

// ─── INIT (called by runLoader, not directly) ───

// ─── CATEGORIES ───
async function loadCategories() {
  try {
    const q = query(collection(db, COL_CATEGORIES), orderBy("displayOrder", "asc"));
    const snap = await getDocs(q);
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    categories = [];
  }
}

function renderCatCards() {
  const grid = document.getElementById("catGrid");
  grid.replaceChildren();
  if (!categories.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "grid-column:1/-1;text-align:center;padding:56px 24px;color:var(--gray)";
    empty.innerHTML = `<p>No hay categorias. Agrega la primera.</p>`;
    grid.appendChild(empty);
    return;
  }
  const gsap = window.gsap;
  categories.forEach(cat => {
    const subs = cat.subcategoryList || cat.subcategories || [];
    const imgSrc = cat.imageUrl || cat.coverImage || "";
    const card = document.createElement("div");
    card.className = "cat-card";

    card.addEventListener("click", e => {
      if (e.target.closest(".cat-action-btn") || e.target.closest(".home-btn")) return;
      openCategoryDetail(cat.id);
    });

    const imgEl = document.createElement("img");
    imgEl.className = "cat-card-img";
    imgEl.src = imgSrc;
    imgEl.onerror = () => { imgEl.style.background = "#1a2e1e"; imgEl.removeAttribute("src"); };

    const overlay = document.createElement("div");
    overlay.className = "cat-card-overlay";

    const homeWrap = document.createElement("div");
    homeWrap.className = "cat-home-toggle";
    const homeBtn = document.createElement("button");
    homeBtn.className = "home-btn " + (cat.showOnHomepage ? "on-home" : "off-home");
    homeBtn.title = cat.showOnHomepage ? "Quitar del home" : "Poner en home";
    homeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    homeBtn.addEventListener("click", e => { e.stopPropagation(); toggleHomepage(cat.id, homeBtn); });
    homeWrap.appendChild(homeBtn);

    const actions = document.createElement("div");
    actions.className = "cat-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "cat-action-btn";
    editBtn.title = "Editar";
    editBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener("click", e => { e.stopPropagation(); editCategory(cat.id); });

    const delBtn = document.createElement("button");
    delBtn.className = "cat-action-btn danger";
    delBtn.title = "Eliminar";
    delBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    delBtn.addEventListener("click", e => { e.stopPropagation(); deleteCategory(cat.id); });
    actions.append(editBtn, delBtn);

    const body = document.createElement("div");
    body.className = "cat-card-body";

    const nameEl = document.createElement("div");
    nameEl.className = "cat-card-name";
    nameEl.textContent = cat.name;

    const pillsEl = document.createElement("div");
    pillsEl.className = "cat-card-subs";
    subs.slice(0, 3).forEach(s => {
      const pill = document.createElement("span");
      pill.className = "cat-sub-pill";
      pill.textContent = s;
      pillsEl.appendChild(pill);
    });
    if (subs.length > 3) {
      const more = document.createElement("span");
      more.className = "cat-sub-pill";
      more.textContent = "+" + (subs.length - 3);
      pillsEl.appendChild(more);
    }

    const metaEl = document.createElement("div");
    metaEl.className = "cat-card-meta";
    metaEl.textContent = (cat.productCount || 0) + " productos";

    body.append(nameEl, pillsEl, metaEl);
    card.append(imgEl, overlay, homeWrap, actions, body);
    grid.appendChild(card);
  });

  gsap.from(".cat-card", { opacity: 0, y: 18, duration: 0.45, stagger: { amount: 0.35 }, ease: "power2.out" });
}

async function toggleHomepage(catId, btn) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;
  const newVal = !cat.showOnHomepage;
  cat.showOnHomepage = newVal;
  btn.className = "home-btn " + (newVal ? "on-home" : "off-home");
  btn.title = newVal ? "Quitar del home" : "Poner en home";
  window.gsap.fromTo(btn, { scale: 0.75 }, { scale: 1, duration: 0.35, ease: "back.out(2.5)" });
  try {
    await updateDoc(doc(db, COL_CATEGORIES, catId), { showOnHomepage: newVal, updatedAt: serverTimestamp() });
    renderDashboard();
  } catch (err) {
    cat.showOnHomepage = !newVal;
    btn.className = "home-btn " + (!newVal ? "on-home" : "off-home");
    showAlert("Error: " + err.message, "error");
  }
}

async function openCategoryDetail(catId) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;
  currentDetailCatId = catId;
  currentDetailSubcategory = "all";
  catProductsAll = [];
  catProductsFiltered = [];
  catProductsShown = 0;

  const img = cat.imageUrl || cat.coverImage || "";
  document.getElementById("detailCatImg").src = img;
  document.getElementById("detailCatName").textContent = cat.name;
  const subs = cat.subcategoryList || cat.subcategories || [];
  document.getElementById("detailCatMeta").textContent = subs.length + " subcategorias";
  document.getElementById("detailEditCatBtn").dataset.catId = catId;
  renderSubTabs(subs);
  showSkeletonGrid(Math.min(CAT_PAGE_SIZE, 8));

  const listView = document.getElementById("catListView");
  const detailView = document.getElementById("catDetailView");
  const gsap = window.gsap;

  gsap.to(listView, {
    opacity: 0, x: -24, duration: 0.22, ease: "power2.in",
    onComplete: () => {
      listView.style.display = "none";
      detailView.style.display = "block";
      gsap.fromTo(detailView, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" });
    }
  });

  await loadCategoryProducts(catId);
}

async function loadCategoryProducts(catId) {
  try {
    // seed-data usó createSlug() que lowercasea los IDs ("Salas" → "salas")
    // pero las categorías en Firestore tienen ID capitalizado ("Salas").
    // Usamos 'in' para cubrir ambos casos sin re-seedear.
    const ids = [...new Set([catId, catId.toLowerCase()])];
    const q = query(collection(db, COL_PRODUCTS), where("categoryId", "in", ids));
    const snap = await getDocs(q);
    catProductsAll = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  } catch (err) {
    console.error("loadCategoryProducts error:", err);
    catProductsAll = [];
  }
  filterCatProducts();
  catProductsShown = 0;
  renderCatDetailProducts();
  const subCount = Math.max(0, document.getElementById("subTabsContainer").children.length - 1);
  document.getElementById("detailCatMeta").textContent = subCount + " subcategorias · " + catProductsAll.length + " productos";
}

function filterCatProducts() {
  catProductsFiltered = currentDetailSubcategory === "all"
    ? [...catProductsAll]
    : catProductsAll.filter(p => p.subcategory === currentDetailSubcategory);
}

function showSkeletonGrid(count) {
  const grid = document.getElementById("catProdGrid");
  grid.replaceChildren();
  for (let i = 0; i < count; i++) {
    const skel = document.createElement("div");
    skel.className = "prod-skel";
    skel.innerHTML = `<div class="prod-skel-img"></div><div class="prod-skel-body"><div class="prod-skel-line"></div><div class="prod-skel-line short"></div><div class="prod-skel-line price short"></div></div>`;
    grid.appendChild(skel);
  }
  window.gsap.from(".prod-skel", { opacity: 0, y: 8, duration: 0.25, stagger: 0.04, ease: "power2.out" });
}

function closeCategoryDetail() {
  currentDetailCatId = null;
  const listView = document.getElementById("catListView");
  const detailView = document.getElementById("catDetailView");
  const gsap = window.gsap;

  gsap.to(detailView, {
    opacity: 0, x: 24, duration: 0.22, ease: "power2.in",
    onComplete: () => {
      detailView.style.display = "none";
      listView.style.display = "block";
      gsap.fromTo(listView, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" });
    }
  });
}

function renderSubTabs(subs) {
  const container = document.getElementById("subTabsContainer");
  container.replaceChildren();

  const allBtn = document.createElement("button");
  allBtn.className = "sub-tab-btn active";
  allBtn.textContent = "Todos";
  allBtn.dataset.sub = "all";
  allBtn.addEventListener("click", () => switchSubTab("all", allBtn));
  container.appendChild(allBtn);

  subs.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "sub-tab-btn";
    btn.textContent = s;
    btn.dataset.sub = s;
    btn.addEventListener("click", () => switchSubTab(s, btn));
    container.appendChild(btn);
  });
}

function switchSubTab(sub, clickedBtn) {
  currentDetailSubcategory = sub;
  document.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");
  filterCatProducts();
  catProductsShown = 0;
  const grid = document.getElementById("catProdGrid");
  window.gsap.to(grid, {
    opacity: 0, duration: 0.12, onComplete: () => {
      renderCatDetailProducts();
      window.gsap.to(grid, { opacity: 1, duration: 0.2 });
    }
  });
}

function buildProdMiniCard(p) {
  console.log("[CARD] Built: " + p.name + " | id=" + p.id + " type:" + typeof p.id);
  const card = document.createElement("div");
  card.className = "prod-mini-card";
  card.dataset.prodId = p.id;
  card.addEventListener("click", () => {
    console.log("[CARD] CLICK:", p.name, "id=" + p.id, "(" + typeof p.id + ")");
    openProductDrawer(p.id);
  });

  const img = document.createElement("img");
  img.className = "prod-mini-img";
  img.src = p.primaryImage || p.imageUrl || "";
  img.loading = "lazy";
  img.onerror = () => { img.style.background = "#1a2e1e"; };

  // badges — float top-left
  const badges = document.createElement("div");
  badges.className = "prod-mini-badges";
  if (p.featured)                    { const b = document.createElement("span"); b.className = "pmb feat";     b.textContent = "Dest";   badges.appendChild(b); }
  if (p.onSale || p.originalPrice)   { const b = document.createElement("span"); b.className = "pmb sale";     b.textContent = "Oferta"; badges.appendChild(b); }
  if (p.isNew)                       { const b = document.createElement("span"); b.className = "pmb new-prod"; b.textContent = "Nuevo";  badges.appendChild(b); }

  // overlay — info on top of image
  const overlay = document.createElement("div");
  overlay.className = "prod-mini-overlay";

  if (p.subcategory) {
    const sub = document.createElement("div");
    sub.className = "prod-mini-sub";
    sub.textContent = p.subcategory;
    overlay.appendChild(sub);
  }

  const name = document.createElement("div");
  name.className = "prod-mini-name";
  name.textContent = p.name;

  const priceRow = document.createElement("div");
  priceRow.className = "prod-mini-price-row";
  const priceEl = document.createElement("span");
  priceEl.className = "prod-mini-price";
  priceEl.textContent = "$" + (p.price || 0).toLocaleString();
  priceRow.appendChild(priceEl);
  if (p.originalPrice) {
    const orig = document.createElement("span");
    orig.className = "prod-mini-orig";
    orig.textContent = "$" + p.originalPrice.toLocaleString();
    priceRow.appendChild(orig);
  }

  overlay.append(name, priceRow);

  // edit button — top right, revealed on hover
  const editBtn = document.createElement("button");
  editBtn.className = "prod-mini-edit-btn";
  editBtn.title = "Editar producto";
  editBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener("click", e => {
    e.stopPropagation();
    console.log("[CARD] EDIT:", p.name, "id=" + p.id);
    openProductDrawer(p.id);
  });

  // Attach product data directly to the card element
  card._prodData = p;

  card.append(img, badges, editBtn, overlay);
  return card;
}

function renderCatDetailProducts() {
  if (catScrollObserver) { catScrollObserver.disconnect(); catScrollObserver = null; }
  const grid = document.getElementById("catProdGrid");
  grid.replaceChildren();
  catProductsShown = 0;
  appendNextCatBatch(grid, true);
}

function appendNextCatBatch(grid, initial = false) {
  if (catScrollObserver) { catScrollObserver.disconnect(); catScrollObserver = null; }

  const batch = catProductsFiltered.slice(catProductsShown, catProductsShown + CAT_PAGE_SIZE);
  const newCards = batch.map(buildProdMiniCard);

  // Remove existing sentinel/add-card before adding new cards
  const oldSentinel = grid.querySelector(".load-sentinel");
  const oldAddCard = grid.querySelector(".add-prod-card");
  if (oldSentinel) oldSentinel.remove();
  if (oldAddCard) oldAddCard.remove();

  newCards.forEach(c => grid.appendChild(c));
  catProductsShown += batch.length;

  const gsap = window.gsap;
  if (newCards.length > 0) {
    gsap.from(newCards, {
      opacity: 0, y: initial ? 20 : 28, scale: 0.96,
      duration: initial ? 0.45 : 0.35,
      stagger: { amount: initial ? 0.5 : 0.3, ease: "power1.in" },
      ease: "power3.out",
      clearProps: "transform"
    });
    gsap.from(newCards.map(c => c.querySelector(".prod-mini-overlay")), {
      opacity: 0, y: 12,
      duration: 0.5,
      delay: 0.1,
      stagger: { amount: initial ? 0.45 : 0.28 },
      ease: "power2.out"
    });
  }

  const hasMore = catProductsShown < catProductsFiltered.length;

  if (hasMore) {
    const sentinel = document.createElement("div");
    sentinel.className = "load-sentinel";
    const spinner = document.createElement("div");
    spinner.className = "load-more-spinner";
    spinner.innerHTML = `<span class="spinner" style="width:16px;height:16px"></span><span>Cargando mas...</span>`;
    sentinel.appendChild(spinner);
    grid.appendChild(sentinel);

    catScrollObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        gsap.to(spinner, { opacity: 1, duration: 0.2 });
        setTimeout(() => appendNextCatBatch(grid, false), 300);
      }
    }, { rootMargin: "200px" });
    catScrollObserver.observe(sentinel);
  }

  // Always have the add-card at the end
  const addCard = document.createElement("div");
  addCard.className = "add-prod-card";
  addCard.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Agregar producto</span>`;
  addCard.addEventListener("click", () => openProductDrawer(null, currentDetailCatId));
  grid.appendChild(addCard);
}

document.getElementById("backToCatsBtn").addEventListener("click", closeCategoryDetail);

document.getElementById("detailEditCatBtn").addEventListener("click", function() {
  if (this.dataset.catId) editCategory(this.dataset.catId);
});

// ─── PRODUCTS ───
async function loadProducts() {
  try {
    const q = query(collection(db, COL_PRODUCTS), orderBy("displayOrder", "asc"));
    const snap = await getDocs(q);
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    products = [];
  }
}


// ─── DASHBOARD ───
function renderDashboard() {
  const allProds = catProductsAll.length ? catProductsAll : products;
  document.getElementById("statCats").textContent = categories.filter(c => c.showOnHomepage).length;
  document.getElementById("statProds").textContent = categories.reduce((s, c) => s + (c.productCount || 0), 0) || allProds.length;
  document.getElementById("statFeatured").textContent = allProds.filter(p => p.featured).length;
  document.getElementById("statOnSale").textContent = allProds.filter(p => p.originalPrice).length;

  const dashCatsEl = document.getElementById("dashboardCats");
  dashCatsEl.replaceChildren();
  const homeCats = categories.filter(c => c.showOnHomepage).slice(0, 5);
  if (homeCats.length) {
    homeCats.forEach(c => {
      const div = document.createElement("div");
      div.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--rule)";
      const img = document.createElement("img");
      img.src = c.imageUrl || c.coverImage || "";
      img.style.cssText = "width:32px;height:32px;border-radius:4px;object-fit:cover";
      img.onerror = () => { img.style.background = "#1a2e1e"; };
      const span = document.createElement("span");
      span.style.fontSize = "13px";
      span.textContent = c.name;
      div.append(img, span);
      dashCatsEl.appendChild(div);
    });
  } else {
    const p = document.createElement("p");
    p.style.cssText = "font-size:13px;color:var(--gray)";
    p.textContent = "Sin categorias en home.";
    dashCatsEl.appendChild(p);
  }

  const dashFeatEl = document.getElementById("dashboardFeatured");
  dashFeatEl.replaceChildren();
  const featProds = products.filter(p => p.featured).slice(0, 5);
  if (featProds.length) {
    featProds.forEach(p => {
      const div = document.createElement("div");
      div.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--rule)";
      const img = document.createElement("img");
      img.src = p.primaryImage || p.imageUrl || "";
      img.style.cssText = "width:32px;height:32px;border-radius:4px;object-fit:cover";
      img.onerror = () => { img.style.background = "#1a2e1e"; };
      const name = document.createElement("span");
      name.style.cssText = "font-size:13px;flex:1";
      name.textContent = p.name;
      const price = document.createElement("span");
      price.style.cssText = "font-size:12px;color:var(--copper-lt)";
      price.textContent = "$" + (p.price || 0).toLocaleString();
      div.append(img, name, price);
      dashFeatEl.appendChild(div);
    });
  } else {
    const p = document.createElement("p");
    p.style.cssText = "font-size:13px;color:var(--gray)";
    p.textContent = "Sin productos destacados.";
    dashFeatEl.appendChild(p);
  }

}

// ─── SEED ───
async function runSeed() {

  // Clean: delete all existing products before re-seeding
  var prodsSnap = await getDocs(collection(db, COL_PRODUCTS));
  if (!prodsSnap.empty) {
    var bsize = 400;
    var pids = prodsSnap.docs.map(d => d.ref);
    for (var i = 0; i < pids.length; i += bsize) {
      var del = writeBatch(db);
      pids.slice(i, i + bsize).forEach(r => del.delete(r));
      await del.commit();
    }
  }
  // Clean: delete all existing categories before re-seeding
  var catsSnap = await getDocs(collection(db, COL_CATEGORIES));
  if (!catsSnap.empty) {
    var del = writeBatch(db);
    catsSnap.docs.map(d => d.ref).forEach(r => del.delete(r));
    await del.commit();
  }
  const catNameMap = {};

  // Batch 1: categories (16) + settings (1) = 17 ops
  const b1 = writeBatch(db);
  for (const cat of CATEGORIES) {
    b1.set(doc(db, COL_CATEGORIES, cat.id), {
      name: cat.name,
      slug: cat.name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, ""),
      imageUrl: cat.imageUrl,
      coverImage: cat.imageUrl,
      subcategoryList: cat.subcategories || [],
      hasSubcategories: (cat.subcategories || []).length > 0,
      showOnHomepage: cat.featured === true,
      productCount: cat.productCount || 0,
      displayOrder: cat.displayOrder ?? 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    catNameMap[cat.id] = cat.name;
  }
  b1.set(doc(db, COL_SETTINGS, "store"), { ...SETTINGS, catalogVersion: 2, updatedAt: serverTimestamp() });
  await b1.commit();

  // Seed products with per-category displayOrder (Salas 0..19, Comedores 0..19, etc.)
  var catOrd = {};
  for (var pi = 0; pi < PRODUCTS.length; pi += 1) {
    var pr = PRODUCTS[pi];
    var cid = pr.categoryId;
    catOrd[cid] = (catOrd[cid] || 0) + 1;
  }
  var catCur = {};
  for (var si = 0; si < PRODUCTS.length; si += 490) {
    var b = writeBatch(db);
    PRODUCTS.slice(si, si + 490).forEach(function(prod) {
      var do_ = (catCur[prod.categoryId] = (catCur[prod.categoryId] || 0) + 1);
      var docId = "p-" + prod.categoryId + "-" + String(do_).padStart(3, "0");
      var cn = catNameMap[prod.categoryId] || prod.categoryId || "";
      b.set(doc(db, COL_PRODUCTS, docId), {
        ...prod,
        imageUrl: prod.primaryImage || prod.imageUrl,
        category: cn,
        displayOrder: do_,
        available: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await b.commit();
  }
}

// ─── SETTINGS ───
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, COL_SETTINGS, "store"));
    settings = snap.exists() ? snap.data() : {};
  } catch {
    settings = {};
  }
}

function populateSettingsForm() {
  const s = settings;
  const fields = {
    // Contact (flat fields per DATA-MODEL)
    setWhatsapp: s.whatsappNumber,
    setWhatsappDisplay: s.whatsappPhoneDisplay,
    setPhone: s.phoneLine,
    setEmail: s.email,
    setHoursMonFri: s.businessHours?.weekdays,
    setHoursSat: s.businessHours?.saturday,
    setHoursSun: s.businessHours?.sunday,
    // Social
    setFb: s.socialLinks?.facebook,
    setIg: s.socialLinks?.instagram,
    setYt: s.socialLinks?.youtube,
    setWaSocial: s.socialLinks?.whatsapp,
    // Hero
    setHeroEyebrow: s.heroSection?.eyebrow,
    setHeroTitle: s.heroSection?.title,
    setHeroSubtitle: s.heroSection?.description,
    setHeroImage: s.heroSection?.bgImage,
    // Banner
    setBannerTitle: s.promoBanner?.title,
    setBannerDiscountPct: s.promoBanner?.discountPct,
    setBannerDiscountText: s.promoBanner?.discountText,
    setBannerCta: s.promoBanner?.ctaText,
    setBannerSubtitle: s.promoBanner?.subtitle,
    setBannerImage: s.promoBanner?.image,
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  }

  document.getElementById("storeLocations").replaceChildren();
  storeCount = 0;
  (s.storeLocations || []).forEach(store => addStoreBlock(store));
}

function addStoreBlock(data = {}) {
  const i = storeCount++;
  const div = document.createElement("div");
  div.className = "admin-card";
  div.style.cssText = "padding:20px;position:relative";
  div.dataset.storeIdx = i;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.style.cssText = "position:absolute;top:12px;right:12px;background:none;border:none;color:var(--gray);font-size:20px;cursor:pointer;line-height:1";
  closeBtn.addEventListener("click", () => div.remove());

  const grid = document.createElement("div");
  grid.className = "form-grid";

  function field(labelText, name, type, value, placeholder, full) {
    const fg = document.createElement("div");
    fg.className = "form-group" + (full ? " full" : "");
    const lbl = document.createElement("label");
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = type;
    inp.name = name;
    inp.value = value || "";
    inp.placeholder = placeholder;
    fg.append(lbl, inp);
    return fg;
  }

  grid.append(
    field("Nombre", "store_name", "text", data.name, "Palito Outlet Centro", false),
    field("Ciudad", "store_city", "text", data.city, "Riobamba", false),
    field("Direccion", "store_address", "text", data.address, "Av. Principal 123", true),
    field("Telefono", "store_phone", "text", data.phone, "03 123 4567", false),
    field("Google Maps URL", "store_maps", "url", data.mapsUrl, "https://maps.google.com/...", false)
  );
  div.append(closeBtn, grid);
  document.getElementById("storeLocations").appendChild(div);
}

document.getElementById("addStoreBtn").addEventListener("click", () => addStoreBlock());

document.getElementById("settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  const storeLocations = [...document.querySelectorAll("[data-store-idx]")].map(b => ({
    name: b.querySelector("[name=store_name]").value,
    city: b.querySelector("[name=store_city]").value,
    address: b.querySelector("[name=store_address]").value,
    phone: b.querySelector("[name=store_phone]").value,
    mapsUrl: b.querySelector("[name=store_maps]").value,
  })).filter(s => s.name);

  const data = {
    // Flat contact fields (DATA-MODEL spec)
    whatsappNumber: document.getElementById("setWhatsapp").value,
    whatsappPhoneDisplay: document.getElementById("setWhatsappDisplay").value,
    phoneLine: document.getElementById("setPhone").value,
    email: document.getElementById("setEmail").value,
    businessHours: {
      weekdays: document.getElementById("setHoursMonFri").value,
      saturday: document.getElementById("setHoursSat").value,
      sunday: document.getElementById("setHoursSun").value,
    },
    socialLinks: {
      facebook: document.getElementById("setFb").value,
      instagram: document.getElementById("setIg").value,
      youtube: document.getElementById("setYt").value,
      whatsapp: document.getElementById("setWaSocial").value,
    },
    // heroSection (DATA-MODEL spec)
    heroSection: {
      eyebrow: document.getElementById("setHeroEyebrow").value,
      title: document.getElementById("setHeroTitle").value,
      description: document.getElementById("setHeroSubtitle").value,
      bgImage: document.getElementById("setHeroImage").value,
    },
    // promoBanner (DATA-MODEL spec)
    promoBanner: {
      title: document.getElementById("setBannerTitle").value,
      discountPct: Number(document.getElementById("setBannerDiscountPct").value) || 0,
      discountText: document.getElementById("setBannerDiscountText").value,
      ctaText: document.getElementById("setBannerCta").value,
      subtitle: document.getElementById("setBannerSubtitle").value,
      image: document.getElementById("setBannerImage").value,
    },
    storeLocations,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, COL_SETTINGS, "store"), data, { merge: true });
    settings = data;
    showAlert("Configuracion guardada correctamente.");
  } catch (err) {
    showAlert("Error al guardar: " + err.message, "error");
  }

  btn.disabled = false;
  btn.textContent = "Guardar configuracion";
});

document.getElementById("resetSettingsBtn").addEventListener("click", () => populateSettingsForm());

// ─── CATEGORY MODAL ───
document.getElementById("addCategoryBtn").addEventListener("click", () => {
  editingCatId = null;
  editingCatSubs = [];
  document.getElementById("catModalTitle").textContent = "Nueva categoria";
  document.getElementById("categoryForm").reset();
  document.getElementById("catEditId").value = "";
  document.getElementById("catSubTags").replaceChildren();
  openModal("categoryModal");
});

document.getElementById("addSubBtn").addEventListener("click", addSubTag);
document.getElementById("catSubInput").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addSubTag(); }
});

function addSubTag() {
  const input = document.getElementById("catSubInput");
  const val = input.value.trim();
  if (!val || editingCatSubs.includes(val)) return;
  editingCatSubs.push(val);
  renderSubTags();
  input.value = "";
}

function renderSubTags() {
  const container = document.getElementById("catSubTags");
  container.replaceChildren();
  editingCatSubs.forEach((s, i) => {
    const span = document.createElement("span");
    span.className = "sub-tag";
    span.textContent = s;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.addEventListener("click", () => { editingCatSubs.splice(i, 1); renderSubTags(); });
    span.appendChild(btn);
    container.appendChild(span);
  });
}

document.getElementById("categoryForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("catName").value.trim();
  const imageUrl = document.getElementById("catImageUrl").value.trim();
  const data = {
    name,
    slug: slugify(name),
    imageUrl,
    coverImage: imageUrl, // renderers use imageUrl || coverImage
    productCount: Number(document.getElementById("catProductCount").value) || 0,
    displayOrder: Number(document.getElementById("catDisplayOrder").value) || 0,
    showOnHomepage: document.getElementById("catShowOnHomepage").checked,
    subcategoryList: [...editingCatSubs], // renderers read subcategoryList
    hasSubcategories: editingCatSubs.length > 0,
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingCatId) {
      await updateDoc(doc(db, COL_CATEGORIES, editingCatId), data);
      showAlert("Categoria actualizada.");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL_CATEGORIES), data);
      showAlert("Categoria creada.");
    }
    closeModal("categoryModal");
    await loadCategories();
    renderCatCards();
    renderDashboard();
  } catch (err) {
    showAlert("Error: " + err.message, "error");
  }
});

function editCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  editingCatId = id;
  // support both subcategoryList and subcategories
  editingCatSubs = [...(cat.subcategoryList || cat.subcategories || [])];
  document.getElementById("catModalTitle").textContent = "Editar categoria";
  document.getElementById("catEditId").value = id;
  document.getElementById("catName").value = cat.name || "";
  document.getElementById("catImageUrl").value = cat.imageUrl || cat.coverImage || "";
  document.getElementById("catProductCount").value = cat.productCount || "";
  document.getElementById("catDisplayOrder").value = cat.displayOrder ?? "";
  document.getElementById("catShowOnHomepage").checked = cat.showOnHomepage !== false;
  renderSubTags();
  openModal("categoryModal");
}

async function deleteCategory(id) {
  if (!confirm("Eliminar esta categoria?")) return;
  try {
    await deleteDoc(doc(db, COL_CATEGORIES, id));
    showAlert("Categoria eliminada.");
    await loadCategories();
    renderCatCards();
    renderDashboard();
  } catch (err) {
    showAlert("Error: " + err.message, "error");
  }
}

// ─── PRODUCT DRAWER ───
function populateCatSelect(currentVal = "") {
  const sel = document.getElementById("prodCategory");
  sel.replaceChildren();
  const def = document.createElement("option");
  def.value = "";
  def.textContent = "Seleccionar categoria";
  sel.appendChild(def);
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  if (currentVal) sel.value = currentVal;
}

function populateSubcategorySelect(catId, currentVal = "") {
  const sel = document.getElementById("prodSubcategory");
  sel.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Sin subcategoria";
  sel.appendChild(none);
  if (catId) {
    const cat = categories.find(c => c.id === catId);
    const subs = cat?.subcategoryList || cat?.subcategories || [];
    subs.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
  }
  if (currentVal) sel.value = currentVal;
}

document.getElementById("prodCategory").addEventListener("change", e => {
  populateSubcategorySelect(e.target.value, "");
});

function openProductDrawer(id = null, preCatId = null) {
  console.group("[DRAWER] openProductDrawer");
  console.log("[DRAWER] id:", id, "| typeof:", typeof id, "| preCatId:", preCatId);
  var overlay = document.getElementById("productDrawerOverlay");
  var drawer = document.getElementById("productDrawer");
  console.log("[DRAWER] overlay:", overlay ? "FOUND" : "MISSING");
  console.log("[DRAWER] drawer:", drawer ? "FOUND" : "MISSING");
  if (drawer) console.log("[DRAWER] drawer.transform NOW:", drawer.style.transform || "(unset)");
  if (overlay) console.log("[DRAWER] overlay.display NOW:", overlay.style.display || "(unset)");

  editingProdId = id;
  editingProdColors = [];

  if (id) {
    var p = null;
    p = catProductsAll.find(function(x) { return String(x.id) === String(id); }) || null;
    if (p) { console.log("[DRAWER] Found in catProductsAll:", p.name); }
    else {
      p = products.find(function(x) { return String(x.id) === String(id); }) || null;
      if (p) { console.log("[DRAWER] Found in products:", p.name); }
    }
    console.log("[DRAWER] catProductsAll:", catProductsAll.length, "| products:", products.length);
    if (catProductsAll.length) console.log("[DRAWER] sample IDs:", JSON.stringify(catProductsAll.slice(0,5).map(function(x){return x.id})));
    if (products.length) console.log("[DRAWER] sample IDs:", JSON.stringify(products.slice(0,5).map(function(x){return x.id})));
    if (!p) {
      console.error("[DRAWER] PRODUCT NOT FOUND");
      showAlert("No se encontro el producto. Revisa la consola.", "error");
      console.groupEnd();
      return;
    }
    console.log("[DRAWER] Editing:", p.name);
    document.getElementById("prodModalTitle").textContent = "Editar producto";
    document.getElementById("prodEditId").value = id;
    document.getElementById("prodName").value = p.name || "";
    document.getElementById("prodDesc").value = p.description || "";
    document.getElementById("prodImage").value = p.primaryImage || p.imageUrl || "";
    document.getElementById("prodDisplayOrder").value = p.displayOrder ?? "";
    document.getElementById("prodPrice").value = p.price || "";
    document.getElementById("prodOriginalPrice").value = p.originalPrice || "";
    document.getElementById("prodFeatured").checked = !!p.featured;
    document.getElementById("prodNew").checked = !!p.isNew;
    editingProdColors = [...(p.colors || [])];
    populateCatSelect(p.categoryId || "");
    populateSubcategorySelect(p.categoryId || "", p.subcategory || "");
  } else {
    console.log("[DRAWER] New product, preCatId:", preCatId);
    document.getElementById("prodModalTitle").textContent = "Nuevo producto";
    document.getElementById("productForm").reset();
    document.getElementById("prodEditId").value = "";
    document.getElementById("prodColors").replaceChildren();
    populateCatSelect(preCatId || "");
    populateSubcategorySelect(preCatId || "", "");
  }
  renderColorSwatches();
  console.log("[DRAWER] Showing overlay + animating drawer...");
  overlay.style.display = "flex";
  console.log("[DRAWER] overlay.display set to:", overlay.style.display);
  requestAnimationFrame(function() {
    drawer.style.transform = "translateX(0)";
    console.log("[DRAWER] drawer.transform set to: translateX(0)");
  });
  console.groupEnd();
}

function closeProductDrawer() {
  console.group("[DRAWER] close");
  var overlay = document.getElementById("productDrawerOverlay");
  var drawer = document.getElementById("productDrawer");
  drawer.style.transform = "translateX(100%)";
  overlay.style.display = "none";
  console.log("[CLOSE] drawer.transform:", drawer.style.transform);
  console.log("[CLOSE] overlay.display:", overlay.style.display);
  console.groupEnd();
}
document.getElementById("closeProductDrawerBtn").addEventListener("click", closeProductDrawer);
document.getElementById("cancelProductDrawerBtn").addEventListener("click", closeProductDrawer);
document.getElementById("productDrawerOverlay").addEventListener("click", closeProductDrawer);

document.getElementById("addProductBtn").addEventListener("click", () => openProductDrawer(null, null));

document.getElementById("addColorBtn").addEventListener("click", () => {
  const hex = document.getElementById("prodColorText").value.trim() || document.getElementById("prodColorInput").value;
  if (!hex || editingProdColors.includes(hex)) return;
  editingProdColors.push(hex);
  renderColorSwatches();
  document.getElementById("prodColorText").value = "";
});

document.getElementById("prodColorInput").addEventListener("input", e => {
  document.getElementById("prodColorText").value = e.target.value;
});

function renderColorSwatches() {
  const container = document.getElementById("prodColors");
  container.replaceChildren();
  editingProdColors.forEach((c, i) => {
    const wrap = document.createElement("div");
    wrap.className = "color-input-wrap";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = c;
    colorInput.addEventListener("change", () => { editingProdColors[i] = colorInput.value; renderColorSwatches(); });

    const label = document.createElement("span");
    label.style.fontSize = "12px";
    label.textContent = c;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => { editingProdColors.splice(i, 1); renderColorSwatches(); });

    wrap.append(colorInput, label, removeBtn);
    container.appendChild(wrap);
  });
}

document.getElementById("productForm").addEventListener("submit", async e => {
  e.preventDefault();
  const origPrice = document.getElementById("prodOriginalPrice").value;
  const imageUrl = document.getElementById("prodImage").value.trim();
  const catId = document.getElementById("prodCategory").value;
  const catName = categories.find(c => c.id === catId)?.name || catId;
  const price = parseFloat(document.getElementById("prodPrice").value) || 0;
  const originalPrice = origPrice ? parseFloat(origPrice) : null;

  const data = {
    name: document.getElementById("prodName").value.trim(),
    description: document.getElementById("prodDesc").value.trim(),
    categoryId: catId.toLowerCase(), // normalizado lowercase para consistencia con seed-data
    category: catName,
    subcategory: document.getElementById("prodSubcategory").value.trim(),
    imageUrl,
    primaryImage: imageUrl, // index-renderer reads primaryImage
    displayOrder: Number(document.getElementById("prodDisplayOrder").value) || 0,
    price,
    originalPrice,
    onSale: !!(originalPrice && originalPrice > price),
    discountPct: (originalPrice && originalPrice > price)
      ? Math.round((1 - price / originalPrice) * 100)
      : null,
    featured: document.getElementById("prodFeatured").checked,
    isNew: document.getElementById("prodNew").checked,
    colors: [...editingProdColors],
    available: true,
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingProdId) {
      await updateDoc(doc(db, COL_PRODUCTS, editingProdId), data);
      showAlert("Producto actualizado.");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL_PRODUCTS), data);
      showAlert("Producto creado.");
    }
    closeProductDrawer();
    renderDashboard();
    if (currentDetailCatId) await loadCategoryProducts(currentDetailCatId);
  } catch (err) {
    showAlert("Error: " + err.message, "error");
  }
});

function editProduct(id) {
  openProductDrawer(id);
}

async function deleteProduct(id) {
  if (!confirm("Eliminar este producto?")) return;
  try {
    await deleteDoc(doc(db, COL_PRODUCTS, id));
    showAlert("Producto eliminado.");
    renderDashboard();
    if (currentDetailCatId) await loadCategoryProducts(currentDetailCatId);
  } catch (err) {
    showAlert("Error: " + err.message, "error");
  }
}


// ─── MODAL HELPERS ───
function openModal(id) {
  document.getElementById(id).classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

window.closeModal = closeModal;

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("active");
  });
});

// Product form subcategory sync when category changes (already handled by populateSubcategorySelect)
// but also sync from the form's own change event set up above
