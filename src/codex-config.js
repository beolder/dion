'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER = '# any-switch';

function getCodexHome(explicit) {
  if (explicit && explicit.trim()) return path.resolve(explicit.trim());
  if (process.env.CODEX_HOME && process.env.CODEX_HOME.trim()) {
    return path.resolve(process.env.CODEX_HOME.trim());
  }
  return path.join(os.homedir(), '.codex');
}

function pathsFor(codexHome) {
  return {
    config: path.join(codexHome, 'config.toml'),
    auth: path.join(codexHome, 'auth.json')
  };
}

function detectNewline(text) {
  return text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
}

function isSectionHeader(line) {
  const t = line.trim();
  return t.length > 2 && t.startsWith('[') && t.endsWith(']');
}

// Returns the parent provider key for a [model_providers...] section header,
// or null if the header does not belong to a model provider block.
function providerGroupKey(header) {
  const t = header.trim();
  const m = t.match(/^\[model_providers\.([^.\]]+)(?:\.[^\]]+)?\]$/);
  return m ? m[1] : null;
}

function parseConfig(text) {
  const newline = detectNewline(text);
  const rawLines = text.split(/\r\n|\n/);
  const entries = [];
  let current = { kind: 'top', header: null, rawHeader: null, lines: [] };
  entries.push(current);

  for (const line of rawLines) {
    if (isSectionHeader(line)) {
      current = { kind: 'section', header: line.trim(), rawHeader: line, lines: [] };
      entries.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return { entries, newline };
}

function serialize(entries, newline) {
  const out = [];
  for (const e of entries) {
    if (e.kind === 'top') {
      out.push(...e.lines);
    } else {
      out.push(e.rawHeader);
      out.push(...e.lines);
    }
  }
  return out.join(newline);
}

function esc(value) {
  // TOML basic strings are compatible with JSON string encoding for our needs.
  return JSON.stringify(String(value));
}

function parseTomlValue(raw) {
  let v = raw.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.replace(/^"|"$/g, '');
    }
  }
  if (v.startsWith("'")) {
    return v.replace(/^'|'$/g, '');
  }
  // Strip inline comment for bare values.
  const hash = v.indexOf('#');
  if (hash !== -1) v = v.slice(0, hash).trim();
  return v;
}

function parseSectionFields(entry) {
  const fields = {};
  for (let line of entry.lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) fields[m[1]] = parseTomlValue(m[2]);
  }
  return fields;
}

function buildProviderSection(provider) {
  const lines = [];
  lines.push(`${MARKER} managed: ${provider.id}`);
  lines.push(`name = ${esc(provider.name || provider.id)}`);
  lines.push(`base_url = ${esc(provider.baseUrl || '')}`);
  lines.push(`wire_api = ${esc(provider.wireApi === 'responses' ? 'responses' : 'chat')}`);
  if (provider.authType === 'env') {
    lines.push(`env_key = ${esc(provider.envKey || 'PROVIDER_API_KEY')}`);
  } else {
    lines.push(`experimental_bearer_token = ${esc(provider.apiKey || '')}`);
  }
  return {
    kind: 'section',
    header: `[model_providers.${provider.id}]`,
    rawHeader: `[model_providers.${provider.id}]`,
    lines
  };
}

function setScalar(lines, key, value) {
  const re = new RegExp('^' + key.replace(/\./g, '\\.') + '\\s*=');
  let found = false;
  const out = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return key + ' = ' + esc(value);
    }
    return line;
  });
  if (!found) out.push(key + ' = ' + esc(value));
  return out;
}

function getScalar(lines, key) {
  const re = new RegExp('^' + key.replace(/\./g, '\\.') + '\\s*=');
  for (const line of lines) {
    if (re.test(line)) return parseTomlValue(line.replace(re, ''));
  }
  return null;
}

function readActive(entries) {
  const top = entries[0] || { lines: [] };
  return {
    providerId: getScalar(top.lines, 'model_provider'),
    model: getScalar(top.lines, 'model')
  };
}

/**
 * Apply a full set of managed providers (enabled only) plus an active selection
 * to already-parsed entries. Existing [model_providers.X] blocks whose key is
 * managed get replaced; all other sections are preserved verbatim.
 */
function applyProviders(entries, providers, active = {}) {
  const managedIds = new Set(providers.filter((p) => p.enabled !== false).map((p) => p.id));
  const kept = [];
  let firstRemovedIndex = -1;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const key = e.kind === 'section' ? providerGroupKey(e.rawHeader) : null;
    if (key && managedIds.has(key)) {
      if (firstRemovedIndex === -1) firstRemovedIndex = kept.length;
      continue;
    }
    kept.push(e);
  }

  const newSections = providers
    .filter((p) => p.enabled !== false)
    .map((p) => buildProviderSection(p));

  let target;
  if (firstRemovedIndex !== -1) {
    target = firstRemovedIndex;
  } else if (kept.length > 1) {
    target = 1; // after the top scalar block
  } else {
    target = kept.length;
  }
  kept.splice(target, 0, ...newSections);

  // Update the active selection on the top-level scalar block.
  const top = kept[0];
  if (top && top.kind === 'top') {
    let lines = top.lines;
    if (active.providerId) lines = setScalar(lines, 'model_provider', active.providerId);
    if (active.model) lines = setScalar(lines, 'model', active.model);
    top.lines = lines;
  }
  return kept;
}

function readConfigText(codexHome) {
  const p = pathsFor(codexHome);
  return fs.existsSync(p.config) ? fs.readFileSync(p.config, 'utf8') : null;
}

function syncToCodex(codexHome, providers, active, options = {}) {
  const p = pathsFor(codexHome);
  fs.mkdirSync(codexHome, { recursive: true });

  const previous = readConfigText(codexHome);
  const created = previous == null || previous.trim() === '';
  const source = previous == null ? '' : previous;

  const { entries, newline } = parseConfig(source);
  const resultEntries = applyProviders(entries, providers, active);

  // Optionally force Codex into API-key auth so provider bearer tokens are used.
  const usedApiKey = active.providerId
    ? providers.some((p) => p.id === active.providerId && p.enabled !== false)
    : false;
  if (usedApiKey && options.forceApiKeyMode !== false) {
    const top = resultEntries[0];
    if (top && top.kind === 'top') {
      top.lines = setScalar(top.lines, 'preferred_auth_method', 'apikey');
      top.lines = setScalar(top.lines, 'forced_login_method', 'api');
    }
  }

  const text = serialize(resultEntries, newline);
  const changed = previous !== text;

  let backup = null;
  if (changed && previous != null && previous.trim() !== '') {
    backup = path.join(codexHome, `config.toml.bak-${timestamp()}`);
    fs.writeFileSync(backup, previous, 'utf8');
  }
  fs.writeFileSync(p.config, text, 'utf8');

  return {
    ok: true,
    created,
    changed,
    preview: text,
    backup
  };
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function backupFiles(codexHome) {
  const p = pathsFor(codexHome);
  const stamp = timestamp();
  const out = [];
  for (const file of [p.config, p.auth]) {
    if (fs.existsSync(file)) {
      const base = path.basename(file);
      let dest = path.join(codexHome, `${base}.bak-${stamp}`);
      let i = 1;
      while (fs.existsSync(dest)) dest = path.join(codexHome, `${base}.bak-${stamp}-${i++}`);
      fs.copyFileSync(file, dest);
      out.push(dest);
    }
  }
  return out;
}

function listBackups(codexHome) {
  const p = pathsFor(codexHome);
  const files = fs.readdirSync(codexHome).filter((f) => /^(config\.toml|auth\.json)\.bak-/.test(f));
  return files
    .map((f) => {
      const full = path.join(codexHome, f);
      let size = 0;
      let mtime = 0;
      try {
        const s = fs.statSync(full);
        size = s.size;
        mtime = s.mtimeMs;
      } catch {
        /* ignore */
      }
      return { file: full, name: f, size, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function restoreBackup(codexHome, file) {
  const p = pathsFor(codexHome);
  const dest = path.basename(file).startsWith('auth.json') ? p.auth : p.config;
  backupFiles(codexHome);
  fs.copyFileSync(file, dest);
  return { ok: true, restored: dest, from: file };
}

// Read every [model_providers.X] currently present in config.toml, for the
// "import detected" and status views. Child sub-tables (e.g. ...env) are merged
// to their parent.
function detectProviders(codexHome) {
  const text = readConfigText(codexHome);
  if (text == null) return [];
  const { entries } = parseConfig(text);
  const byKey = new Map();
  for (const e of entries) {
    if (e.kind !== 'section') continue;
    const key = providerGroupKey(e.rawHeader);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { sections: [], key });
    byKey.get(key).sections.push(e);
  }

  const out = [];
  for (const { key, sections } of byKey.values()) {
    const parent = sections.find((s) => s.rawHeader.trim() === `[model_providers.${key}]`);
    const fields = parent ? parseSectionFields(parent) : {};
    const managed = sections.some((s) => s.lines.some((l) => l.includes(MARKER)));
    out.push({
      id: key,
      name: fields.name || key,
      baseUrl: fields.base_url || '',
      wireApi: fields.wire_api === 'responses' ? 'responses' : 'chat',
      authType: fields.env_key ? 'env' : 'bearer',
      envKey: fields.env_key || '',
      apiKey: fields.experimental_bearer_token || '',
      managed,
      models: []
    });
  }
  return out;
}

function openCodexHome() {
  return getCodexHome();
}

function modelCatalogPath(text) {
  if (text == null) return null;
  const { entries } = parseConfig(text);
  const top = entries[0];
  if (!top) return null;
  return getScalar(top.lines, 'model_catalog_json') || null;
}

// Returns true/false if the model appears in the catalog file, or null when the
// catalog cannot be read (e.g. absent or unparsable).
function catalogContains(catalogFile, model) {
  if (!catalogFile || !model) return null;
  if (!fs.existsSync(catalogFile)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    const arr = Array.isArray(doc) ? doc : doc.models || [];
    const slugs = arr.map((m) => m.slug || m.id || m.name).filter(Boolean);
    return slugs.includes(model);
  } catch {
    return null;
  }
}

module.exports = {
  getCodexHome,
  pathsFor,
  parseConfig,
  serialize,
  parseTomlValue,
  readActive,
  applyProviders,
  syncToCodex,
  detectProviders,
  backupFiles,
  listBackups,
  restoreBackup,
  timestamp,
  modelCatalogPath,
  catalogContains,
  MARKER
};
