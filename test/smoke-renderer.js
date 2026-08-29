'use strict';

// Non-Electron smoke test: loads the renderer with a fake DOM and a mock IPC
// bridge so we can exercise the UI render paths and catch reference errors.
const assert = require('node:assert');

const nodes = {};
class FakeNode {
  constructor(sel) {
    this.sel = sel;
    this._html = '';
    this.value = '';
    this.textContent = '';
    this.name = '';
    this.type = '';
    this.title = '';
    this.placeholder = '';
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.style = {};
    this._listeners = {};
    this.classList = {
      _s: new Set(),
      add: (c) => this.classList._s.add(c),
      remove: (c) => this.classList._s.delete(c),
      toggle: (c) => (this.classList._s.has(c) ? this.classList._s.delete(c) : this.classList._s.add(c)),
      contains: (c) => this.classList._s.has(c)
    };
  }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  appendChild(n) { return n; }
  remove() {}
  querySelector() { return new FakeNode(); }
  querySelectorAll() { return []; }
  closest() { return null; }
}

const doc = {
  querySelector: (sel) => (nodes[sel] ||= new FakeNode(sel)),
  querySelectorAll: () => [],
  createElement: (t) => new FakeNode(t),
  addEventListener: () => {}
};

const mockProvider = {
  id: 'deepseek',
  name: 'DeepSeek',
  vendor: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  wireApi: 'chat',
  authType: 'bearer',
  apiKey: 'sk-x',
  envKey: 'DEEPSEEK_API_KEY',
  models: ['deepseek-chat', 'deepseek-reasoner'],
  defaultModel: 'deepseek-chat',
  color: '#4d6bfe',
  note: 'note',
  builtin: true,
  enabled: true
};

const mockState = {
  ok: true,
  codexHome: 'C:/Users/x/.codex',
  configPath: 'C:/Users/x/.codex/config.toml',
  authPath: 'C:/Users/x/.codex/auth.json',
  configExists: true,
  configError: null,
  activeModelInCatalog: false,
  catalogPath: 'C:/Users/x/.codex/models.json',
  data: {
    providers: [mockProvider],
    active: { providerId: 'deepseek', model: 'deepseek-chat' },
    settings: { codexHome: '', forceApiKeyMode: true, mergeCatalog: false }
  },
  detected: [],
  activeInConfig: { providerId: 'deepseek', model: 'deepseek-chat' }
};

global.window = {
  anySwitch: {
    presets: async () => [],
    getState: async () => mockState,
    version: async () => ({ ok: true, app: '1.0.0', electron: '33', node: '24', platform: 'win32' }),
    saveProvider: async () => ({ ok: true, state: mockState }),
    deleteProvider: async () => ({ ok: true, state: mockState }),
    duplicateProvider: async () => ({ ok: true, state: mockState }),
    importDetected: async () => ({ ok: true, state: mockState }),
    setActive: async () => ({ ok: true, state: mockState, sync: { changed: false } }),
    sync: async () => ({ ok: true, result: { changed: false, backup: null }, state: mockState }),
    testConnection: async () => ({ ok: true, latencyMs: 5, status: 200, kind: 'models', models: [], message: 'ok' }),
    createBackup: async () => ({ ok: true, files: [] }),
    listBackups: async () => ({ ok: true, files: [] }),
    restoreBackup: async () => ({ ok: true, state: mockState }),
    openConfigDir: async () => ({ ok: true }),
    setCodexHome: async () => ({ ok: true, state: mockState }),
    setForceApiKey: async () => ({ ok: true, state: mockState })
  }
};
global.document = doc;
global.confirm = () => true;

require('../renderer/app.js');

setTimeout(() => {
  try {
    assert.ok(nodes['#codexHomeChip'].textContent, 'chip rendered');
    assert.ok(nodes['#providerList'].innerHTML.includes('DeepSeek'), 'provider list rendered');
    assert.ok(nodes['#activePanel'].innerHTML.includes('DeepSeek'), 'active panel rendered');
    assert.ok(nodes['#editorPanel'].innerHTML.includes('DeepSeek'), 'editor rendered');
    assert.ok(nodes['#btnSync']._listeners.click, 'sync bound');
    assert.ok(nodes['#btnNew']._listeners.click, 'new bound');
    assert.ok(nodes['#btnSettings']._listeners.click, 'settings bound');
    console.log('OK smoke-renderer: chip=' + nodes['#codexHomeChip'].textContent);
    process.exit(0);
  } catch (e) {
    console.error('FAIL smoke-renderer:', e.message);
    process.exit(1);
  }
}, 150);
