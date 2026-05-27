# Códigos de error — Muebleria Palito Admin

Cada vez que algo falla en el admin, aparece una **notificación push** arriba a la derecha con un código (ej. `E101`). Buscá el código aquí para saber qué pasó y cómo arreglarlo.

Origen del catálogo: `js/error-codes.js` (debe estar en sync con este archivo).

---

## Bunny CDN — códigos E1xx

| Código | Cuándo aparece | Causa | Fix |
|---|---|---|---|
| **E101** | Subida o lectura del manifest devuelve 401 | API key inválida o expirada | Copia la **FTP Password** desde Bunny Dashboard → Storage Zone "muebleria-palito" → FTP & API Access → pégala en `js/firebase-config.js:30`. Hard refresh con `Cmd+Shift+R`. |
| **E102** | Bunny devuelve 402 Payment Required | Cuenta sin balance / suspendida | Recarga balance en https://dash.bunny.net → Billing. Una vez con saldo, el servicio reanuda al instante. |
| **E103** | Bunny devuelve 404 en upload | Storage Zone no existe o `zoneName` está mal | Verifica `BUNNY_CDN.zoneName` en `js/firebase-config.js`. Debe coincidir exactamente con el nombre del zone en Bunny. |
| **E104** | Bunny devuelve 507 / quota error | Cuota de storage excedida | Borra archivos viejos en Bunny Dashboard → Storage → File Manager, o sube de plan. |
| **E105** | `xhr.onerror` o fetch network error | Sin conexión a internet o DNS roto | Verifica tu conexión. Si funciona, prueba `curl https://br.storage.bunnycdn.com` desde terminal para descartar bloqueo de red. |
| **E106** | Bunny devuelve 5xx | Error del servidor de Bunny | Esperá 1-2 min y reintenta. Si persiste, https://status.bunny.net |
| **E107** | Delete falló al borrar producto/categoría | Imagen quedó huérfana en CDN | El producto/categoría sí se borró de Firestore, pero la imagen en Bunny no. Revisar manualmente en Bunny File Manager y borrarla, o ignorar (es solo espacio en disco). |
| **E108** | `regenerateProductsManifest` 401 | Mismo que E101 al regenerar el manifest de productos | El catálogo público sigue funcionando, pero el manifest no se actualiza. Arregla la key. |
| **E109** | Purge cache devuelve 401 / falla | Después de subir, el CDN sirvió la imagen vieja en cache | Espera 60s o purga manual en Bunny Dashboard → Pull Zones → Purge. |
| **E110** | Upload modal/crop cerrado sin imagen | El usuario canceló o falló el crop antes de subir | No es error real. Se ignora silenciosamente. |

---

## Firestore — códigos E2xx

| Código | Cuándo aparece | Causa | Fix |
|---|---|---|---|
| **E201** | Firestore devuelve `permission-denied` | Reglas de seguridad rechazan el write | Verifica que estás logueado como admin. Revisar reglas en Firebase Console → Firestore → Rules. |
| **E202** | Operación sobre doc inexistente | Doc fue borrado en otra pestaña | Recargar el admin para refrescar el cache local. |
| **E203** | `resource-exhausted` | Cuota de Firestore excedida | Esperar al reset de cuota (24h) o subir plan en Firebase Console. |
| **E204** | Crear categoría falla | Red, permisos, o validación de Firestore | Revisa los logs del browser para detalle. Posible: campo `slug` ya existe. |
| **E205** | Actualizar categoría falla | Red o conflicto de versión | Reintentar. Si persiste, recargar admin. |
| **E206** | Borrar categoría falla | Productos asociados o permisos | El admin borra los productos hijos primero. Si falla a mitad, hay productos huérfanos — revisar en la sección Categorías. |
| **E207** | Crear producto falla | Red, validación, o duplicado | Revisar mensaje específico en el detalle. |
| **E208** | Actualizar producto falla | Red o conflicto | Reintentar. |
| **E209** | Borrar producto falla | Red o referencia (featured order) | Reintentar. La imagen en Bunny puede quedar huérfana (E107). |
| **E210** | Guardar settings falla | Red o reglas | Reintentar. Los settings de la última edición se mantienen en el form. |
| **E211** | Actualizar `featured` o `featuredOrder` falla | Red al hacer ↑↓ en dashboard | El reorden quedó solo local; recargar admin sincroniza con DB. |
| **E212** | Seed inicial falla | Primera carga del admin no pudo seedear settings | Recargar. Si persiste, verificar reglas y `firebase-config.js`. |

---

## Validación / UI — códigos E3xx

| Código | Cuándo aparece | Causa | Fix |
|---|---|---|---|
| **E301** | Submit con campos requeridos vacíos | (No es realmente notif: se muestra inline bajo el campo) | Llenar campos marcados en rojo. |
| **E302** | URL/email mal formado | Validación local | Corregir el formato. |
| **E303** | Imagen > 10 MB antes de crop | Archivo demasiado grande | Comprimir / redimensionar antes de subir, o subir una imagen más chica. |
| **E304** | Tipo de archivo no soportado | Subiste algo que no es imagen | Solo JPG, PNG, WebP. |

---

## Auth — códigos E4xx

| Código | Cuándo aparece | Causa | Fix |
|---|---|---|---|
| **E401** | Login falló con mensaje genérico | Email/password incorrecto, cuenta deshabilitada, etc. | Verificar credenciales. Si la cuenta existe en Firebase Auth con otra password, resetear desde Firebase Console. |
| **E402** | Sesión expira mientras editas | Token de Firebase expiró | Recargar admin para re-autenticar. |

---

## App / cache — códigos E5xx

| Código | Cuándo aparece | Causa | Fix |
|---|---|---|---|
| **E501** | El log `[BUNNY] keyLen` no coincide con el de `firebase-config.js` | Browser tiene cacheada una versión vieja de `firebase-config.js` | DevTools → Application → Storage → Clear site data → recargar. |
| **E502** | Acción aplicada localmente pero la lista del dashboard no se refresca | Falta llamar a `renderDashboard()` después del cambio | Reportable como bug. Recargar admin como workaround. |
| **E503** | Después de upload, el thumb no muestra la imagen nueva | URL del CDN servida desde cache antiguo | Esperar 30-60s para que el edge cache se purgue, o purgar manual (E109). |

---

## Cómo se ve la notificación

```
┌──────────────────────────────────────────────┐
│  E101  API key de Bunny inválida          ×  │
│  ────────────────────────────────────────────│
│  Las subidas a Bunny CDN no funcionarán      │
│  hasta que arregles la API key.              │
│                                              │
│  ▸ Cómo arreglar                             │
│    Copia la FTP Password desde Bunny         │
│    Dashboard → Storage Zone → FTP & API…     │
└──────────────────────────────────────────────┘
```

- Click en el código → copia el código al clipboard
- Click en "Cómo arreglar" → expande el fix
- Click en × → cierra la notificación
- Notificaciones críticas (E101, E102, E211) son **persistentes** (no auto-dismiss)
- Notificaciones de operación fallida son **5 segundos**
