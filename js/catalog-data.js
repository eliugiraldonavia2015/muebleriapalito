/**
 * Shared rendering utilities for Mueblería Palito Outlet
 * Loads catalog data from Firebase Firestore and provides helpers
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── COLLECTION NAMES ───
const COL_CATEGORIES = "categories";
const COL_PRODUCTS = "products";
const COL_SETTINGS = "settings";

// ─── CATEGORY HELPERS ───
async function getCategories(orderKey = "displayOrder", ascending = true) {
  const q = query(collection(db, COL_CATEGORIES), orderBy(orderKey, ascending ? "asc" : "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getHomepageCategories(limit = 5) {
  const q = query(collection(db, COL_CATEGORIES), orderBy("displayOrder", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.showOnHomepage === true);
}

async function getCategory(id) {
  const snap = await getDoc(doc(db, COL_CATEGORIES, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function getCategoryBySlug(slug) {
  const q = query(collection(db, COL_CATEGORIES), where("slug", "==", slug));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

// ─── PRODUCT HELPERS ───
async function getProducts(filters = {}) {
  let q = collection(db, COL_PRODUCTS);

  if (filters.categoryId) {
    q = query(q, where("categoryId", "==", filters.categoryId));
  }
  if (filters.subcategory) {
    q = query(q, where("subcategory", "==", filters.subcategory));
  }
  if (filters.featured) {
    q = query(q, where("featured", "==", true));
  }
  if (filters.onSale) {
    q = query(q, where("onSale", "==", true));
  }

  // Sort
  const sortBy = filters.sortBy || "displayOrder";
  const sortDir = filters.sortDir || "asc";
  q = query(q, orderBy(sortBy, sortDir));

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getProduct(id) {
  const snap = await getDoc(doc(db, COL_PRODUCTS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── SETTINGS HELPERS ───
async function getSettings() {
  const snap = await getDoc(doc(db, COL_SETTINGS, "store"));
  return snap.exists() ? snap.data() : {};
}

// ─── IMAGE HELPER ───
function buildImageUrl(storagePath) {
  return `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

export {
  db,
  COL_CATEGORIES,
  COL_PRODUCTS,
  COL_SETTINGS,
  getCategories,
  getHomepageCategories,
  getCategory,
  getCategoryBySlug,
  getProducts,
  getProduct,
  getSettings,
  buildImageUrl
};
