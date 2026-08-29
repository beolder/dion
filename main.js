'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const codex = require('./src/codex-config');
const store = require('./src/store');
const { presets, fromPreset, findPreset } = require('./src/presets');
const health = require('./src/health');
const { createRouterServer } = require('./src/router');

const dataDir = process.env.ANY_SWITCH_HOME || app.getPath('userData');

const DEFAULt_ROUTER_PORT = 8788;
let router = null;

let mainWindow = null;

function slugify(name) {
  return String(name || 'provider')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'provider';
}

function computeState() {
  const data = store.load(dataDir);
  const codexHome = codex.getCodexHome(data.settings.codexHome);
  const p = codex.pathsFor(codexHome);
  let activeInConfig = { providerId: null, model: null };
  let detected = [];
  let configExists = false;
  let configError = null;
  let activeModelInCatalog = null;
  let catalogPath = null;
  try {
    const text = fs.existsSync(p.config) ? fs.readFileSync(p.config, 'utf8') : null;
    if (text != null) {
      configExists = true;
      activeInConfig = codex.readActive(codex.parseConfig(text).entries);
      catalogPath = codex.modelCatalogPath(text);
      activeModelInCatalog = codex.catalogContains(catalogPath, activeInConfig.model);
    }
    detected = codex.detectProviders(codexHome);
  } catch (e) {
    configError = e.message;
  }
  return {
    ok: true,
    codexHome,
    configPath: p.config,
    authPath: p.auth,
    configExists,
    configError,
    activeModelInCatalog,
    catalogPath,
    data,
    detected,
    activeInConfig,
    routerStatus: {
      running: !!router,
      port: router ? router.port() : (data.settings.routerPort || DEFAULt_ROUTER_PORT)
    }
  };
}

function isRouterMode(override) {
  return override !== undefined ? !!override : store.load(dataDir).settings.routerMode === true;
}

function routerProvider(data, port, model) {
  const seen = new Set();
  const models = [];
  for (const p of data.providers) {
    if (p.enabled === false) continue;
    for (const m of p.models || []) {
      if (!seen.has(m)) {
        seen.add(m);
        models.push(m);
      }
    }
    if (p.defaultModel && !seen.has(p.defaultModel)) {
      seen.add(p.defaultModel);
      models.push(p.defaultModel);
    }
  }
  const modelStr = model || data.active.model || models[0] || '';
  return {
    id: 'any-switch',
    name: 'Any Switch Router',
    baseUrl: `http://127.0.0.1:${port}/v1`,
    wireApi: 'responses',
    authType: 'bearer',
    apiKey: 'any-switch',
    envKey: '',
    models,
    defaultModel: modelStr,
    color: '#0ea5e9',
    note: '本地多路由：Codex 点哪个模型，就把请求转发到对应 Provider',
    builtin: false,
    enabled: true
  };
}

function effectiveProviders(state, routerMode) {
  if (!routerMode) return state.data.providers;
  // Only the router provider is written to config in router mode. Real providers
  // are used by the router (from the store) and by the catalog merge, so chat-only
  // providers never end up in config.toml (which the desktop app rejects).
  return [routerProvider(state.data, state.data.settings.routerPort || DEFAULt_ROUTER_PORT)];
}

function effectiveActive(state, routerMode) {
  if (!routerMode) return state.data.active;
  let model = state.data.active.model || '';
  if (!model) {
    for (const p of state.data.providers) {
      if (p.enabled !== false) {
        model = p.defaultModel || (p.models && p.models[0]) || '';
        if (model) break;
      }
    }
  }
  return {
    providerId: 'any-switch',
    model
  };
}

function syncNow(opts = {}) {
  const state = computeState();
  const routerMode = isRouterMode(opts.routerMode);
  const providers = effectiveProviders(state, routerMode);
  const active = effectiveActive(state, routerMode);
  return codex.syncToCodex(state.codexHome, providers, active, {
    forceApiKeyMode: state.data.settings.forceApiKeyMode !== false,
    mergeCatalog: state.data.settings.mergeCatalog === true || routerMode,
    catalogProviders: state.data.providers
  });
}

async function ensureRouter() {
  if (router) return router;
  const data = store.load(dataDir);
  const port = data.settings.routerPort || DEFAULt_ROUTER_PORT;
  const created = createRouterServer({
    getProviders: () => store.load(dataDir).providers
  });
  const res = await created.listen(port);
  if (!res.ok) {
    return { error: res.error };
  }
  router = created;
  return router;
}

async function stopRouter() {
  if (!router) return { ok: true };
  await router.close();
  router = null;
  return { ok: true };
}

function registerIpc() {
  ipcMain.handle('presets:list', () => presets);

  ipcMain.handle('state:get', () => computeState());

  ipcMain.handle('provider:save', (_e, provider) => {
    const state = computeState();
    let rec = { ...provider };
    rec.id = String(rec.id || slugify(rec.name)).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(rec.id)) {
      return { ok: false, error: 'ID 只能包含字母、数字、下划线、连字符' };
    }
    rec.enabled = rec.enabled !== false;
    rec.models = Array.isArray(rec.models) ? rec.models.filter(Boolean) : [];
    rec.authType = rec.authType === 'env' ? 'env' : 'bearer';
    store.upsertProvider(state.data, rec);
    state.data.settings = state.data.settings || {};
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('provider:delete', (_e, id) => {
    const state = computeState();
    state.data.providers = state.data.providers.filter((p) => p.id !== id);
    if (state.data.active.providerId === id) {
      state.data.active = { providerId: null, model: null };
    }
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('provider:duplicate', (_e, id) => {
    const state = computeState();
    const src = state.data.providers.find((p) => p.id === id);
    if (!src) return { ok: false, error: '来源不存在' };
    let newId = `${src.id}-copy`;
    let n = 2;
    while (state.data.providers.some((p) => p.id === newId)) {
      newId = `${src.id}-copy-${n++}`;
    }
    const copy = { ...src, id: newId, name: `${src.name} (副本)`, builtin: false };
    state.data.providers.push(copy);
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('provider:importDetected', () => {
    const state = computeState();
    for (const d of state.detected) {
      if (!state.data.providers.some((p) => p.id === d.id)) {
        const preset = findPreset(d.id);
        const base = preset
          ? fromPreset(preset, { apiKey: d.apiKey, baseUrl: d.baseUrl, wireApi: d.wireApi, authType: d.authType })
          : {
              id: d.id,
              name: d.name,
              vendor: 'custom',
              baseUrl: d.baseUrl,
              wireApi: d.wireApi,
              authType: d.authType,
              envKey: d.envKey,
              apiKey: d.apiKey,
              models: [],
              defaultModel: '',
              color: '#64748b',
              note: d.managed ? '由 Any Switch 管理' : '从 Codex 配置导入',
              builtin: false,
              enabled: true
            };
        state.data.providers.push(base);
      }
    }
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('provider:setActive', (_e, { providerId, model, sync = true }) => {
    const state = computeState();
    const provider = state.data.providers.find((p) => p.id === providerId && p.enabled !== false);
    if (!provider) return { ok: false, error: '该 provider 不存在或未启用' };
    if (!provider.baseUrl) {
      return { ok: false, error: '请先为该 Provider 填写 Base URL 再设为当前' };
    }
    if (!model) {
      model = provider.defaultModel || (provider.models && provider.models[0]) || '';
    }
    if (!model) {
      return { ok: false, error: '请先为该 Provider 添加一个模型，再设为当前' };
    }
    state.data.active = { providerId, model };
    store.save(dataDir, state.data);
    let syncResult = null;
    if (sync) {
      syncResult = syncNow();
    }
    return { ok: true, state: computeState(), sync: syncResult };
  });

  ipcMain.handle('sync:run', () => {
    try {
      return { ok: true, result: syncNow(), state: computeState() };
    } catch (e) {
      return { ok: false, error: e.message, state: computeState() };
    }
  });

  ipcMain.handle('test:connection', async (_e, id) => {
    const state = computeState();
    const provider = state.data.providers.find((p) => p.id === id);
    if (!provider) return { ok: false, error: 'provider 不存在' };
    try {
      const result = await health.testProvider(provider);
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('backup:create', () => {
    const state = computeState();
    try {
      const files = codex.backupFiles(state.codexHome);
      return { ok: true, files };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('backup:list', () => {
    const state = computeState();
    try {
      return { ok: true, files: codex.listBackups(state.codexHome) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('backup:restore', (_e, file) => {
    const state = computeState();
    try {
      const res = codex.restoreBackup(state.codexHome, file);
      return { ok: true, result: res, state: computeState() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('config:open', () => {
    const state = computeState();
    shell.openPath(state.codexHome);
    return { ok: true };
  });

  ipcMain.handle('settings:setCodexHome', (_e, codexHome) => {
    const state = computeState();
    state.data.settings.codexHome = codexHome || '';
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('settings:setForceApiKey', (_e, val) => {
    const state = computeState();
    state.data.settings.forceApiKeyMode = val !== false;
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('settings:setMergeCatalog', (_e, val) => {
    const state = computeState();
    state.data.settings.mergeCatalog = val === true;
    store.save(dataDir, state.data);
    return { ok: true, state: computeState() };
  });

  ipcMain.handle('settings:setRouterMode', async (_e, val) => {
    const want = val === true;
    const state = computeState();
    const data = state.data;
    const model = data.active.model || '';
    if (!want) {
      const owning = data.providers.find(
        (p) => p.enabled !== false && ((p.models || []).includes(model) || p.defaultModel === model)
      );
      const fb = owning || data.providers.find((p) => p.enabled !== false) || null;
      if (fb) {
        data.active = { providerId: fb.id, model: model || fb.defaultModel || (fb.models && fb.models[0]) || '' };
      }
    }
    data.settings.routerMode = want;
    store.save(dataDir, data);
    if (want) {
      const r = await ensureRouter();
      if (r && r.error) return { ok: false, error: r.error, state: computeState() };
    } else {
      await stopRouter();
    }
    let sync = null;
    try {
      sync = syncNow();
    } catch (e) {
      sync = { ok: false, error: e.message };
    }
    return { ok: true, state: computeState(), sync };
  });

  ipcMain.handle('app:version', () => ({
    ok: true,
    app: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform
  }));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1216',
    title: 'Any Switch',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(true);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  if (store.load(dataDir).settings.routerMode) {
    ensureRouter().then((r) => {
      if (r && !r.error) {
        try {
          syncNow();
        } catch {
          /* ignore */
        }
      }
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (router) {
    try {
      syncNow({ routerMode: false });
    } catch {
      /* ignore */
    }
    await stopRouter();
  }
});
