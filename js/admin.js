import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { firebaseConfig, BUNNY_CDN } from "./firebase-config.js?v=20260529i";
import { CATEGORIES, SETTINGS } from "./seed-data.js?v=20260529i";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Diagnostic: surface non-sensitive metadata about the loaded config so cache
// issues are obvious. We only print zone + key length (no key material).
// The two key versions in flight have distinct lengths (39 vs 36), which is
// enough to distinguish them without leaking any key bytes.
console.log(
  "[BUNNY] config loaded · zone=" + BUNNY_CDN.zoneName +
  " · keyPresent=" + Boolean(BUNNY_CDN.apiKey) +
  " · keyLen=" + (BUNNY_CDN.apiKey || "").length
);

// Hardcoded admin credentials - change these if needed
const ADMIN_EMAIL = "admin@palito.com";
const ADMIN_PASSWORD = "admin2025";

const COL_CATEGORIES = "categories";
const COL_PRODUCTS = "products";
const COL_SETTINGS = "settings";
const PLACEHOLDER_IMG = "../assets/placeholder.svg";

// Target crop aspect ratios per home container (width / height).
// These match the actual layout slots so the image lands without surprise cropping.
const CROP_RATIO = {
  hero:      4 / 3,   // hero-img-wrap on the right column
  banner:    21 / 9,  // full-banner is extra wide
  lifestyle: 4 / 5,   // lifestyle-img on the left column
  category:  3 / 4,   // .cat-card aspect-ratio:3/4
  product:   3 / 4,   // .product-img-wrap aspect-ratio:3/4
};

let categories = [];
let products = [];
let settings = {};
let dashFeaturedCatFilter = "all";
let editingCatSubs = [];
let editingProdColors = [];
let editingProdMaterials = [];
let editingProdQrUrl = "";
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
  // Marcador de build escrito por el JS realmente cargado: si NO dice "build
  // v29i", tu navegador esta corriendo un admin.js viejo en cache → Cmd+Shift+R.
  const __BUILD = "v29i";
  const __bv = document.getElementById("buildVersion");
  if (__bv) { __bv.textContent = "build " + __BUILD; __bv.title = "Si no dice " + __BUILD + ", recarga con Cmd+Shift+R"; }

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

  // Confirm to the user that everything loaded. The persistent error banner
  // (setBunnyHealth(false, ...)) would override this if Bunny is actually down.
  const detail = categories.length + " categorias · " + products.length + " productos";
  notify("OK001", detail);
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
  if (section === "dashboard") {
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
    notifyError(firestoreCodeFromError(err, "E205"), err.message);
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
  renderDashAudit();
  populateHomeImagesSection();
  renderDashCatOrder();
  renderDashFeatured();
}

// ─── CATALOG AUDIT ───
// Walks every product in the DB and reports records missing required fields.
// Required per DATA-MODEL.md: name, categoryId, price. categoryId must resolve
// to a real category. Optional but flagged when missing: image, displayOrder.
function auditCatalog() {
  const issues = {
    noName: [],
    noCategoryId: [],
    orphanCategory: [],     // categoryId set but doesn't match any category
    noPrice: [],
    noImage: [],
    duplicateNames: [],
  };

  const validCatIds = new Set();
  categories.forEach(c => {
    validCatIds.add(c.id);
    if (c.id) validCatIds.add(c.id.toLowerCase());
  });

  const nameSeen = new Map();

  products.forEach(p => {
    const name = (p.name || "").trim();
    if (!name) issues.noName.push(p);
    if (!p.categoryId) {
      issues.noCategoryId.push(p);
    } else {
      const cid = String(p.categoryId).toLowerCase();
      if (!validCatIds.has(p.categoryId) && !validCatIds.has(cid)) {
        issues.orphanCategory.push(p);
      }
    }
    if (p.price == null || isNaN(Number(p.price)) || Number(p.price) <= 0) {
      issues.noPrice.push(p);
    }
    if (!p.primaryImage && !p.imageUrl) {
      issues.noImage.push(p);
    }
    if (name) {
      const key = name.toLowerCase();
      nameSeen.set(key, (nameSeen.get(key) || 0) + 1);
    }
  });

  const dupNames = [...nameSeen.entries()].filter(([_, n]) => n > 1).map(([k]) => k);
  if (dupNames.length) {
    issues.duplicateNames = products.filter(p => dupNames.includes((p.name || "").toLowerCase()));
  }

  const total = Object.values(issues).reduce((s, arr) => s + arr.length, 0);
  return { issues, total, productCount: products.length, categoryCount: categories.length };
}

function renderDashAudit() {
  const banner = document.getElementById("dashAuditBanner");
  const summary = document.getElementById("dashAuditSummary");
  const detail = document.getElementById("dashAuditDetail");
  const toggle = document.getElementById("dashAuditToggle");
  if (!banner) return;

  const report = auditCatalog();
  const { issues, total, productCount } = report;

  // Always show the banner: green when clean, red when issues
  banner.classList.remove("hidden");
  banner.classList.toggle("ok", total === 0);

  if (total === 0) {
    summary.textContent = `Catalogo OK: ${productCount} productos verificados, todos con categoria, titulo, precio e imagen.`;
    detail.classList.add("hidden");
    toggle.style.display = "none";
    return;
  }

  summary.textContent = `${total} producto${total !== 1 ? "s" : ""} con campos incompletos de ${productCount}. Click en "Ver detalle" para revisarlos.`;
  toggle.style.display = "";
  toggle.textContent = detail.classList.contains("hidden") ? "Ver detalle →" : "Ocultar ↑";

  // Build detail panel
  detail.replaceChildren();
  const groups = [
    ["Sin titulo (name)",         issues.noName],
    ["Sin categoria (categoryId)",issues.noCategoryId],
    ["Categoria invalida (no existe en DB)", issues.orphanCategory],
    ["Sin precio o precio invalido", issues.noPrice],
    ["Sin imagen",                issues.noImage],
    ["Nombres duplicados",        issues.duplicateNames],
  ];

  groups.forEach(([title, list]) => {
    if (!list.length) return;
    const g = document.createElement("div");
    g.className = "dash-audit-group";
    const h4 = document.createElement("h4");
    h4.textContent = `${title} · ${list.length}`;
    g.appendChild(h4);
    const ul = document.createElement("ul");
    list.slice(0, 20).forEach(p => {
      const li = document.createElement("li");
      li.className = "dash-audit-item";
      const idEl = document.createElement("span");
      idEl.className = "dash-audit-item-id";
      idEl.textContent = (p.id || "").slice(0, 8);
      const nameEl = document.createElement("span");
      nameEl.className = "dash-audit-item-name";
      nameEl.textContent = p.name || "(sin nombre) · cat: " + (p.categoryId || "—");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dash-audit-item-action";
      btn.textContent = "Abrir";
      btn.addEventListener("click", () => openProductDrawer(p.id));
      li.append(idEl, nameEl, btn);
      ul.appendChild(li);
    });
    if (list.length > 20) {
      const more = document.createElement("li");
      more.style.cssText = "font-size:11px;color:var(--gray);text-align:center;padding:4px";
      more.textContent = `... y ${list.length - 20} más`;
      ul.appendChild(more);
    }
    g.appendChild(ul);
    detail.appendChild(g);
  });
}

// Wire toggle once on first render — guarded by dataset flag
function wireDashAuditToggle() {
  const toggle = document.getElementById("dashAuditToggle");
  const detail = document.getElementById("dashAuditDetail");
  if (!toggle || !detail || toggle.dataset.wired === "1") return;
  toggle.dataset.wired = "1";
  toggle.addEventListener("click", () => {
    const hidden = detail.classList.toggle("hidden");
    toggle.textContent = hidden ? "Ver detalle →" : "Ocultar ↑";
  });
}
document.addEventListener("DOMContentLoaded", wireDashAuditToggle);

// SVG factories using createElementNS to avoid innerHTML (XSS-safe).
const SVG_NS = "http://www.w3.org/2000/svg";
function makeSvg(viewBox, pathDefs) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  pathDefs.forEach(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    svg.appendChild(node);
  });
  return svg;
}
function dashIconUpload() {
  return makeSvg("0 0 24 24", [
    ["path",     { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" }],
    ["polyline", { points: "17 8 12 3 7 8" }],
    ["line",     { x1: "12", y1: "3", x2: "12", y2: "15" }],
  ]);
}
function dashIconPencil() {
  return makeSvg("0 0 24 24", [
    ["path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }],
    ["path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" }],
  ]);
}

// ─── DASH: Home Images strip ───
const DASH_HOME_IMG_DEFS = [
  { key: "hero",      title: "Hero",                    meta: "Imagen principal",      path: "heroSection.bgImage",  read: (s) => s?.heroSection?.bgImage,  ratio: CROP_RATIO.hero,      label: "el Hero" },
  { key: "banner",    title: "Banner Credito Directo",  meta: "Imagen del banner",     path: "promoBanner.image",    read: (s) => s?.promoBanner?.image,    ratio: CROP_RATIO.banner,    label: "el Banner" },
  { key: "lifestyle", title: "Asesoria personalizada",  meta: "Imagen del bloque",     path: "lifestyle.imageUrl",   read: (s) => s?.lifestyle?.imageUrl,   ratio: CROP_RATIO.lifestyle, label: "el bloque de Asesoria" },
];

function renderDashHomeImgs() {
  const wrap = document.getElementById("dashboardHomeImgs");
  if (!wrap) return;
  wrap.replaceChildren();

  DASH_HOME_IMG_DEFS.forEach(def => {
    const url = def.read(settings);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "dash-img-tile";
    tile.setAttribute("aria-label", "Cambiar imagen de " + def.title);

    const thumb = document.createElement("div");
    thumb.className = "dash-img-tile-thumb";

    const img = document.createElement("img");
    img.src = url || PLACEHOLDER_IMG;
    img.alt = "";
    img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };

    const overlay = document.createElement("div");
    overlay.className = "dash-img-tile-overlay";
    const overlayAction = document.createElement("span");
    overlayAction.className = "dash-img-tile-overlay-action";
    overlayAction.appendChild(dashIconUpload());
    overlayAction.appendChild(document.createTextNode(" Cambiar"));
    overlay.appendChild(overlayAction);

    const spinner = document.createElement("div");
    spinner.className = "dash-img-tile-spinner hidden";
    spinner.id = "dashHomeImgSpinner_" + def.key;
    const spinnerInner = document.createElement("span");
    spinnerInner.className = "spinner";
    spinner.appendChild(spinnerInner);

    thumb.append(img, overlay, spinner);

    const body = document.createElement("div");
    body.className = "dash-img-tile-body";
    const titleEl = document.createElement("div");
    titleEl.className = "dash-img-tile-title";
    titleEl.textContent = def.title;
    const metaEl = document.createElement("div");
    metaEl.className = "dash-img-tile-meta";
    metaEl.textContent = def.meta;
    body.append(titleEl, metaEl);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    fileInput.id = "dashHomeImgFile_" + def.key;

    tile.append(thumb, body, fileInput);
    tile.addEventListener("click", () => fileInput.click());

    wrap.appendChild(tile);

    mountImageUploader({
      fileInputId: fileInput.id,
      previewId: null,
      statusId: null,
      spinnerId: spinner.id,
      folder: "site",
      cropAspectRatio: def.ratio,
      cropLabel: def.label,
      onUploaded: async (cdnUrl) => {
        img.src = cdnUrl;
        try {
          await saveHomeImage(def.path, cdnUrl);
          // Reflect in main "Home Images" section if present
          if (def.key === "hero") setHomeThumb("heroImgThumb", cdnUrl);
          if (def.key === "banner") setHomeThumb("bannerImgThumb", cdnUrl);
          if (def.key === "lifestyle") setHomeThumb("lifestyleImgThumb", cdnUrl);
          notify("OK002", def.title);
        } catch (err) {
          notifyError(firestoreCodeFromError(err, "E210"), "Imagen subida pero settings no se guardo: " + err.message);
        }
      }
    });
  });
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
    const empty = document.createElement("div");
    empty.className = "dash-cat-empty";
    const emptyMsg = document.createElement("p");
    emptyMsg.textContent = "Sin categorias en home. Actualas desde la seccion Categorias.";
    empty.appendChild(emptyMsg);
    const linkRow = document.createElement("a");
    linkRow.href = "#";
    linkRow.dataset.goSection = "categories";
    linkRow.style.cssText = "display:inline-block;margin-top:10px;font-size:11px;letter-spacing:.08em;color:var(--copper-lt)";
    linkRow.textContent = "Ir a categorias →";
    empty.appendChild(linkRow);
    el.appendChild(empty);
    return;
  }

  homeCats.forEach((cat, idx) => {
    const card = document.createElement("article");
    card.className = "dash-cat-card";

    // Thumb (click = upload)
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "dash-cat-thumb";
    thumb.id = "dashCatThumb_" + cat.id;
    thumb.setAttribute("aria-label", "Cambiar imagen de " + cat.name);

    const img = document.createElement("img");
    img.src = cat.imageUrl || cat.coverImage || PLACEHOLDER_IMG;
    img.alt = "";
    img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };
    thumb.appendChild(img);

    const overlay = document.createElement("div");
    overlay.className = "dash-cat-thumb-overlay";
    overlay.appendChild(dashIconUpload());
    overlay.appendChild(document.createTextNode("Cambiar"));
    thumb.appendChild(overlay);

    const spinner = document.createElement("div");
    spinner.className = "dash-cat-thumb-spinner hidden";
    spinner.id = "dashCatSpinner_" + cat.id;
    const sp = document.createElement("span");
    sp.className = "spinner";
    spinner.appendChild(sp);
    thumb.appendChild(spinner);

    const posEl = document.createElement("div");
    posEl.className = "dash-cat-pos" + (idx === 0 ? " featured-pos" : "");
    posEl.textContent = String(idx + 1);
    posEl.title = idx === 0 ? "Posicion 1 · foto grande del home" : "Posicion " + (idx + 1);
    thumb.appendChild(posEl);

    // Hidden file input scoped to this card
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    fileInput.id = "dashCatFile_" + cat.id;
    thumb.addEventListener("click", () => fileInput.click());

    // Body
    const body = document.createElement("div");
    body.className = "dash-cat-body";
    const nameEl = document.createElement("div");
    nameEl.className = "dash-cat-name";
    nameEl.textContent = cat.name;
    const metaEl = document.createElement("div");
    metaEl.className = "dash-cat-meta";
    metaEl.textContent = (cat.productCount || 0) + " productos";
    body.append(nameEl, metaEl);

    // Actions: arrows
    const actions = document.createElement("div");
    actions.className = "dash-cat-actions";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "dash-cat-arrow";
    upBtn.textContent = "↑";
    upBtn.title = "Subir";
    upBtn.disabled = idx === 0;
    if (!upBtn.disabled) upBtn.addEventListener("click", () => moveCatInHomeDashboard(cat.id, -1));

    const dnBtn = document.createElement("button");
    dnBtn.type = "button";
    dnBtn.className = "dash-cat-arrow";
    dnBtn.textContent = "↓";
    dnBtn.title = "Bajar";
    dnBtn.disabled = idx === homeCats.length - 1;
    if (!dnBtn.disabled) dnBtn.addEventListener("click", () => moveCatInHomeDashboard(cat.id, +1));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "dash-cat-arrow";
    editBtn.title = "Editar categoria";
    editBtn.appendChild(dashIconPencil());
    editBtn.addEventListener("click", () => editCategory(cat.id));

    actions.append(upBtn, dnBtn, editBtn);

    card.append(thumb, fileInput, body, actions);
    el.appendChild(card);

    // Wire the uploader: persist URL to Firestore directly, no separate save step.
    mountImageUploader({
      fileInputId: fileInput.id,
      previewId: null,
      statusId: null,
      spinnerId: spinner.id,
      folder: "categories",
      cropAspectRatio: CROP_RATIO.category,
      cropLabel: cat.name,
      feedbackTargetId: thumb.id,
      onUploaded: async (cdnUrl) => {
        img.src = cdnUrl;
        try {
          await updateDoc(doc(db, COL_CATEGORIES, cat.id), {
            imageUrl: cdnUrl,
            coverImage: cdnUrl,
            updatedAt: serverTimestamp(),
          });
          const local = categories.find(c => c.id === cat.id);
          if (local) { local.imageUrl = cdnUrl; local.coverImage = cdnUrl; }
          notify("OK002", "Categoria: " + cat.name);
        } catch (err) {
          notifyError(firestoreCodeFromError(err, "E205"), "Imagen subida pero la categoria no se actualizo: " + err.message);
        }
      }
    });
  });

  // Persist new order automatically on each ↑↓ click (handled in moveCatInHomeDashboard)
}

async function moveCatInHomeDashboard(catId, dir) {
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

  try {
    const b = writeBatch(db);
    homeCats.forEach((hc, i) => {
      b.update(doc(db, COL_CATEGORIES, hc.id), { displayOrder: i + 1, updatedAt: serverTimestamp() });
    });
    await b.commit();
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E205"), "Reorden de categorias no se guardo: " + err.message);
  }
}

async function saveCatDisplayOrder() {
  const homeCats = categories.filter(c => c.showOnHomepage);
  try {
    const b = writeBatch(db);
    homeCats.forEach(cat => {
      b.update(doc(db, COL_CATEGORIES, cat.id), { displayOrder: cat.displayOrder || 0, updatedAt: serverTimestamp() });
    });
    await b.commit();
    notify("OK007", "Categorias del home");
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E205"), err.message);
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

  // ─── ACTIVE FEATURED (with reorder + remove) ───
  const featured = allProds.filter(p => p.featured)
    .sort((a, b) => (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (b.featuredOrder ?? Number.MAX_SAFE_INTEGER));

  const activeTitle = document.createElement("div");
  activeTitle.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gray);margin-bottom:8px;font-weight:600;flex-wrap:wrap";
  const activeLabel = document.createElement("span");
  activeLabel.textContent = "En home";
  const activeRight = document.createElement("span");
  activeRight.style.cssText = "display:flex;align-items:center;gap:10px";
  const activeCount = document.createElement("span");
  activeCount.style.cssText = "color:var(--copper-lt);letter-spacing:.06em";
  activeCount.textContent = featured.length + (featured.length === 1 ? " producto" : " productos");
  activeRight.appendChild(activeCount);
  if (featured.length > 0) {
    const clearAllBtn = document.createElement("button");
    clearAllBtn.type = "button";
    clearAllBtn.textContent = "Quitar todos";
    clearAllBtn.style.cssText = "font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:4px;border:1px solid var(--rule);background:none;color:var(--gray);cursor:pointer;transition:all .15s ease-out;font-weight:600";
    clearAllBtn.addEventListener("mouseenter", () => { clearAllBtn.style.borderColor = "var(--red)"; clearAllBtn.style.color = "var(--red-lt)"; });
    clearAllBtn.addEventListener("mouseleave", () => { clearAllBtn.style.borderColor = "var(--rule)"; clearAllBtn.style.color = "var(--gray)"; });
    clearAllBtn.addEventListener("click", clearAllFeaturedProducts);
    activeRight.appendChild(clearAllBtn);
  }
  activeTitle.append(activeLabel, activeRight);
  el.appendChild(activeTitle);

  if (!featured.length) {
    const empty = document.createElement("p");
    empty.style.cssText = "font-size:12px;color:var(--gray);padding:10px 12px;border:1px dashed var(--rule);border-radius:6px;font-style:italic;margin-bottom:14px";
    empty.textContent = "Aun no hay destacados. La seccion \"Lo mas deseado\" estara oculta en el home hasta que selecciones al menos uno.";
    el.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:5px;margin-bottom:14px";
    featured.forEach((p, idx) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;border:1px solid rgba(58,140,92,.25);background:rgba(58,140,92,.06)";

      const posEl = document.createElement("div");
      posEl.style.cssText = "width:20px;text-align:center;font-size:13px;font-weight:700;flex-shrink:0;color:var(--copper-lt)";
      posEl.textContent = String(idx + 1);

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

      const arrows = document.createElement("div");
      arrows.style.cssText = "display:flex;gap:2px;flex-shrink:0";
      const upBtn = makeDirBtn("↑", "Subir", idx === 0);
      const dnBtn = makeDirBtn("↓", "Bajar", idx === featured.length - 1);
      if (!upBtn.disabled) upBtn.addEventListener("click", () => moveFeaturedInHome(p.id, -1));
      if (!dnBtn.disabled) dnBtn.addEventListener("click", () => moveFeaturedInHome(p.id, +1));
      arrows.append(upBtn, dnBtn);

      const removeBtn = document.createElement("button");
      removeBtn.style.cssText = "flex-shrink:0;width:24px;height:24px;border-radius:4px;font-size:13px;line-height:1;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--gray);transition:all .15s ease-out";
      removeBtn.textContent = "×";
      removeBtn.title = "Quitar de destacados";
      removeBtn.addEventListener("mouseenter", () => { removeBtn.style.borderColor = "var(--red)"; removeBtn.style.color = "var(--red-lt)"; });
      removeBtn.addEventListener("mouseleave", () => { removeBtn.style.borderColor = "var(--rule)"; removeBtn.style.color = "var(--gray)"; });
      removeBtn.addEventListener("click", () => toggleFeaturedProduct(p.id));

      row.append(posEl, img, info, arrows, removeBtn);
      list.appendChild(row);
    });
    el.appendChild(list);
  }

  // ─── ADD MORE ───
  const addTitle = document.createElement("div");
  addTitle.style.cssText = "font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gray);margin-bottom:8px;font-weight:600;padding-top:6px;border-top:1px solid var(--rule)";
  addTitle.textContent = "Agregar a destacados";
  addTitle.style.paddingTop = "12px";
  el.appendChild(addTitle);

  const tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px";
  const catNames = [...new Set(allProds.map(p => p.category).filter(Boolean))].sort();
  ["all", ...catNames].forEach(cname => {
    const btn = document.createElement("button");
    const isActive = cname === dashFeaturedCatFilter;
    btn.textContent = cname === "all" ? "Todas" : cname;
    btn.style.cssText = "padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;letter-spacing:.04em;cursor:pointer;transition:all .15s ease-out;border:1px solid;" +
      (isActive ? "background:var(--copper);color:var(--bg);border-color:var(--copper);" : "background:none;color:var(--cream-dim);border-color:var(--rule);");
    btn.addEventListener("click", () => { dashFeaturedCatFilter = cname; renderDashFeatured(); });
    tabs.appendChild(btn);
  });
  el.appendChild(tabs);

  const available = (dashFeaturedCatFilter === "all"
    ? allProds.filter(p => !p.featured)
    : allProds.filter(p => p.category === dashFeaturedCatFilter && !p.featured)
  ).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (!available.length) {
    const p = document.createElement("p");
    p.style.cssText = "font-size:12px;color:var(--gray);padding:10px 0;font-style:italic";
    p.textContent = featured.length
      ? "Todos los productos de esta categoria ya estan destacados."
      : "No hay productos en esta categoria.";
    el.appendChild(p);
    return;
  }

  const availList = document.createElement("div");
  availList.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto;padding-right:2px";

  available.forEach(p => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;border:1px solid var(--rule);background:transparent";

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

    const addBtn = document.createElement("button");
    addBtn.style.cssText = "flex-shrink:0;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.05em;cursor:pointer;transition:all .15s ease-out;border:1px solid var(--rule);background:none;color:var(--cream-dim)";
    addBtn.textContent = "+ Destacar";
    addBtn.addEventListener("mouseenter", () => { addBtn.style.borderColor = "var(--copper)"; addBtn.style.color = "var(--copper-lt)"; });
    addBtn.addEventListener("mouseleave", () => { addBtn.style.borderColor = "var(--rule)"; addBtn.style.color = "var(--cream-dim)"; });
    addBtn.addEventListener("click", () => toggleFeaturedProduct(p.id));

    row.append(img, info, addBtn);
    availList.appendChild(row);
  });
  el.appendChild(availList);
}

async function moveFeaturedInHome(prodId, dir) {
  const featured = products.filter(p => p.featured)
    .sort((a, b) => (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (b.featuredOrder ?? Number.MAX_SAFE_INTEGER));

  const idx = featured.findIndex(p => p.id === prodId);
  if (idx < 0) return;
  const target = idx + dir;
  if (target < 0 || target >= featured.length) return;

  [featured[idx], featured[target]] = [featured[target], featured[idx]];

  // Update local order
  featured.forEach((p, i) => {
    const g = products.find(x => x.id === p.id);
    if (g) g.featuredOrder = i + 1;
  });

  renderDashboard();

  // Persist all featured products' new order in a single batch
  try {
    const b = writeBatch(db);
    featured.forEach((p, i) => {
      b.update(doc(db, COL_PRODUCTS, p.id), { featuredOrder: i + 1, updatedAt: serverTimestamp() });
    });
    await b.commit();
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E211"), err.message);
  }
}

async function clearAllFeaturedProducts() {
  const featured = products.filter(p => p.featured);
  if (!featured.length) return;
  if (!window.confirm("Vas a quitar de \"Lo mas deseado\" los " + featured.length + " productos actuales. Los productos siguen en el catalogo, solo se ocultan del home. Continuar?")) return;

  // Optimistic local update
  featured.forEach(p => { p.featured = false; p.featuredOrder = null; });
  renderDashboard();

  // Firestore batch write
  try {
    const b = writeBatch(db);
    featured.forEach(p => {
      b.update(doc(db, COL_PRODUCTS, p.id), { featured: false, featuredOrder: null, updatedAt: serverTimestamp() });
    });
    await b.commit();
    notify("OK007", "Lo mas deseado vaciado (" + featured.length + " productos quitados)");
  } catch (err) {
    // Roll back optimistic update
    featured.forEach(p => { p.featured = true; });
    renderDashboard();
    notifyError(firestoreCodeFromError(err, "E211"), err.message);
  }
}

async function toggleFeaturedProduct(prodId) {
  const prod = products.find(p => p.id === prodId);
  if (!prod) return;
  const willFeature = !prod.featured;

  const updateData = { featured: willFeature, updatedAt: serverTimestamp() };

  if (willFeature) {
    // Append to end of featured list
    const currentMaxOrder = products
      .filter(p => p.featured && p.id !== prodId)
      .reduce((m, p) => Math.max(m, p.featuredOrder ?? 0), 0);
    prod.featuredOrder = currentMaxOrder + 1;
    updateData.featuredOrder = prod.featuredOrder;
  }

  prod.featured = willFeature;

  try {
    await updateDoc(doc(db, COL_PRODUCTS, prodId), updateData);
  } catch (err) {
    prod.featured = !willFeature;
    notifyError(firestoreCodeFromError(err, "E211"), err.message);
  }
  renderDashboard();
}

async function deleteImageFromBunny(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith(BUNNY_CDN.cdnUrl)) return;
  const path = imageUrl.slice(BUNNY_CDN.cdnUrl.length);
  const storageUrl = BUNNY_CDN.apiUrl + "/" + BUNNY_CDN.zoneName + path;
  const res = await fetch(storageUrl, { method: "DELETE", headers: { AccessKey: BUNNY_CDN.apiKey } });
  if (!res.ok && res.status !== 404) {
    // 404 = already gone, treat as success. Anything else surfaces.
    setBunnyHealth(false, res.status);
    throw new Error("Bunny DELETE " + res.status);
  }
  // Best-effort cache purge using the Account API key. Skipped if not configured.
  if (BUNNY_CDN.accountApiKey) {
    try {
      await fetch("https://api.bunny.net/purge?url=" + encodeURIComponent(imageUrl), {
        method: "POST",
        headers: { AccessKey: BUNNY_CDN.accountApiKey }
      });
    } catch (e) {
      console.warn("[BUNNY] purge failed:", e.message);
    }
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
    const res = await fetch(apiUrl, {
      method: "PUT",
      headers: { AccessKey: BUNNY_CDN.apiKey, "Content-Type": "application/json" },
      body: json
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[manifest] PUT failed:", res.status, text);
      setBunnyHealth(false, res.status);
      return;
    }
    // Purge edge cache so subsequent fetches see the new version.
    // Uses the Account API key (different from the Storage Zone key). Skipped
    // silently if not configured — edge will update naturally within ~60s.
    if (BUNNY_CDN.accountApiKey) {
      fetch("https://api.bunny.net/purge?url=" + encodeURIComponent(cdnUrl), {
        method: "POST",
        headers: { AccessKey: BUNNY_CDN.accountApiKey }
      }).catch(() => {});
    }
    setBunnyHealth(true);
    console.log("[manifest] regenerated:", Object.keys(manifest).length, "products");
  } catch (e) {
    console.warn("[manifest] regenerate failed:", e.message);
    setBunnyHealth(false);
  }
}

// ─── BUNNY HEALTH BANNER ───
function setBunnyHealth(healthy, status) {
  const banner = document.getElementById("bunnyHealthBanner");
  if (!banner) return;
  if (healthy) {
    banner.classList.add("hidden");
    banner.replaceChildren();
    return;
  }
  // Also fire a push notification with the matched code
  if (typeof notifyError === "function") {
    notifyError(bunnyCodeFromStatus(status), "HTTP " + (status || "?"));
  }
  // Build the banner content (safe DOM only, no innerHTML)
  banner.replaceChildren();
  banner.classList.remove("hidden");

  const dot = document.createElement("div");
  dot.className = "bunny-health-dot";

  const body = document.createElement("div");
  body.className = "bunny-health-body";
  const title = document.createElement("div");
  title.className = "bunny-health-title";
  title.textContent = status === 401
    ? "Bunny CDN: API key invalida (HTTP 401)"
    : "Bunny CDN inaccesible";
  const sub = document.createElement("div");
  sub.className = "bunny-health-sub";
  const subText1 = document.createTextNode("Las subidas de imagenes van a fallar hasta que arregles la API key. Verifica en ");
  const code = document.createElement("code");
  code.textContent = "js/firebase-config.js → BUNNY_CDN.apiKey";
  const subText2 = document.createTextNode(". Pega la Password actual desde Bunny Dashboard → Storage Zone \"" + BUNNY_CDN.zoneName + "\" → FTP & API Access.");
  sub.append(subText1, code, subText2);
  body.append(title, sub);

  const dismiss = document.createElement("button");
  dismiss.className = "bunny-health-dismiss";
  dismiss.textContent = "Ocultar";
  dismiss.addEventListener("click", () => {
    banner.classList.add("hidden");
  });

  banner.append(dot, body, dismiss);
}

// ─── BUNNY CDN UPLOAD ───
async function uploadImageToBunny(file, subFolder) {
  if (subFolder === void 0) { subFolder = 'products'; }
  console.group('[BUNNY] uploadImageToBunny');
  console.log('[BUNNY] file:', file.name, '| size:', Math.round(file.size / 1024) + 'KB');
  if (!BUNNY_CDN.apiKey || BUNNY_CDN.apiKey.indexOf('PASTE_YOUR') !== -1) {
    console.error('[BUNNY] ERROR API key not configured — edit firebase-config.js');
    console.groupEnd();
    throw new Error('Bunny CDN API key no configurada. Edita js/firebase-config.js');
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
        let msg = 'Bunny upload failed (' + xhr.status + ')';
        if (xhr.status === 401) {
          msg = 'API key de Bunny invalida o expirada. Verifica js/firebase-config.js (Storage Zone Password).';
          setBunnyHealth(false, 401);
        } else if (xhr.status === 404) {
          msg = 'Storage Zone no encontrada. Verifica zoneName en js/firebase-config.js.';
          setBunnyHealth(false, 404);
        } else {
          setBunnyHealth(false, xhr.status);
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = function() {
      console.error('[BUNNY] ERROR network error');
      console.groupEnd();
      setBunnyHealth(false);
      if (typeof notifyError === 'function') notifyError('E105', 'No se pudo alcanzar br.storage.bunnycdn.com');
      reject(new Error('Sin conexion a Bunny CDN. Revisa tu internet o el bloqueo de red.'));
    };
    xhr.send(file);
  });
}

// ─── CROP MODAL ───
// Native (no library) image cropper. Opens with a file + target aspect ratio,
// resolves with a Blob containing the cropped JPEG, or null if cancelled.
const cropState = {
  resolve: null,
  ratio: null,
  natural: { w: 0, h: 0 },
  displayed: { w: 0, h: 0 },
  scale: 1,
  box: { x: 0, y: 0, w: 0, h: 0 }, // in displayed pixels
  drag: null,
};

function openCropModal(file, aspectRatio, label) {
  return new Promise((resolve) => {
    cropState.resolve = resolve;
    cropState.ratio = aspectRatio || null;

    const overlay = document.getElementById("cropOverlay");
    const img = document.getElementById("cropImg");
    const subtitle = document.getElementById("cropSubtitle");
    const ratioLabel = document.getElementById("cropRatioLabel");

    subtitle.textContent = label
      ? `Define la zona visible para ${label}. Arrastra el recuadro o las esquinas.`
      : "Arrastra el recuadro o las esquinas para definir la zona visible.";
    ratioLabel.textContent = aspectRatio
      ? aspectRatioToLabel(aspectRatio)
      : "Libre";

    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        cropState.natural = { w: img.naturalWidth, h: img.naturalHeight };
        // CRITICAL: show overlay BEFORE measuring, otherwise display:none makes
        // clientWidth/Height return 0, which produces a 0x0 crop box and the
        // canvas.toBlob() later returns null silently.
        overlay.classList.add("active");
        requestAnimationFrame(() => {
          let dw = img.clientWidth;
          let dh = img.clientHeight;
          // Defensive fallback in case layout still isn't ready
          if (!dw || !dh) {
            const stageEl = document.getElementById("cropStage");
            const maxW = stageEl ? Math.max(320, stageEl.clientWidth - 48) : 600;
            const maxH = Math.min(window.innerHeight * 0.6, 600);
            const r = cropState.natural.w / cropState.natural.h;
            if (cropState.natural.w / maxW > cropState.natural.h / maxH) {
              dw = maxW; dh = Math.round(maxW / r);
            } else {
              dh = maxH; dw = Math.round(maxH * r);
            }
            img.style.width = dw + "px";
            img.style.height = dh + "px";
            console.warn("[crop] clientSize was 0, using fallback dims " + dw + "x" + dh);
          }
          cropState.displayed = { w: dw, h: dh };
          cropState.scale = cropState.natural.w / dw;
          initCropBox();
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function aspectRatioToLabel(r) {
  if (!r) return "Libre";
  // Try to match common ratios
  const ratios = [
    [16, 9], [4, 3], [3, 2], [1, 1], [4, 5], [3, 4], [21, 9], [2, 3],
  ];
  for (const [a, b] of ratios) {
    if (Math.abs(r - a / b) < 0.005) return `${a}:${b}`;
  }
  return r.toFixed(2);
}

function initCropBox() {
  const { displayed, ratio } = cropState;
  let w, h;
  if (ratio) {
    // Fit largest box inside the displayed image at the target ratio
    if (displayed.w / displayed.h > ratio) {
      h = displayed.h;
      w = h * ratio;
    } else {
      w = displayed.w;
      h = w / ratio;
    }
  } else {
    w = displayed.w;
    h = displayed.h;
  }
  cropState.box = {
    x: (displayed.w - w) / 2,
    y: (displayed.h - h) / 2,
    w, h,
  };
  applyCropBox();
}

function applyCropBox() {
  const boxEl = document.getElementById("cropBox");
  const { box, natural, displayed } = cropState;
  boxEl.style.left = box.x + "px";
  boxEl.style.top = box.y + "px";
  boxEl.style.width = box.w + "px";
  boxEl.style.height = box.h + "px";
  // Final size label (natural pixels)
  const finalW = Math.round(box.w * (natural.w / displayed.w));
  const finalH = Math.round(box.h * (natural.h / displayed.h));
  const sizeEl = document.getElementById("cropSizeLabel");
  if (sizeEl) sizeEl.textContent = finalW + "×" + finalH + " px";
}

function clampBox() {
  const { box, displayed, ratio } = cropState;
  // Clamp size
  if (box.w < 24) box.w = 24;
  if (box.h < 24) box.h = 24;
  if (ratio) {
    box.h = box.w / ratio;
  }
  if (box.w > displayed.w) { box.w = displayed.w; if (ratio) box.h = box.w / ratio; }
  if (box.h > displayed.h) { box.h = displayed.h; if (ratio) box.w = box.h * ratio; }
  // Clamp position
  if (box.x < 0) box.x = 0;
  if (box.y < 0) box.y = 0;
  if (box.x + box.w > displayed.w) box.x = displayed.w - box.w;
  if (box.y + box.h > displayed.h) box.y = displayed.h - box.h;
}

function onCropPointerDown(e) {
  const target = e.target.closest(".crop-handle, .crop-box");
  if (!target) return;
  e.preventDefault();
  const handle = target.dataset.handle || null;
  cropState.drag = {
    mode: handle ? "resize" : "move",
    handle,
    startX: e.clientX,
    startY: e.clientY,
    startBox: { ...cropState.box },
  };
  document.addEventListener("pointermove", onCropPointerMove);
  document.addEventListener("pointerup", onCropPointerUp, { once: true });
}

function onCropPointerMove(e) {
  const d = cropState.drag;
  if (!d) return;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  const b = { ...d.startBox };
  const { ratio } = cropState;

  if (d.mode === "move") {
    b.x += dx;
    b.y += dy;
  } else {
    // Resize from a corner. For aspect-locked, the dominant axis drives the size.
    let newW = b.w, newH = b.h, newX = b.x, newY = b.y;
    if (d.handle === "br") {
      newW = b.w + dx; newH = ratio ? newW / ratio : b.h + dy;
    } else if (d.handle === "tr") {
      newW = b.w + dx;
      newH = ratio ? newW / ratio : b.h - dy;
      newY = b.y + (b.h - newH);
    } else if (d.handle === "bl") {
      newW = b.w - dx;
      newX = b.x + (b.w - newW);
      newH = ratio ? newW / ratio : b.h + dy;
    } else if (d.handle === "tl") {
      newW = b.w - dx;
      newX = b.x + (b.w - newW);
      newH = ratio ? newW / ratio : b.h - dy;
      newY = b.y + (b.h - newH);
    }
    b.w = newW; b.h = newH; b.x = newX; b.y = newY;
  }
  cropState.box = b;
  clampBox();
  applyCropBox();
}

function onCropPointerUp() {
  cropState.drag = null;
  document.removeEventListener("pointermove", onCropPointerMove);
}

async function commitCrop() {
  const img = document.getElementById("cropImg");
  const { box, displayed, natural } = cropState;

  if (!displayed.w || !displayed.h || !natural.w || !natural.h) {
    throw new Error("Recorte invalido: el editor no midio la imagen (displayed " + displayed.w + "x" + displayed.h + ", natural " + natural.w + "x" + natural.h + "). Cancela y reintenta.");
  }
  if (box.w <= 0 || box.h <= 0) {
    throw new Error("Recorte invalido: la caja de seleccion tiene tamano 0. Arrastra las esquinas para definir el area.");
  }

  // Map displayed box back to natural pixels
  const sx = box.x * (natural.w / displayed.w);
  const sy = box.y * (natural.h / displayed.h);
  const sw = box.w * (natural.w / displayed.w);
  const sh = box.h * (natural.h / displayed.h);

  // Cap output to a reasonable maximum dimension to keep file size sane
  const MAX_W = 2400;
  let outW = Math.round(sw);
  let outH = Math.round(sh);
  if (outW > MAX_W) {
    const r = MAX_W / outW;
    outW = MAX_W;
    outH = Math.round(outH * r);
  }

  if (outW <= 0 || outH <= 0) {
    throw new Error("Recorte invalido: dimensiones de salida " + outW + "x" + outH + ". Reintenta con un recorte mas grande.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas.toBlob devolvio null (canvas " + outW + "x" + outH + "). Posible: imagen muy grande o memoria insuficiente."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.9);
  });
}

function closeCropModal(blob) {
  const overlay = document.getElementById("cropOverlay");
  overlay.classList.remove("active");
  const r = cropState.resolve;
  cropState.resolve = null;
  cropState.drag = null;
  document.removeEventListener("pointermove", onCropPointerMove);
  if (r) r(blob || null);
}

// Wire crop modal once the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const box = document.getElementById("cropBox");
  const stage = document.getElementById("cropStage");
  const closeBtn = document.getElementById("cropCloseBtn");
  const cancelBtn = document.getElementById("cropCancelBtn");
  const confirmBtn = document.getElementById("cropConfirmBtn");
  const overlay = document.getElementById("cropOverlay");
  if (!box || !confirmBtn) return;

  box.addEventListener("pointerdown", onCropPointerDown);
  if (closeBtn) closeBtn.addEventListener("click", () => closeCropModal(null));
  if (cancelBtn) cancelBtn.addEventListener("click", () => closeCropModal(null));
  if (overlay) overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCropModal(null);
  });
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = "0.7";
    try {
      const blob = await commitCrop();
      if (!blob) {
        // Defensive: commitCrop now always throws on failure, but just in case
        notify("E110", "El recorte no produjo imagen. Intenta de nuevo o cancela.");
        return;
      }
      closeCropModal(blob);
    } catch (err) {
      console.error("[crop] commit failed:", err);
      notify("E110", err.message || "Error al recortar");
      // Keep modal open so the user can adjust the crop and retry
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = "";
    }
  });
});

// ─── ERROR/EVENT CODE CATALOG ───
// Keep this object in sync with docs/error-codes.md
const ERROR_CODES = {
  // Success codes — confirm to the user that things ARE working
  OK001: { sev: "ok", persist: false, title: "Sistema cargado correctamente",  msg: "Bunny CDN conectado, Firestore conectado, catalogo listo.", fix: null },
  OK002: { sev: "ok", persist: false, title: "Imagen subida y publicada",      msg: "El archivo esta en Bunny CDN y guardado en Firestore.",     fix: null },
  OK003: { sev: "ok", persist: false, title: "Categoria guardada",             msg: "Cambios aplicados en Firestore.",                            fix: null },
  OK004: { sev: "ok", persist: false, title: "Producto guardado",              msg: "Cambios aplicados en Firestore.",                            fix: null },
  OK005: { sev: "ok", persist: false, title: "Producto eliminado",             msg: "Removido de Firestore. Imagen del CDN tambien borrada.",     fix: null },
  OK006: { sev: "ok", persist: false, title: "Categoria eliminada",            msg: "Categoria y sus productos hijos removidos.",                 fix: null },
  OK007: { sev: "ok", persist: false, title: "Orden actualizado",              msg: "Nuevo orden persistido en Firestore.",                       fix: null },
  OK008: { sev: "ok", persist: false, title: "Configuracion guardada",         msg: "Settings actualizados en Firestore.",                        fix: null },


  // Bunny CDN
  E101: { sev: "error", persist: true,  title: "API key de Bunny invalida",         msg: "Las subidas a Bunny CDN no funcionaran hasta que arregles la API key.",                fix: "Copia la FTP Password desde Bunny Dashboard → Storage Zone \"muebleria-palito\" → FTP & API Access. Pegala en js/firebase-config.js:30. Despues Cmd+Shift+R en el admin." },
  E102: { sev: "error", persist: true,  title: "Cuenta de Bunny sin balance",       msg: "Bunny rechaza las requests porque la cuenta esta suspendida por falta de pago.",       fix: "Recarga balance en https://dash.bunny.net → Billing. El servicio reanuda al instante una vez con saldo." },
  E103: { sev: "error", persist: true,  title: "Storage Zone no encontrada",        msg: "El zoneName no existe en tu cuenta de Bunny.",                                          fix: "Verifica BUNNY_CDN.zoneName en js/firebase-config.js. Debe coincidir con el nombre exacto del zone." },
  E104: { sev: "error", persist: true,  title: "Cuota de Bunny excedida",           msg: "El storage zone esta lleno y no acepta uploads.",                                       fix: "Borra archivos viejos en Bunny File Manager o sube de plan." },
  E105: { sev: "error", persist: false, title: "Sin conexion a Bunny",              msg: "No se pudo alcanzar el servidor de Bunny. Verifica tu conexion.",                       fix: "Prueba abrir https://br.storage.bunnycdn.com en otra pestana. Si falla, es red local." },
  E106: { sev: "error", persist: false, title: "Bunny tuvo un error de servidor",   msg: "Bunny devolvio 5xx — su lado.",                                                         fix: "Esperá 1-2 min y reintenta. Si persiste: https://status.bunny.net" },
  E107: { sev: "warn",  persist: false, title: "Imagen no se borro del CDN",        msg: "El item se elimino de Firestore pero la imagen quedo en Bunny.",                       fix: "Es solo espacio en disco. Borra manual desde Bunny → File Manager si te molesta." },
  E108: { sev: "error", persist: true,  title: "Manifest de productos no se actualizo",  msg: "regenerateProductsManifest fallo. El catalogo sigue funcionando pero el manifest CDN no.", fix: "Mismo arreglo que E101. Verifica la API key." },
  E109: { sev: "warn",  persist: false, title: "Purge de cache CDN fallo",          msg: "La imagen nueva podria tardar hasta 60s en propagarse.",                                fix: "Esperar o purgar manual desde Bunny Dashboard → Pull Zones → Purge." },
  E110: { sev: "error", persist: false, title: "Recorte fallido",                   msg: "El editor de recorte no pudo generar la imagen final.",                                  fix: "Cancela el modal, asegurate de que la imagen no sea enorme (> 20 MB) y reintenta. Si vuelve a pasar, sube una imagen mas chica." },

  // Firestore
  E201: { sev: "error", persist: true,  title: "Firestore: permiso denegado",       msg: "Las reglas de seguridad rechazaron la operacion.",                                       fix: "Verifica que estas logueado. Revisar reglas en Firebase Console → Firestore → Rules." },
  E202: { sev: "error", persist: false, title: "Documento no encontrado",           msg: "El item que intentabas modificar ya no existe en Firestore.",                            fix: "Recarga el admin para refrescar el cache local." },
  E203: { sev: "error", persist: true,  title: "Cuota de Firestore excedida",       msg: "El proyecto excedio el limite de lecturas/escrituras del dia.",                          fix: "Esperar al reset (24h) o subir plan en Firebase Console." },
  E204: { sev: "error", persist: false, title: "No se pudo crear la categoria",     msg: "Firestore rechazo la creacion.",                                                         fix: "Mira el detalle en consola. Posible: slug duplicado o campos invalidos." },
  E205: { sev: "error", persist: false, title: "No se pudo actualizar la categoria",msg: "Firestore rechazo el update.",                                                           fix: "Reintenta. Si persiste, recargar admin." },
  E206: { sev: "error", persist: false, title: "No se pudo borrar la categoria",    msg: "Algun producto hijo o regla bloqueo el delete.",                                         fix: "Verificar en seccion Categorias si hay productos huerfanos." },
  E207: { sev: "error", persist: false, title: "No se pudo crear el producto",      msg: "Firestore rechazo la creacion del producto.",                                            fix: "Mira el detalle en consola. Verifica que la categoria existe." },
  E208: { sev: "error", persist: false, title: "No se pudo actualizar el producto", msg: "Firestore rechazo el update.",                                                           fix: "Reintenta. Tu input se mantiene en el form." },
  E209: { sev: "error", persist: false, title: "No se pudo borrar el producto",     msg: "Firestore rechazo el delete.",                                                           fix: "Reintenta. La imagen en Bunny puede quedar huerfana (ver E107)." },
  E210: { sev: "error", persist: false, title: "Settings no se guardaron",          msg: "Firestore rechazo la escritura de settings.",                                            fix: "Reintenta. El form mantiene tus cambios." },
  E211: { sev: "warn",  persist: false, title: "Orden de destacados no se guardo",  msg: "El reorden quedo local. La proxima vez que cargues el admin se pierde.",                fix: "Reintentar el reorden cuando la red este OK." },
  E212: { sev: "error", persist: true,  title: "Seed inicial fallo",                msg: "No se pudo inicializar settings en Firestore.",                                          fix: "Recargar. Verifica firebase-config.js y reglas." },

  // Validación / UI
  E303: { sev: "warn",  persist: false, title: "Imagen demasiado grande",           msg: "El archivo supera el limite recomendado (10 MB).",                                       fix: "Comprimi/redimensiona antes de subir." },
  E304: { sev: "warn",  persist: false, title: "Tipo de archivo no soportado",      msg: "Solo se aceptan imagenes JPG, PNG, WebP.",                                                fix: "Convertir a uno de esos formatos." },

  // Auth
  E401: { sev: "error", persist: false, title: "Login fallido",                     msg: "El email/password no son validos o la cuenta esta deshabilitada.",                       fix: "Verificar credenciales. Si la cuenta existe pero no entra, resetear desde Firebase Console." },
  E402: { sev: "warn",  persist: true,  title: "Sesion expirada",                   msg: "Tu token de Firebase se vencio mientras editabas.",                                      fix: "Recargar el admin para re-autenticar." },

  // App
  E502: { sev: "warn",  persist: false, title: "Lista no se refresco",              msg: "Despues del cambio, la lista del dashboard quedo desactualizada.",                       fix: "Recargar el admin como workaround. Reportar como bug." },
  E503: { sev: "warn",  persist: false, title: "Thumbnail vieja en cache",          msg: "El thumb sigue mostrando la imagen vieja por cache del CDN.",                            fix: "Esperar 60s o purgar manual (ver E109)." },
};

// Map HTTP status codes from Bunny → error code
function bunnyCodeFromStatus(status) {
  if (status === 401) return "E101";
  if (status === 402) return "E102";
  if (status === 404) return "E103";
  if (status === 507) return "E104";
  if (status >= 500) return "E106";
  return "E106";
}

// Map Firestore error → error code (uses err.code from Firebase SDK)
function firestoreCodeFromError(err, defaultCode) {
  const c = err && err.code;
  if (c === "permission-denied") return "E201";
  if (c === "not-found")         return "E202";
  if (c === "resource-exhausted")return "E203";
  if (c === "unauthenticated")   return "E402";
  return defaultCode;
}

// ─── NOTIFICATION SYSTEM ───
const _notifIds = new Map();   // code → element (for dedupe on persistent codes)
let _notifSeq = 0;

function notify(code, detail) {
  const def = ERROR_CODES[code];
  if (!def) {
    console.warn("[notify] unknown code:", code, detail);
    return;
  }
  const stack = document.getElementById("notifStack");
  if (!stack) return;

  // Dedupe persistent notifications by code (don't pile up duplicates)
  if (def.persist && _notifIds.has(code)) {
    const existing = _notifIds.get(code);
    if (existing && existing.isConnected) return; // already showing
  }

  const id = "notif-" + (++_notifSeq);
  const root = document.createElement("div");
  root.id = id;
  root.className = "notif notif-" + (def.sev === "error" ? "error" : def.sev === "ok" ? "ok" : "warn");

  // Head: code badge · title · close
  const head = document.createElement("div");
  head.className = "notif-head";

  const codeEl = document.createElement("button");
  codeEl.type = "button";
  codeEl.className = "notif-code";
  codeEl.textContent = code;
  codeEl.title = "Click para copiar el codigo";
  codeEl.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      codeEl.classList.add("copied");
      const orig = codeEl.textContent;
      codeEl.textContent = "✓ " + orig;
      setTimeout(() => { codeEl.classList.remove("copied"); codeEl.textContent = orig; }, 1200);
    } catch {}
  });

  const titleEl = document.createElement("div");
  titleEl.className = "notif-title";
  titleEl.textContent = def.title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "notif-close";
  closeBtn.setAttribute("aria-label", "Cerrar notificacion " + code);
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => dismissNotif(root));

  head.append(codeEl, titleEl, closeBtn);

  const msg = document.createElement("p");
  msg.className = "notif-msg";
  msg.textContent = def.msg + (detail ? "  ·  " + detail : "");

  root.append(head, msg);

  if (def.fix) {
    const details = document.createElement("details");
    details.className = "notif-fix";
    const summary = document.createElement("summary");
    summary.textContent = "Como arreglar";
    const body = document.createElement("div");
    body.className = "notif-fix-body";
    body.textContent = def.fix;
    details.append(summary, body);
    root.appendChild(details);
  }

  stack.appendChild(root);
  if (def.persist) _notifIds.set(code, root);

  if (!def.persist) {
    const ttl = def.sev === "error" ? 6500 : def.sev === "warn" ? 5500 : 3500;
    setTimeout(() => dismissNotif(root), ttl);
  }
  console.log("[" + code + "] " + def.title + (detail ? " · " + detail : ""));
}

function dismissNotif(root) {
  if (!root || !root.isConnected) return;
  root.classList.add("leaving");
  setTimeout(() => {
    if (!root.isConnected) return;
    // Clean dedupe entry if this was a persistent one
    for (const [k, v] of _notifIds.entries()) { if (v === root) _notifIds.delete(k); }
    root.remove();
  }, 180);
}

// Shortcut for error paths
function notifyError(code, detail) { notify(code, detail); }
function notifyOk(code, detail)    { notify(code, detail); }

// ─── FRIENDLY FORM VALIDATION ───
// Renders inline error messages under fields and highlights the input.
// Returns true when all checks pass.
function validateFields(checks) {
  // Clear previous errors
  document.querySelectorAll(".field-error").forEach(n => n.remove());
  document.querySelectorAll(".form-group.field-invalid").forEach(n => n.classList.remove("field-invalid"));

  let firstInvalid = null;
  for (const c of checks) {
    if (c.valid) continue;
    const el = document.getElementById(c.id);
    if (!el) continue;
    const group = el.closest(".form-group") || el.parentElement;
    if (group) group.classList.add("field-invalid");
    const msg = document.createElement("span");
    msg.className = "field-error";
    msg.textContent = c.msg;
    (group || el.parentElement).appendChild(msg);
    if (!firstInvalid) firstInvalid = el;
  }
  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => firstInvalid.focus({ preventScroll: true }), 200);
  }
  return !firstInvalid;
}

function clearFieldErrors(formEl) {
  if (!formEl) {
    document.querySelectorAll(".field-error").forEach(n => n.remove());
    document.querySelectorAll(".form-group.field-invalid").forEach(n => n.classList.remove("field-invalid"));
    return;
  }
  formEl.querySelectorAll(".field-error").forEach(n => n.remove());
  formEl.querySelectorAll(".form-group.field-invalid").forEach(n => n.classList.remove("field-invalid"));
}

// ─── UPLOAD TOAST (visible upload state) ───
let _uploadToastTimer = null;
function showUploadToast(state, title, sub) {
  const toast = document.getElementById("uploadToast");
  if (!toast) return;
  if (_uploadToastTimer) { clearTimeout(_uploadToastTimer); _uploadToastTimer = null; }

  toast.classList.remove("hidden", "ok", "err");
  if (state === "ok") toast.classList.add("ok");
  if (state === "err") toast.classList.add("err");

  toast.replaceChildren();
  const icon = document.createElement("div");
  icon.className = "upload-toast-icon";
  if (state === "busy") {
    const sp = document.createElement("div");
    sp.className = "upload-toast-spinner";
    icon.appendChild(sp);
  } else if (state === "ok") {
    icon.appendChild(makeSvg("0 0 24 24", [["polyline", { points: "20 6 9 17 4 12" }]]));
  } else if (state === "err") {
    icon.appendChild(makeSvg("0 0 24 24", [
      ["circle", { cx: "12", cy: "12", r: "10" }],
      ["line",   { x1: "12", y1: "8",  x2: "12", y2: "12" }],
      ["line",   { x1: "12", y1: "16", x2: "12.01", y2: "16" }],
    ]));
  }
  const body = document.createElement("div");
  body.className = "upload-toast-body";
  const t = document.createElement("div");
  t.className = "upload-toast-title";
  t.textContent = title;
  body.appendChild(t);
  if (sub) {
    const s = document.createElement("div");
    s.className = "upload-toast-sub";
    s.textContent = sub;
    body.appendChild(s);
  }
  toast.append(icon, body);

  if (state === "ok") {
    _uploadToastTimer = setTimeout(() => hideUploadToast(), 2400);
  } else if (state === "err") {
    _uploadToastTimer = setTimeout(() => hideUploadToast(), 5500);
  }
}
function hideUploadToast() {
  const toast = document.getElementById("uploadToast");
  if (toast) {
    toast.classList.add("hidden");
    toast.replaceChildren();
  }
  if (_uploadToastTimer) { clearTimeout(_uploadToastTimer); _uploadToastTimer = null; }
}

// ─── IN-PLACE FEEDBACK OVERLAY ───
// Paints a big green check (success) or red X with the error message (failure)
// directly on top of the upload card the user clicked. So the user doesn't have
// to look at the corner toast or the console.
function flashCardFeedback(targetEl, mode, message) {
  if (!targetEl) return;
  // Remove any previous feedback overlay on this target
  targetEl.querySelectorAll(":scope > .img-feedback").forEach(n => n.remove());

  const fb = document.createElement("div");
  fb.className = "img-feedback " + (mode === "ok" ? "ok" : "err");

  const iconWrap = document.createElement("div");
  iconWrap.className = "img-feedback-icon";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  if (mode === "ok") {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M5 12 l5 5 L19 7");
    svg.appendChild(p);
  } else {
    const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l1.setAttribute("x1","7"); l1.setAttribute("y1","7");
    l1.setAttribute("x2","17"); l1.setAttribute("y2","17");
    const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l2.setAttribute("x1","17"); l2.setAttribute("y1","7");
    l2.setAttribute("x2","7"); l2.setAttribute("y2","17");
    svg.appendChild(l1); svg.appendChild(l2);
  }
  iconWrap.appendChild(svg);

  const label = document.createElement("div");
  label.className = "img-feedback-label";
  label.textContent = mode === "ok" ? "Guardada" : "Error";

  fb.append(iconWrap, label);

  if (mode === "err" && message) {
    const msg = document.createElement("div");
    msg.className = "img-feedback-msg";
    msg.textContent = String(message).slice(0, 140);
    fb.appendChild(msg);
    // Click dismisses the error overlay
    fb.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fb.remove(); });
  }

  targetEl.appendChild(fb);
  // Force reflow then add .show so the transition runs
  void fb.offsetWidth;
  fb.classList.add("show");

  if (mode === "ok") {
    setTimeout(() => {
      fb.classList.remove("show");
      setTimeout(() => fb.remove(), 260);
    }, 1500);
  }
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

  // Optional: an element to anchor the big inline feedback overlay onto.
  // Defaults to the parent of the preview thumb (the upload card).
  function getFeedbackTarget() {
    if (opts.feedbackTargetId) {
      const t = document.getElementById(opts.feedbackTargetId);
      if (t) return t;
    }
    if (previewEl && previewEl.parentElement) return previewEl.parentElement;
    return null;
  }

  fileEl.addEventListener("change", async function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const label = opts.cropLabel || "imagen";
    const fbTarget = getFeedbackTarget();
    console.log("[uploader] change fired · file=" + file.name + " · target=" + (fbTarget && fbTarget.id ? "#" + fbTarget.id : (fbTarget ? fbTarget.tagName : "MISSING")));
    if (!fbTarget) {
      console.warn("[uploader] No feedback target found. previewId=" + (opts.previewId || "(none)") + " feedbackTargetId=" + (opts.feedbackTargetId || "(none)"));
    }

    // Step 1: optional crop step before upload
    let toUpload = file;
    if (opts.cropAspectRatio) {
      setStatus("Abre el editor de recorte...", "busy");
      const blob = await openCropModal(file, opts.cropAspectRatio, opts.cropLabel);
      if (!blob) {
        setStatus("", null);
        fileEl.value = "";
        return; // user cancelled
      }
      const baseName = file.name.replace(/\.[^.]+$/, "");
      toUpload = new File([blob], baseName + ".jpg", { type: "image/jpeg" });
    }

    const localUrl = URL.createObjectURL(toUpload);
    if (previewEl) {
      previewEl.src = localUrl;
      previewEl.style.display = "block";
      if (previewWrap) previewWrap.classList.remove("empty");
    }
    setStatus("Subiendo imagen...", "busy");
    if (spinnerEl) spinnerEl.classList.remove("hidden");
    showUploadToast("busy", "Subiendo a Bunny CDN...", Math.round(toUpload.size / 1024) + " KB · " + label);
    console.log("[uploader] PUT to Bunny starting · folder=" + folder + " · " + Math.round(toUpload.size / 1024) + "KB");

    let bunnyOk = false;
    let cdnUrl = null;
    try {
      cdnUrl = await uploadImageToBunny(toUpload, folder);
      bunnyOk = true;
      console.log("[uploader] Bunny PUT OK · " + cdnUrl);
      if (urlEl) urlEl.value = cdnUrl;
      if (previewEl) previewEl.src = cdnUrl;
      setStatus("Imagen subida correctamente", "ok");
      showUploadToast("ok", "Imagen subida", label.charAt(0).toUpperCase() + label.slice(1) + " actualizada en el sitio.");
      flashCardFeedback(fbTarget, "ok");
    } catch (err) {
      console.error("[uploader] Bunny PUT failed:", err);
      const detail = err.message || "Error desconocido";
      setStatus(detail, "err");
      showUploadToast("err", "Subida fallida", detail);
      flashCardFeedback(fbTarget, "err", detail);
    }

    if (bunnyOk && typeof opts.onUploaded === "function") {
      try {
        console.log("[uploader] onUploaded callback starting · " + cdnUrl);
        await opts.onUploaded(cdnUrl);
        console.log("[uploader] onUploaded OK");
      } catch (saveErr) {
        console.error("[uploader] Firestore save failed:", saveErr);
        const detail = "Firestore: " + (saveErr.message || "error desconocido");
        setStatus(detail, "err");
        showUploadToast("err", "Guardar en Firestore fallo", detail);
        flashCardFeedback(fbTarget, "err", detail);
      }
    }

    if (spinnerEl) spinnerEl.classList.add("hidden");
    fileEl.value = "";
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
  setHomeThumb("bannerImgThumb", s.promoBanner?.image || "");
  setHomeThumb("lifestyleImgThumb", s.lifestyle?.imageUrl || "");
  ["bannerImgStatus", "lifestyleImgStatus", "heroSlidesStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.remove("ok", "err", "busy"); }
  });
  renderHeroSlides();
}

// ─── HERO SLIDES (image + video) ───
function getHeroSlides() {
  const hero = (settings && settings.heroSection) || {};
  let slides = Array.isArray(hero.slides) ? hero.slides.filter(s => s && s.url) : [];
  // Backward compat: if there's a legacy bgImage but no slides array, treat
  // it as one image slide so the user sees their current Hero in the editor.
  if (!slides.length && hero.bgImage) {
    slides = [{ type: "image", url: hero.bgImage }];
  }
  return slides;
}

function renderHeroSlides() {
  const list = document.getElementById("heroSlidesList");
  if (!list) return;
  list.replaceChildren();
  const slides = getHeroSlides();
  slides.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "hero-slide-row";

    const thumb = document.createElement("div");
    thumb.className = "hero-slide-thumb";
    if (s.type === "video") {
      const v = document.createElement("video");
      v.src = s.url;
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.preload = "metadata";
      thumb.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = s.url;
      img.alt = "";
      img.onerror = () => { img.src = PLACEHOLDER_IMG; img.onerror = null; };
      thumb.appendChild(img);
    }
    const typeBadge = document.createElement("span");
    typeBadge.className = "hero-slide-type" + (s.type === "video" ? " vid" : "");
    typeBadge.textContent = s.type === "video" ? "VID" : "IMG";
    thumb.appendChild(typeBadge);

    const info = document.createElement("div");
    info.className = "hero-slide-info";
    const pos = document.createElement("span");
    pos.className = "hero-slide-pos";
    pos.textContent = "Slide " + (i + 1);
    const meta = document.createElement("span");
    meta.className = "hero-slide-meta";
    meta.textContent = s.type === "video" ? "video · duracion completa" : "imagen · 5 s";
    info.append(pos, meta);

    const actions = document.createElement("div");
    actions.className = "hero-slide-actions";
    const upBtn = document.createElement("button");
    upBtn.type = "button"; upBtn.className = "hero-slide-btn"; upBtn.textContent = "↑";
    upBtn.title = "Subir"; upBtn.disabled = i === 0;
    upBtn.addEventListener("click", () => moveHeroSlide(i, -1));
    const dnBtn = document.createElement("button");
    dnBtn.type = "button"; dnBtn.className = "hero-slide-btn"; dnBtn.textContent = "↓";
    dnBtn.title = "Bajar"; dnBtn.disabled = i === slides.length - 1;
    dnBtn.addEventListener("click", () => moveHeroSlide(i, 1));
    const delBtn = document.createElement("button");
    delBtn.type = "button"; delBtn.className = "hero-slide-btn danger"; delBtn.textContent = "×";
    delBtn.title = "Borrar";
    delBtn.addEventListener("click", () => deleteHeroSlide(i));
    actions.append(upBtn, dnBtn, delBtn);

    row.append(thumb, info, actions);
    list.appendChild(row);
  });
}

async function moveHeroSlide(idx, dir) {
  const slides = getHeroSlides();
  const tgt = idx + dir;
  if (tgt < 0 || tgt >= slides.length) return;
  [slides[idx], slides[tgt]] = [slides[tgt], slides[idx]];
  try {
    await saveHomeImage("heroSection.slides", slides);
    renderHeroSlides();
    notify("OK007", "Slide #" + (idx + 1) + " ↔ #" + (tgt + 1));
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E210"), err.message);
  }
}

async function deleteHeroSlide(idx) {
  const slides = getHeroSlides();
  const s = slides[idx];
  if (!s) return;
  if (!window.confirm("Borrar este slide del Hero?")) return;
  const updated = slides.slice(0, idx).concat(slides.slice(idx + 1));
  try {
    await saveHomeImage("heroSection.slides", updated);
    // Best-effort: remove file from Bunny CDN. If it fails, file just stays orphaned.
    try { await deleteImageFromBunny(s.url); }
    catch (e) { notify("E107", e.message); }
    renderHeroSlides();
    notify("OK005", "Slide eliminado");
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E210"), err.message);
  }
}

async function handleHeroSlideUpload(file) {
  if (!file) return;
  const isVideo = file.type && file.type.startsWith("video/");
  const card = document.getElementById("heroSlidesCard");
  const statusEl = document.getElementById("heroSlidesStatus");
  const setStatus = (text, mode) => {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.remove("ok", "err", "busy");
    if (mode) statusEl.classList.add(mode);
  };

  let toUpload = file;
  if (!isVideo) {
    setStatus("Abre el editor de recorte...", "busy");
    const blob = await openCropModal(file, CROP_RATIO.hero, "el slide del Hero");
    if (!blob) { setStatus("", null); return; }
    const baseName = (file.name || "slide").replace(/\.[^.]+$/, "");
    toUpload = new File([blob], baseName + ".jpg", { type: "image/jpeg" });
  }

  setStatus("Subiendo a Bunny CDN... (" + Math.round(toUpload.size / 1024) + " KB)", "busy");
  showUploadToast("busy", "Subiendo slide del Hero", Math.round(toUpload.size / 1024) + " KB · " + (isVideo ? "video" : "imagen"));
  try {
    const cdnUrl = await uploadImageToBunny(toUpload, "hero-slides");
    const updated = [...getHeroSlides(), { type: isVideo ? "video" : "image", url: cdnUrl }];
    await saveHomeImage("heroSection.slides", updated);
    renderHeroSlides();
    setStatus("Slide agregado", "ok");
    showUploadToast("ok", "Slide agregado", isVideo ? "Video listo en el slider." : "Imagen lista en el slider.");
    flashCardFeedback(card, "ok");
    notify("OK002", isVideo ? "Video al Hero (" + updated.length + " slides)" : "Imagen al Hero (" + updated.length + " slides)");
  } catch (err) {
    console.error("[hero-slide] upload failed:", err);
    const detail = err.message || "Error desconocido";
    setStatus(detail, "err");
    showUploadToast("err", "No se pudo agregar el slide", detail);
    flashCardFeedback(card, "err", detail);
  }
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

  // Hero slider — uses its own dedicated handler (supports image + video)
  const addSlideBtn = document.getElementById("addHeroSlideBtn");
  const slideFile = document.getElementById("heroSlideFile");
  if (addSlideBtn && slideFile && !addSlideBtn.dataset.wired) {
    addSlideBtn.dataset.wired = "1";
    addSlideBtn.addEventListener("click", () => {
      slideFile.value = "";
      slideFile.click();
    });
    slideFile.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await handleHeroSlideUpload(file);
      slideFile.value = "";
    });
  }

  wire('[data-trigger="bannerImgFile"]', {
    fileInputId: "bannerImgFile",
    previewId: "bannerImgThumb",
    statusId: "bannerImgStatus",
    spinnerId: "bannerImgSpinner",
    statusClass: "home-img-status",
    folder: "site",
    cropAspectRatio: CROP_RATIO.banner,
    cropLabel: "el Banner",
    onUploaded: async (url) => {
      try {
        await saveHomeImage("promoBanner.image", url);
        notify("OK002", "Banner Credito Directo");
      } catch (err) {
        notifyError(firestoreCodeFromError(err, "E210"), "Banner subido pero settings no se guardo: " + err.message);
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
    cropAspectRatio: CROP_RATIO.lifestyle,
    cropLabel: "el bloque de Asesoria",
    onUploaded: async (url) => {
      try {
        await saveHomeImage("lifestyle.imageUrl", url);
        notify("OK002", "Asesoria personalizada");
      } catch (err) {
        notifyError(firestoreCodeFromError(err, "E210"), "Lifestyle subido pero settings no se guardo: " + err.message);
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

// Garantiza que los editores de "Paleta de colores" y "Materiales" existan en
// el formulario de settings. Si el navegador sirve un admin/index.html viejo en
// caché (sin estas tarjetas), las crea dinámicamente — así aparecen siempre que
// cargue este JS (que sí se versiona con ?v=), sin depender del caché del HTML.
// Idempotente: no duplica si ya existen. También cablea sus botones "+".
function ensureStandardsUI() {
  const form = document.getElementById("settingsForm");
  if (!form) return;

  // Se insertan ARRIBA del formulario (no al final) para que sean lo primero
  // visible en Configuracion.
  let paletteCard = null;
  if (!document.getElementById("paletteColors")) {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.style.padding = "24px";
    card.innerHTML =
      '<h3 style="margin:0 0 4px">Paleta de colores estandar</h3>' +
      '<p style="font-size:12px;color:var(--gray);margin:0 0 16px">Estos colores son los que podras elegir al cargar un producto. El nombre es solo para identificarlos aqui (el cliente ve solo el cuadrito).</p>' +
      '<div id="paletteColors"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="addPaletteColorBtn" style="margin-top:10px">+ Agregar color</button>';
    form.insertBefore(card, form.firstChild);
    paletteCard = card;
  } else {
    paletteCard = document.getElementById("paletteColors").closest(".admin-card");
  }

  if (!document.getElementById("materialList")) {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.style.padding = "24px";
    card.innerHTML =
      '<h3 style="margin:0 0 4px">Materiales estandar</h3>' +
      '<p style="font-size:12px;color:var(--gray);margin:0 0 16px">Estos materiales son los que podras marcar en cada producto.</p>' +
      '<div id="materialList"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="addMaterialBtn" style="margin-top:10px">+ Agregar material</button>';
    if (paletteCard && paletteCard.parentElement === form) {
      form.insertBefore(card, paletteCard.nextSibling);
    } else {
      form.insertBefore(card, form.firstChild);
    }
  }

  // Cableado idempotente (onclick reemplaza, no acumula listeners).
  const addColorBtn = document.getElementById("addPaletteColorBtn");
  if (addColorBtn) addColorBtn.onclick = () => addPaletteColorRow();
  const addMatBtn = document.getElementById("addMaterialBtn");
  if (addMatBtn) addMatBtn.onclick = () => addMaterialRow();
}

// ─── PALETA DE COLORES ESTANDAR (settings) ───
function addPaletteColorRow(data = {}) {
  const container = document.getElementById("paletteColors");
  const row = document.createElement("div");
  row.className = "color-input-wrap";
  row.style.marginTop = "8px";
  row.dataset.paletteRow = "1";

  const color = document.createElement("input");
  color.type = "color";
  color.value = data.hex || "#8b7355";
  color.dataset.paletteHex = "1";

  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "Nombre (ej. Cafe)";
  name.value = data.name || "";
  name.dataset.paletteName = "1";
  name.style.flex = "1";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(color, name, remove);
  container.appendChild(row);
}

function readPaletteColors() {
  return [...document.querySelectorAll("[data-palette-row]")].map(row => ({
    hex: row.querySelector("[data-palette-hex]").value,
    name: row.querySelector("[data-palette-name]").value.trim(),
  })).filter(c => c.hex);
}

// ─── LISTA DE MATERIALES ESTANDAR (settings) ───
function addMaterialRow(value = "") {
  const container = document.getElementById("materialList");
  const row = document.createElement("div");
  row.className = "color-input-wrap";
  row.style.marginTop = "8px";
  row.dataset.materialRow = "1";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Nombre del material (ej. Madera)";
  input.value = value;
  input.dataset.materialName = "1";
  input.style.flex = "1";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(input, remove);
  container.appendChild(row);
}

function readMaterialList() {
  return [...document.querySelectorAll("[data-material-row]")]
    .map(row => row.querySelector("[data-material-name]").value.trim())
    .filter(Boolean);
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

  ensureStandardsUI();
  const palBox = document.getElementById("paletteColors");
  if (palBox) { palBox.replaceChildren(); (s.colorPalette || []).forEach(c => addPaletteColorRow(c)); }
  const matBox = document.getElementById("materialList");
  if (matBox) { matBox.replaceChildren(); (s.materialList || []).forEach(m => addMaterialRow(m)); }
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
  // Preserve the SVG icon — only replace the text node, not the whole content
  const originalHTML = btn.innerHTML;
  btn.replaceChildren(document.createTextNode("Guardando..."));

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
    colorPalette: readPaletteColors(),
    materialList: readMaterialList(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, COL_SETTINGS, "store"), data, { merge: true });
    settings = { ...settings, ...data };
    notify("OK008");
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E210"), err.message);
  }

  btn.disabled = false;
  btn.innerHTML = originalHTML;
});

document.getElementById("resetSettingsBtn").addEventListener("click", () => populateSettingsForm());
// Los botones "+ Agregar color/material" se cablean en ensureStandardsUI()
// (llamado desde populateSettingsForm), para que funcionen tanto si el HTML
// trae las tarjetas como si las crea el JS por caché viejo.

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
    notifyError(firestoreCodeFromError(err, "E212"), err.message);
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
    folder: "categories",
    cropAspectRatio: CROP_RATIO.category,
    cropLabel: "la categoria",
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
  clearFieldErrors(document.getElementById("categoryForm"));
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

  // Friendly validation — block save if required fields are missing
  const okValid = validateFields([
    { id: "catName",     valid: name.length >= 2,
      msg: "Pon un nombre de al menos 2 letras (ej. \"Comedores\")." },
    { id: "catImageUrl", valid: imageUrl.length > 0,
      msg: "Sube una imagen para la categoria o pega un link. No puede ir vacia." },
  ]);
  if (!okValid) return;

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
      notify("OK003", name);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL_CATEGORIES), data);
      notify("OK003", "Nueva: " + name);
    }
    closeModal("categoryModal");
    await loadCategories();
    renderCatCards();
    renderDashboard();
  } catch (err) {
    notifyError(firestoreCodeFromError(err, editingCatId ? "E205" : "E204"), err.message);
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
    const imageUrls = [...new Set(prodsSnap.docs.flatMap(d => {
      const data = d.data();
      const urls = [data.primaryImage || data.imageUrl];
      (data.colors || []).forEach(c => { if (c && typeof c === "object" && c.image) urls.push(c.image); });
      return urls;
    }).filter(Boolean))];

    const b = writeBatch(db);
    prodsSnap.docs.forEach(d => b.delete(d.ref));
    b.delete(doc(db, COL_CATEGORIES, id));
    await b.commit();

    await Promise.allSettled(imageUrls.map(url => deleteImageFromBunny(url)));
    products = products.filter(p => !ids.includes(p.categoryId));

    notify("OK006", prodsSnap.size + " producto(s) tambien eliminado(s)");
    await loadCategories();
    renderCatCards();
    renderDashboard();
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E206"), err.message);
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
  // Match case-insensitive: el producto guarda categoryId en minusculas pero
  // los IDs de categoria estan capitalizados (ej. "Salas"). Sin esto el select
  // se reiniciaba al editar.
  if (currentVal) {
    const m = [...sel.options].find(o => o.value.toLowerCase() === String(currentVal).toLowerCase());
    sel.value = m ? m.value : currentVal;
  }
  return sel.value;
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
  if (currentVal) {
    const m = [...sel.options].find(o => o.value.toLowerCase() === String(currentVal).toLowerCase());
    sel.value = m ? m.value : currentVal;
  }
}

document.getElementById("prodCategory").addEventListener("change", e => {
  populateSubcategorySelect(e.target.value, "");
});

function openProductDrawer(id = null, preCatId = null) {
  console.group("[DRAWER] openProductDrawer");
  console.log("[DRAWER] id:", id, "| typeof:", typeof id, "| preCatId:", preCatId);
  clearFieldErrors(document.getElementById("productForm"));
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
      notifyError("E202", "Producto con id=" + id);
      console.groupEnd();
      return;
    }
    console.log("[DRAWER] Editing:", p.name);
    document.getElementById("prodModalTitle").textContent = "Editar producto";
    document.getElementById("prodEditId").value = id;
    document.getElementById("prodName").value = p.name || "";
    document.getElementById("prodDesc").value = p.description || "";
    document.getElementById("prodDisplayOrder").value = p.displayOrder ?? "";
    document.getElementById("prodPrice").value = p.price || "";
    document.getElementById("prodOriginalPrice").value = p.originalPrice || "";
    document.getElementById("prodFeatured").checked = !!p.featured;
    document.getElementById("prodNew").checked = !!p.isNew;
    editingProdColors = (p.colors || []).map(c =>
      (c && typeof c === "object") ? { hex: c.hex || "", image: c.image || null }
                                   : { hex: c || "", image: null });
    editingProdMaterials = Array.isArray(p.materials) ? [...p.materials]
                          : (typeof p.material === "string" && p.material.trim() ? [p.material.trim()] : []);
    editingProdQrUrl = p.qrUrl || "";
    // populateCatSelect devuelve el id real resuelto (case-insensitive); se usa
    // para poblar y seleccionar la subcategoria correctamente.
    const realCatId = populateCatSelect(p.categoryId || "");
    populateSubcategorySelect(realCatId, p.subcategory || "");
  } else {
    console.log("[DRAWER] New product, preCatId:", preCatId);
    document.getElementById("prodModalTitle").textContent = "Nuevo producto";
    document.getElementById("productForm").reset();
    document.getElementById("prodEditId").value = "";
    document.getElementById("prodColors").replaceChildren();
    editingProdMaterials = [];
    editingProdQrUrl = "";
    populateCatSelect(preCatId || "");
    populateSubcategorySelect(preCatId || "", "");
  }
  ensureProductVariationUI();
  const qrInput = document.getElementById("prodQrUrl");
  if (qrInput) qrInput.value = editingProdQrUrl;
  renderQrPreview();
  renderColorSwatches();
  renderMaterialChips();
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
// Abre el selector de archivo para la variación hex, recorta 3:4, sube a Bunny y
// guarda la URL en la variación correspondiente de editingProdColors.
async function pickVariationPhoto(hex) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.querySelector('[data-var-status="' + hex + '"]');
    const setStatus = (t, color) => { if (statusEl) { statusEl.textContent = t; statusEl.style.color = color || "var(--gray)"; } };
    setStatus("Abriendo recorte...", "var(--copper-lt)");
    const blob = await openCropModal(file, CROP_RATIO.product, "el producto");
    if (!blob) { setStatus(""); return; }
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const toUpload = new File([blob], baseName + ".jpg", { type: "image/jpeg" });
    setStatus("Subiendo a Bunny CDN...", "var(--copper-lt)");
    showUploadToast("busy", "Subiendo a Bunny CDN...", Math.round(toUpload.size / 1024) + " KB · variacion");
    try {
      const cdnUrl = await uploadImageToBunny(toUpload, "products");
      const target = editingProdColors.find(v => v.hex === hex);
      if (target) target.image = cdnUrl;
      setStatus("OK foto subida", "var(--copper-lt)");
      showUploadToast("ok", "Foto subida", "Foto de la variacion guardada en el CDN.");
      renderColorSwatches();
    } catch (err) {
      setStatus("ERROR " + err.message, "var(--red-lt)");
      showUploadToast("err", "Subida fallida", err.message);
    }
  });
  input.click();
}

document.getElementById("cancelProductDrawerBtn").addEventListener("click", closeProductDrawer);
document.getElementById("productDrawerOverlay").addEventListener("click", closeProductDrawer);
document.getElementById("deleteProductBtn").addEventListener("click", async () => {
  if (editingProdId) { await deleteProduct(editingProdId); closeProductDrawer(); }
});

document.getElementById("addProductBtn").addEventListener("click", () => openProductDrawer(null, null));


// Dibuja los chips de la paleta (settings.colorPalette). Click en un chip que
// no está usado agrega una variación; si ya está usado, no hace nada.
// Resiliencia ante HTML cacheado viejo en el formulario de producto: si faltan
// los bloques nuevos (chips de paleta + materiales), los inyecta y oculta los
// controles viejos. Así editar variaciones de color y materiales funciona
// aunque el navegador sirva un admin/index.html viejo. Idempotente.
// ─── QR (codigo opcional por producto) ───
let __qrLibPromise = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (__qrLibPromise) return __qrLibPromise;
  __qrLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => reject(new Error("no se pudo cargar la libreria QR"));
    document.head.appendChild(s);
  });
  return __qrLibPromise;
}

// Previsualiza el QR del valor en #prodQrUrl dentro de #prodQrPreview.
function renderQrPreview() {
  const input = document.getElementById("prodQrUrl");
  const box = document.getElementById("prodQrPreview");
  if (!input || !box) return;
  const url = input.value.trim();
  if (!url) { box.replaceChildren(); return; }
  box.textContent = "Generando QR...";
  box.style.cssText = "margin-top:10px;font-size:12px;color:var(--gray)";
  loadQrLib().then(qrcode => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    box.style.cssText = "margin-top:10px";
    box.innerHTML =
      '<div style="display:inline-block;background:#fff;padding:8px;border-radius:8px;border:1px solid var(--rule)">' +
      '<div style="width:120px;height:120px">' + qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) + '</div>' +
      '</div>';
    const svg = box.querySelector("svg");
    if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; svg.removeAttribute("width"); svg.removeAttribute("height"); }
  }).catch(err => {
    box.textContent = "No se pudo generar el QR: " + err.message;
    box.style.cssText = "margin-top:10px;font-size:12px;color:var(--red-lt)";
  });
}

function ensureProductVariationUI() {
  const colors = document.getElementById("prodColors");
  if (!colors) return;
  const colorsGroup = colors.closest(".form-group") || colors.parentElement;

  if (!document.getElementById("prodPaletteChips")) {
    const hint = document.createElement("p");
    hint.id = "paletteHint";
    hint.style.cssText = "font-size:12px;color:var(--gray);margin:0 0 8px";
    const chips = document.createElement("div");
    chips.id = "prodPaletteChips";
    chips.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px";
    colors.parentElement.insertBefore(hint, colors);
    colors.parentElement.insertBefore(chips, colors);
    // Ocultar el control viejo de color libre (input + boton "+") si existe.
    const oldInput = document.getElementById("prodColorInput");
    if (oldInput && oldInput.parentElement) oldInput.parentElement.style.display = "none";
  }

  // Ocultar el bloque viejo de "Imagen del producto" (subida unica) si existe.
  const oldFile = document.getElementById("prodImageFile");
  if (oldFile) {
    const g = oldFile.closest(".form-group");
    if (g) g.style.display = "none";
  }

  if (!document.getElementById("prodMaterials")) {
    const group = document.createElement("div");
    group.className = "form-group full";
    group.innerHTML =
      '<label>Materiales (elige de la lista del dashboard)</label>' +
      '<p id="materialHint" style="font-size:12px;color:var(--gray);margin:0 0 8px"></p>' +
      '<div id="prodMaterials" style="display:flex;flex-wrap:wrap;gap:8px"></div>';
    if (colorsGroup && colorsGroup.parentElement) {
      colorsGroup.parentElement.insertBefore(group, colorsGroup.nextSibling);
    } else {
      colors.parentElement.appendChild(group);
    }
  }

  if (!document.getElementById("prodQrUrl")) {
    const group = document.createElement("div");
    group.className = "form-group full";
    group.innerHTML =
      '<label>Codigo QR (opcional)</label>' +
      '<div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">' +
        '<input type="text" id="prodQrUrl" placeholder="https://... (link a video, info, etc.)" style="flex:1;min-width:200px"/>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="genQrBtn">Generar QR</button>' +
      '</div>' +
      '<div id="prodQrPreview" style="margin-top:10px"></div>';
    (colorsGroup && colorsGroup.parentElement ? colorsGroup.parentElement : colors.parentElement).appendChild(group);
  }

  // Cableado idempotente del boton Generar QR.
  const genBtn = document.getElementById("genQrBtn");
  if (genBtn) genBtn.onclick = () => renderQrPreview();
}

function renderPaletteChips() {
  const chips = document.getElementById("prodPaletteChips");
  const hint = document.getElementById("paletteHint");
  const palette = (settings.colorPalette || []);
  if (!chips || !hint) return;
  chips.replaceChildren();
  if (!palette.length) {
    hint.textContent = "No hay colores en la paleta. Agrega colores en Configuracion → Paleta de colores estandar.";
    return;
  }
  hint.textContent = "Toca un color para agregar su variacion y subir la foto de ese color.";
  palette.forEach(pc => {
    const used = editingProdColors.some(v => v.hex === pc.hex);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.title = pc.name || pc.hex;
    chip.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid var(--rule);background:none;color:var(--cream-dim);cursor:pointer;font-size:12px;opacity:" + (used ? ".4" : "1");
    const dot = document.createElement("span");
    dot.style.cssText = "width:16px;height:16px;border-radius:50%;border:1px solid var(--rule);background:" + pc.hex;
    const label = document.createElement("span");
    label.textContent = pc.name || pc.hex;
    chip.append(dot, label);
    chip.disabled = used;
    chip.addEventListener("click", () => {
      if (editingProdColors.some(v => v.hex === pc.hex)) return;
      editingProdColors.push({ hex: pc.hex, image: null });
      renderColorSwatches();
    });
    chips.appendChild(chip);
  });
}

// Dibuja las variaciones elegidas: cuadrito (solo lectura) + botón subir foto +
// miniatura + quitar. La 1ª variación con foto será la foto principal.
function renderColorSwatches() {
  renderPaletteChips();
  const container = document.getElementById("prodColors");
  container.replaceChildren();
  const primaryHex = (editingProdColors.find(c => c.image) || {}).hex;
  const palette = (settings.colorPalette || []);
  editingProdColors.forEach((v, i) => {
    const name = (palette.find(pc => pc.hex === v.hex) || {}).name || v.hex;

    const wrap = document.createElement("div");
    wrap.className = "color-input-wrap";
    wrap.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:8px";

    const dot = document.createElement("span");
    dot.style.cssText = "width:24px;height:24px;border-radius:4px;border:1px solid var(--rule);flex-shrink:0;background:" + v.hex;

    const label = document.createElement("span");
    label.textContent = name + (v.hex && v.hex === primaryHex ? " (principal)" : "");
    label.style.cssText = "font-size:12px;min-width:90px";

    const thumb = document.createElement("img");
    thumb.style.cssText = "width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--rule);background:var(--charcoal-deep);" + (v.image ? "" : "display:none");
    if (v.image) thumb.src = v.image;

    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.className = "btn btn-ghost btn-sm";
    fileBtn.textContent = v.image ? "Cambiar foto" : "Subir foto";
    fileBtn.addEventListener("click", () => pickVariationPhoto(v.hex));

    const status = document.createElement("span");
    status.dataset.varStatus = v.hex;
    status.style.cssText = "font-size:11px;color:var(--gray)";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.style.cssText = "background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;margin-left:auto";
    remove.addEventListener("click", () => { editingProdColors.splice(i, 1); renderColorSwatches(); });

    wrap.append(dot, label, thumb, fileBtn, status, remove);
    container.appendChild(wrap);
  });
}

// Dibuja la lista de materiales estándar (settings.materialList) como chips
// toggle. Los marcados quedan en editingProdMaterials.
function renderMaterialChips() {
  const container = document.getElementById("prodMaterials");
  const hint = document.getElementById("materialHint");
  const list = (settings.materialList || []);
  if (!container || !hint) return;
  container.replaceChildren();
  if (!list.length) {
    hint.textContent = "No hay materiales. Agrega materiales en Configuracion → Materiales estandar.";
    return;
  }
  hint.textContent = "Toca los materiales de este producto (puedes elegir varios).";
  list.forEach(mat => {
    const on = editingProdMaterials.includes(mat);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = mat;
    chip.style.cssText = "padding:5px 12px;border-radius:999px;cursor:pointer;font-size:12px;border:1px solid " +
      (on ? "var(--copper)" : "var(--rule)") + ";background:" + (on ? "var(--copper)" : "none") +
      ";color:" + (on ? "var(--bg)" : "var(--cream-dim)");
    chip.addEventListener("click", () => {
      const idx = editingProdMaterials.indexOf(mat);
      if (idx === -1) editingProdMaterials.push(mat);
      else editingProdMaterials.splice(idx, 1);
      renderMaterialChips();
    });
    container.appendChild(chip);
  });
}

// Animacion de confirmacion al guardar/publicar un producto: check verde
// centrado que entra, se dibuja y se va solo (~1.4s). Usa GSAP (ya cargado).
function showSaveConfirmation(text) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(10,12,11,.55);backdrop-filter:blur(2px)";
  const card = document.createElement("div");
  card.style.cssText = "background:var(--charcoal-deep,#161a18);border:1px solid var(--rule,rgba(255,255,255,.12));border-radius:18px;padding:30px 40px;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:0 24px 60px rgba(0,0,0,.45)";
  card.innerHTML =
    '<svg viewBox="0 0 52 52" style="width:60px;height:60px">' +
      '<circle class="__chkC" cx="26" cy="26" r="24" fill="none" stroke="#3a8c5c" stroke-width="3"/>' +
      '<path class="__chkT" fill="none" stroke="#3a8c5c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M14 27 l8 8 l16 -18"/>' +
    '</svg>' +
    '<div style="font-size:15px;font-weight:600;color:var(--cream,#f3efe7);letter-spacing:.02em">' + text + '</div>';
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const circle = card.querySelector(".__chkC");
  const tick = card.querySelector(".__chkT");
  const cLen = 2 * Math.PI * 24, tLen = 40;
  circle.style.strokeDasharray = cLen; circle.style.strokeDashoffset = cLen;
  tick.style.strokeDasharray = tLen; tick.style.strokeDashoffset = tLen;

  const done = () => overlay.remove();
  if (window.gsap) {
    gsap.set(card, { scale: 0.85, autoAlpha: 0 });
    const tl = gsap.timeline({ onComplete: () => gsap.to(overlay, { autoAlpha: 0, duration: 0.3, delay: 0.7, onComplete: done }) });
    tl.to(card, { scale: 1, autoAlpha: 1, duration: 0.3, ease: "back.out(1.7)" })
      .to(circle, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, 0.05)
      .to(tick, { strokeDashoffset: 0, duration: 0.3, ease: "power2.out" }, 0.32);
  } else {
    circle.style.strokeDashoffset = 0; tick.style.strokeDashoffset = 0;
    setTimeout(done, 1400);
  }
}

document.getElementById("productForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("prodName").value.trim();
  const origPrice = document.getElementById("prodOriginalPrice").value;
  var imageUrl = (editingProdColors.find(c => c.image) || {}).image || "";
  // Retrocompat: producto viejo sin foto por variación pero que ya tenía imagen
  // principal — conservarla para no bloquear la edición.
  if (!imageUrl && editingProdId) {
    const prevProd = catProductsAll.find(p => p.id === editingProdId) || products.find(p => p.id === editingProdId);
    if (prevProd) imageUrl = prevProd.primaryImage || prevProd.imageUrl || "";
  }
  const catId = document.getElementById("prodCategory").value;
  const catName = categories.find(c => c.id === catId)?.name || catId;
  const priceRaw = document.getElementById("prodPrice").value;
  const price = parseFloat(priceRaw) || 0;
  const originalPrice = origPrice ? parseFloat(origPrice) : null;

  // Friendly validation — block save if required fields are missing
  const okValid = validateFields([
    { id: "prodName",     valid: name.length >= 2,
      msg: "Pon un nombre para el producto (ej. \"Sofa Lineal Berlin\")." },
    { id: "prodCategory", valid: !!catId,
      msg: "Selecciona una categoria para el producto." },
    { id: "prodPrice",    valid: priceRaw !== "" && price > 0,
      msg: "Ingresa un precio mayor a 0." },
    { id: "prodOriginalPrice", valid: !originalPrice || originalPrice > price,
      msg: "El precio original debe ser mayor que el precio actual (o dejalo vacio si no esta en oferta)." },
    { id: "prodColors", valid: imageUrl.length > 0,
      msg: "Agrega al menos un color y sube su foto. No puede ir vacio." },
  ]);
  if (!okValid) return;

  const data = {
    name,
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
    materials: [...editingProdMaterials],
    qrUrl: (document.getElementById("prodQrUrl")?.value || "").trim(),
    available: true,
    updatedAt: serverTimestamp(),
  };

  // If toggled to featured and has no featuredOrder yet, append to end of list.
  const existingProd = editingProdId ? products.find(p => p.id === editingProdId) : null;
  if (data.featured) {
    const hasOrder = existingProd && typeof existingProd.featuredOrder === "number";
    if (!hasOrder) {
      const currentMax = products
        .filter(p => p.featured && p.id !== editingProdId)
        .reduce((m, p) => Math.max(m, p.featuredOrder ?? 0), 0);
      data.featuredOrder = currentMax + 1;
    }
  }

  try {
    let confirmText;
    if (editingProdId) {
      await updateDoc(doc(db, COL_PRODUCTS, editingProdId), data);
      // Reflect change in local cache so dashboard reorder works without a reload
      const local = products.find(p => p.id === editingProdId);
      if (local) {
        local.featured = data.featured;
        if (data.featured && data.featuredOrder !== undefined) local.featuredOrder = data.featuredOrder;
      }
      notify("OK004", name);
      confirmText = "Producto actualizado";
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL_PRODUCTS), data);
      notify("OK004", "Nuevo: " + name);
      confirmText = "Producto publicado";
    }
    regenerateProductsManifest(); // fire-and-forget, don't block UI
    closeProductDrawer();
    showSaveConfirmation(confirmText);
    renderDashboard();
    if (currentDetailCatId) await loadCategoryProducts(currentDetailCatId);
  } catch (err) {
    notifyError(firestoreCodeFromError(err, editingProdId ? "E208" : "E207"), err.message);
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
    if (prod) {
      const urls = [];
      const addUrl = (u) => { if (u && !urls.includes(u)) urls.push(u); };
      addUrl(prod.primaryImage); addUrl(prod.imageUrl);
      (prod.colors || []).forEach(c => { if (c && typeof c === "object") addUrl(c.image); });
      for (const u of urls) {
        try {
          await deleteImageFromBunny(u);
        } catch (imgErr) {
          // Firestore delete succeeded but Bunny didn't — surface as warning
          notifyError("E107", imgErr.message);
        }
      }
    }
    products = products.filter(p => p.id !== id);
    regenerateProductsManifest(); // fire-and-forget
    notify("OK005", prod ? prod.name : id);
    renderDashboard();
    if (currentDetailCatId) await loadCategoryProducts(currentDetailCatId);
  } catch (err) {
    notifyError(firestoreCodeFromError(err, "E209"), err.message);
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
