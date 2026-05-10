#!/bin/bash
# Uploads all product, category, and banner images to Bunny CDN storage zone
# Uses the same Unsplash photos as the original Vercel deployment

API_KEY="63ab4787-ab96-43c4-86da7c32777c-8927-4afa"
BASE_URL="https://br.storage.bunnycdn.com/muebleria-palito"
TMP="/tmp/palito-imgs"

mkdir -p "$TMP/products" "$TMP/categorias" "$TMP/banners"

# ── helpers ──────────────────────────────────────────────
download() {
  local url="$1" dest="$2"
  echo -n "  Downloading $(basename $dest)... "
  curl -sL --max-time 30 "$url" -o "$dest"
  if [ $? -eq 0 ] && [ -s "$dest" ]; then
    echo "OK ($(du -sh $dest | cut -f1))"
  else
    echo "FAILED"
  fi
}

upload() {
  local file="$1" remote="$2"
  echo -n "  Uploading $remote... "
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/$remote" \
    -H "AccessKey: $API_KEY" \
    -H "Content-Type: image/jpeg" \
    --data-binary "@$file")
  if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
    echo "OK ($HTTP)"
  else
    echo "FAILED (HTTP $HTTP)"
  fi
}

dl_and_up() {
  local url="$1" local_path="$2" remote="$3"
  download "$url" "$local_path"
  upload "$local_path" "$remote"
}

UNS="https://images.unsplash.com"

# ═══════════════════════════════════════════════════════
echo ""
echo "▶ PRODUCTS (9 images — same as original Vercel site)"
echo "═══════════════════════════════════════════════════"
dl_and_up "$UNS/photo-1505693416388-ac5ce068fe85?w=800&q=80" \
  "$TMP/products/cama-platform-oslo.jpg"      "products/cama-platform-oslo.jpg"

dl_and_up "$UNS/photo-1540518614846-7eded433c457?w=800&q=80" \
  "$TMP/products/cama-king-monarch.jpg"       "products/cama-king-monarch.jpg"

dl_and_up "$UNS/photo-1631049307264-da0ec9d70304?w=800&q=80" \
  "$TMP/products/set-dormitorio-milano.jpg"   "products/set-dormitorio-milano.jpg"

dl_and_up "$UNS/photo-1567538096630-e0c55bd6374c?w=800&q=80" \
  "$TMP/products/colchon-memory-plus.jpg"     "products/colchon-memory-plus.jpg"

dl_and_up "$UNS/photo-1555041469-a586c61ea9bc?w=800&q=80" \
  "$TMP/products/mesa-noche-flux.jpg"         "products/mesa-noche-flux.jpg"

dl_and_up "$UNS/photo-1493663284031-b7e3aefcae8e?w=800&q=80" \
  "$TMP/products/armario-3-puertas.jpg"       "products/armario-3-puertas.jpg"

dl_and_up "$UNS/photo-1618221195710-dd6b41faaea6?w=800&q=80" \
  "$TMP/products/cabecera-terciopelo-vienna.jpg" "products/cabecera-terciopelo-vienna.jpg"

dl_and_up "$UNS/photo-1600210492486-724fe5c67fb0?w=800&q=80" \
  "$TMP/products/cama-tapizada-berlin.jpg"    "products/cama-tapizada-berlin.jpg"

dl_and_up "$UNS/photo-1617806118233-18e1de247200?w=800&q=80" \
  "$TMP/products/comoda-doble-lund.jpg"       "products/comoda-doble-lund.jpg"

# ═══════════════════════════════════════════════════════
echo ""
echo "▶ CATEGORIES (16 images)"
echo "═══════════════════════════════════════════════════"
dl_and_up "$UNS/photo-1555041469-a586c61ea9bc?w=800&q=80" \
  "$TMP/categorias/salas.jpg"           "categorias/salas.jpg"

dl_and_up "$UNS/photo-1556909114-f6e7ad7d3136?w=800&q=80" \
  "$TMP/categorias/comedores.jpg"       "categorias/comedores.jpg"

dl_and_up "$UNS/photo-1631049307264-da0ec9d70304?w=800&q=80" \
  "$TMP/categorias/dormitorios.jpg"     "categorias/dormitorios.jpg"

dl_and_up "$UNS/photo-1505693416388-ac5ce068fe85?w=800&q=80" \
  "$TMP/categorias/camas.jpg"           "categorias/camas.jpg"

dl_and_up "$UNS/photo-1617806118233-18e1de247200?w=800&q=80" \
  "$TMP/categorias/comodas.jpg"         "categorias/comodas.jpg"

dl_and_up "$UNS/photo-1616486338812-3dadae4b4ace?w=800&q=80" \
  "$TMP/categorias/coquetas.jpg"        "categorias/coquetas.jpg"

dl_and_up "$UNS/photo-1493663284031-b7e3aefcae8e?w=800&q=80" \
  "$TMP/categorias/roperos.jpg"         "categorias/roperos.jpg"

dl_and_up "$UNS/photo-1593062096033-9a26b09da705?w=800&q=80" \
  "$TMP/categorias/entretenimiento.jpg" "categorias/entretenimiento.jpg"

dl_and_up "$UNS/photo-1567538096630-e0c55bd6374c?w=800&q=80" \
  "$TMP/categorias/consolas.jpg"        "categorias/consolas.jpg"

dl_and_up "$UNS/photo-1544148103-0773bf10d330?w=800&q=80" \
  "$TMP/categorias/bar.jpg"             "categorias/bar.jpg"

dl_and_up "$UNS/photo-1540518614846-7eded433c457?w=800&q=80" \
  "$TMP/categorias/camacuna.jpg"        "categorias/camacuna.jpg"

dl_and_up "$UNS/photo-1593062096033-9a26b09da705?w=800&q=80" \
  "$TMP/categorias/basesTv.jpg"         "categorias/basesTv.jpg"

dl_and_up "$UNS/photo-1600210492486-724fe5c67fb0?w=800&q=80" \
  "$TMP/categorias/sofacama.jpg"        "categorias/sofacama.jpg"

dl_and_up "$UNS/photo-1518455027359-f3f8164ba6bd?w=800&q=80" \
  "$TMP/categorias/escritorios.jpg"     "categorias/escritorios.jpg"

dl_and_up "$UNS/photo-1617806118233-18e1de247200?w=800&q=80" \
  "$TMP/categorias/bufetera.jpg"        "categorias/bufetera.jpg"

dl_and_up "$UNS/photo-1617806118233-18e1de247200?w=800&q=80" \
  "$TMP/categorias/aparador.jpg"        "categorias/aparador.jpg"

# ═══════════════════════════════════════════════════════
echo ""
echo "▶ BANNERS (2 images)"
echo "═══════════════════════════════════════════════════"
dl_and_up "$UNS/photo-1555041469-a586c61ea9bc?w=1600&q=80" \
  "$TMP/banners/lifestyle.jpg"           "banners/lifestyle.jpg"

dl_and_up "$UNS/photo-1631049307264-da0ec9d70304?w=1600&q=80" \
  "$TMP/banners/dormitorios-hero.jpg"    "banners/dormitorios-hero.jpg"

# ═══════════════════════════════════════════════════════
echo ""
echo "✓ Done. Check https://muebleria-palito-cdn.b-cdn.net/products/cama-platform-oslo.jpg to verify."
echo ""
