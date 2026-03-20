import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import * as XLSX from 'xlsx';
import { randomUUID, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_FILE  = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const DIST_DIR   = path.join(__dirname, 'dist');

// ── PIN hashing — crypto built-in, no external packages ─────────────────────
function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(String(pin), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const testHash = pbkdf2Sync(String(pin), salt, 100000, 64, 'sha512').toString('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
  } catch { return false; }
}

// ── Audit log ────────────────────────────────────────────────────────────────
const AUDIT_FILE = path.join(__dirname, 'hub-audit.log');
function auditLog(attuid, action, detail = '') {
  const line = `[${new Date().toISOString()}] [${attuid}] ${action}${detail ? ' | ' + detail : ''}\n`;
  try { fs.appendFileSync(AUDIT_FILE, line, 'utf8'); } catch { /* no-op */ }
  console.log('[AUDIT]', line.trim());
}

// ── Allowed settings fields (prevent prototype pollution) ────────────────────
const ALLOWED_SETTINGS = new Set([
  'theme', 'navMode', 'clocks', 'pinnedItems',
  'adminUser', 'adminDomain', 'servers', 'recentConns'
]);
function sanitizeSettings(incoming) {
  const clean = {};
  for (const key of ALLOWED_SETTINGS) {
    if (key in incoming) clean[key] = incoming[key];
  }
  return clean;
}

// ── Allowed snippet fields (prevent XSS / prototype pollution) ───────────────
function sanitizeSnippet(s) {
  return {
    id:          typeof s.id === 'string'          ? s.id          : randomUUID(),
    title:       typeof s.title === 'string'       ? s.title       : '',
    description: typeof s.description === 'string' ? s.description : '',
    code:        typeof s.code === 'string'         ? s.code        : '',
    language:    typeof s.language === 'string'     ? s.language    : 'plaintext',
    category:    typeof s.category === 'string'     ? s.category    : '',
    tags:        Array.isArray(s.tags)              ? s.tags.map(String) : [],
    author:      typeof s.author === 'string'       ? s.author      : '',
    createdAt:   typeof s.createdAt === 'string'    ? s.createdAt   : new Date().toISOString(),
    favorite:    typeof s.favorite === 'boolean'    ? s.favorite    : false,
    runMode:     typeof s.runMode === 'string'      ? s.runMode     : '',
    pinned:      typeof s.pinned === 'boolean'      ? s.pinned      : false,
  };
}
function sanitizeTool(t) {
  return {
    id:          typeof t.id === 'string'          ? t.id          : randomUUID(),
    name:        typeof t.name === 'string'         ? t.name        : '',
    description: typeof t.description === 'string' ? t.description : '',
    command:     typeof t.command === 'string'      ? t.command     : '',
    icon:        typeof t.icon === 'string'         ? t.icon        : 'Terminal',
    color:       typeof t.color === 'string'        ? t.color       : '#6c5ce7',
    category:    typeof t.category === 'string'     ? t.category    : '',
    runMode:     typeof t.runMode === 'string'      ? t.runMode     : '',
  };
}

// ── In-memory session store ───────────────────────────────────────────────────
const sessions = new Map(); // token → { userId, attuid, createdAt }
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

function createSession(userId, attuid) {
  const token = randomUUID();
  sessions.set(token, { userId, attuid, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) { sessions.delete(token); return null; }
  return s;
}

function requireAuth(req, res, next) {
  const token = req.headers['x-hub-token'];
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'No autenticado. Iniciá sesión nuevamente.' });
  req.hubSession = session;
  next();
}

// ── In-memory rate limiter ───────────────────────────────────────────────────
const rateLimits = new Map(); // ip → { count, resetAt }
const RL_WINDOW = 15 * 60 * 1000; // 15 min
const RL_MAX    = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) entry = { count: 0, resetAt: now + RL_WINDOW };
  entry.count++;
  rateLimits.set(ip, entry);
  return entry.count > RL_MAX;
}

// ── CORS — localhost (any port, for dev) + LAN IP on 3001 ────────────────────
const LAN_IP = getLocalIP();

app.use(cors({
  origin: (origin, cb) => {
    // No origin = same-origin request (production build served by Express)
    if (!origin) return cb(null, true);
    // Allow any localhost / 127.0.0.1 port (covers Vite :5173 in dev and Express :3001 in prod)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    // Allow any LAN IP (10.x, 172.16-31.x, 192.168.x) on any port
    if (/^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(origin)) return cb(null, true);
    cb(null, false); // reject silently (no 500, just no CORS header)
  },
  credentials: false,
}));
app.use(express.json({ limit: '10mb' }));

// ── Serve built React app ────────────────────────────────────────────────────
if (fs.existsSync(DIST_DIR)) app.use(express.static(DIST_DIR));

// ── Atomic file write (ALTA-01) ───────────────────────────────────────────────
function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── Initialize data files ────────────────────────────────────────────────────
if (!fs.existsSync(DATA_FILE))  atomicWrite(DATA_FILE,  JSON.stringify({ snippets: [], tools: [] }, null, 2));
if (!fs.existsSync(USERS_FILE)) atomicWrite(USERS_FILE, JSON.stringify([], null, 2));

// ── Helper: read/write users ─────────────────────────────────────────────────
function readUsers()   { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { return []; } }
function writeUsers(u) { atomicWrite(USERS_FILE, JSON.stringify(u, null, 2)); }

// ── POST /api/auth/login ─────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (checkRateLimit(ip)) return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });

  const { attuid, pin } = req.body || {};
  if (!attuid || !pin) return res.status(400).json({ error: 'ATTUID y PIN requeridos.' });

  const users = readUsers();
  const idx = users.findIndex(u => u.attuid.toUpperCase() === attuid.toUpperCase());
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const user = users[idx];
  let pinOk = false;

  // Auto-migrate plain-text PINs on first successful login
  if (!user.pin.includes(':')) {
    pinOk = (user.pin === String(pin));
    if (pinOk) {
      users[idx].pin = hashPin(pin);
    }
  } else {
    pinOk = verifyPin(pin, user.pin);
  }

  if (!pinOk) return res.status(401).json({ error: 'PIN incorrecto.' });

  users[idx].lastLogin = new Date().toISOString();
  writeUsers(users);

  const token = createSession(user.id, user.attuid);
  res.json({ id: user.id, attuid: user.attuid, settings: user.settings, token });
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (checkRateLimit(ip)) return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });

  const { attuid, pin } = req.body || {};
  if (!attuid || !pin) return res.status(400).json({ error: 'ATTUID y PIN requeridos.' });
  if (!/^\d+$/.test(String(pin))) return res.status(400).json({ error: 'El PIN debe contener solo dígitos.' });
  if (String(pin).length < 6) return res.status(400).json({ error: 'El PIN debe tener al menos 6 dígitos.' });

  const users = readUsers();
  if (users.find(u => u.attuid.toUpperCase() === attuid.toUpperCase()))
    return res.status(409).json({ error: 'El usuario ya existe.' });

  const newUser = {
    id: randomUUID(),
    attuid: attuid.toUpperCase(),
    pin: hashPin(pin),
    settings: { theme: 'dark', navMode: 'fixed', clocks: [], pinnedItems: [], adminUser: '', adminDomain: '', servers: [], recentConns: [] },
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };
  users.push(newUser);
  writeUsers(users);
  res.status(201).json({ id: newUser.id, attuid: newUser.attuid, settings: newUser.settings });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['x-hub-token'];
  sessions.delete(token);
  auditLog(req.hubSession.attuid, 'LOGOUT');
  res.json({ success: true });
});

// ── GET /api/users/:id ───────────────────────────────────────────────────────
app.get('/api/users/:id', requireAuth, (req, res) => {
  // Users can only read their own profile
  if (req.hubSession.userId !== req.params.id)
    return res.status(403).json({ error: 'Acceso denegado.' });
  const user = readUsers().find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Perfil no encontrado.' });
  res.json({ id: user.id, attuid: user.attuid, settings: user.settings });
});

// ── PUT /api/users/:id/settings ──────────────────────────────────────────────
app.put('/api/users/:id/settings', requireAuth, (req, res) => {
  // Users can only update their own settings
  if (req.hubSession.userId !== req.params.id)
    return res.status(403).json({ error: 'Acceso denegado.' });
  const { settings } = req.body || {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    return res.status(400).json({ error: 'Settings inválidos.' });
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Perfil no encontrado.' });
  // Whitelist-only merge — prevents prototype pollution
  users[idx].settings = { ...users[idx].settings, ...sanitizeSettings(settings) };
  writeUsers(users);
  res.json({ success: true });
});

// ── GET /api/snippets ─────────────────────────────────────────────────────────
app.get('/api/snippets', requireAuth, (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')));
  } catch {
    res.status(500).json({ error: 'Error al leer el archivo de datos.' });
  }
});

// ── POST /api/snippets ────────────────────────────────────────────────────────
app.post('/api/snippets', requireAuth, (req, res) => {
  const { snippets, tools } = req.body || {};
  if (!Array.isArray(snippets) || !Array.isArray(tools))
    return res.status(400).json({ error: 'Estructura de datos inválida.' });
  if (snippets.length > 2000 || tools.length > 500)
    return res.status(400).json({ error: 'Límite de datos excedido.' });
  try {
    // Sanitize each item — strips prototype pollution and unknown fields
    const cleanSnippets = snippets.map(sanitizeSnippet);
    const cleanTools    = tools.map(sanitizeTool);
    atomicWrite(DATA_FILE, JSON.stringify({ snippets: cleanSnippets, tools: cleanTools }, null, 2));
    auditLog(req.hubSession.attuid, 'SAVE_DATA', `snippets=${cleanSnippets.length} tools=${cleanTools.length}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al guardar los datos.' });
  }
});

// ── Strip PowerShell CLIXML envelope ─────────────────────────────────────────
function parsePsError(raw) {
  if (!raw) return '';
  if (raw.includes('#< CLIXML')) {
    const matches = [...raw.matchAll(/<S S="Error">([^<]*)<\/S>/g)];
    if (matches.length) {
      return matches
        .map(m => m[1].replace(/_x000D__x000A_/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean).join(' ').trim();
    }
  }
  return raw.trim();
}

// ── Validate identifiers (BLOCKER-04) ────────────────────────────────────────
function isValidIdent(s) {
  return typeof s === 'string' && /^[a-zA-Z0-9.\-_@\\]{1,128}$/.test(s);
}

// ── POST /api/elevated-terminal — protected ───────────────────────────────────
// Commands are generated client-side (makeConectarScript / makeRunAsToolScript)
// and use `runas` which creates its own visible CMD window with a password prompt.
app.post('/api/elevated-terminal', requireAuth, (req, res) => {
  const { command, adminUser, adminDomain } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Se requiere "command" en el body.' });
  }
  // Enforce maximum command length (prevent payload stuffing)
  if (command.length > 8192) {
    return res.status(400).json({ error: 'Comando demasiado largo.' });
  }
  // Validate admin identifiers if provided (BLOCKER-04 — isValidIdent now in use)
  if (adminUser   && !isValidIdent(adminUser))   return res.status(400).json({ error: 'adminUser inválido.' });
  if (adminDomain && !isValidIdent(adminDomain)) return res.status(400).json({ error: 'adminDomain inválido.' });

  // Audit every execution — who, when, first 120 chars of command
  auditLog(req.hubSession.attuid, 'EXEC_PS', command.slice(0, 120).replace(/\n/g, ' '));

  // Encode as UTF-16LE base64 → -EncodedCommand avoids shell argument injection
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 60000 }, (error, stdout, stderr) => {
    if (error) {
      if (error.killed) return res.status(500).json({ error: 'El comando tardó demasiado.' });
      return res.status(500).json({ error: parsePsError(stderr) || error.message || 'Error al ejecutar PowerShell.' });
    }
    res.json({ success: true, message: 'Ejecutado.', output: stdout || stderr || '' });
  });
});

// ── CPU real-time load ────────────────────────────────────────────────────────
function getCpuLoad() {
  return new Promise(resolve => {
    const s1 = os.cpus();
    setTimeout(() => {
      const s2 = os.cpus();
      let totalDiff = 0, idleDiff = 0;
      s1.forEach((cpu, i) => {
        const t1 = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const t2 = Object.values(s2[i].times).reduce((a, b) => a + b, 0);
        totalDiff += t2 - t1;
        idleDiff  += s2[i].times.idle - cpu.times.idle;
      });
      resolve(totalDiff > 0 ? +((1 - idleDiff / totalDiff) * 100).toFixed(0) : 0);
    }, 150);
  });
}

// ── GET /api/sysinfo — public (only shows local machine metrics, not sensitive) ─
app.get('/api/sysinfo', async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const cpus     = os.cpus();
    const cpuPct   = await getCpuLoad();
    res.json({
      ip:         getLocalIP(),
      totalMemGB: +(totalMem / 1073741824).toFixed(1),
      usedMemGB:  +(usedMem  / 1073741824).toFixed(2),
      memPct:     +(usedMem  / totalMem * 100).toFixed(0),
      cpuPct,
      cpuModel:   cpus[0]?.model?.split(' ').slice(0, 3).join(' ') || 'CPU',
      uptime:     Math.floor(os.uptime() / 3600),
      platform:   os.platform(),
    });
  } catch {
    res.status(500).json({ error: 'Error al obtener info del sistema.' });
  }
});

// ── GET /api/export/json — protected ─────────────────────────────────────────
app.get('/api/export/json', requireAuth, (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    auditLog(req.hubSession.attuid, 'EXPORT_JSON');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="codehub-backup.json"');
    res.send(raw);
  } catch { res.status(500).json({ error: 'Error al exportar JSON.' }); }
});

// ── GET /api/export/xlsx — protected ─────────────────────────────────────────
app.get('/api/export/xlsx', requireAuth, (req, res) => {
  try {
    const { snippets = [], tools = [] } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const wb = XLSX.utils.book_new();

    const categories = [...new Set(snippets.map(s => s.category || 'Sin Categoría'))];
    for (const cat of categories) {
      const rows = snippets
        .filter(s => (s.category || 'Sin Categoría') === cat)
        .map(s => ({
          Título: s.title, Descripción: s.description || '', Lenguaje: s.language,
          Autor: s.author || '', Tags: (s.tags || []).join(', '), Código: s.code,
          Creado: s.createdAt || '', Favorito: s.favorite ? 'Sí' : 'No',
        }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), cat.replace(/[:\\/?*[\]]/g, '').slice(0, 31));
    }

    if (tools.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        tools.map(t => ({ Nombre: t.name, Descripción: t.description || '', Comando: t.command, Ícono: t.icon, Color: t.color }))
      ), 'Herramientas');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    auditLog(req.hubSession.attuid, 'EXPORT_XLSX');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="codehub-backup.xlsx"');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/*path', (req, res) => {
  const index = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(404).send('App no compilada. Ejecuta "npm run build" primero.');
  }
});

// ── Global error handlers (ALTA-02) ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err.message || err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

process.on('uncaughtException',  (err)    => console.error('[UNCAUGHT]', err));
process.on('unhandledRejection', (reason) => console.error('[UNHANDLED]', reason));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Code Hub corriendo → http://localhost:${PORT}`);
  console.log(`   Red local        → http://${getLocalIP()}:${PORT}`);
  console.log(`📁 Datos            → ${DATA_FILE}`);
  console.log(`\n   Comparte la URL de red con tu equipo!\n`);
});

function getLocalIP() {
  try {
    const nets = os.networkInterfaces();
    for (const iface of Object.values(nets)) {
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch { return 'TU-IP'; }
  return 'TU-IP';
}
