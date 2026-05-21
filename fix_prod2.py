import re

with open("/Users/eliugiraldo/Downloads/muebleriapalito/js/producto-renderer.js", "r") as f:
    content = f.read()

# Replace the body of initOrderPanel to just do Add to cart logic.
new_body = """function initOrderPanel(product) {
  const btn = document.getElementById("btn-add-cart");
  if (!btn) return;
  
  btn.addEventListener("click", () => {
    const qtyText = document.getElementById("qty-val") ? document.getElementById("qty-val").textContent : "1";
    const qty = parseInt(qtyText, 10) || 1;
    
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: qty,
      image: product.images && product.images.length ? product.images[0] : ""
    });
  });
}
"""

content = re.sub(r"function initOrderPanel\(product\).*?(?=async function init\(\))", new_body + "\n", content, flags=re.DOTALL)

with open("/Users/eliugiraldo/Downloads/muebleriapalito/js/producto-renderer.js", "w") as f:
    f.write(content)
