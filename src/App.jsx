import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search, Plus, Star, Copy, Check, Trash2, Edit, Code2, Grid, List,
  ChevronLeft, ChevronRight, X, Tag, Clock, User, Zap, Shield,
  Terminal, Monitor, Settings, Network, Server, Cloud, Cpu, Command,
  Play, Wrench, AlertTriangle, MessageSquare, Mail, Wifi,
  Palette, Info, Globe, ExternalLink, Pin, Lock, Download, LogOut
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Hub Icon ────────────────────────────────────────────────────────────────
function HubIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="3,5 9,10 3,15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="11" y1="15" x2="17" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

function getAuthHeader() {
  try {
    const { token } = JSON.parse(localStorage.getItem('hub_session') || '{}');
    return token ? { 'Content-Type': 'application/json', 'x-hub-token': token } : { 'Content-Type': 'application/json' };
  } catch { return { 'Content-Type': 'application/json' }; }
}

const SNIPPET_CATEGORIES = [
  { id: 'all', label: 'Todos', icon: Grid },
  { id: 'Active Directory', label: 'Active Directory', icon: Server },
  { id: 'Networking', label: 'Networking', icon: Network },
  { id: 'Office 365', label: 'Office 365', icon: Cloud },
  { id: 'Hardware', label: 'Hardware', icon: Cpu },
  { id: 'Windows', label: 'Windows', icon: Monitor },
  { id: 'Scripts', label: 'Scripts', icon: Code2 },
  { id: 'Favoritos', label: '⭐ Favoritos', icon: Star },
];

const LANGUAGES = ['powershell', 'python', 'batch', 'bash', 'javascript', 'sql', 'cmd', 'vbscript', 'run'];

const TOOL_ICONS = { Terminal, Monitor, Shield, Server, Network, Cpu, Cloud, Wrench, Command, Settings };
const TOOL_ICON_NAMES = Object.keys(TOOL_ICONS);

// Default tools — commands run directly in the server's session context (no RunAs needed)
const DEFAULT_TOOLS = [
  {
    id: 'cmd-admin',
    name: 'CMD Admin',
    description: 'Terminal de comandos con privilegios elevados',
    command: 'Start-Process cmd.exe',
    icon: 'Command',
    color: '#f6ad55',
  },
  {
    id: 'taskmgr',
    name: 'Task Manager',
    description: 'Monitor de recursos y procesos del sistema',
    command: 'Start-Process taskmgr.exe',
    icon: 'Cpu',
    color: '#00b894',
  },
  {
    id: 'ps-admin',
    name: 'PowerShell Admin',
    description: 'Consola PowerShell para administración',
    command: 'pwsh.exe -NoExit -ExecutionPolicy Bypass',
    icon: 'Terminal',
    color: '#5b9cf6',
  },
  {
    id: 'sccm',
    name: 'SCCM Console',
    description: 'Gestión de configuración de endpoints',
    command: 'Start-Process "C:\\Program Files (x86)\\ConfigMgrConsole\\bin\\Microsoft.ConfigurationManagement.exe"',
    icon: 'Server',
    color: '#a855f7',
  },
  {
    id: 'remote-control',
    name: 'Control Remoto',
    description: 'Herramienta de asistencia y soporte remoto',
    command: 'Start-Process "C:\\Program Files (x86)\\ConfigMgrConsole\\bin\\i386\\CmRcViewer.exe"',
    icon: 'Monitor',
    color: '#e17055',
  },
  {
    id: 'gpedit',
    name: 'Editor de Políticas',
    description: 'Gestión de GPO y directivas locales',
    command: 'Start-Process gpedit.msc',
    icon: 'Shield',
    color: '#fdcb6e',
  },
];

// ─── Share Helpers ───────────────────────────────────────────────────────────

const shareToTeams = (snippet) => {
  const text = encodeURIComponent(`📌 *${snippet.title || 'Snippet'}*\n${snippet.description || ''}\n\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\``);
  window.open(`https://teams.microsoft.com/l/chat/0/0?users=&message=${text}`, '_blank');
};

const shareByEmail = (snippet) => {
  const subject = encodeURIComponent(`[Code Hub] ${snippet.title}`);
  const body = encodeURIComponent(`Script: ${snippet.title}\n\n${snippet.description}\n\n${snippet.code}`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

function getLangBadge(lang) {
  const map = { powershell: 'PS', python: 'PY', batch: 'BAT', bash: 'SH', javascript: 'JS', sql: 'SQL', cmd: 'CMD', vbscript: 'VBS', run: 'RUN' };
  return map[lang] || 'TXT';
}

function getLangClass(lang) {
  const map = { powershell: 'lang-powershell', python: 'lang-python', batch: 'lang-batch', bash: 'lang-bash', javascript: 'lang-javascript', sql: 'lang-sql', cmd: 'lang-cmd', vbscript: 'lang-default', run: 'lang-run' };
  return map[lang] || 'lang-default';
}

function formatDate(date) {
  if (!date) return '';
  return format(new Date(date), "d 'de' MMM, yyyy", { locale: es });
}

// ─── Network helpers ──────────────────────────────────────────────────────────

/** Returns `\\hostname\resource` as a safe display string */
function unc(hostname, resource) {
  return `\\\\${hostname}\\${resource}`;
}

/** Validates hostname (name or IPv4) and SMB resource. Returns error string or null. */
function validateHost(hostname, resource) {
  if (!hostname || !hostname.trim()) return 'El nombre del equipo es requerido.';
  if (!/^[a-zA-Z0-9.\-_]{1,64}$/.test(hostname.trim()))
    return 'Hostname inválido. Solo se permiten letras, números, guiones y puntos.';
  if (resource && !/^[a-zA-Z0-9$\-_]{1,32}$/.test(resource.trim()))
    return 'Recurso inválido. Solo se permiten letras, números, $ y guiones.';
  return null;
}

function highlight(code, lang) {
  if (!code) return '';
  let esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (lang === 'powershell' || lang === 'cmd' || lang === 'run') {
    esc = esc
      .replace(/(#[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="token-string">$1</span>')
      .replace(/\b(Get-|Set-|New-|Remove-|Add-|Import-|Export-|Start-|Stop-|Test-|Write-Host|Write-Output|Connect-|Enable-|Disable-|Enter-)(\w*)/g, '<span class="token-function">$1$2</span>')
      .replace(/\b(if|else|foreach|for|while|do|switch|try|catch|finally|return|function|param)\b/gi, '<span class="token-keyword">$1</span>')
      .replace(/(\$[\w:]+)/g, '<span class="token-variable">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="token-number">$1</span>');
  } else if (lang === 'python') {
    esc = esc
      .replace(/(#[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="token-string">$1</span>')
      .replace(/\b(def|class|import|from|return|if|elif|else|for|while|try|except|with|as|in|None|True|False|pass|break|continue|lambda|async|await)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\b(print|len|range|str|int|float|list|dict|open|self)\b/g, '<span class="token-builtin">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="token-number">$1</span>');
  } else if (lang === 'bash') {
    esc = esc
      .replace(/(#[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'[^']*')/g, '<span class="token-string">$1</span>')
      .replace(/\b(if|then|else|fi|for|while|do|done|echo|export|return|function)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/(\$[\w{]+}?)/g, '<span class="token-variable">$1</span>');
  }
  return esc;
}

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ─── Tag Input ────────────────────────────────────────────────────────────────

function TagInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState('');
  const ref = useRef(null);
  const addTag = (tag) => {
    const t = tag.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInputVal('');
  };
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inputVal); }
    if (e.key === 'Backspace' && !inputVal && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="tags-input-wrap" onClick={() => ref.current?.focus()}>
      {value.map(t => (
        <span key={t} className="tag-pill">{t}
          <button type="button" onClick={() => onChange(value.filter(x => x !== t))}>×</button>
        </span>
      ))}
      <input ref={ref} value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={handleKey}
        placeholder={value.length === 0 ? 'Tag, Enter para agregar...' : ''} />
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, visible }) {
  return (
    <div className={`toast ${type} ${visible ? 'visible' : ''}`}>
      {type === 'success' && <Check size={14} />}
      {type === 'error' && <AlertTriangle size={14} />}
      {message}
    </div>
  );
}

// ─── Tool Card ────────────────────────────────────────────────────────────────

function ToolCard({ tool, onRun, onEdit, onDelete, running, pinnedItems = [], onPinToggle }) {
  const IconComp = TOOL_ICONS[tool.icon] || Wrench;
  const isRunning = running === tool.id;
  const isPinned = pinnedItems.some(p => p.type === 'tool' && p.id === tool.id);
  const withoutStart = tool.command.replace(/^Start-Process /i, '').trim();
  const cmdPreview = withoutStart.startsWith('"')
    ? withoutStart.split('\\').pop().replace(/".*/g, '')
    : withoutStart.split(' ')[0];
  return (
    <div className="tool-card">
      <div className="tool-card-top">
        <div className="tool-icon-wrap" style={{ background: tool.color + '20', border: `1px solid ${tool.color}35` }}>
          <IconComp size={20} style={{ color: tool.color }} />
        </div>
        <div className="tool-card-actions">
          <button className={`icon-btn pin-btn ${isPinned ? 'active' : ''}`} title={isPinned ? 'Quitar del Dashboard' : 'Anclar al Dashboard'} onClick={() => onPinToggle?.('tool', tool.id)}><Pin size={12} /></button>
          {tool.locked
            ? <span className="icon-btn lock-badge" title="Herramienta protegida — solo lectura"><Lock size={11} /></span>
            : <>
                <button className="icon-btn" onClick={() => onEdit(tool)} title="Editar"><Edit size={12} /></button>
                <button className="icon-btn danger" onClick={() => onDelete(tool.id)} title="Eliminar"><Trash2 size={12} /></button>
              </>
          }
        </div>
      </div>
      <div className="tool-name">{tool.name}</div>
      <div className="tool-desc">{tool.description}</div>
      <div className="tool-command-preview">{cmdPreview}</div>
      <button
        className="tool-run-btn"
        onClick={() => onRun(tool)}
        disabled={isRunning}
        style={{ background: isRunning ? 'var(--bg-hover)' : tool.color, opacity: isRunning ? 0.7 : 1 }}
      >
        {isRunning
          ? <><Zap size={13} style={{ animation: 'pulse 0.6s infinite' }} /> Ejecutando…</>
          : <><Play size={13} fill="white" /> Ejecutar con Admin</>}
      </button>
    </div>
  );
}

// ─── Tool Edit Modal ──────────────────────────────────────────────────────────

function ToolModal({ tool, onSave, onClose }) {
  const isEdit = !!tool?.id;
  const [form, setForm] = useState({
    name: tool?.name || '',
    description: tool?.description || '',
    command: tool?.command || 'Start-Process  -Verb RunAs',
    icon: tool?.icon || 'Wrench',
    color: tool?.color || '#636eff',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const IconComp = TOOL_ICONS[form.icon] || Wrench;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Editar Herramienta' : '🔧 Nueva Herramienta'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8 }}>
            El comando se ejecutará automáticamente con permisos de administrador (UAC).
          </p>

          {/* Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-base)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: form.color + '22', border: `1px solid ${form.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconComp size={20} style={{ color: form.color }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{form.name || 'Nombre herramienta'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{form.description || 'Descripción...'}</div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Nombre *</label>
              <input placeholder="ej: Task Manager" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.color} onChange={e => set('color', e.target.value)}
                  style={{ width: 44, height: 38, padding: 4, cursor: 'pointer', borderRadius: 8 }} />
                {['#636eff','#a855f7','#06d6a0','#f6ad55','#fc8181','#5b9cf6','#68d391'].map(c =>
                  <div key={c} onClick={() => set('color', c)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '2px solid white' : '2px solid transparent', flexShrink: 0 }} />
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Descripción (se muestra en la card)</label>
            <input placeholder="Breve descripción de qué hace" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Comando PowerShell *</label>
            <textarea
              className="code-editor-area"
              rows={4}
              placeholder="Start-Process notepad.exe -Verb RunAs"
              value={form.command}
              onChange={e => set('command', e.target.value)}
              spellCheck={false}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              💡 Usa <code style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)', background: 'rgba(99,110,255,0.1)', padding: '0 4px', borderRadius: 4 }}>-Verb RunAs</code> para que pida credenciales de administrador
            </span>
          </div>

          <div className="form-group">
            <label>Ícono</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TOOL_ICON_NAMES.map(name => {
                const Ic = TOOL_ICONS[name];
                return (
                  <button key={name} type="button" onClick={() => set('icon', name)}
                    style={{ width: 38, height: 38, borderRadius: 8, border: `1px solid ${form.icon === name ? 'var(--accent)' : 'var(--border)'}`, background: form.icon === name ? 'rgba(99,110,255,0.15)' : 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: form.icon === name ? 'var(--accent)' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                    <Ic size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...tool, ...form, id: tool?.id || genId() })} disabled={!form.name.trim() || !form.command.trim()}>
            <Check size={14} /> {isEdit ? 'Guardar' : 'Agregar Herramienta'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Snippet Form Modal ───────────────────────────────────────────────────────

function SnippetModal({ snippet, onSave, onClose, userName }) {
  const isEdit = !!snippet?.id;
  const [form, setForm] = useState({
    title: snippet?.title || '',
    description: snippet?.description || '',
    code: snippet?.code || '',
    language: snippet?.language || 'powershell',
    category: snippet?.category || 'Scripts',
    author: snippet?.author || userName || '',
    tags: snippet?.tags || [],
  });
  const authorLocked = !!(snippet?.author || userName);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.title.trim() || !form.code.trim()) return;
    onSave({ ...snippet, ...form, id: snippet?.id || genId(), createdAt: snippet?.createdAt || new Date().toISOString(), favorite: snippet?.favorite || false });
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Editar Snippet' : '✨ Nuevo Snippet'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Título *</label>
            <input placeholder="ej: Reset contraseña Active Directory" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Descripción / Instrucciones</label>
            <textarea placeholder="Para qué sirve, requisitos, cómo usarlo..." value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Lenguaje</label>
              <select value={form.language} onChange={e => set('language', e.target.value)}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Categoría</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                {SNIPPET_CATEGORIES.slice(1, -1).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Código *</label>
            <textarea className="code-editor-area" placeholder="Pega tu código aquí..." value={form.code} onChange={e => set('code', e.target.value)} rows={10} spellCheck={false} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Autor</label>
              <input placeholder="Tu nombre" value={form.author} onChange={e => set('author', e.target.value)} disabled={authorLocked} />
            </div>
            <div className="form-group">
              <label>Tags</label>
              <TagInput value={form.tags} onChange={v => set('tags', v)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.title.trim() || !form.code.trim()}>
            <Plus size={14} />{isEdit ? 'Guardar cambios' : 'Agregar Snippet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Code Card — Stitch design ────────────────────────────────────────────────

function CodeCard({ snippet, onClick, onToggleFav, onDelete, onEdit, pinnedItems = [], onPinToggle }) {
  const [copied, setCopied] = useState(false);
  const isPinned = pinnedItems.some(p => p.type === 'snippet' && p.id === snippet.id);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = (snippet.code || '').split('\n').slice(0, 3);
  const highlighted = highlight(lines.join('\n'), snippet.language);
  const highlightedLines = highlighted.split('\n');

  return (
    <div className="code-card" onClick={() => onClick(snippet)}>
      {/* Pills row at top */}
      <div className="card-top-pills">
        <span className={`lang-pill ${getLangClass(snippet.language)}`}>{getLangBadge(snippet.language)}</span>
        <span className="category-pill">{snippet.category}</span>
        <div className="card-actions">
          <button className={`icon-btn fav ${snippet.favorite ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onToggleFav(snippet.id); }}>
            <Star size={12} fill={snippet.favorite ? 'currentColor' : 'none'} />
          </button>
          <button className={`icon-btn ${copied ? 'copy-success' : ''}`} onClick={handleCopy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button className={`icon-btn pin-btn ${isPinned ? 'active' : ''}`} title={isPinned ? 'Quitar del Dashboard' : 'Anclar al Dashboard'} onClick={e => { e.stopPropagation(); onPinToggle?.('snippet', snippet.id); }}>
            <Pin size={12} />
          </button>
          {snippet.locked
            ? <span className="icon-btn lock-badge" title="Entrada protegida — solo lectura"><Lock size={11} /></span>
            : <>
                <button className="icon-btn" onClick={e => { e.stopPropagation(); onEdit(snippet); }}><Edit size={12} /></button>
                <button className="icon-btn danger" onClick={e => { e.stopPropagation(); onDelete(snippet.id); }}><Trash2 size={12} /></button>
              </>
          }
        </div>
      </div>

      {/* Title */}
      <div className="card-title">{snippet.title}</div>

      {/* Description */}
      {snippet.description && <div className="card-description">{snippet.description}</div>}

      {/* Code preview */}
      <div className="card-code-block">
        <div
          className="code-content"
          dangerouslySetInnerHTML={{ __html: highlightedLines.slice(0, 3).join('\n') }}
        />
      </div>

      {/* Footer */}
      <div className="card-footer">
        <div className="card-author-info">
          <div className="author-avatar">{(snippet.author || 'A').charAt(0).toUpperCase()}</div>
          <span>{snippet.author ? `${snippet.author.split(' ')[0].slice(0,6)}.` : 'Anon'}</span>
          <span>·</span>
          <span>{formatDate(snippet.createdAt)}</span>
        </div>
        <div className="card-tags">
          {snippet.tags?.slice(0, 2).map(t => <span key={t} className="tag">#{t}</span>)}
        </div>
      </div>
    </div>
  );
}

// ─── Snippet Row (List mode) ──────────────────────────────────────────────────

function SnippetRow({ snippet, onClick, onToggleFav, onDelete, onEdit, pinnedItems = [], onPinToggle }) {
  const [copied, setCopied] = useState(false);
  const isPinned = pinnedItems.some(p => p.type === 'snippet' && p.id === snippet.id);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="snippet-row" onClick={() => onClick(snippet)}>
      <span className={`lang-pill ${getLangClass(snippet.language)}`} style={{ flexShrink: 0 }}>{getLangBadge(snippet.language)}</span>
      <div className="snippet-row-info">
        <span className="snippet-row-title">{snippet.title}</span>
        {snippet.description && <span className="snippet-row-desc">{snippet.description}</span>}
      </div>
      <span className="snippet-row-cat">{snippet.category}</span>
      <span className="snippet-row-meta">{snippet.author ? snippet.author.split(' ')[0] : 'Anon'} · {formatDate(snippet.createdAt)}</span>
      <div className="snippet-row-actions" onClick={e => e.stopPropagation()}>
        <button className={`icon-btn fav ${snippet.favorite ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onToggleFav(snippet.id); }}><Star size={12} fill={snippet.favorite ? 'currentColor' : 'none'} /></button>
        <button className={`icon-btn ${copied ? 'copy-success' : ''}`} onClick={handleCopy}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>
        <button className={`icon-btn pin-btn ${isPinned ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onPinToggle?.('snippet', snippet.id); }}><Pin size={12} /></button>
        {snippet.locked
          ? <span className="icon-btn lock-badge" title="Protegido"><Lock size={11} /></span>
          : <>
              <button className="icon-btn" onClick={e => { e.stopPropagation(); onEdit(snippet); }}><Edit size={12} /></button>
              <button className="icon-btn danger" onClick={e => { e.stopPropagation(); onDelete(snippet.id); }}><Trash2 size={12} /></button>
            </>
        }
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({ snippet, onClose, onEdit, onToggleFav, onToast }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    onToast('✅ Código copiado al portapapeles', 'success');
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className={`card-lang-badge ${getLangClass(snippet.language)}`} style={{ width: 36, height: 36, fontSize: 11, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>
              {getLangBadge(snippet.language)}
            </div>
            <div>
              <h2 style={{ fontSize: 16 }}>{snippet.title}</h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                <span className="badge badge-category">{snippet.category}</span>
                <span className="badge badge-lang">{snippet.language}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`icon-btn fav ${snippet.favorite ? 'active' : ''}`} onClick={() => onToggleFav(snippet.id)}><Star size={15} fill={snippet.favorite ? 'currentColor' : 'none'} /></button>
            <button className="icon-btn" onClick={() => onEdit(snippet)}><Edit size={15} /></button>
            <button className="icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><User size={11} /> {snippet.author || 'Anónimo'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={11} /> {formatDate(snippet.createdAt)}</span>
          </div>
          {snippet.description && <div className="detail-description">{snippet.description}</div>}
          <div className="detail-code-block">
            <div className="code-block-header">
              <span className="code-block-lang">{snippet.language}</span>
              <button className={`copy-btn ${copied ? 'success' : ''}`} onClick={handleCopy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado!' : 'Copiar código'}
              </button>
            </div>
            <pre dangerouslySetInnerHTML={{ __html: highlight(snippet.code, snippet.language) }} />
          </div>
          {snippet.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {snippet.tags.map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 9px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)' }}>
                  <Tag size={10} />{t}
                </span>
              ))}
            </div>
          )}
          <div className="share-row">
            <button className="share-btn teams" onClick={() => shareToTeams(snippet)}>
              <MessageSquare size={13} /> Compartir en Teams
            </button>
            <button className="share-btn email" onClick={() => shareByEmail(snippet)}>
              <Mail size={13} /> Enviar por Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Panel ───────────────────────────────────────────────────────────

function CalendarPanel({ snippets, onSelectSnippet }) {
  const today = new Date();
  const [current, setCurrent] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(null);

  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
  const firstDay = new Date(current.year, current.month, 1).getDay();

  const activityMap = {};
  snippets.forEach(s => {
    if (!s.createdAt) return;
    const d = new Date(s.createdAt);
    if (d.getFullYear() === current.year && d.getMonth() === current.month) {
      const day = d.getDate();
      if (!activityMap[day]) activityMap[day] = [];
      activityMap[day].push(s);
    }
  });

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames = ['D','L','M','M','J','V','S'];
  const prev = () => setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const next = () => setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });
  const goToday = () => { setCurrent({ year: today.getFullYear(), month: today.getMonth() }); setSelected(today.getDate()); };
  const isCurrentMonth = current.year === today.getFullYear() && current.month === today.getMonth();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i });

  const selectedSnippets = selected ? (activityMap[selected] || []) : [];
  const recentSnippets = snippets.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return (
    <div className="calendar-panel">
      <div className="calendar-header">
        <h3>Actividad</h3>
        <div className="cal-nav">
          <button onClick={prev}><ChevronLeft size={12} /></button>
          <span>{monthNames[current.month]} {current.year}</span>
          <button onClick={next}><ChevronRight size={12} /></button>
          {!isCurrentMonth && (
            <button onClick={goToday} title="Ir a hoy" style={{ marginLeft: 2, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--accent-light)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Inter', sans-serif", letterSpacing: '0.04em' }}>
              HOY
            </button>
          )}
        </div>
      </div>
      <div className="calendar-grid">
        <div className="cal-weekdays">{dayNames.map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cal-days">
          {cells.map((cell, i) => {
            if (!cell.day) return <div key={i} />;
            const isToday = cell.day === today.getDate() && current.month === today.getMonth() && current.year === today.getFullYear();
            const hasActivity = !!activityMap[cell.day];
            const isSel = cell.day === selected;
            return (
              <div key={i} className={`cal-day ${isToday ? 'today' : ''} ${hasActivity ? 'has-activity' : ''} ${isSel ? 'selected' : ''}`}
                onClick={() => setSelected(isSel ? null : (hasActivity ? cell.day : null))}>
                {cell.day}
              </div>
            );
          })}
        </div>
      </div>
      <div className="calendar-activity">
        {selected && selectedSnippets.length > 0 ? (
          <>
            <div className="activity-section-label">{selected} de {monthNames[current.month]}</div>
            {selectedSnippets.map((s, i) => {
              const colors = ['#6c5ce7','#00b894','#fdcb6e','#e17055','#5b9cf6'];
              return (
                <div key={s.id} className="activity-item" onClick={() => onSelectSnippet(s)}>
                  <div className="activity-dot" style={{ background: colors[i % colors.length] + '25', color: colors[i % colors.length] }}>
                    <Edit size={11} />
                  </div>
                  <div><h4>{s.title}</h4><p>{s.author || 'Anónimo'} · {s.category}</p></div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <div className="activity-section-label">Recientes</div>
            {recentSnippets.map((s, i) => {
              const icons = [Edit, Star, Plus, Settings, Copy];
              const colors = ['#6c5ce7','#fdcb6e','#00b894','#5b9cf6','#e17055'];
              const IconC = icons[i % icons.length];
              return (
                <div key={s.id} className="activity-item" onClick={() => onSelectSnippet(s)}>
                  <div className="activity-dot" style={{ background: colors[i % colors.length] + '25', color: colors[i % colors.length] }}>
                    <IconC size={11} />
                  </div>
                  <div><h4>{s.title}</h4><p>{formatDate(s.createdAt)} · Por {s.author || 'Anón'}</p></div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tools View ───────────────────────────────────────────────────────────────

function ToolsView({ tools, onUpdateTools, onToast, pinnedItems = [], onPinToggle, adminUser = '', adminDomain = '' }) {
  const [running, setRunning] = useState(null);
  const [editTool, setEditTool] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const filteredTools = localSearch
    ? tools.filter(t => {
        const q = localSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.command.toLowerCase().includes(q);
      })
    : tools;

  const runTool = async (tool) => {
    setRunning(tool.id);
    const cmd = (adminUser && adminUser.trim())
      ? makeRunAsToolScript(tool.command, adminDomain, adminUser)
      : tool.command;
    try {
      const res = await fetch(`${API}/elevated-terminal`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onToast(`✅ ${tool.name} lanzado con éxito`, 'success');
    } catch (err) {
      onToast(`❌ Error al lanzar ${tool.name}: ${err.message}`, 'error');
    } finally {
      setTimeout(() => setRunning(null), 1500);
    }
  };

  const handleSaveTool = (tool) => {
    const isEdit = tools.some(t => t.id === tool.id);
    const updated = isEdit ? tools.map(t => t.id === tool.id ? tool : t) : [...tools, tool];
    onUpdateTools(updated);
    setEditTool(null);
    setShowNew(false);
    onToast(isEdit ? '✅ Herramienta actualizada' : '✅ Herramienta agregada', 'success');
  };

  const handleDelete = (id) => {
    onUpdateTools(tools.filter(t => t.id !== id));
    onToast('🗑️ Herramienta eliminada', 'success');
  };

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-title">
          <h2><Shield size={20} /> Herramientas Admin</h2>
          <p>Ejecuta aplicaciones con credenciales — un clic, sin complicaciones</p>
        </div>
        <div className="search-wrap" style={{ width: 200 }}>
          <Search size={13} />
          <input placeholder="Buscar herramienta..." value={localSearch} onChange={e => setLocalSearch(e.target.value)} />
        </div>
        <button className="btn-new" onClick={() => setShowNew(true)} style={{ width: 'auto', padding: '9px 16px' }}>
          <Plus size={14} /> Nueva Herramienta
        </button>
      </div>

      <div className="content-area">
        {/* Info banner */}
        <div className="info-banner">
          <div className="info-banner-icon"><Shield size={16} /></div>
          <div>
            <h4>Credenciales de Servidor</h4>
            <p>Las herramientas listadas se ejecutan automáticamente con privilegios elevados utilizando las credenciales seguras del servidor configurado. No es necesario introducir la contraseña de administrador manualmente.</p>
          </div>
        </div>

        <div className="tools-grid">
          {filteredTools.map(tool => (
            <ToolCard key={tool.id} tool={tool} onRun={runTool} onEdit={setEditTool} onDelete={handleDelete} running={running} pinnedItems={pinnedItems} onPinToggle={onPinToggle} />
          ))}
          <button className="add-tool-card" onClick={() => setShowNew(true)}>
            <Plus size={28} />
            <span>Agregar herramienta</span>
            <small>Custom Shortcut</small>
          </button>
        </div>
      </div>

      {(showNew || editTool) && (
        <ToolModal tool={editTool} onSave={handleSaveTool} onClose={() => { setShowNew(false); setEditTool(null); }} />
      )}
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({ syncStatus, lastSync, localIP, onOpenConfig, clocks = [], activeProfile, onLogout }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const mainClock = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mainDate = now.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  const isOnline = syncStatus !== 'error';
  const isSyncing = syncStatus === 'syncing';
  const attuid = activeProfile?.attuid || '';
  const initial = attuid.slice(0, 2).toUpperCase();

  return (
    <div className="status-bar">
      {/* LEFT — IP */}
      <div className="status-bar-left">
        <span className="status-item status-count" title="IP Local">
          IP: {localIP || '—'}
        </span>
      </div>

      <div className="status-bar-center" />

      {/* RIGHT — user/logout | sep | settings | sep | clock */}
      <div className="status-bar-right">
        {attuid && (
          <span className="status-user-badge" title={`Sesión activa: ${attuid}`}>
            <span className="status-user-avatar">{initial}</span>
            <span className="status-user-name">{attuid}</span>
            <button className="status-icon-btn" title="Cambiar usuario" onClick={onLogout} style={{ marginLeft: 2 }}>
              <LogOut size={12} />
            </button>
          </span>
        )}
        <span className="status-divider" />
        <button className="status-icon-btn status-config-btn" onClick={onOpenConfig} title="Configuración">
          <Settings size={15} />
        </button>
        <span className="status-divider" />
        <span className="status-local-time">
          <span className="clock-time-local">{mainClock}</span>
          <span className="clock-time-local clock-date-local">{mainDate}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Clock Editor ─────────────────────────────────────────────────────────────

const CITY_TZ = [
  // ── Américas ──
  { city: 'Nueva York',      country: 'EE.UU.',          tz: 'America/New_York',                  k: ['new york','nyc','miami','boston','washington','dc','estados unidos','usa'] },
  { city: 'Los Ángeles',     country: 'EE.UU.',          tz: 'America/Los_Angeles',               k: ['los angeles','la','california','san francisco','las vegas','seattle'] },
  { city: 'Chicago',         country: 'EE.UU.',          tz: 'America/Chicago',                   k: ['chicago','illinois','houston','dallas','texas'] },
  { city: 'Denver',          country: 'EE.UU.',          tz: 'America/Denver',                    k: ['denver','colorado','salt lake'] },
  { city: 'Phoenix',         country: 'EE.UU.',          tz: 'America/Phoenix',                   k: ['phoenix','arizona'] },
  { city: 'Toronto',         country: 'Canadá',          tz: 'America/Toronto',                   k: ['toronto','canada','ontario','montreal','ottawa'] },
  { city: 'Vancouver',       country: 'Canadá',          tz: 'America/Vancouver',                 k: ['vancouver','british columbia','bc'] },
  { city: 'México DF',       country: 'México',          tz: 'America/Mexico_City',               k: ['mexico','cdmx','ciudad de mexico','df','guadalajara'] },
  { city: 'Buenos Aires',    country: 'Argentina',       tz: 'America/Argentina/Buenos_Aires',    k: ['buenos aires','argentina','baires','arg','cordoba','rosario'] },
  { city: 'São Paulo',       country: 'Brasil',          tz: 'America/Sao_Paulo',                 k: ['sao paulo','brasil','brazil','sp','rio de janeiro','rio','san pablo'] },
  { city: 'Santiago',        country: 'Chile',           tz: 'America/Santiago',                  k: ['santiago','chile'] },
  { city: 'Lima',            country: 'Perú',            tz: 'America/Lima',                      k: ['lima','peru'] },
  { city: 'Bogotá',          country: 'Colombia',        tz: 'America/Bogota',                    k: ['bogota','colombia'] },
  { city: 'Caracas',         country: 'Venezuela',       tz: 'America/Caracas',                   k: ['caracas','venezuela'] },
  { city: 'La Paz',          country: 'Bolivia',         tz: 'America/La_Paz',                    k: ['la paz','bolivia'] },
  // ── Europa ──
  { city: 'Londres',         country: 'Reino Unido',     tz: 'Europe/London',                     k: ['london','reino unido','uk','england','inglaterra','gb','dublin','irlanda'] },
  { city: 'Madrid',          country: 'España',          tz: 'Europe/Madrid',                     k: ['madrid','espana','spain','barcelona','sevilla','valencia','bilbao'] },
  { city: 'París',           country: 'Francia',         tz: 'Europe/Paris',                      k: ['paris','france','francia','lyon','marsella'] },
  { city: 'Berlín',          country: 'Alemania',        tz: 'Europe/Berlin',                     k: ['berlin','germany','alemania','munich','hamburgo','frankfurt'] },
  { city: 'Ámsterdam',       country: 'Países Bajos',    tz: 'Europe/Amsterdam',                  k: ['amsterdam','holanda','netherlands','paises bajos'] },
  { city: 'Roma',            country: 'Italia',          tz: 'Europe/Rome',                       k: ['rome','roma','italy','italia','milan','milano','napoles'] },
  { city: 'Zúrich',          country: 'Suiza',           tz: 'Europe/Zurich',                     k: ['zurich','suiza','switzerland','ginebra','geneva','berna'] },
  { city: 'Lisboa',          country: 'Portugal',        tz: 'Europe/Lisbon',                     k: ['lisbon','lisboa','portugal','oporto'] },
  { city: 'Moscú',           country: 'Rusia',           tz: 'Europe/Moscow',                     k: ['moscow','moscu','russia','rusia','san petersburgo'] },
  { city: 'Estambul',        country: 'Turquía',         tz: 'Europe/Istanbul',                   k: ['istanbul','estambul','turkey','turquia'] },
  { city: 'Varsovia',        country: 'Polonia',         tz: 'Europe/Warsaw',                     k: ['warsaw','varsovia','poland','polonia'] },
  { city: 'Estocolmo',       country: 'Suecia',          tz: 'Europe/Stockholm',                  k: ['stockholm','estocolmo','sweden','suecia','oslo','noruega','copenhague','dinamarca'] },
  { city: 'Helsinki',        country: 'Finlandia',       tz: 'Europe/Helsinki',                   k: ['helsinki','finlandia','finland'] },
  { city: 'Atenas',          country: 'Grecia',          tz: 'Europe/Athens',                     k: ['athens','atenas','greece','grecia'] },
  { city: 'Bucarest',        country: 'Rumania',         tz: 'Europe/Bucharest',                  k: ['bucharest','bucarest','romania','rumania'] },
  // ── Medio Oriente / África ──
  { city: 'Dubái',           country: 'EAU',             tz: 'Asia/Dubai',                        k: ['dubai','uae','eau','emiratos','abu dhabi'] },
  { city: 'Riad',            country: 'Arabia Saudita',  tz: 'Asia/Riyadh',                       k: ['riyadh','riad','saudi','arabia saudita'] },
  { city: 'Tel Aviv',        country: 'Israel',          tz: 'Asia/Jerusalem',                    k: ['tel aviv','israel','jerusalem'] },
  { city: 'El Cairo',        country: 'Egipto',          tz: 'Africa/Cairo',                      k: ['cairo','el cairo','egypt','egipto'] },
  { city: 'Johannesburgo',   country: 'Sudáfrica',       tz: 'Africa/Johannesburg',               k: ['johannesburg','johannesburgo','south africa','sudafrica','cape town'] },
  { city: 'Lagos',           country: 'Nigeria',         tz: 'Africa/Lagos',                      k: ['lagos','nigeria','abuja'] },
  { city: 'Nairobi',         country: 'Kenia',           tz: 'Africa/Nairobi',                    k: ['nairobi','kenya','kenia'] },
  // ── Asia ──
  { city: 'Tokio',           country: 'Japón',           tz: 'Asia/Tokyo',                        k: ['tokyo','japan','japon','japo','tokio','osaka','kyoto','jp'] },
  { city: 'Pekín',           country: 'China',           tz: 'Asia/Shanghai',                     k: ['beijing','china','pekin','shanghai','shenzhen','guangzhou','cn'] },
  { city: 'Seúl',            country: 'Corea del Sur',   tz: 'Asia/Seoul',                        k: ['seoul','seul','korea','corea','south korea','corea del sur','kr'] },
  { city: 'Singapur',        country: 'Singapur',        tz: 'Asia/Singapore',                    k: ['singapore','singapur','sg'] },
  { city: 'Hong Kong',       country: 'China',           tz: 'Asia/Hong_Kong',                    k: ['hong kong','hk'] },
  { city: 'Mumbai',          country: 'India',           tz: 'Asia/Kolkata',                      k: ['mumbai','bombay','india','delhi','kolkata','new delhi','bangalore','in'] },
  { city: 'Bangkok',         country: 'Tailandia',       tz: 'Asia/Bangkok',                      k: ['bangkok','thailand','tailandia','hanoi','vietnam'] },
  { city: 'Yakarta',         country: 'Indonesia',       tz: 'Asia/Jakarta',                      k: ['jakarta','yakarta','indonesia'] },
  { city: 'Kuala Lumpur',    country: 'Malasia',         tz: 'Asia/Kuala_Lumpur',                 k: ['kuala lumpur','kl','malaysia','malasia'] },
  { city: 'Karachi',         country: 'Pakistán',        tz: 'Asia/Karachi',                      k: ['karachi','pakistan','islamabad'] },
  { city: 'Colombo',         country: 'Sri Lanka',       tz: 'Asia/Colombo',                      k: ['colombo','sri lanka'] },
  { city: 'Dhaka',           country: 'Bangladesh',      tz: 'Asia/Dhaka',                        k: ['dhaka','bangladesh'] },
  { city: 'Tashkent',        country: 'Uzbekistán',      tz: 'Asia/Tashkent',                     k: ['tashkent','uzbekistan'] },
  // ── Oceanía ──
  { city: 'Sídney',          country: 'Australia',       tz: 'Australia/Sydney',                  k: ['sydney','sidnei','australia','melbourne','brisbane','au'] },
  { city: 'Perth',           country: 'Australia',       tz: 'Australia/Perth',                   k: ['perth','western australia'] },
  { city: 'Auckland',        country: 'Nueva Zelanda',   tz: 'Pacific/Auckland',                  k: ['auckland','new zealand','nueva zelanda','nz','wellington'] },
  // ── Universal ──
  { city: 'UTC / GMT',       country: 'Universal',       tz: 'UTC',                               k: ['utc','gmt','universal'] },
];

function normStr(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function ClockEditor({ clocks, onChange }) {
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const getOffset = (tz) => {
    try {
      const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
      return parts.find(p => p.type === 'timeZoneName')?.value || '';
    } catch { return ''; }
  };

  const suggestions = useMemo(() => {
    if (query.length < 2) return [];
    const q = normStr(query);
    return CITY_TZ.filter(c =>
      normStr(c.city).includes(q) ||
      normStr(c.country).includes(q) ||
      c.k.some(k => k.includes(q))
    ).slice(0, 8);
  }, [query]);

  const handleSelect = (c) => {
    setSelected(c);
    setQuery(c.city);
    setLabel(c.city);
    setOpen(false);
  };

  const handleAdd = () => {
    if (!selected || clocks.length >= 5) return;
    onChange([...clocks, { tz: selected.tz, label: label.trim() || selected.city }]);
    setQuery(''); setLabel(''); setSelected(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {clocks.map((c, i) => (
        <div key={i} className="clock-item">
          <Globe size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginLeft: 8 }}>{c.tz}</span>
            <span style={{ color: 'var(--success)', fontSize: 10, marginLeft: 6 }}>{getOffset(c.tz)}</span>
          </div>
          <button className="icon-btn danger" onClick={() => onChange(clocks.filter((_, j) => j !== i))}><X size={12} /></button>
        </div>
      ))}

      {clocks.length < 5 && (
        <div>
          <div className="config-field" style={{ position: 'relative' }}>
            <label>Buscar ciudad o país</label>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="ej: Japón, Nueva York, Sydney…"
              autoComplete="off"
            />
            {open && suggestions.length > 0 && (
              <div className="tz-dropdown">
                {suggestions.map((c, i) => (
                  <div key={i} className="tz-option" onMouseDown={() => handleSelect(c)}>
                    <span className="tz-opt-city">{c.city}</span>
                    <span className="tz-opt-country">{c.country}</span>
                    <span className="tz-opt-iana">{c.tz}</span>
                    <span className="tz-opt-offset">{getOffset(c.tz)}</span>
                  </div>
                ))}
              </div>
            )}
            {open && query.length >= 2 && suggestions.length === 0 && (
              <div className="tz-dropdown">
                <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Sin resultados para "{query}"</div>
              </div>
            )}
          </div>

          {selected && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
              <div className="config-field" style={{ flex: 1 }}>
                <label>Etiqueta</label>
                <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder={selected.city} />
              </div>
              <button className="btn btn-primary" onClick={handleAdd} style={{ height: 36 }}>
                <Plus size={13} /> Agregar
              </button>
            </div>
          )}
        </div>
      )}
      <span className="config-hint">{clocks.length}/5 zonas · La hora local siempre aparece resaltada en el status bar</span>
    </div>
  );
}

// ─── Config View ──────────────────────────────────────────────────────────────

function ConfigView({ userName, onUserNameChange, theme, onThemeChange, snippetCount, toolCount, lastSync, clocks, onClocksChange, navMode, onNavModeChange, adminUser, onAdminUserChange, adminDomain, onAdminDomainChange }) {
  const [section, setSection] = useState('perfil');
  const [nameInput, setNameInput] = useState(userName);
  const [domainInput, setDomainInput] = useState(adminDomain);
  const [userInput, setUserInput] = useState(adminUser);

  const NAV = [
    { id: 'perfil',        icon: User,    label: 'Perfil' },
    { id: 'credenciales',  icon: Shield,  label: 'Credenciales' },
    { id: 'interfaz',      icon: Palette, label: 'Interfaz' },
    { id: 'timezones',     icon: Globe,   label: 'TimeZones' },
    { id: 'about',         icon: Info,    label: 'Sobre la app' },
  ];

  return (
    <div className="config-shell">
      {/* ── Sidebar ── */}
      <div className="config-sidebar">
        <div className="config-sidebar-brand"><Settings size={14} /> Configuración</div>
        {NAV.map(n => (
          <button key={n.id} className={`config-nav-item ${section === n.id ? 'active' : ''}`} onClick={() => setSection(n.id)}>
            <n.icon size={14} /> {n.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="config-content">

        {section === 'perfil' && (
          <div className="cfg-panel">
            <div className="cfg-panel-hdr"><User size={18} /> Perfil</div>
            <div className="cfg-panel-body">
              <div className="config-field">
                <label>Nombre de usuario</label>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)} onBlur={() => onUserNameChange(nameInput)}
                  placeholder="Tu nombre (se auto-completa en snippets)" style={{ maxWidth: 320 }} />
                <span className="config-hint">Se usará como autor al crear snippets.</span>
              </div>
              <div className="config-field">
                <label>Backup</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href={`${API}/export/xlsx`} download className="config-toggle-btn" style={{ textDecoration: 'none' }}>
                    <Download size={13} /> Exportar Excel (.xlsx)
                  </a>
                  <a href={`${API}/export/json`} download className="config-toggle-btn" style={{ textDecoration: 'none' }}>
                    <Download size={13} /> Exportar JSON
                  </a>
                </div>
                <span className="config-hint">Descarga todos tus snippets y herramientas. El Excel incluye dos solapas: Snippets y Herramientas.</span>
              </div>
            </div>
          </div>
        )}

        {section === 'credenciales' && (
          <div className="cfg-panel">
            <div className="cfg-panel-hdr"><Shield size={18} /> Credenciales Admin</div>
            <p className="cfg-panel-desc">Credenciales del S-user para Conectar-Admin y Quick Connect en el Dashboard. Se solicitan en cada conexión — no se almacenan.</p>
            <div className="cfg-panel-body">
              <div className="config-field">
                <label>Dominio</label>
                <input value={domainInput} onChange={e => setDomainInput(e.target.value)} onBlur={() => onAdminDomainChange(domainInput)}
                  placeholder="DOMINIO" style={{ maxWidth: 220 }} />
                <span className="config-hint">Ej: MIEMPRESA, corp.local</span>
              </div>
              <div className="config-field">
                <label>Usuario admin (S-user)</label>
                <input value={userInput} onChange={e => setUserInput(e.target.value)} onBlur={() => onAdminUserChange(userInput)}
                  placeholder="SUSER001" style={{ maxWidth: 220, fontFamily: "'JetBrains Mono', monospace" }} />
                <span className="config-hint">Se combina con el dominio: DOMINIO\SUSER001</span>
              </div>
              {domainInput && userInput && (
                <div style={{ padding: '8px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--accent)' }}>
                  {domainInput}\{userInput}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'interfaz' && (
          <div className="cfg-panel">
            <div className="cfg-panel-hdr"><Palette size={18} /> Interfaz</div>
            <div className="cfg-panel-body">
              <div className="config-field">
                <label>Barra de navegación</label>
                <div className="config-toggle-group">
                  <button className={`config-toggle-btn ${navMode === 'fixed' ? 'active' : ''}`} onClick={() => onNavModeChange('fixed')}><Monitor size={13} /> Fija</button>
                  <button className={`config-toggle-btn ${navMode === 'autohide' ? 'active' : ''}`} onClick={() => onNavModeChange('autohide')}><Zap size={13} /> Auto-ocultar</button>
                </div>
                <span className="config-hint">Auto-ocultar: pasa el cursor por la franja superior para revelar la barra.</span>
              </div>
              <div className="config-field">
                <label>Tema</label>
                <div className="theme-grid">
                  <div className={`theme-card ${theme === 'dark' ? 'active' : ''}`} onClick={() => onThemeChange('dark')}>
                    <div className="theme-preview" style={{ background: '#080b14' }}>
                      <div className="theme-preview-sidebar" style={{ background: 'rgba(13,16,28,0.95)' }} />
                      <div className="theme-preview-main">
                        <div className="theme-preview-card" style={{ background: 'rgba(18,22,42,0.85)' }} />
                        <div className="theme-preview-card" style={{ background: 'rgba(18,22,42,0.85)' }} />
                        <div className="theme-preview-card" style={{ background: '#6c5ce7', opacity: 0.5 }} />
                      </div>
                    </div>
                    <div className="theme-card-label">Dark</div>
                    <div className="theme-card-sub">Oscuro con acento violeta</div>
                  </div>
                  <div className={`theme-card ${theme === 'pastel' ? 'active' : ''}`} onClick={() => onThemeChange('pastel')}>
                    <div className="theme-preview" style={{ background: '#F3F4F6' }}>
                      <div className="theme-preview-sidebar" style={{ background: '#EAECF0' }} />
                      <div className="theme-preview-main">
                        <div className="theme-preview-card" style={{ background: '#FFFFFF' }} />
                        <div className="theme-preview-card" style={{ background: '#FFFFFF' }} />
                        <div className="theme-preview-card" style={{ background: '#16C2A1', opacity: 0.65 }} />
                      </div>
                    </div>
                    <div className="theme-card-label">Light</div>
                    <div className="theme-card-sub">VS Code — gris + verde</div>
                  </div>
                  <div className={`theme-card ${theme === 'att' ? 'active' : ''}`} onClick={() => onThemeChange('att')}>
                    <div className="theme-preview" style={{ background: '#EDF1F7' }}>
                      <div className="theme-preview-sidebar" style={{ background: '#003875' }} />
                      <div className="theme-preview-main">
                        <div className="theme-preview-card" style={{ background: '#FFFFFF', border: '1px solid rgba(0,87,168,0.25)' }} />
                        <div className="theme-preview-card" style={{ background: '#FFFFFF', border: '1px solid rgba(0,87,168,0.25)' }} />
                        <div className="theme-preview-card" style={{ background: '#00A8E0', opacity: 0.7 }} />
                      </div>
                    </div>
                    <div className="theme-card-label">ATT</div>
                    <div className="theme-card-sub">Corporativo AT&T</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {section === 'timezones' && (
          <div className="cfg-panel">
            <div className="cfg-panel-hdr"><Globe size={18} /> TimeZones</div>
            <p className="cfg-panel-desc">Agrega hasta 2 relojes mundiales. Aparecen en el status bar junto a la hora local.</p>
            <div className="cfg-panel-body">
              <ClockEditor clocks={clocks} onChange={onClocksChange} />
            </div>
          </div>
        )}

        {section === 'about' && (
          <div className="cfg-panel">
            <div className="cfg-panel-hdr"><Info size={18} /> Sobre la app</div>
            <div className="cfg-panel-body">
              <div className="app-info-grid">
                <div className="app-info-item"><label>Versión</label><span>2.0.0</span></div>
                <div className="app-info-item"><label>Snippets</label><span>{snippetCount}</span></div>
                <div className="app-info-item"><label>Herramientas</label><span>{toolCount}</span></div>
                <div className="app-info-item"><label>Última sync</label><span>{lastSync ? lastSync.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
              </div>
              <div className="config-hint" style={{ marginTop: 16, lineHeight: 1.8 }}>
                Code Hub — Hub de snippets y herramientas de IT.<br />
                Corre localmente en <code style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--accent)' }}>localhost:3001</code> — sin conexión a internet.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Conectar Admin — Script builder ─────────────────────────────────────────

const makeConectarScript = (equipo, recurso, dominio, usuario) => {
  const userSpec = dominio ? `${dominio}\\${usuario}` : usuario;
  return `Start-Process cmd.exe -ArgumentList '/c runas /netonly /user:${userSpec} "explorer.exe \\\\${equipo}\\${recurso}"' -WindowStyle Normal`;
};

const makeRunAsToolScript = (toolCommand, dominio, usuario) => {
  const userSpec = dominio ? `${dominio}\\${usuario}` : usuario;
  let app = toolCommand.trim();
  if (app.startsWith('Start-Process ')) {
    app = app.replace(/^Start-Process\s+/i, '').replace(/\s+-Verb\s+RunAs/gi, '').trim().replace(/^["']|["']$/g, '');
  }
  return `Start-Process cmd.exe -ArgumentList '/c runas /user:${userSpec} "${app}"' -WindowStyle Normal`;
};

// ─── Add Server Modal ─────────────────────────────────────────────────────────

function AddServerModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [resource, setResource] = useState('C$');
  const hostError = hostname.trim() ? validateHost(hostname.trim(), resource.trim()) : null;
  const canSave = name.trim() && hostname.trim() && !hostError;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ id: genId(), name: name.trim(), hostname: hostname.trim(), resource: resource.trim() || 'C$' });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2><Server size={16} style={{ marginRight: 6 }} /> Agregar servidor</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Nombre / Etiqueta *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="PC Gerencia, DC Principal..." autoFocus />
          </div>
          <div className="form-group">
            <label>Hostname o IP *</label>
            <input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="PC-GERENCIA-01 o 192.168.1.100"
              style={{ fontFamily: "'JetBrains Mono', monospace", borderColor: hostError ? 'var(--danger)' : undefined }} />
            {hostError && <span style={{ fontSize: 10, color: 'var(--danger)', marginTop: 3 }}>{hostError}</span>}
          </div>
          <div className="form-group">
            <label>Recurso compartido</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={resource} onChange={e => setResource(e.target.value)}
                style={{ width: 100, fontFamily: "'JetBrains Mono', monospace" }} />
              {['C$', 'D$', 'Users', 'Admin$'].map(r => (
                <button key={r} type="button" onClick={() => setResource(r)}
                  style={{ padding: '4px 9px', borderRadius: 5, border: `1px solid ${resource === r ? 'var(--accent)' : 'var(--border)'}`, background: resource === r ? 'var(--accent-light)' : 'var(--bg-hover)', color: resource === r ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {hostname.trim() && !hostError && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-base)', borderRadius: 7, border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--accent)' }}>
              {unc(hostname.trim(), resource.trim() || 'C$')}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            <Plus size={13} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Conectar Admin View ───────────────────────────────────────────────────────

function ConectarAdminView({ servers, onServersChange, recentConns, onRecentConnsChange, adminUser, adminDomain, onToast, onGoToConfig }) {
  const [equipo, setEquipo] = useState('');
  const [recurso, setRecurso] = useState('C$');
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const manualValidErr = equipo.trim() ? validateHost(equipo.trim(), recurso.trim()) : null;
  const rutaPreview = equipo.trim() && !manualValidErr ? unc(equipo.trim(), recurso.trim() || 'C$') : null;

  const runConnect = async (hostname, resource, loadId = null) => {
    const validErr = validateHost(hostname, resource);
    if (validErr) { onToast(`❌ ${validErr}`, 'error'); return; }
    const cmd = makeConectarScript(hostname, resource, adminDomain, adminUser);
    if (loadId !== null) setLoadingId(loadId);
    else setLoading(true);
    try {
      const res = await fetch(`${API}/elevated-terminal`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      const updated = [{ hostname, resource, ts: Date.now() }, ...recentConns.filter(r => !(r.hostname === hostname && r.resource === resource))].slice(0, 3);
      onRecentConnsChange(updated);
      onToast(`✅ Abriendo ${unc(hostname, resource)}…`, 'success');
    } catch (err) {
      onToast(`❌ Error: ${err.message}`, 'error');
    } finally {
      setLoadingId(null);
      setLoading(false);
    }
  };

  const handleManualConnect = () => {
    const h = equipo.trim();
    const r = recurso.trim() || 'C$';
    const validErr = validateHost(h, r);
    if (validErr) { onToast(`❌ ${validErr}`, 'error'); return; }
    runConnect(h, r);
    setEquipo('');
  };

  const handleAddServer = (server) => {
    onServersChange([...servers, server]);
    setShowAddModal(false);
    onToast(`✅ Servidor "${server.name}" agregado`, 'success');
  };

  const formatRelTime = (ts) => {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  return (
    <div className="config-view">
      <div className="config-title">
        <Globe size={22} /> Conectar-Admin
        <small>Acceso SMB con credenciales de administrador</small>
      </div>

      {!adminUser.trim() && (
        <div className="info-banner" style={{ maxWidth: 640 }}>
          <div className="info-banner-icon"><AlertTriangle size={16} /></div>
          <div>
            <h4>Configuración requerida</h4>
            <p>Ingresa tu <strong>dominio</strong> y <strong>usuario admin</strong> en{' '}
              <button onClick={onGoToConfig} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
                Configuración → Credenciales Admin
              </button>
              {' '}antes de conectarte.</p>
          </div>
        </div>
      )}

      {/* Saved Servers */}
      <div className="config-section">
        <div className="config-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Server size={14} /> Servidores guardados</span>
          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11, height: 26 }} onClick={() => setShowAddModal(true)}>
            <Plus size={12} /> Agregar
          </button>
        </div>
        <div className="config-section-body">
          {servers.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No hay servidores guardados. Agrega uno con el botón de arriba.
            </div>
          ) : (
            <div className="server-grid">
              {servers.map(srv => (
                <div key={srv.id} className="server-card">
                  <button className="server-card-delete" onClick={() => onServersChange(servers.filter(s => s.id !== srv.id))} title="Eliminar">
                    <X size={13} />
                  </button>
                  <div className="server-card-name">{srv.name}</div>
                  <div className="server-card-host">{srv.hostname}</div>
                  <div className="server-card-unc">{unc(srv.hostname, srv.resource)}</div>
                  <button
                    className="server-card-connect"
                    onClick={() => runConnect(srv.hostname, srv.resource, srv.id)}
                    disabled={loadingId === srv.id}
                  >
                    {loadingId === srv.id
                      ? <><Wifi size={11} style={{ animation: 'spin 1.5s linear infinite' }} /> Conectando…</>
                      : <><ExternalLink size={11} /> Conectar</>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Connections */}
      {recentConns.length > 0 && (
        <div className="config-section">
          <div className="config-section-header"><Clock size={14} /> Conexiones recientes</div>
          <div className="config-section-body">
            <ul className="recent-list">
              {recentConns.map((rc, i) => (
                <li key={i} className="recent-item">
                  <div className="recent-item-path">
                    <span className="recent-dot" />
                    <span>{unc(rc.hostname, rc.resource)}</span>
                  </div>
                  <span className="recent-time">{formatRelTime(rc.ts)}</span>
                  <button className="btn btn-ghost recent-connect-btn" onClick={() => runConnect(rc.hostname, rc.resource)}>
                    <ExternalLink size={10} /> Conectar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Manual connect */}
      <div className="config-section" style={{ maxWidth: 560 }}>
        <div className="config-section-header"><Terminal size={14} /> Conexión manual</div>
        <div className="config-section-body">
          <div className="config-field">
            <label>Equipo (nombre o IP) *</label>
            <input
              placeholder="PC-GERENCIA-01 o 192.168.1.100"
              value={equipo}
              onChange={e => setEquipo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualConnect()}
              style={{ maxWidth: 380 }}
              autoFocus
            />
          </div>
          <div className="config-field">
            <label>Recurso compartido</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={recurso} onChange={e => setRecurso(e.target.value)} style={{ maxWidth: 120 }} />
              {['C$', 'D$', 'Users', 'Temp', 'Admin$'].map(r => (
                <button key={r} type="button" onClick={() => setRecurso(r)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${recurso === r ? 'var(--accent)' : 'var(--border)'}`, background: recurso === r ? 'var(--accent-light)' : 'var(--bg-hover)', color: recurso === r ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, transition: 'all 0.15s' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {rutaPreview && (
            <div style={{ padding: '10px 14px', background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--accent)', letterSpacing: '0.02em' }}>
              {rutaPreview}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleManualConnect}
            disabled={!equipo.trim() || loading || !adminUser.trim()}
            title={!adminUser.trim() ? 'Configura tu usuario admin primero' : undefined}
            style={{ minWidth: 140 }}>
            {loading
              ? <><Wifi size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> Conectando…</>
              : <><ExternalLink size={14} /> Conectar</>}
          </button>
        </div>
      </div>

      {showAddModal && <AddServerModal onSave={handleAddServer} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

function DashboardView({ snippets, tools, userName, adminUser, adminDomain, onNavigate, onToast, pinnedItems = [], onPinToggle, clocks = [] }) {
  const [sysinfo, setSysinfo] = useState(null);
  const [quickEquipo, setQuickEquipo] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [runningPin, setRunningPin] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [getIpHost, setGetIpHost] = useState('');
  const [getIpResult, setGetIpResult] = useState(null); // { ip } | { error }
  const [getIpLoading, setGetIpLoading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleRunPinned = async (tool) => {
    setRunningPin(tool.id);
    try {
      const res = await fetch(`${API}/elevated-terminal`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ command: tool.command }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onToast(`✅ ${tool.name} lanzado`, 'success');
    } catch (err) {
      onToast(`❌ ${err.message}`, 'error');
    } finally {
      setTimeout(() => setRunningPin(null), 1500);
    }
  };

  useEffect(() => {
    const ab = new AbortController();
    const load = () => fetch(`${API}/sysinfo`, { signal: ab.signal })
      .then(r => r.json()).then(setSysinfo).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { clearInterval(t); ab.abort(); };
  }, []);

  const todaySnippets = useMemo(() => snippets.filter(s => {
    if (!s.createdAt) return false;
    return new Date(s.createdAt).toDateString() === new Date().toDateString();
  }), [snippets]);

  const recentSnippets = useMemo(() =>
    [...snippets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
  [snippets]);

  const favSnippets = snippets.filter(s => s.favorite);
  const contributors = [...new Set(snippets.map(s => s.author).filter(Boolean))];

  const handleQuickConnect = async () => {
    const h = quickEquipo.trim();
    if (!h) return;
    const validErr = validateHost(h, 'C$');
    if (validErr) { onToast(`❌ ${validErr}`, 'error'); return; }
    setConnecting(true);
    const cmd = makeConectarScript(h, 'C$', adminDomain, adminUser);
    try {
      const res = await fetch(`${API}/elevated-terminal`, { method: 'POST', headers: getAuthHeader(), body: JSON.stringify({ command: cmd }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      onToast(`✅ Abriendo ${unc(h, 'C$')}…`, 'success');
      setQuickEquipo('');
    } catch (err) {
      onToast(`❌ Error: ${err.message}`, 'error');
    } finally { setConnecting(false); }
  };

  const handleGetIp = async () => {
    const h = getIpHost.trim();
    if (!h) return;
    setGetIpLoading(true);
    setGetIpResult(null);
    const target = adminDomain ? `${h}.${adminDomain}` : h;
    const cmd = `(Resolve-DnsName "${target}" -Type A -ErrorAction Stop | Where-Object { $_.Type -eq "A" } | Select-Object -First 1).IPAddress`;
    try {
      const res = await fetch(`${API}/elevated-terminal`, { method: 'POST', headers: getAuthHeader(), body: JSON.stringify({ command: cmd }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo resolver');
      const ip = (data.output || '').trim();
      if (!ip) throw new Error('Sin respuesta DNS');
      setGetIpResult({ ip });
    } catch {
      setGetIpResult({ error: 'Posiblemente offline o no encontrado' });
    } finally { setGetIpLoading(false); }
  };

  const getLangColor = (lang) => {
    const map = { powershell: '#639bf6', python: '#fdcb6e', bash: '#00b894', sql: '#e17055', batch: '#fd9644', cmd: '#fd9644', run: '#fd9644', javascript: '#fdcb6e' };
    return map[lang] || '#6c5ce7';
  };
  const getLangInitial = (lang) => ({ powershell: 'PS', python: 'PY', bash: 'SH', sql: 'SQL', batch: 'BAT', cmd: 'CMD', run: 'RUN', javascript: 'JS' }[lang] || lang?.slice(0,3).toUpperCase() || '?');

  const cpuColor  = (sysinfo?.cpuPct  || 0) > 80 ? 'var(--danger)' : (sysinfo?.cpuPct  || 0) > 50 ? 'var(--warning)' : 'var(--success)';
  const memColor  = (sysinfo?.memPct  || 0) > 80 ? 'var(--danger)' : (sysinfo?.memPct  || 0) > 60 ? 'var(--warning)' : 'var(--success)';

  const tips = [
    <>Podés usar <strong>Ctrl+C</strong> en las cards para copiar el código al instante.</>,
    <>Los snippets con lenguaje <strong>RUN</strong> son comandos de WIN+R — dobleclic los abre directo.</>,
    <>En <strong>Conectar-Admin</strong> podés conectarte a recursos compartidos con WHfB/YubiKey.</>,
    <>Usá las <strong>tags</strong> en los snippets para agrupar por proyecto o equipo.</>,
  ];
  const tip = tips[new Date().getDay() % tips.length];

  return (
    <div className="dashboard">
      {/* Clocks bar — solo si hay configurados */}
      {clocks.length > 0 && (
        <div className="dash-clocks-bar">
          {clocks.map((c, i) => {
            const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: c.tz });
            const dateStr = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: c.tz });
            return (
              <div key={i} className="dash-clock-card">
                <div className="dash-clock-time">{timeStr}</div>
                <div className="dash-clock-label">{c.label}</div>
                <div className="dash-clock-date">{dateStr}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Body — 3 columns */}
      <div className="dash-body">

        {/* COL LEFT — Actividad Reciente */}
        <div className="dash-col-left">
          <div className="dash-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="dash-panel-header">
              <div className="dash-panel-title"><Clock size={13} /> Actividad Reciente</div>
              <button className="dash-panel-action" onClick={() => onNavigate(VIEWS.snippets)}>VER TODO →</button>
            </div>
            <div className="activity-list" style={{ flex: 1, overflowY: 'auto' }}>
              {recentSnippets.length === 0
                ? <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No hay snippets aún</div>
                : recentSnippets.map(s => {
                    const color = getLangColor(s.language);
                    const initials = getLangInitial(s.language);
                    const mins = Math.round((Date.now() - new Date(s.createdAt)) / 60000);
                    const timeStr = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins/60)}h` : `${Math.floor(mins/1440)}d`;
                    return (
                      <div key={s.id} className="activity-row">
                        <div className="activity-avatar" style={{ background: color+'22', border:`1px solid ${color}44`, color }}>{initials}</div>
                        <div className="activity-info">
                          <div className="activity-name">{s.title}</div>
                          <div className="activity-desc">{s.description}</div>
                          <div className="activity-tags">
                            {s.category && <span className="activity-tag">{s.category}</span>}
                            {s.author && <span className="activity-tag">{s.author}</span>}
                          </div>
                        </div>
                        <div className="activity-time">{timeStr}</div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>

        {/* COL CENTER — Anclados */}
        <div className="dash-col-center">
          <div className="dash-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="dash-panel-header">
              <div className="dash-panel-title"><Pin size={13} /> Anclados</div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{pinnedItems.length}/4</span>
            </div>
            {pinnedItems.length === 0 ? (
              <div className="pinned-empty" style={{ flex: 1 }}>
                <Pin size={20} style={{ opacity: 0.2 }} />
                <span>Ancla snippets o herramientas con el ícono <Pin size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> en sus respectivas secciones</span>
              </div>
            ) : (
              <div className="pinned-list">
                {pinnedItems.map(p => {
                  if (p.type === 'snippet') {
                    const s = snippets.find(x => x.id === p.id);
                    if (!s) return null;
                    return (
                      <div key={p.id} className="pinned-list-item"
                        onClick={() => { navigator.clipboard.writeText(s.code); onToast(`📋 ${s.title} copiado`, 'success'); }}>
                        <span className={`lang-pill ${getLangClass(s.language)}`} style={{ fontSize: 9, flexShrink: 0 }}>{getLangBadge(s.language)}</span>
                        <div className="pinned-list-info">
                          <div className="pinned-list-name">{s.title}</div>
                          {s.description && <div className="pinned-list-sub">{s.description}</div>}
                        </div>
                        <span className="pinned-list-action">COPY</span>
                        <button className="pinned-unpin" title="Desanclar" onClick={e => { e.stopPropagation(); onPinToggle('snippet', p.id); }}><Pin size={9} /></button>
                      </div>
                    );
                  } else {
                    const t = tools.find(x => x.id === p.id);
                    if (!t) return null;
                    const IconComp = TOOL_ICONS[t.icon] || Wrench;
                    const isRunning = runningPin === t.id;
                    return (
                      <div key={p.id} className={`pinned-list-item pinned-list-tool ${isRunning ? 'running' : ''}`}
                        onClick={() => !isRunning && handleRunPinned(t)}>
                        <IconComp size={14} style={{ color: t.color, flexShrink: 0 }} />
                        <div className="pinned-list-info">
                          <div className="pinned-list-name">{t.name}</div>
                          {t.description && <div className="pinned-list-sub">{t.description}</div>}
                        </div>
                        <span className="pinned-list-action" style={{ color: t.color }}>{isRunning ? '…' : 'RUN'}</span>
                        <button className="pinned-unpin" title="Desanclar" onClick={e => { e.stopPropagation(); onPinToggle('tool', p.id); }}><Pin size={9} /></button>
                      </div>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </div>

        {/* COL RIGHT — Utilidades */}
        <div className="dash-col-right">

          {/* Get IP */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title"><Globe size={13} /> Get IP</div>
            </div>
            <div className="quick-connect-body">
              {adminDomain && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  Dominio: <span style={{ color: 'var(--accent)' }}>{adminDomain}</span>
                </div>
              )}
              <div className="quick-connect-input">
                <input value={getIpHost} onChange={e => { setGetIpHost(e.target.value); setGetIpResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleGetIp()}
                  placeholder="PC-NOMBRE-01"
                  style={{ background: 'none', border: 'none', outline: 'none', flex: 1, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }} />
              </div>
              <button className="quick-connect-btn" onClick={handleGetIp} disabled={!getIpHost.trim() || getIpLoading}>
                {getIpLoading ? <>Resolviendo…</> : <>Obtener IP <Globe size={13} /></>}
              </button>
              {getIpResult && (
                getIpResult.ip
                  ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(0,184,148,0.08)', border: '1px solid rgba(0,184,148,0.2)', borderRadius: 8 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: 'var(--success)', textShadow: '0 0 10px rgba(0,184,148,0.5)' }}>{getIpResult.ip}</span>
                      <button className="icon-btn" title="Copiar IP" onClick={() => { navigator.clipboard.writeText(getIpResult.ip); onToast('📋 IP copiada', 'success'); }}><Copy size={12} /></button>
                    </div>
                  : <div style={{ padding: '6px 10px', background: 'rgba(225,112,85,0.08)', border: '1px solid rgba(225,112,85,0.2)', borderRadius: 8, fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                      ⚠ {getIpResult.error}
                    </div>
              )}
            </div>
          </div>

          {/* Acceso Remoto */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title"><Network size={13} /> Acceso Remoto</div>
              <button className="dash-panel-action" onClick={() => onNavigate(VIEWS.conectar)}>ABRIR →</button>
            </div>
            <div className="quick-connect-body">
              <div className="quick-connect-input">
                <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>\\</span>
                <input value={quickEquipo} onChange={e => setQuickEquipo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickConnect()}
                  placeholder="PC-SERVIDOR-01"
                  style={{ background: 'none', border: 'none', outline: 'none', flex: 1, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }} />
              </div>
              <button className="quick-connect-btn" onClick={handleQuickConnect} disabled={!quickEquipo.trim() || connecting}>
                {connecting ? <><Wifi size={13} style={{ animation: 'spin 1.5s linear infinite' }} /> Conectando…</> : <>Conectar <ExternalLink size={13} /></>}
              </button>
            </div>
          </div>

          {/* Monitor Recursos */}
          <div className="dash-panel">
            <div className="dash-panel-header"><div className="dash-panel-title"><Cpu size={13} /> Recursos</div></div>
            <div className="resource-body">
              <div className="resource-row">
                <div className="resource-label">
                  <span className="resource-name">CPU</span>
                  <span className={`resource-val ${(sysinfo?.cpuPct||0)>80?'danger':(sysinfo?.cpuPct||0)>50?'warn':''}`}>{sysinfo ? `${sysinfo.cpuPct}%` : '—'}</span>
                </div>
                <div className="resource-bar-track"><div className="resource-bar-fill" style={{ width:`${sysinfo?.cpuPct||0}%`, background:cpuColor }} /></div>
              </div>
              <div className="resource-row">
                <div className="resource-label">
                  <span className="resource-name">RAM</span>
                  <span className={`resource-val ${(sysinfo?.memPct||0)>80?'danger':(sysinfo?.memPct||0)>60?'warn':''}`}>{sysinfo ? `${sysinfo.usedMemGB}GB` : '—'}</span>
                </div>
                <div className="resource-bar-track"><div className="resource-bar-fill" style={{ width:`${sysinfo?.memPct||0}%`, background:memColor }} /></div>
              </div>
              <div className="resource-row">
                <div className="resource-label">
                  <span className="resource-name">Uptime</span>
                  <span className="resource-val ok">{sysinfo ? `${sysinfo.uptime}h` : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tip */}
          <div className="dash-panel">
            <div className="dash-panel-header"><div className="dash-panel-title"><Info size={13} /> Tip</div></div>
            <div className="tip-body"><div className="tip-icon"><Info size={14} /></div><div className="tip-text">{tip}</div></div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  // mode: 'login' | 'register' | 'register-done'
  const [mode, setMode] = useState('login');

  // login state
  const [loginAttuid, setLoginAttuid] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // register state
  const [regAttuid, setRegAttuid] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regPin2, setRegPin2] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async () => {
    const uid = loginAttuid.trim().toUpperCase();
    const p   = loginPin.trim();
    if (!uid || !p) { setLoginError('Ingresá tu ATTUID y PIN.'); return; }
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attuid: uid, pin: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión.');
      localStorage.setItem('hub_session', JSON.stringify({ id: data.id, attuid: data.attuid, token: data.token || '' }));
      onLogin(data);
    } catch (err) {
      setLoginError(err.message);
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    const uid = regAttuid.trim().toUpperCase();
    const p   = regPin.trim();
    if (!uid || !p) { setRegError('Completá todos los campos.'); return; }
    if (p.length < 4) { setRegError('El PIN debe tener al menos 4 dígitos.'); return; }
    if (p !== regPin2.trim()) { setRegError('Los PINs no coinciden.'); return; }
    setRegLoading(true); setRegError('');
    try {
      const res = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attuid: uid, pin: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear cuenta.');
      setMode('register-done');
    } catch (err) {
      setRegError(err.message);
      setRegLoading(false);
    }
  };

  const goLogin = () => { setMode('login'); setRegAttuid(''); setRegPin(''); setRegPin2(''); setRegError(''); setRegLoading(false); };

  /* ── Register done ── */
  if (mode === 'register-done') return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-badge" style={{ width: 40, height: 40 }}><HubIcon size={22} /></span>
          <span className="login-brand">Code Hub</span>
        </div>
        <div className="login-notice" style={{ textAlign: 'center', fontSize: 13 }}>
          ✅ Perfil <strong>{regAttuid.toUpperCase()}</strong> creado.<br />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ahora iniciá sesión con tu ATTUID y PIN.</span>
        </div>
        <button className="login-btn" onClick={goLogin}>Ir al login</button>
      </div>
    </div>
  );

  /* ── Register form ── */
  if (mode === 'register') return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-badge" style={{ width: 40, height: 40 }}><HubIcon size={22} /></span>
          <span className="login-brand">Code Hub</span>
          <span className="login-sub">Crear nuevo perfil</span>
        </div>
        <div className="login-fields">
          <div className="login-field">
            <label>ATTUID</label>
            <input value={regAttuid} onChange={e => { setRegAttuid(e.target.value.toUpperCase()); setRegError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              placeholder="JRODRIGUEZ" maxLength={20} autoFocus autoComplete="off" />
          </div>
          <div className="login-field">
            <label>Elegí un PIN (4-6 dígitos)</label>
            <input type="password" value={regPin} onChange={e => { setRegPin(e.target.value.replace(/\D/g, '')); setRegError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              placeholder="••••" maxLength={6} inputMode="numeric" autoComplete="new-password" />
          </div>
          <div className="login-field">
            <label>Confirmá el PIN</label>
            <input type="password" value={regPin2} onChange={e => { setRegPin2(e.target.value.replace(/\D/g, '')); setRegError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              placeholder="••••" maxLength={6} inputMode="numeric" autoComplete="new-password" />
          </div>
        </div>
        {regError && <div className="login-error">{regError}</div>}
        <button className="login-btn" onClick={handleRegister} disabled={regLoading || !regAttuid.trim() || !regPin.trim() || !regPin2.trim()}>
          {regLoading ? 'Creando perfil…' : 'Crear perfil'}
        </button>
        <button className="login-back" onClick={goLogin}>← Volver al login</button>
      </div>
    </div>
  );

  /* ── Login form (default) ── */
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-badge" style={{ width: 40, height: 40 }}><HubIcon size={22} /></span>
          <span className="login-brand">Code Hub</span>
          <span className="login-sub">Entorno corporativo ATT · IT Tools</span>
        </div>
        <div className="login-fields">
          <div className="login-field">
            <label>ATTUID</label>
            <input value={loginAttuid} onChange={e => { setLoginAttuid(e.target.value.toUpperCase()); setLoginError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="JRODRIGUEZ" maxLength={20} autoFocus autoComplete="off" />
          </div>
          <div className="login-field">
            <label>PIN</label>
            <input type="password" value={loginPin} onChange={e => { setLoginPin(e.target.value.replace(/\D/g, '')); setLoginError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••" maxLength={6} inputMode="numeric" autoComplete="current-password" />
          </div>
        </div>
        {loginError && <div className="login-error">{loginError}</div>}
        <button className="login-btn" onClick={handleLogin} disabled={loginLoading || !loginAttuid.trim() || !loginPin.trim()}>
          {loginLoading ? 'Verificando…' : 'Entrar'}
        </button>
        <div className="login-divider"><span>¿Primera vez?</span></div>
        <button className="login-create-btn" onClick={() => setMode('register')}>
          <Plus size={13} /> Crear cuenta nueva
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const VIEWS = { dashboard: 'dashboard', snippets: 'snippets', tools: 'tools', config: 'config', conectar: 'conectar' };

const DEFAULT_CLOCKS_PRESET = [
  { label: 'Brasilia',  tz: 'America/Sao_Paulo'  },
  { label: 'México DF', tz: 'America/Mexico_City' },
  { label: 'Dallas',    tz: 'America/Chicago'     },
];

export default function App() {
  // ── Auth / session ──────────────────────────────────────────
  const [activeProfile, setActiveProfile] = useState(null); // null = not logged in
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    const tryRestore = async () => {
      try {
        const raw = localStorage.getItem('hub_session');
        if (!raw) { setSessionLoading(false); return; }
        const { id } = JSON.parse(raw);
        const res = await fetch(`${API}/users/${id}`, { headers: getAuthHeader() });
        if (!res.ok) { if (res.status === 401) { localStorage.removeItem('hub_session'); setSessionLoading(false); return; } throw new Error('not found'); }
        const data = await res.json();
        applyProfile(data);
        setActiveProfile(data);
      } catch {
        localStorage.removeItem('hub_session');
      } finally {
        setSessionLoading(false);
      }
    };
    tryRestore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shared data ─────────────────────────────────────────────
  const [snippets, setSnippets] = useState([]);
  const [tools, setTools] = useState(DEFAULT_TOOLS);
  const [view, setView] = useState(VIEWS.dashboard);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [detailSnippet, setDetailSnippet] = useState(null);
  const [editSnippet, setEditSnippet] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [syncStatus, setSyncStatus] = useState('syncing');
  const [lastSync, setLastSync] = useState(null);
  const [localIP, setLocalIP] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  // ── Per-profile settings (seeded from profile on login) ─────
  const [userName, setUserName] = useState('');
  const [theme, setTheme] = useState('dark');
  const [clocks, setClocks] = useState(DEFAULT_CLOCKS_PRESET);
  const [navMode, setNavMode] = useState('fixed');
  const [prevView, setPrevView] = useState(null);
  const [servers, setServers] = useState([]);
  const [recentConns, setRecentConns] = useState([]);
  const [adminUser, setAdminUser] = useState('');
  const [adminDomain, setAdminDomain] = useState('');
  const [pinnedItems, setPinnedItems] = useState([]);
  const toastTimer = useRef(null);
  const loadingRef = useRef(false);

  // ── Apply a loaded profile's settings to state ───────────────
  const applyProfile = (profile) => {
    const s = profile.settings || {};
    if (s.theme)      { setTheme(s.theme); document.documentElement.setAttribute('data-theme', s.theme); }
    if (s.navMode)    setNavMode(s.navMode);
    if (Array.isArray(s.clocks))      setClocks(s.clocks.length ? s.clocks : DEFAULT_CLOCKS_PRESET);
    if (Array.isArray(s.pinnedItems)) setPinnedItems(s.pinnedItems);
    if (Array.isArray(s.servers))     setServers(s.servers);
    if (Array.isArray(s.recentConns)) setRecentConns(s.recentConns);
    if (s.adminUser !== undefined)    setAdminUser(s.adminUser);
    if (s.adminDomain !== undefined)  setAdminDomain(s.adminDomain);
    setUserName(profile.attuid || '');
  };

  // ── Save a partial settings update to the active profile ─────
  const saveProfileSettings = useCallback(async (patch) => {
    const raw = localStorage.getItem('hub_session');
    if (!raw) return;
    const { id } = JSON.parse(raw);
    try {
      await fetch(`${API}/users/${id}/settings`, {
        method: 'PUT', headers: getAuthHeader(),
        body: JSON.stringify({ settings: patch }),
      });
    } catch { /* silent */ }
  }, []);

  const handleLogin = (profile) => {
    applyProfile(profile);
    setActiveProfile(profile);
  };

  const handleLogout = () => {
    localStorage.removeItem('hub_session');
    setActiveProfile(null);
    setView(VIEWS.dashboard);
  };

  // Cleanup toast timer on unmount
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const handleClocksChange = (newClocks) => {
    setClocks(newClocks);
    saveProfileSettings({ clocks: newClocks });
  };

  const handleNavModeChange = (mode) => {
    setNavMode(mode);
    saveProfileSettings({ navMode: mode });
  };

  const handleServersChange = (newServers) => {
    setServers(newServers);
    saveProfileSettings({ servers: newServers });
  };

  const handleRecentConnsChange = (newConns) => {
    setRecentConns(newConns);
    saveProfileSettings({ recentConns: newConns });
  };

  const handleAdminUserChange = (user) => {
    setAdminUser(user);
    saveProfileSettings({ adminUser: user });
  };

  const handleAdminDomainChange = (domain) => {
    setAdminDomain(domain);
    saveProfileSettings({ adminDomain: domain });
  };

  const handleOpenConfig = () => {
    if (view === VIEWS.config) {
      setView(prevView || VIEWS.dashboard);
      setPrevView(null);
    } else {
      setPrevView(view);
      setView(VIEWS.config);
    }
  };

  const handlePinToggle = useCallback((type, id) => {
    setPinnedItems(prev => {
      const exists = prev.some(p => p.type === type && p.id === id);
      let next;
      if (exists) {
        next = prev.filter(p => !(p.type === type && p.id === id));
      } else {
        if (prev.length >= 4) return prev;
        next = [...prev, { type, id }];
      }
      saveProfileSettings({ pinnedItems: next });
      return next;
    });
  }, [saveProfileSettings]);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message, type });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 3200);
  }, []);

  const loadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch(`${API}/snippets`, { headers: { 'x-hub-token': JSON.parse(localStorage.getItem('hub_session') || '{}').token || '' } });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      let snippetsData = data.snippets || [];
      let toolsData = data.tools || [];
      // One-time migration: mark all existing entries as locked (read-only)
      const lockKey = 'hub_locks_v1';
      if (!localStorage.getItem(lockKey) && (snippetsData.length > 0 || toolsData.length > 0)) {
        snippetsData = snippetsData.map(s => s.locked !== undefined ? s : { ...s, locked: true });
        toolsData = toolsData.map(t => t.locked !== undefined ? t : { ...t, locked: true });
        fetch(`${API}/snippets`, { method: 'POST', headers: getAuthHeader(), body: JSON.stringify({ snippets: snippetsData, tools: toolsData }) });
        localStorage.setItem(lockKey, '1');
      }
      setSnippets(snippetsData);
      if (toolsData.length) setTools(toolsData);
      setLastSync(new Date());
      setSyncStatus('idle');
    } catch {
      setSyncStatus('error');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const saveData = useCallback(async (newSnippets, newTools) => {
    setSyncStatus('syncing');
    try {
      const res = await fetch(`${API}/snippets`, {
        method: 'POST', headers: getAuthHeader(),
        body: JSON.stringify({ snippets: newSnippets, tools: newTools }),
      });
      if (!res.ok) throw new Error('Error del servidor');
      setLastSync(new Date());
      setSyncStatus('idle');
    } catch {
      setSyncStatus('error');
    }
  }, []);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 15000);
    return () => clearInterval(iv);
  }, [loadData]);

  useEffect(() => {
    fetch(`${API}/sysinfo`).then(r => r.json()).then(d => setLocalIP(d.ip)).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveProfileSettings({ theme });
  }, [theme, saveProfileSettings]);

  const handleSaveSnippet = async (snippet) => {
    const isEdit = snippets.some(s => s.id === snippet.id);
    const updated = isEdit ? snippets.map(s => s.id === snippet.id ? snippet : s) : [snippet, ...snippets];
    setSnippets(updated);
    setShowNew(false);
    setEditSnippet(null);
    await saveData(updated, tools);
    showToast(isEdit ? '✅ Snippet actualizado' : '✅ Snippet agregado', 'success');
  };

  const handleDeleteSnippet = async (id) => {
    const updated = snippets.filter(s => s.id !== id);
    setSnippets(updated);
    if (detailSnippet?.id === id) setDetailSnippet(null);
    await saveData(updated, tools);
    showToast('🗑️ Snippet eliminado', 'success');
  };

  const handleToggleFav = async (id) => {
    const updated = snippets.map(s => s.id === id ? { ...s, favorite: !s.favorite } : s);
    setSnippets(updated);
    await saveData(updated, tools);
    const s = updated.find(x => x.id === id);
    showToast(s.favorite ? '⭐ Agregado a favoritos' : 'Quitado de favoritos', 'success');
  };

  const handleUpdateTools = async (newTools) => {
    setTools(newTools);
    await saveData(snippets, newTools);
  };

  const filtered = snippets.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.title?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.tags?.some(t => t.includes(q));
    const matchCat = activeCategory === 'all' ? true : activeCategory === 'Favoritos' ? s.favorite : s.category === activeCategory;
    return matchSearch && matchCat;
  });

  const catCounts = {};
  SNIPPET_CATEGORIES.forEach(c => {
    if (c.id === 'all') catCounts[c.id] = snippets.length;
    else if (c.id === 'Favoritos') catCounts[c.id] = snippets.filter(s => s.favorite).length;
    else catCounts[c.id] = snippets.filter(s => s.category === c.id).length;
  });

  if (sessionLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-muted)', fontSize: 13, gap: 10 }}>
      <Zap size={18} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)' }} /> Cargando Code Hub…
    </div>
  );

  if (!activeProfile) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      {/* ── Top Nav ── */}
      <div className={`top-nav-wrapper ${navMode}`}>
        <nav className="top-nav">
          <div className="top-nav-logo" onClick={() => setView(VIEWS.dashboard)}>
            <span className="logo-badge"><HubIcon size={14} /></span>
            Hola, {userName || 'usuario'}
          </div>
          <div className="top-nav-items">
            <button className={`top-nav-item ${view === VIEWS.dashboard ? 'active' : ''}`} onClick={() => setView(VIEWS.dashboard)}>
              <Grid size={13} /> Dashboard
            </button>
            <div className="top-nav-sep" />
            <button className={`top-nav-item ${view === VIEWS.snippets ? 'active' : ''}`} onClick={() => setView(VIEWS.snippets)}>
              <Code2 size={13} /> Snippets
            </button>
            <div className="top-nav-sep" />
            <button className={`top-nav-item ${view === VIEWS.tools ? 'active' : ''}`} onClick={() => setView(VIEWS.tools)}>
              <Shield size={13} /> Herramientas
            </button>
            <div className="top-nav-sep" />
            <button className={`top-nav-item ${view === VIEWS.conectar ? 'active' : ''}`} onClick={() => setView(VIEWS.conectar)}>
              <Globe size={13} /> Conectar-Admin
            </button>
          </div>
        </nav>
      </div>

      {/* ── Main ── */}
      <div className="main-content">
        <div key={view} className="view-enter">
        {view === VIEWS.dashboard ? (
          <DashboardView snippets={snippets} tools={tools} userName={userName} adminUser={adminUser} adminDomain={adminDomain} onNavigate={setView} onToast={showToast} pinnedItems={pinnedItems} onPinToggle={handlePinToggle} clocks={clocks} />
        ) : view === VIEWS.config ? (
          <ConfigView
            userName={userName} onUserNameChange={name => setUserName(name)}
            theme={theme} onThemeChange={setTheme}
            snippetCount={snippets.length} toolCount={tools.length} lastSync={lastSync}
            clocks={clocks} onClocksChange={handleClocksChange}
            navMode={navMode} onNavModeChange={handleNavModeChange}
            adminUser={adminUser} onAdminUserChange={handleAdminUserChange}
            adminDomain={adminDomain} onAdminDomainChange={handleAdminDomainChange}
          />
        ) : view === VIEWS.conectar ? (
          <ConectarAdminView
            servers={servers} onServersChange={handleServersChange}
            recentConns={recentConns} onRecentConnsChange={handleRecentConnsChange}
            adminUser={adminUser} adminDomain={adminDomain}
            onToast={showToast} onGoToConfig={handleOpenConfig}
          />
        ) : view === VIEWS.tools ? (
          <ToolsView tools={tools} onUpdateTools={handleUpdateTools} onToast={showToast} pinnedItems={pinnedItems} onPinToggle={handlePinToggle} adminUser={adminUser} adminDomain={adminDomain} />
        ) : (
          <>
            <div className="topbar">
              <div className="topbar-title">
                <h2>{SNIPPET_CATEGORIES.find(c => c.id === activeCategory)?.label || 'Todos'}</h2>
                <p>{filtered.length} snippet{filtered.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="search-wrap" style={{ width: 220 }}>
                <Search size={13} />
                <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="view-toggle">
                <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}><Grid size={13} /> Grid</button>
                <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><List size={13} /> Lista</button>
              </div>
              <button className="btn-new" style={{ width: 'auto', padding: '9px 14px' }} onClick={() => setShowNew(true)}>
                <Plus size={14} /> Nuevo
              </button>
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 24px', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {SNIPPET_CATEGORIES.map(cat => (
                <button key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: `1px solid ${activeCategory === cat.id ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border)'}`, background: activeCategory === cat.id ? 'var(--accent-light)' : 'var(--bg-card)', color: activeCategory === cat.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif", transition: 'all 0.15s', flexShrink: 0 }}>
                  <cat.icon size={12} /> {cat.label}
                  {catCounts[cat.id] > 0 && <span style={{ fontSize: 9, background: activeCategory === cat.id ? 'rgba(var(--accent-rgb),0.2)' : 'var(--bg-hover)', padding: '0 4px', borderRadius: 4, marginLeft: 2 }}>{catCounts[cat.id]}</span>}
                </button>
              ))}
            </div>

            <div className="content-body">
              <div className="content-area">
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <Code2 size={48} />
                    <h3>{search ? `Sin resultados para "${search}"` : 'No hay snippets aún'}</h3>
                    <p>{search ? 'Prueba con otros términos.' : 'Hacé clic en "+ Nuevo Snippet" para agregar el primero.'}</p>
                    {!search && <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Agregar primer snippet</button>}
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="snippets-grid">
                    {filtered.map(s => (
                      <CodeCard key={s.id} snippet={s} onClick={setDetailSnippet} onToggleFav={handleToggleFav} onDelete={handleDeleteSnippet} onEdit={s => { setDetailSnippet(null); setEditSnippet(s); }} pinnedItems={pinnedItems} onPinToggle={handlePinToggle} />
                    ))}
                  </div>
                ) : (
                  <div className="snippets-list-compact">
                    {filtered.map(s => (
                      <SnippetRow key={s.id} snippet={s} onClick={setDetailSnippet} onToggleFav={handleToggleFav} onDelete={handleDeleteSnippet} onEdit={s => { setDetailSnippet(null); setEditSnippet(s); }} pinnedItems={pinnedItems} onPinToggle={handlePinToggle} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </div>

      {/* Modals */}
      {(showNew || editSnippet) && (
        <SnippetModal snippet={editSnippet || null} onSave={handleSaveSnippet} onClose={() => { setShowNew(false); setEditSnippet(null); }} userName={userName} />
      )}
      {detailSnippet && (
        <DetailView snippet={detailSnippet} onClose={() => setDetailSnippet(null)} onEdit={s => { setDetailSnippet(null); setEditSnippet(s); }} onToggleFav={handleToggleFav} onToast={showToast} />
      )}
      <Toast {...toast} />
      <StatusBar
        syncStatus={syncStatus} lastSync={lastSync}
        localIP={localIP}
        onOpenConfig={handleOpenConfig}
        clocks={clocks}
        activeProfile={activeProfile}
        onLogout={handleLogout}
      />
    </div>
  );
}
