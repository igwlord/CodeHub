# Auditoría QA — Code Hub v2
**Fecha:** 2026-03-19
**Versión analizada:** 2.0.0
**Archivos auditados:** `src/App.jsx`, `src/index.css`, `server.js`, `data.json`
**Auditor:** Claude Sonnet 4.6 (análisis estático completo, sin ejecución de código)

---

## Resumen Ejecutivo

Code Hub v2 es una herramienta de soporte IT sólida y bien estructurada, con una arquitectura React + Vite + Express clara. La separación de responsabilidades entre componentes es razonable y el sistema de temas (dark/pastel) está bien implementado a través de CSS custom properties. Sin embargo, el análisis estático revela varios problemas que van desde bugs funcionales hasta decisiones de seguridad que merecen atención antes de un despliegue en red corporativa.

**Nivel de riesgo global:** MEDIO
**Bugs críticos encontrados:** 4
**Problemas UX/UI:** 8
**Inconsistencias de código:** 7
**Consideraciones de seguridad:** 5

---

## Bugs Críticos

### BUG-01 — `handleQuickConnect` ignora el error de red sin parsear el body (App.jsx ~línea 1076)

**Severidad:** Alta
**Ubicación:** `DashboardView` → función `handleQuickConnect`

```js
if (!res.ok) throw new Error((await res.json()).error);
```

El problema es que `res.json()` puede lanzar una excepción si el cuerpo de la respuesta no es JSON válido (por ejemplo, si el servidor devuelve un error 502 como HTML). Esto provoca que el `catch` capture el error del parser JSON en lugar del error real del servidor, mostrando al usuario un mensaje genérico e inútil como `"Unexpected token '<'"`.

**Comparación:** La implementación equivalente en `ConectarAdminView` (línea ~964) sí protege correctamente con `data.error || 'Error desconocido'`, porque primero parsea y luego lanza. El Dashboard no sigue el mismo patrón.

**Impacto:** El usuario ve un error críptico cuando el servidor cae, en lugar de un mensaje claro.

---

### BUG-02 — `saveData` nunca actualiza `syncStatus` a `'idle'` en caso de éxito silencioso (App.jsx ~línea 1356)

**Severidad:** Media
**Ubicación:** `App` → función `saveData`

```js
const saveData = useCallback(async (newSnippets, newTools) => {
  setSyncStatus('syncing');
  try {
    await fetch(`${API}/snippets`, { ... });
    setLastSync(new Date());
    setSyncStatus('idle');
  } catch {
    setSyncStatus('error');
  }
}, []);
```

La función no verifica `res.ok` — si el servidor responde con un 500, el `fetch` no lanza una excepción (los errores HTTP no son excepciones de red), y el código avanza directamente a `setSyncStatus('idle')`. Esto le indica al usuario que la sincronización fue exitosa cuando en realidad los datos no fueron guardados.

**Impacto:** Pérdida silenciosa de datos del usuario.

---

### BUG-03 — `DEFAULT_TOOLS` en el estado inicial puede ser sobreescrito permanentemente por `data.json` (App.jsx ~líneas 1296, 1340)

**Severidad:** Media
**Ubicación:** `App` → estado inicial + `loadData`

```js
const [tools, setTools] = useState(DEFAULT_TOOLS);
// ...
if (data.tools) setTools(data.tools);
```

Al arrancar la app, si `data.json` ya tiene un array `tools` (que es el caso en el archivo actual, con 14 herramientas), los `DEFAULT_TOOLS` definidos en código (6 herramientas) son ignorados completamente. Esto es correcto en operación normal, pero si se borra el archivo `data.json`, la app inicializa con `DEFAULT_TOOLS` en memoria, y en el primer guardado (ej. agregar un snippet) persiste esas 6 herramientas, descartando las 14 que estaban en el JSON. No hay lógica de "merge" ni de fallback robusto.

**Impacto:** Pérdida de herramientas configuradas si `data.json` se corrompe o borra.

---

### BUG-04 — `authorLocked` bloquea el campo Autor cuando `userName` está vacío pero `snippet.author` tampoco existe (App.jsx ~línea 332)

**Severidad:** Baja
**Ubicación:** `SnippetModal`

```js
const authorLocked = !!(snippet?.author || userName);
```

Cuando se crea un snippet nuevo (`snippet` es `null`) y el usuario no ha configurado su nombre, `authorLocked` es `false` y el campo queda editable, lo cual es correcto. Sin embargo, al **editar** un snippet existente cuyo campo `author` sea una cadena vacía `""`, la expresión `!!('')` evalúa a `false`, dejando el campo de autor editable cuando debería estar bloqueado (si el autor original ya está definido, aunque sea vacío). Es un edge case, pero puede llevar a sobreescritura accidental del autor.

---

## Código Muerto / Limpieza

### DEAD-01 — Importaciones no utilizadas de `lucide-react`

**Ubicación:** App.jsx, líneas 3–8

Los siguientes íconos son importados pero **nunca referenciados** en ningún JSX ni función del archivo:

- `Tag` — importado, solo usado en `DetailView` con `<Tag size={10} />` ✓ (este sí se usa)
- `Palette` — importado, **NUNCA usado** en JSX. ConfigView referencia el texto "Interfaz" con el ícono `Palette` en el header, pero en el código real usa `<Palette size={14} />` en la línea 881. Revisión: **sí se usa**, pero conviene verificar en builds de producción si tree-shaking lo elimina.
- `Lock` — importado en la línea 6, **no aparece en ningún JSX** del archivo. Es código muerto.
- `AlertTriangle` — importado y usado en `Toast` ✓
- `ExternalLink` — importado y usado ✓

**Candidato confirmado de código muerto:** `Lock` (importado, nunca utilizado).

---

### DEAD-02 — `TOOL_ICON_NAMES` es redundante

**Ubicación:** App.jsx, línea 30

```js
const TOOL_ICON_NAMES = Object.keys(TOOL_ICONS);
```

Esta constante se usa únicamente en `ToolModal` para renderizar el selector de íconos. Podría inline-arse directamente como `Object.keys(TOOL_ICONS)` en el JSX, o bien mantenerse por legibilidad. No es un bug, pero es un candidato de simplificación.

---

### DEAD-03 — `.sidebar` y clases relacionadas en CSS nunca se renderizan

**Ubicación:** index.css, líneas 113–142

El bloque de estilos `.sidebar`, `.sidebar-header`, `.sidebar-logo`, `.logo-icon`, `.logo-text`, `.sidebar-search`, `.sidebar-nav`, `.nav-section-label`, `.nav-item` y variantes están presentes en el CSS con el comentario `"kept for backwards compat, now hidden by default"`. Sin embargo, no existe ningún elemento con esas clases en el JSX actual del componente `App`. Es CSS muerto puro.

**Tamaño estimado del código muerto en CSS:** ~30 líneas / ~1.2 KB de CSS que el navegador parsea innecesariamente.

---

### DEAD-04 — `status-bar-clock` definida dos veces en CSS

**Ubicación:** index.css, líneas 170 y 483

```css
/* Línea 170 */
.status-bar-clock { ... font-size: 10.5px; color: rgba(255,255,255,0.38); }

/* Línea 483 */
.status-bar-clock { ... font-size: 11px; color: rgba(255,255,255,0.6); }
```

La clase `.status-bar-clock` está declarada dos veces con valores diferentes. La segunda declaración (línea 483) sobreescribe la primera silenciosamente. Ninguna de las dos es utilizada en el JSX actual del `StatusBar` — el reloj local usa `.clock-time-local`. Código CSS duplicado y posiblemente muerto.

---

### DEAD-05 — `prevView` nunca se inicializa al navegar desde el Rail

**Ubicación:** App.jsx, líneas 1425–1441 (rail-items)

Los items del rail llaman directamente a `setView(...)` sin actualizar `prevView`. Esto significa que si el usuario navega Dashboard → Snippets → abre Config desde el botón del status bar → cierra Config, el `prevView` será `'dashboard'` (el estado al momento de abrir Config), no `'snippets'`. El comportamiento de "volver" es inconsistente dependiendo de cómo el usuario llegó a la vista actual.

---

### DEAD-06 — `clocks` prop se pasa a `StatusBar` pero no se usa dentro de `StatusBar`

**Ubicación:** App.jsx línea 1549; StatusBar definición línea 736

```js
function StatusBar({ syncStatus, lastSync, snippetCount, toolCount, onOpenConfig, clocks = [] }) {
```

El parámetro `clocks` se recibe en `StatusBar` pero **no se renderiza ningún reloj mundial** en el JSX del componente. La barra de estado solo muestra la hora local. Los relojes configurados por el usuario en Config → Relojes Mundiales no aparecen en ningún lugar de la UI. La funcionalidad está implementada a medias: `ClockEditor` permite agregar zonas, se persisten en `localStorage`, pero no se muestran.

**Impacto UX alto:** El usuario configura relojes y no pasa nada visible.

---

### DEAD-07 — `data.json` contiene `demo-scr-001` faltante (secuencia rota)

**Ubicación:** data.json

Los IDs de la categoría Scripts van: `demo-scr-002`, `demo-scr-003`, ... `demo-scr-008`. El ID `demo-scr-001` no existe. Esto sugiere que fue eliminado manualmente pero la numeración no fue corregida. No es un bug funcional, pero es una inconsistencia en los datos de demostración.

---

## Problemas UX/UI

### UX-01 — Quick Connect: placeholder engañoso

**Ubicación:** App.jsx, línea 1231

```jsx
placeholder="SERVER-ADMIN\\Snippets"
```

El placeholder sugiere que el usuario debe ingresar una ruta SMB completa del tipo `SERVIDOR\Recurso`, pero la lógica en `handleQuickConnect` siempre usa `C$` como recurso fijo (`replaceAll('{{RECURSO}}', 'C$')`). El placeholder contradice el comportamiento real. Un placeholder más honesto sería `"PC-GERENCIA-01"` o `"192.168.1.100"`.

---

### UX-02 — Quick Connect no limpia el campo en caso de éxito (inconsistencia)

**Ubicación:** App.jsx, línea 1078

```js
onToast(`✅ Abriendo \\\\${quickEquipo}\\C$…`, 'success');
setQuickEquipo('');
```

El campo sí se limpia en el Dashboard. Sin embargo, en `ConectarAdminView` (la versión completa), el campo `equipo` **nunca se limpia** después de una conexión exitosa (no existe `setEquipo('')` en el bloque de éxito). Esto es inconsistente entre los dos puntos de entrada a la misma funcionalidad.

---

### UX-03 — Resource Monitor: "Network I/O" es siempre "Stable" (dato ficticio)

**Ubicación:** App.jsx, líneas 1265–1270

```jsx
<div className="resource-row">
  <div className="resource-label">
    <span className="resource-name">Network I/O</span>
    <span className="resource-val ok">Stable</span>
  </div>
</div>
```

El valor "Stable" está hardcodeado. El endpoint `/api/sysinfo` no devuelve datos de red, y el componente no hace ningún cálculo. Mostrar un dato que siempre dice "Stable" puede crear una falsa sensación de seguridad. Debería eliminarse la fila, reemplazarse con un dato real (uptime, IP), o marcarse claramente como "N/A".

---

### UX-04 — `syncStatus` inicial es `'idle'` pero nunca muestra el indicador "sin datos todavía"

**Ubicación:** App.jsx, línea 1304 + StatusBar

Al arrancar, `syncStatus` es `'idle'` y el indicador `Zap` aparece en color verde/synced. Pero los datos aún no se han cargado (`loadData` es asíncrono). El usuario ve brevemente el estado "sincronizado" antes de que cualquier dato llegue. Sería más correcto iniciar en `'syncing'`.

---

### UX-05 — `ToolModal`: comentario de ayuda contradice la implementación real

**Ubicación:** App.jsx, líneas 241–242 y 288–290

La descripción del modal dice:
> "El comando se ejecutará automáticamente con permisos de administrador (UAC)."

Y el hint del campo dice:
> "Usa `-Verb RunAs` para que pida credenciales de administrador."

Estas dos afirmaciones se contradicen: si el comando ya se ejecuta automáticamente con permisos elevados (según la primera), no haría falta el hint de `-Verb RunAs`. En realidad, el servidor ejecuta los comandos con los permisos del proceso Node.js, no con UAC. El texto confunde al usuario sobre el modelo de seguridad real.

---

### UX-06 — Relojes Mundiales: límite inconsistente entre UI y lógica

**Ubicación:** App.jsx, líneas 808 y 915

La lógica de `ClockEditor` impide agregar más de 2 relojes (`clocks.length >= 2`), pero el header de la sección en `ConfigView` dice **"hasta 3"**:

```jsx
<small style={{ ... }}>hasta 3</small>
```

Y el hint al pie dice "**2/2** zonas". El límite real es 2, no 3. El usuario puede confundirse intentando agregar un tercer reloj que nunca podrá agregar.

---

### UX-07 — Dashboard: "Recent Activity" y "Did you know?" en inglés, resto en español

**Ubicación:** App.jsx, líneas 1179 y 1277

La interfaz es predominantemente en español, pero los títulos de dos paneles del Dashboard están en inglés: `"Recent Activity"`, `"VIEW ALL →"`, `"Resource Monitor"`, `"Did you know?"`. La inconsistencia idiomática resulta extraña para una herramienta IT de equipo hispanohablante.

---

### UX-08 — Tip del Dashboard depende del día de la semana con solo 4 tips (posible repetición frecuente)

**Ubicación:** App.jsx, líneas 1093–1099

```js
const tip = tips[new Date().getDay() % tips.length];
```

Con `tips.length === 4` y `getDay()` retornando 0–6, el mapeo de día a tip no es uniforme (los 7 días se distribuyen en 4 slots, con días que comparten tip). Los lunes y viernes muestran el mismo tip (índice 1). No es un bug grave, pero la distribución es irregular.

---

## Quick Connect — Análisis

### Flujo completo

1. El usuario escribe un nombre de equipo en el input (ej. `PC-GERENCIA-01`).
2. Al presionar Enter o el botón "Conectar-Admin", se llama `handleQuickConnect()`.
3. La función construye el script `CONECTAR_SCRIPT` reemplazando `{{EQUIPO}}` con el valor del input y `{{RECURSO}}` fijo como `C$`.
4. El script se envía al endpoint `POST /api/elevated-terminal` como body JSON.
5. El servidor ejecuta el script completo con PowerShell de forma no interactiva.
6. Se muestra un toast de éxito o error.

### Problemas identificados

**QC-01 — El script usa `Get-Credential` dentro de una sesión PowerShell no-interactiva**

```powershell
$cred = Get-Credential -UserName "DOMINIO\\TuSUser" -Message "..."
```

El servidor ejecuta PowerShell con `-NonInteractive` (ver server.js línea 58). `Get-Credential` en modo no interactivo no puede mostrar un diálogo GUI al usuario que está frente al navegador — intenta abrir el diálogo en la sesión del proceso del servidor. En Windows, si el servidor corre sin sesión de escritorio (modo servicio), `Get-Credential` lanzará una excepción inmediatamente. El flujo conceptual está roto para ese caso de uso.

**QC-02 — `DOMINIO\\TuSUser` es un literal hardcodeado**

```powershell
$cred = Get-Credential -UserName "DOMINIO\\TuSUser" -Message "..."
```

El nombre de usuario admin es un placeholder que el equipo debe reemplazar manualmente en el código fuente. No hay ningún campo de configuración en la UI para personalizarlo. Esto requiere conocimiento del código y un rebuild para cada instalación.

**QC-03 — El input del Dashboard solo acepta el nombre del equipo, siempre conecta a C$**

La versión completa en `ConectarAdminView` permite elegir el recurso compartido (`C$`, `D$`, `Users`, `Admin$`, etc.). El Quick Connect en el Dashboard está fijo a `C$`. No se le indica esto al usuario en ningún label o descripción — el placeholder `"SERVER-ADMIN\\Snippets"` incluso sugiere que puede especificar un recurso distinto.

**QC-04 — Sin validación de formato del input**

No hay validación de que el valor ingresado sea un hostname o IP válido. Si el usuario ingresa caracteres especiales (`;`, `"`, `\n`), estos son sanitizados parcialmente por el servidor (solo se escapa `"` → `\"`), pero un input malicioso podría provocar inyección en el contexto del script PowerShell.

---

## Resource Monitor — Análisis

### Conexión con `/api/sysinfo`

El `DashboardView` llama al endpoint correctamente:

```js
useEffect(() => {
  fetch(`${API}/sysinfo`).then(r => r.json()).then(setSysinfo).catch(() => {});
  const t = setInterval(() => fetch(`${API}/sysinfo`).then(r => r.json()).then(setSysinfo).catch(() => {}), 10000);
  return () => clearInterval(t);
}, []);
```

**Lo que funciona correctamente:**
- La llamada inicial se hace al montar el componente.
- Se refresca cada 10 segundos con `setInterval`.
- El cleanup de `clearInterval` en el return del `useEffect` previene memory leaks.
- Los datos de CPU y RAM se muestran dinámicamente con barras de progreso.
- Los colores de las barras cambian según umbrales (verde < 50%, amarillo < 80%, rojo >= 80%).

**Problemas encontrados:**

**RM-01 — El `.catch(() => {})` silencia todos los errores**

Si el servidor está caído o la red falla, el monitor no muestra nada diferente al estado de carga inicial (`sysinfo === null`). El usuario ve `—` en todos los valores, pero no hay ninguna indicación de que el servidor esté offline. No hay estado de error separado para el Resource Monitor.

**RM-02 — CPU % calculado incorrectamente en Node.js**

El cálculo de CPU en `server.js` (líneas 74–78):

```js
const cpuLoad = cpus.reduce((acc, cpu) => {
  const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
  const idle = cpu.times.idle;
  return acc + ((total - idle) / total);
}, 0) / cpus.length;
```

`os.cpus()` en Node.js devuelve tiempos acumulados desde el boot, **no un snapshot de uso actual**. Este cálculo devuelve el porcentaje de uso promedio *desde que arrancó la máquina*, no el uso actual. Para obtener el uso en tiempo real se necesitaría tomar dos muestras separadas por un intervalo y calcular la diferencia. Los valores mostrados en el Resource Monitor para CPU **no representan el uso actual**.

**RM-03 — El umbral de color para RAM usa valores distintos a los de CPU**

```js
const cpuColor  = ... > 80 ? danger : ... > 50 ? warning : success;
const memColor  = ... > 80 ? danger : ... > 60 ? warning : '#5b9cf6'; // azul en lugar de success
```

CPU usa `var(--success)` (verde) cuando está bien, RAM usa `#5b9cf6` (azul). Esta diferencia de color no está documentada ni tiene justificación aparente. Podría confundir al usuario pensando que hay un problema de RAM cuando el color es distinto al de CPU "saludable".

**RM-04 — `resource-val.ok` vs `resource-val.warn` — falta clase `danger`**

En el CSS (index.css, líneas 471–472) se definen `.resource-val.ok` (verde) y `.resource-val.warn` (amarillo), pero no existe `.resource-val.danger`. El JSX tampoco aplica clase `danger` nunca — solo `warn` cuando > 80%. Cuando la CPU o RAM supera el 80%, la barra se pone roja pero el texto del valor (`${sysinfo.cpuPct}%`) no cambia de color, porque la condición ternaria solo asigna `'warn'` o `''`.

---

## Optimizaciones

### OPT-01 — `loadData` se llama cada 15 segundos desde `App` Y `sysinfo` cada 10 segundos desde `DashboardView`

Hay dos pollers independientes: uno de datos (snippets/tools) y uno de sysinfo. Esto es correcto en diseño, pero cuando el usuario está en el Dashboard, se hacen 2 peticiones HTTP al backend por cada ciclo de 10 segundos. Para una herramienta local esto es negligible, pero en redes con latencia podría acumularse.

### OPT-02 — `highlight()` se recalcula en cada render sin memoización

**Ubicación:** `CodeCard` componente

```js
const highlighted = highlight(lines.join('\n'), snippet.language);
```

La función `highlight()` usa múltiples `.replace()` con regex y se ejecuta en cada render del componente. Para una librería de 50+ snippets en vista grid, esto puede provocar trabajo innecesario. Se beneficiaría de `useMemo`.

### OPT-03 — `recentSnippets` y `contributors` se calculan con `[...snippets].sort()` en cada render del Dashboard

**Ubicación:** DashboardView, líneas 1066–1068

```js
const recentSnippets = [...snippets].sort(...).slice(0, 6);
const contributors = [...new Set(snippets.map(s => s.author).filter(Boolean))];
```

Estas derivaciones se recalculan en cada render de `DashboardView`. Dado que `snippets` cambia raramente (solo al guardar), ambas se beneficiarían de `useMemo([snippets])`.

### OPT-04 — `saveData` no tiene debounce

Cada operación (toggle favorito, guardar snippet, actualizar herramienta) llama inmediatamente a `saveData`, que hace un `fs.writeFileSync` en el servidor. Si el usuario hace múltiples toggles rápidos de favoritos, se generan múltiples escrituras al disco en sucesión. Un debounce de ~500ms reduciría la carga de I/O.

### OPT-05 — El endpoint `POST /api/snippets` no valida la estructura del body

**Ubicación:** server.js, líneas 41–48

```js
app.post('/api/snippets', (req, res) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});
```

Se escribe directamente `req.body` al archivo sin ninguna validación de esquema. Si por algún bug en el cliente se envía un body malformado (ej. `{ snippets: null }`), el archivo `data.json` queda corrupto y la app pierde todos sus datos.

---

## Consideraciones de Seguridad

### SEC-01 — Endpoint `/api/elevated-terminal` expuesto sin autenticación

**Severidad:** CRÍTICA para despliegue en red
**Ubicación:** server.js, línea 52

```js
app.post('/api/elevated-terminal', (req, res) => {
  exec(`powershell -NoProfile -NonInteractive -Command "${safe}"`, ...
```

El servidor escucha en `0.0.0.0:3001` (todas las interfaces de red). El endpoint que ejecuta comandos PowerShell en el servidor no tiene ningún mecanismo de autenticación (sin token, sin sesión, sin IP whitelist). Cualquier dispositivo en la misma red local puede enviar una petición HTTP y ejecutar comandos arbitrarios con los privilegios del proceso Node.

**La sanitización es insuficiente:**
```js
const safe = command.replace(/"/g, '\\"');
```
Solo se escapan comillas dobles, pero el argumento se construye con `"${safe}"`. Un atacante puede usar otras técnicas de escape de PowerShell para salir del contexto del string y ejecutar comandos adicionales.

### SEC-02 — CORS abierto

**Ubicación:** server.js, línea 17

```js
app.use(cors());
```

Sin opciones, `cors()` permite peticiones desde cualquier origen. En una herramienta interna esto no es un riesgo inmediato, pero si el servidor llega a ser accesible desde internet, una página web maliciosa podría hacer peticiones cross-origin al endpoint de ejecución de comandos.

### SEC-03 — Credenciales del dominio en el script CONECTAR_SCRIPT

**Ubicación:** App.jsx, línea 938

```js
const CONECTAR_SCRIPT = `$cred = Get-Credential -UserName "DOMINIO\\TuSUser" ...
```

El nombre de usuario del dominio admin está hardcodeado como literal en el bundle JavaScript del cliente. Cualquier usuario que abra las DevTools del navegador puede ver el template del script completo, incluyendo el nombre de usuario predeterminado. Aunque la contraseña no está hardcodeada (se solicita via `Get-Credential`), exponer el nombre de usuario admin puede facilitar ataques dirigidos.

### SEC-04 — `data.json` sin ningún control de acceso

El archivo `data.json` contiene el historial completo de snippets del equipo (incluyendo scripts de reset de contraseñas con credenciales de ejemplo como `TempPass@2026!` hardcodeadas en los snippets de demostración). Si el servidor está accesible en red y no hay firewall, cualquier persona en la LAN puede leer todos los snippets via `GET /api/snippets`.

### SEC-05 — `shareToTeams` construye URL con datos del snippet sin sanitizar

**Ubicación:** App.jsx, línea 87

```js
const text = `...${snippet.code}...`.replace(/\n/g, '%0A');
```

El código del snippet se inserta directamente en una URL de Teams. Solo se escapan saltos de línea, pero caracteres como `&`, `=`, `#`, `?` no son codificados. Si un snippet contiene esos caracteres en el código, la URL generada puede ser malformada o truncada. Se debería usar `encodeURIComponent()` en toda la cadena.

---

## Estado por Sección (tabla)

| Sección | Estado | Notas |
|---|---|---|
| Dashboard — Stats Cards | ✅ OK | Funcional, datos correctos |
| Dashboard — Recent Activity | ✅ OK | Ordena y muestra bien |
| Dashboard — Quick Connect | ⚠️ Parcial | Placeholder erróneo, `Get-Credential` no funciona en modo no interactivo |
| Dashboard — Resource Monitor | ⚠️ Parcial | CPU % es promedio histórico, no uso actual; "Network I/O" hardcodeado |
| Dashboard — Did you know? | ⚠️ Menor | Distribución de tips irregular, mezclado en inglés |
| Snippets — Búsqueda y filtrado | ✅ OK | Funciona correctamente por título, descripción, código y tags |
| Snippets — CRUD | ✅ OK | Crear, editar, eliminar y favoritos funcionan |
| Snippets — Vista Grid/Lista | ✅ OK | Toggle funcional |
| Snippets — CalendarPanel | ✅ OK | Calendario de actividad funciona bien |
| Snippets — Highlight de código | ✅ OK | Básico pero funcional para PS/Python/Bash |
| Snippets — Compartir (Teams/Email) | ⚠️ Menor | URL de Teams no usa `encodeURIComponent` completo |
| Herramientas Admin — CRUD | ✅ OK | Agregar, editar, eliminar funciona |
| Herramientas Admin — Ejecutar | ⚠️ Parcial | Funciona si el servidor tiene los permisos necesarios; sin autenticación |
| Herramientas Admin — Búsqueda | ✅ OK | Filtra por nombre, descripción y comando |
| Conectar-Admin | ⚠️ Parcial | `Get-Credential` puede no funcionar en modo no interactivo; campo equipo nunca se limpia |
| Config — Perfil | ✅ OK | Guarda en localStorage, se persiste entre sesiones |
| Config — Tema | ✅ OK | Dark/Pastel funcionan correctamente |
| Config — Relojes Mundiales | ❌ Roto | Se configuran pero nunca se muestran (StatusBar ignora la prop `clocks`) |
| Config — Info App | ✅ OK | Muestra counts correctos |
| StatusBar — Reloj local | ✅ OK | Se actualiza cada segundo con glow effect |
| StatusBar — Toggle Config | ⚠️ Parcial | `prevView` no se actualiza cuando el usuario navega por el Rail |
| StatusBar — Sync indicator | ⚠️ Parcial | Estado inicial es `idle` (parece sincronizado antes de cargar datos) |
| Server — `/api/snippets` GET | ✅ OK | Lee y devuelve datos correctamente |
| Server — `/api/snippets` POST | ⚠️ Parcial | Sin validación de esquema; puede corromper datos |
| Server — `/api/sysinfo` | ⚠️ Parcial | CPU % es dato acumulado desde boot, no uso en tiempo real |
| Server — `/api/elevated-terminal` | ⚠️ Riesgo | Sin autenticación; sanitización de comandos insuficiente |
| data.json — Estructura | ✅ OK | Schema consistente en todos los snippets |
| data.json — Contenido demo | ✅ OK | 50 snippets de calidad, cubriendo todas las categorías |

---

## Recomendaciones

### Prioridad 1 — Crítico (acción inmediata)

1. **Autenticar `/api/elevated-terminal`**: Agregar un token estático compartido (header `X-Hub-Token`) o al menos una whitelist de IPs. Sin esto, cualquier dispositivo en la LAN puede ejecutar comandos PowerShell en el servidor.

2. **Validar el body en `POST /api/snippets`**: Verificar que `req.body.snippets` sea un Array antes de escribir al disco. Un `if (!Array.isArray(req.body?.snippets)) return res.status(400).json(...)` es suficiente como primer filtro.

3. **Corregir el error de parseo en `handleQuickConnect`**: Cambiar el patrón de manejo de errores para que sea consistente con `ConectarAdminView`, parseando el body antes de evaluar `res.ok`.

### Prioridad 2 — Alto (próximo sprint)

4. **Implementar los Relojes Mundiales en StatusBar**: La funcionalidad está al 80% — solo falta renderizar las zonas en el JSX del `StatusBar`. Es la feature más esperada por el usuario que llega a configurarla.

5. **Corregir el cálculo de CPU en `/api/sysinfo`**: Tomar dos muestras con una diferencia de 100ms para calcular uso real en lugar de promedio histórico.

6. **Arreglar el placeholder del Quick Connect**: Cambiarlo de `"SERVER-ADMIN\\Snippets"` a `"PC-NOMBRE o 192.168.1.x"` para reflejar que solo acepta el hostname, no la ruta completa.

7. **Hacer configurable `DOMINIO\\TuSUser`**: Mover el nombre de usuario del dominio admin a un campo en Config (o al menos a una variable de entorno del servidor), en lugar de hardcodearlo en el código fuente del cliente.

### Prioridad 3 — Medio (mejoras de calidad)

8. **Revisar y limpiar CSS muerto**: Eliminar o aislar en un archivo separado los estilos de `.sidebar` y sus variantes. Eliminar la declaración duplicada de `.status-bar-clock`.

9. **Corregir inconsistencia de idioma**: Traducir al español los títulos "Recent Activity", "Resource Monitor", "Did you know?", "VIEW ALL →" del Dashboard.

10. **Corregir el límite de relojes en UI**: Cambiar el texto "hasta 3" por "hasta 2" en el header de la sección Relojes Mundiales, para que coincida con la lógica real.

11. **Agregar `useMemo` a derivaciones costosas**: `recentSnippets`, `contributors` en `DashboardView` y la función `highlight()` en `CodeCard` son candidatos directos.

12. **Agregar clase `.resource-val.danger`** al CSS y aplicarla cuando CPU o RAM superan el 80%, para coherencia visual con el color de la barra.

13. **Inicializar `syncStatus` en `'syncing'`** en lugar de `'idle'` para que el indicador sea honesto durante la primera carga.

14. **Agregar debounce a `saveData`** para reducir escrituras innecesarias al disco en operaciones rápidas sucesivas (como múltiples toggles de favoritos).

15. **Usar `encodeURIComponent` completo en `shareToTeams`** para evitar URLs malformadas cuando el código del snippet contiene caracteres especiales.

---

*Documento generado por análisis estático — ningún archivo fue modificado durante la auditoría.*
*Generado: 2026-03-19 | Code Hub v2.0.0 | Claude Sonnet 4.6*
