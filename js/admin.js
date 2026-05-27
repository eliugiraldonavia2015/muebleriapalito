import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { firebaseConfig, BUNNY_CDN } from "./firebase-config.js";
import { CATEGORIES, SETTINGS } from "./seed-data.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Hardcoded admin credentials - change these if needed
const ADMIN_EMAIL = "admin@palito.com";
const ADMIN_PASSWORD = "admin2025";

const COL_CATEGORIES = "categories";
const COL_PRODUCTS = "products";
const COL_SETTINGS = "settings";
const PLACEHOLDER_IMG = "../assets/placeholder.svg";

let categories = [];
let products = [];
let settings = {};
let dashFeaturedCatFilter = "all";
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

  setLoaderStatus(statusEl, barEl, gsap, "Verificando catalogo...", "40%");
  await runSeedIfNeeded();

  setLoaderStatus(statusEl, barEl, gsap, "Cargando datos...", "75%");
  await loadCategories();
  await loadProducts();
  await loadSettings();

  setLoaderStatus(statusEl, barEl, gsap, "Preparando panel...", "95%");
  renderDashboard();
  renderCatCards();
  populateSettingsForm();
  mountHomeImagesUploaders();
  populateHomeImagesSection();
  mountCategoryImageUploader();
  document.getElementById("lastSync").textContent = "Sincronizado: " + new Date().toLocaleTimeString("es-EC");

  // Keep CDN manifest in sync on every admin session login (covers cases where products
  // were added directly via Firestore console without going through this admin panel).
  regenerateProductsManifest();

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
function goToSection(section) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const navBtn = document.querySelector('.nav-item[data-section="' + section + '"]');
  if (navBtn) navBtn.classList.add("active");
  document.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById("sec-" + section);
  if (target) target.classList.add("active");
  if (section === "categories" && !currentDetailCatId) {
    document.getElementById("catListView").style.display = "block";
    document.getElementById("catDetailView").style.display = "none";
  }
  if (section === "home-images") {
    populateHomeImagesSection();
  }
}

document.getElementById("adminNav").addEventListener("click", e => {
  const btn = e.target.closest("[data-section]");
  if (!btn) return;
  goToSection(btn.dataset.section);
});

// Allow inline links (e.g. "Gestionar en Imagenes del home") to switch sections
document.addEventListener("click", e => {
  const link = e.target.closest("[data-go-section]");
  if (!link) return;
  e.preventDefault();
  goToSection(link.dataset.goSection);
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
    imgEl.src = imgSrc || PLACEHOLDER_IMG;
    imgEl.onerror = () => { imgEl.src = PLACEHOLDER_IMG; imgEl.onerror = null; };

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
  const detailImg = document.getElementById("detailCatImg");
  detailImg.src = img || PLACEHOLDER_IMG;
  detailImg.onerror = () => { detailImg.src = PLACEHOLDER_IMG; detailImg.onerror = null; };
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
  img.src = p.primaryImage || p.imageUrl || PLACEHOLDER_IMG;
  img.loading = "lazy";
  img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };

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
  const allProds = products.length ? products : catProductsAll;
  document.getElementById("statCats").textContent = categories.filter(c => c.showOnHomepage).length;
  document.getElementById("statProds").textContent = categories.reduce((s, c) => s + (c.productCount || 0), 0) || allProds.length;
  document.getElementById("statFeatured").textContent = allProds.filter(p => p.featured).length;
  document.getElementById("statOnSale").textContent = allProds.filter(p => p.originalPrice).length;
  renderDashCatOrder();
  renderDashFeatured();
}

function makeDirBtn(label, title, disabled) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.title = title;
  btn.disabled = disabled;
  btn.style.cssText = "background:none;border:1px solid var(--rule);border-radius:3px;color:var(--cream-dim);cursor:pointer;padding:1px 5px;font-size:11px;line-height:1.4;transition:border-color .2s,color .2s;opacity:" + (disabled ? ".3" : "1");
  if (!disabled) {
    btn.addEventListener("mouseover", () => { btn.style.borderColor = "var(--copper)"; btn.style.color = "var(--cream)"; });
    btn.addEventListener("mouseout", () => { btn.style.borderColor = "var(--rule)"; btn.style.color = "var(--cream-dim)"; });
  }
  return btn;
}

function renderDashCatOrder() {
  const el = document.getElementById("dashboardCats");
  el.replaceChildren();

  const homeCats = [...categories]
    .filter(c => c.showOnHomepage)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  if (!homeCats.length) {
    const p = document.createElement("p");
    p.style.cssText = "font-size:13px;color:var(--gray)";
    p.textContent = "Sin categorias en home. Actívalas desde la sección Categorias.";
    el.appendChild(p);
    return;
  }

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:5px";

  homeCats.forEach((cat, idx) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;border:1px solid var(--rule);background:rgba(160,220,180,.04)";

    const posEl = document.createElement("div");
    posEl.style.cssText = "width:20px;text-align:center;font-size:13px;font-weight:700;flex-shrink:0;color:" + (idx === 0 ? "var(--copper-lt)" : "var(--gray)");
    posEl.textContent = String(idx + 1);

    const img = document.createElement("img");
    img.src = cat.imageUrl || cat.coverImage || PLACEHOLDER_IMG;
    img.style.cssText = "width:34px;height:34px;border-radius:4px;object-fit:cover;flex-shrink:0";
    img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };

    const info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0";
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    nameEl.textContent = cat.name;
    info.appendChild(nameEl);
    if (idx === 0) {
      const badge = document.createElement("div");
      badge.style.cssText = "font-size:10px;color:var(--copper);margin-top:2px;letter-spacing:.04em";
      badge.textContent = "★ Foto predominante";
      info.appendChild(badge);
    }

    const arrows = document.createElement("div");
    arrows.style.cssText = "display:flex;flex-direction:column;gap:2px;flex-shrink:0";
    const upBtn = makeDirBtn("↑", "Subir", idx === 0);
    const dnBtn = makeDirBtn("↓", "Bajar", idx === homeCats.length - 1);
    if (!upBtn.disabled) upBtn.addEventListener("click", () => moveCatInHomeDashboard(cat.id, -1));
    if (!dnBtn.disabled) dnBtn.addEventListener("click", () => moveCatInHomeDashboard(cat.id, +1));
    arrows.append(upBtn, dnBtn);

    row.append(posEl, img, info, arrows);
    list.appendChild(row);
  });

  el.appendChild(list);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary btn-sm";
  saveBtn.style.cssText = "margin-top:12px;width:100%;justify-content:center";
  saveBtn.textContent = "Guardar orden";
  saveBtn.addEventListener("click", saveCatDisplayOrder);
  el.appendChild(saveBtn);
}

function moveCatInHomeDashboard(catId, dir) {
  const homeCats = [...categories]
    .filter(c => c.showOnHomepage)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const idx = homeCats.findIndex(c => c.id === catId);
  if (idx < 0) return;
  const target = idx + dir;
  if (target < 0 || target >= homeCats.length) return;

  [homeCats[idx], homeCats[target]] = [homeCats[target], homeCats[idx]];
  homeCats.forEach((hc, i) => {
    const g = categories.find(c => c.id === hc.id);
    if (g) g.displayOrder = i + 1;
  });

  renderDashCatOrder();
}

async function saveCatDisplayOrder() {
  const homeCats = categories.filter(c => c.showOnHomepage);
  try {
    const b = writeBatch(db);
    homeCats.forEach(cat => {
      b.update(doc(db, COL_CATEGORIES, cat.id), { displayOrder: cat.displayOrder || 0, updatedAt: serverTimestamp() });
    });
    await b.commit();
    showAlert("Orden de categorias guardado.");
  } catch (err) {
    showAlert("Error al guardar: " + err.message, "error");
  }
}

function renderDashFeatured() {
  const el = document.getElementById("dashboardFeatured");
  el.replaceChildren();

  const allProds = products.length ? products : [];

  if (!allProds.length) {
    const p = document.createElement("p");
    p.style.cssText = "font-size:13px;color:var(--gray)";
    p.textContent = "Cargando productos...";
    el.appendChild(p);
    return;
  }

  // Category filter tabs
  const tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px";
  const catNames = [...new Set(allProds.map(p => p.category).filter(Boolean))].sort();

  ["all", ...catNames].forEach(cname => {
    const btn = document.createElement("button");
    const isActive = cname === dashFeaturedCatFilter;
    btn.textContent = cname === "all" ? "Todas" : cname;
    btn.style.cssText = "padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;letter-spacing:.04em;cursor:pointer;transition:all .2s;border:1px solid;" +
      (isActive ? "background:var(--copper);color:var(--bg);border-color:var(--copper);" : "background:none;color:var(--cream-dim);border-color:var(--rule);");
    btn.addEventListener("click", () => { dashFeaturedCatFilter = cname; renderDashFeatured(); });
    tabs.appendChild(btn);
  });
  el.appendChild(tabs);

  const filtered = (dashFeaturedCatFilter === "all"
    ? [...allProds]
    : allProds.filter(p => p.category === dashFeaturedCatFilter)
  ).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));

  if (!filtered.length) {
    const p = document.createElement("p");
    p.style.cssText = "font-size:13px;color:var(--gray)";
    p.textContent = "No hay productos en esta categoría.";
    el.appendChild(p);
    return;
  }

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;padding-right:2px";

  filtered.forEach(p => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;border:1px solid;" +
      (p.featured ? "rgba(58,140,92,.25);background:rgba(58,140,92,.06);" : "var(--rule);background:transparent;");

    const img = document.createElement("img");
    img.src = p.primaryImage || p.imageUrl || PLACEHOLDER_IMG;
    img.style.cssText = "width:30px;height:30px;border-radius:3px;object-fit:cover;flex-shrink:0";
    img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };

    const info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0";
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    nameEl.textContent = p.name;
    const catEl = document.createElement("div");
    catEl.style.cssText = "font-size:10px;color:var(--gray);margin-top:1px";
    catEl.textContent = p.category + (p.subcategory ? " · " + p.subcategory : "");
    info.append(nameEl, catEl);

    const toggleBtn = document.createElement("button");
    toggleBtn.style.cssText = "flex-shrink:0;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.05em;cursor:pointer;transition:all .2s;border:1px solid;" +
      (p.featured ? "background:rgba(58,140,92,.18);color:var(--copper-lt);border-color:rgba(58,140,92,.35);" : "background:none;color:var(--gray);border-color:var(--rule);");
    toggleBtn.textContent = p.featured ? "★ Dest." : "Destacar";
    toggleBtn.addEventListener("click", () => toggleFeaturedProduct(p.id));

    row.append(img, info, toggleBtn);
    list.appendChild(row);
  });
  el.appendChild(list);

  const featCount = allProds.filter(p => p.featured).length;
  const countEl = document.createElement("div");
  countEl.style.cssText = "font-size:11px;color:var(--gray);margin-top:8px;text-align:right";
  countEl.textContent = featCount + " producto" + (featCount !== 1 ? "s" : "") + " destacado" + (featCount !== 1 ? "s" : "");
  el.appendChild(countEl);
}

async function toggleFeaturedProduct(prodId) {
  const prod = products.find(p => p.id === prodId);
  if (!prod) return;
  prod.featured = !prod.featured;
  try {
    await updateDoc(doc(db, COL_PRODUCTS, prodId), { featured: prod.featured, updatedAt: serverTimestamp() });
  } catch (err) {
    prod.featured = !prod.featured;
    showAlert("Error: " + err.message, "error");
  }
  renderDashboard();
}

async function deleteImageFromBunny(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith(BUNNY_CDN.cdnUrl)) return;
  const path = imageUrl.slice(BUNNY_CDN.cdnUrl.length);
  const storageUrl = BUNNY_CDN.apiUrl + "/" + BUNNY_CDN.zoneName + path;
  try {
    await fetch(storageUrl, { method: "DELETE", headers: { AccessKey: BUNNY_CDN.apiKey } });
    // Purge CDN cache so the file stops being served immediately
    await fetch("https://api.bunny.net/purge?url=" + encodeURIComponent(imageUrl), {
      method: "POST",
      headers: { AccessKey: BUNNY_CDN.apiKey }
    });
  } catch (e) {
    console.warn("[BUNNY] DELETE/purge failed:", e.message);
  }
}

// ─── MANIFEST REGEN ───
// Builds {id: imageUrl} for all products and uploads it to Bunny CDN. Called after every
// product CRUD so the client-side lookup stays fresh without manual edits.
async function regenerateProductsManifest() {
  try {
    const snap = await getDocs(collection(db, COL_PRODUCTS));
    const manifest = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const img = data.imageUrl || data.primaryImage;
      if (img) manifest[d.id] = img;
    });
    const json = JSON.stringify(manifest);
    const path = "/" + BUNNY_CDN.zoneName + "/manifests/products.json";
    const cdnUrl = BUNNY_CDN.cdnUrl + "/manifests/products.json";
    const apiUrl = BUNNY_CDN.apiUrl + path;
    await fetch(apiUrl, {
      method: "PUT",
      headers: { AccessKey: BUNNY_CDN.apiKey, "Content-Type": "application/json" },
      body: json
    });
    // Purge edge cache so subsequent fetches see the new version
    fetch("https://api.bunny.net/purge?url=" + encodeURIComponent(cdnUrl), {
      method: "POST",
      headers: { AccessKey: BUNNY_CDN.apiKey }
    }).catch(() => {});
    console.log("[manifest] regenerated:", Object.keys(manifest).length, "products");
  } catch (e) {
    console.warn("[manifest] regenerate failed:", e.message);
  }
}

// ─── BUNNY CDN UPLOAD ───
async function uploadImageToBunny(file, subFolder) {
  if (subFolder === void 0) { subFolder = 'products'; }
  console.group('[BUNNY] uploadImageToBunny');
  console.log('[BUNNY] file:', file.name, '| size:', Math.round(file.size / 1024) + 'KB');
  if (!BUNNY_CDN.apiKey || BUNNY_CDN.apiKey.indexOf('PASTE_YOUR') !== -1) {
    console.error('[BUNNY] ERROR API key not configured — edit firebase-config.js');
    console.groupEnd();
    throw new Error('Bunny CDN API key not configured');
  }
  var ext = file.name.indexOf('.') !== -1 ? file.name.split('.').pop() : 'jpg';
  var base = file.name.replace(/.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'img';
  var ts = Date.now();
  var fname = base + '-' + ts + '.' + ext;
  var fpath = '/' + BUNNY_CDN.zoneName + '/' + subFolder + '/' + fname;
  var cdnUrl = BUNNY_CDN.cdnUrl + '/' + subFolder + '/' + fname;
  var apiUrl = BUNNY_CDN.apiUrl + fpath;
  console.log('[BUNNY] PUT', apiUrl);
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', apiUrl, true);
    xhr.setRequestHeader('AccessKey', BUNNY_CDN.apiKey);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('[BUNNY] OK uploaded:', cdnUrl);
        console.groupEnd();
        resolve(cdnUrl);
      } else {
        console.error('[BUNNY] ERROR status:', xhr.status, xhr.responseText);
        console.groupEnd();
        reject(new Error('Bunny upload failed: ' + xhr.status + ' ' + xhr.responseText));
      }
    };
    xhr.onerror = function() {
      console.error('[BUNNY] ERROR network error');
      console.groupEnd();
      reject(new Error('Bunny upload network error'));
    };
    xhr.send(file);
  });
}

// ─── REUSABLE IMAGE UPLOADER ───
// Wires a file input to upload to Bunny CDN and update preview + hidden URL field.
// onUploaded(cdnUrl) is invoked after the upload succeeds, e.g. to persist the URL
// directly to Firestore for sections that don't have a separate Save button.
function mountImageUploader(opts) {
  const fileEl = document.getElementById(opts.fileInputId);
  if (!fileEl) { console.warn("[uploader] missing file input:", opts.fileInputId); return; }
  if (fileEl.dataset.uploaderMounted === "1") return;
  fileEl.dataset.uploaderMounted = "1";

  const urlEl = opts.urlInputId ? document.getElementById(opts.urlInputId) : null;
  const previewEl = opts.previewId ? document.getElementById(opts.previewId) : null;
  const previewWrap = opts.previewWrapId ? document.getElementById(opts.previewWrapId) : null;
  const statusEl = opts.statusId ? document.getElementById(opts.statusId) : null;
  const spinnerEl = opts.spinnerId ? document.getElementById(opts.spinnerId) : null;
  const statusClass = opts.statusClass || "";
  const folder = opts.folder || "site";

  function setStatus(text, mode) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    if (statusClass) {
      ["ok", "err", "busy"].forEach(c => statusEl.classList.remove(statusClass + " " + c, c));
      statusEl.classList.remove("ok", "err", "busy");
      if (mode) statusEl.classList.add(mode);
    } else {
      statusEl.style.color = mode === "ok" ? "var(--copper-lt)"
        : mode === "err" ? "var(--red-lt)"
        : mode === "busy" ? "var(--copper-lt)"
        : "var(--gray)";
    }
  }

  fileEl.addEventListener("change", async function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    if (previewEl) {
      previewEl.src = localUrl;
      previewEl.style.display = "block";
      if (previewWrap) previewWrap.classList.remove("empty");
    }
    setStatus("Subiendo imagen...", "busy");
    if (spinnerEl) spinnerEl.classList.remove("hidden");
    try {
      const cdnUrl = await uploadImageToBunny(file, folder);
      if (urlEl) urlEl.value = cdnUrl;
      if (previewEl) previewEl.src = cdnUrl;
      setStatus("Imagen subida correctamente", "ok");
      if (typeof opts.onUploaded === "function") {
        await opts.onUploaded(cdnUrl);
      }
    } catch (err) {
      console.error("[uploader] failed:", err);
      setStatus("Error al subir: " + err.message, "err");
    } finally {
      if (spinnerEl) spinnerEl.classList.add("hidden");
      fileEl.value = "";
    }
  });
}

// ─── HOME IMAGES SECTION ───
async function saveHomeImage(path, url) {
  // path is a dot-path like "heroSection.bgImage". Builds a nested object for merge.
  const parts = path.split(".");
  const payload = {};
  let cur = payload;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = url;
  payload.updatedAt = serverTimestamp();
  await setDoc(doc(db, COL_SETTINGS, "store"), payload, { merge: true });

  // Update local cache so re-renders stay in sync
  let dest = settings;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!dest[parts[i]] || typeof dest[parts[i]] !== "object") dest[parts[i]] = {};
    dest = dest[parts[i]];
  }
  dest[parts[parts.length - 1]] = url;
}

function setHomeThumb(thumbId, url) {
  const el = document.getElementById(thumbId);
  if (!el) return;
  el.src = url || PLACEHOLDER_IMG;
  el.style.display = "block";
  el.onerror = () => { el.src = PLACEHOLDER_IMG; el.onerror = null; };
}

function populateHomeImagesSection() {
  const s = settings || {};
  setHomeThumb("heroImgThumb", s.heroSection?.bgImage || "");
  setHomeThumb("bannerImgThumb", s.promoBanner?.image || "");
  setHomeThumb("lifestyleImgThumb", s.lifestyle?.imageUrl || "");
  ["heroImgStatus", "bannerImgStatus", "lifestyleImgStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.remove("ok", "err", "busy"); }
  });
}

function mountHomeImagesUploaders() {
  function wire(thumbBtnSelector, cfg) {
    const btn = document.querySelector(thumbBtnSelector);
    if (btn) {
      btn.addEventListener("click", () => {
        const fi = document.getElementById(btn.dataset.trigger);
        if (fi) fi.click();
      });
    }
    mountImageUploader(cfg);
  }

  wire('[data-trigger="heroImgFile"]', {
    fileInputId: "heroImgFile",
    previewId: "heroImgThumb",
    statusId: "heroImgStatus",
    spinnerId: "heroImgSpinner",
    statusClass: "home-img-status",
    folder: "site",
    onUploaded: async (url) => {
      try {
        await saveHomeImage("heroSection.bgImage", url);
        showAlert("Imagen del Hero actualizada.");
      } catch (err) {
        showAlert("Error al guardar: " + err.message, "error");
      }
    }
  });

  wire('[data-trigger="bannerImgFile"]', {
    fileInputId: "bannerImgFile",
    previewId: "bannerImgThumb",
    statusId: "bannerImgStatus",
    spinnerId: "bannerImgSpinner",
    statusClass: "home-img-status",
    folder: "site",
    onUploaded: async (url) => {
      try {
        await saveHomeImage("promoBanner.image", url);
        showAlert("Imagen del banner actualizada.");
      } catch (err) {
        showAlert("Error al guardar: " + err.message, "error");
      }
    }
  });

  wire('[data-trigger="lifestyleImgFile"]', {
    fileInputId: "lifestyleImgFile",
    previewId: "lifestyleImgThumb",
    statusId: "lifestyleImgStatus",
    spinnerId: "lifestyleImgSpinner",
    statusClass: "home-img-status",
    folder: "site",
    onUploaded: async (url) => {
      try {
        await saveHomeImage("lifestyle.imageUrl", url);
        showAlert("Imagen de asesoria actualizada.");
      } catch (err) {
        showAlert("Error al guardar: " + err.message, "error");
      }
    }
  });
}

// ─── SEED ───
async function runSeedIfNeeded() {
  try {
    const snap = await getDoc(doc(db, COL_SETTINGS, "store"));
    if (snap.exists() && (snap.data().catalogVersion || 0) >= 2) {
      settings = snap.data();
      return; // already seeded, skip destructive reset
    }
  } catch { /* proceed to seed on error */ }
  await runSeed();
}

async function runSeed() {
  // Only seed categories + settings — products are managed manually from the admin panel.
  // No destructive cleanup of products here.

  var catsSnap = await getDocs(collection(db, COL_CATEGORIES));
  if (!catsSnap.empty) {
    // Categories already exist — skip seed, just load settings
    const snap = await getDoc(doc(db, COL_SETTINGS, "store"));
    if (snap.exists()) { settings = snap.data(); }
    return;
  }

  const catNameMap = {};
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
    // Hero (image is managed from Home Images section)
    setHeroEyebrow: s.heroSection?.eyebrow,
    setHeroTitle: s.heroSection?.title,
    setHeroSubtitle: s.heroSection?.description,
    // Banner (image is managed from Home Images section)
    setBannerTitle: s.promoBanner?.title,
    setBannerDiscountPct: s.promoBanner?.discountPct,
    setBannerDiscountText: s.promoBanner?.discountText,
    setBannerCta: s.promoBanner?.ctaText,
    setBannerSubtitle: s.promoBanner?.subtitle,
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
    // heroSection (DATA-MODEL spec) — bgImage preserved (managed in Home Images section)
    heroSection: {
      ...(settings.heroSection || {}),
      eyebrow: document.getElementById("setHeroEyebrow").value,
      title: document.getElementById("setHeroTitle").value,
      description: document.getElementById("setHeroSubtitle").value,
    },
    // promoBanner (DATA-MODEL spec) — image preserved (managed in Home Images section)
    promoBanner: {
      ...(settings.promoBanner || {}),
      title: document.getElementById("setBannerTitle").value,
      discountPct: Number(document.getElementById("setBannerDiscountPct").value) || 0,
      discountText: document.getElementById("setBannerDiscountText").value,
      ctaText: document.getElementById("setBannerCta").value,
      subtitle: document.getElementById("setBannerSubtitle").value,
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

document.getElementById("hardResetCatalogBtn").addEventListener("click", async () => {
  if (!confirm("Esto BORRARA todo el catalogo actual y lo recargara desde seed-data.js. Continuar?")) return;
  const btn = document.getElementById("hardResetCatalogBtn");
  btn.disabled = true;
  btn.textContent = "Reseteando...";
  try {
    await runSeed();
    await loadCategories();
    await loadProducts();
    renderDashboard();
    renderCatCards();
    showAlert("Catalogo reseteado correctamente.");
  } catch (err) {
    showAlert("Error: " + err.message, "error");
  }
  btn.disabled = false;
  btn.textContent = "Resetear catalogo";
});

// ─── CATEGORY MODAL ───
function setCategoryImagePreview(url) {
  const prev = document.getElementById("catImagePreview");
  const wrap = document.getElementById("catImagePreviewWrap");
  const st = document.getElementById("catImageStatus");
  if (!prev || !wrap) return;
  const finalUrl = (url && url.trim()) ? url.trim() : PLACEHOLDER_IMG;
  prev.src = finalUrl;
  prev.style.display = "block";
  prev.onerror = () => { prev.src = PLACEHOLDER_IMG; prev.onerror = null; };
  wrap.classList.remove("empty");
  if (st) { st.textContent = ""; st.classList.remove("ok", "err", "busy"); }
}

function mountCategoryImageUploader() {
  mountImageUploader({
    fileInputId: "catImageFile",
    urlInputId: "catImageUrl",
    previewId: "catImagePreview",
    previewWrapId: "catImagePreviewWrap",
    statusId: "catImageStatus",
    statusClass: "cat-image-status",
    folder: "categories"
  });
  // Update preview when user pastes a URL manually
  const urlInput = document.getElementById("catImageUrl");
  if (urlInput && !urlInput.dataset.previewWired) {
    urlInput.dataset.previewWired = "1";
    urlInput.addEventListener("input", () => setCategoryImagePreview(urlInput.value.trim()));
  }
}

document.getElementById("addCategoryBtn").addEventListener("click", () => {
  editingCatId = null;
  editingCatSubs = [];
  document.getElementById("catModalTitle").textContent = "Nueva categoria";
  document.getElementById("categoryForm").reset();
  document.getElementById("catEditId").value = "";
  document.getElementById("catSubTags").replaceChildren();
  setCategoryImagePreview("");
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
  const currentImg = cat.imageUrl || cat.coverImage || "";
  document.getElementById("catImageUrl").value = currentImg;
  setCategoryImagePreview(currentImg);
  document.getElementById("catProductCount").value = cat.productCount || "";
  document.getElementById("catDisplayOrder").value = cat.displayOrder ?? "";
  document.getElementById("catShowOnHomepage").checked = cat.showOnHomepage !== false;
  renderSubTags();
  openModal("categoryModal");
}

async function deleteCategory(id) {
  if (!confirm("Eliminar esta categoria y TODOS sus productos?")) return;
  try {
    const ids = [...new Set([id, id.toLowerCase()])];
    const q = query(collection(db, COL_PRODUCTS), where("categoryId", "in", ids));
    const prodsSnap = await getDocs(q);
    const imageUrls = prodsSnap.docs.map(d => d.data().primaryImage || d.data().imageUrl).filter(Boolean);

    const b = writeBatch(db);
    prodsSnap.docs.forEach(d => b.delete(d.ref));
    b.delete(doc(db, COL_CATEGORIES, id));
    await b.commit();

    await Promise.allSettled(imageUrls.map(url => deleteImageFromBunny(url)));
    products = products.filter(p => !ids.includes(p.categoryId));

    showAlert("Categoria eliminada. " + prodsSnap.size + " producto(s) eliminado(s).");
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
    setProductImagePreview(p.primaryImage || p.imageUrl || "");
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
  document.getElementById("deleteProductBtn").style.display = id ? "inline-flex" : "none";
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
// ─── PRODUCT IMAGE FILE PICKER ───
function setProductImagePreview(url) {
  var hid = document.getElementById("prodImage");
  var prev = document.getElementById("prodImagePreview");
  var st = document.getElementById("prodImageStatus");
  var fi = document.getElementById("prodImageFile");
  hid.value = url || "";
  prev.src = (url && url.trim()) ? url : PLACEHOLDER_IMG;
  prev.style.display = "block";
  prev.onerror = () => { prev.src = PLACEHOLDER_IMG; prev.onerror = null; };
  st.textContent = (url && url.trim()) ? "Imagen actual del producto" : "Sin imagen — usa el selector para subir";
  st.style.color = "var(--gray)";
  if (fi) { fi.value = ""; }
}

document.getElementById("prodImageFile").addEventListener("change", async function(e) {
  var file = e.target.files[0];
  if (!file) { return; }
  console.log("[IMG] selected:", file.name, Math.round(file.size / 1024) + "KB");
  var prev = document.getElementById("prodImagePreview");
  var st = document.getElementById("prodImageStatus");
  prev.src = URL.createObjectURL(file);
  prev.style.display = "block";
  st.textContent = "Subiendo a Bunny CDN...";
  st.style.color = "var(--copper-lt)";
  try {
    var cdnUrl = await uploadImageToBunny(file, "products");
    document.getElementById("prodImage").value = cdnUrl;
    prev.src = cdnUrl;
    st.textContent = "OK Imagen subida";
    st.style.color = "var(--green-ok)";
    console.log("[IMG] uploaded:", cdnUrl);
  } catch (err) {
    st.textContent = "ERROR " + err.message;
    st.style.color = "var(--red-fail)";
    console.error("[IMG] upload failed:", err);
  }
});

document.getElementById("cancelProductDrawerBtn").addEventListener("click", closeProductDrawer);
document.getElementById("productDrawerOverlay").addEventListener("click", closeProductDrawer);
document.getElementById("deleteProductBtn").addEventListener("click", async () => {
  if (editingProdId) { await deleteProduct(editingProdId); closeProductDrawer(); }
});

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
  var imageUrl = document.getElementById("prodImage").value.trim();
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
    regenerateProductsManifest(); // fire-and-forget, don't block UI
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
  const prod = catProductsAll.find(p => p.id === id) || products.find(p => p.id === id);
  if (!confirm("Eliminar este producto?")) return;
  try {
    await deleteDoc(doc(db, COL_PRODUCTS, id));
    if (prod) await deleteImageFromBunny(prod.primaryImage || prod.imageUrl);
    products = products.filter(p => p.id !== id);
    regenerateProductsManifest(); // fire-and-forget
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
