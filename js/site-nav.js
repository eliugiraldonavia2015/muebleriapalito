// Menu superior compartido: las categorias salen de Firestore (las 5 primeras
// con showOnHomepage, por displayOrder), igual que en producto.html.
// El HTML de cada pagina trae la misma lista escrita como respaldo para que
// no parpadee; este script la corrige si el admin cambia las categorias.
// Usa la API REST (lectura publica) para no inicializar Firestore otra vez
// en paginas cuyo renderer ya lo hace con su propia cache.
const URL_CATS =
  "https://firestore.googleapis.com/v1/projects/muebleria-palito-outlet/databases/(default)/documents/categories?pageSize=100";

function slugify(t) {
  return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function val(f) {
  if (!f) return undefined;
  if ("stringValue" in f) return f.stringValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  return undefined;
}

async function syncNav() {
  const ul = document.querySelector(".nav-links");
  if (!ul) return;
  const res = await fetch(URL_CATS);
  if (!res.ok) return;
  const data = await res.json();
  const cats = (data.documents || [])
    .map(d => ({
      name: val(d.fields.name),
      show: val(d.fields.showOnHomepage),
      order: val(d.fields.displayOrder) ?? 999,
    }))
    .filter(c => c.name && c.show)
    .sort((a, b) => a.order - b.order)
    .slice(0, 5);
  if (!cats.length) return;

  // Se reemplazan solo los enlaces de categoria; "Ubicaciones" se queda.
  ul.querySelectorAll("li[data-cat]").forEach(li => li.remove());
  const anchor = ul.querySelector("li:not([data-cat])");
  cats.forEach(c => {
    const li = document.createElement("li");
    li.dataset.cat = "";
    const a = document.createElement("a");
    a.href = "catalogo.html?cat=" + slugify(c.name);
    a.textContent = c.name;
    li.appendChild(a);
    ul.insertBefore(li, anchor);
  });
}

syncNav().catch(() => { /* se queda la lista escrita en el HTML */ });
