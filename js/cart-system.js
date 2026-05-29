// Cart system for Muebleria Palito
const CART_KEY = "palito_cart";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(i => i.id === item.id);
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }
  saveCart(cart);
  showToast("¡Item añadido al carrito!");
}

function removeFromCart(id) {
  let cart = getCart();
  cart = cart.filter(i => i.id !== id);
  saveCart(cart);
}

function updateCartCount() {
  const cart = getCart();
  const count = cart.reduce((acc, i) => acc + i.qty, 0);
  document.querySelectorAll(".nav-cart-count").forEach(el => {
    el.textContent = count;
  });
}

function showToast(msg) {
  let toast = document.getElementById("cart-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cart-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%) translateY(100px)";
    toast.style.background = "#3a8c5c";
    toast.style.color = "#fff";
    toast.style.padding = "12px 24px";
    toast.style.borderRadius = "4px";
    toast.style.zIndex = "9999";
    toast.style.fontFamily = "'DM Sans', sans-serif";
    toast.style.fontSize = "12px";
    toast.style.letterSpacing = "0.1em";
    toast.style.textTransform = "uppercase";
    toast.style.transition = "transform 0.3s ease";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.transform = "translateX(-50%) translateY(0)";
  
  setTimeout(() => {
    toast.style.transform = "translateX(-50%) translateY(100px)";
  }, 3000);
}

// ─── WISHLIST (favoritos) ───
const WISH_KEY = "palito_wishlist";

function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISH_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function isInWishlist(id) {
  return getWishlist().includes(String(id));
}

// Adds or removes the id from the wishlist. Returns true if it's now saved,
// false if it was removed. Also shows a small toast.
function toggleWishlist(id) {
  const sid = String(id);
  const list = getWishlist();
  const idx = list.indexOf(sid);
  let nowSaved;
  if (idx >= 0) {
    list.splice(idx, 1);
    nowSaved = false;
  } else {
    list.push(sid);
    nowSaved = true;
  }
  localStorage.setItem(WISH_KEY, JSON.stringify(list));
  showToast(nowSaved ? "Agregado a favoritos" : "Quitado de favoritos");
  return nowSaved;
}

// Expose to window so module-loaded renderers can call these
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.getCart = getCart;
window.saveCart = saveCart;
window.getWishlist = getWishlist;
window.isInWishlist = isInWishlist;
window.toggleWishlist = toggleWishlist;

document.addEventListener("DOMContentLoaded", updateCartCount);
