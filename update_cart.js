const fs = require('fs');

function updateFile(filePath, isIndex) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove the btn-add-cart-grid from btn-wish if present
  content = content.replace(/<button class="btn-wish btn-add-cart-grid" data-id="\$\{p\.id\}"/g, '<button class="btn-wish" data-id="${p.id}"');
  
  // Replace the generic btn-cart with the full data attributes
  content = content.replace(
    /<button class="btn-cart">Agregar al carrito<\/button>/g,
    '<button class="btn-cart btn-add-cart-grid" data-id="${p.id}" data-name="${p.name.replace(/\\"/g, \'&quot;\')}" data-price="${p.price}" data-image="${p.imageUrl || p.primaryImage || (p.images && p.images.length ? p.images[0] : \'\')}">Agregar al carrito</button>'
  );

  // Define the new listener
  const newListener = `// Add to cart delegation for ${isIndex ? 'index' : 'catalog'}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-add-cart-grid");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  
  const id = btn.getAttribute("data-id");
  const name = btn.getAttribute("data-name");
  const price = parseFloat(btn.getAttribute("data-price")) || 0;
  const image = btn.getAttribute("data-image") || "";
  
  console.log("Intentando añadir al carrito:", { id, name, price, image });
  
  if (!id || !name) {
    console.error("Faltan datos en el boton:", btn);
    return;
  }
  
  if (typeof window.addToCart === "function") {
    window.addToCart({
      id: id,
      name: name,
      price: price,
      qty: 1,
      image: image
    });
    console.log("Añadido con exito via window.addToCart");
  } else {
    console.error("No se encontro window.addToCart. Verifica que cart-system.js este cargado.");
  }
});`;

  // Use regex to replace old listener block completely
  const listenerRegex = new RegExp(`// Add to cart delegation for (?:index|catalog)[\\s\\S]*?(?:}\\);|$)`, 'm');
  
  if (content.match(listenerRegex)) {
    content = content.replace(listenerRegex, newListener);
  } else {
    content += '\n\n' + newListener;
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

updateFile('/Users/eliugiraldo/Downloads/muebleriapalito/js/index-renderer.js', true);
updateFile('/Users/eliugiraldo/Downloads/muebleriapalito/js/catalogo-renderer.js', false);
console.log("Files updated successfully");
