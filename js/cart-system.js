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

document.addEventListener("DOMContentLoaded", updateCartCount);
