'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cc = require('../src/codex-config');

const SAMPLE = `model = "gpt-5"
model_provider = "openai"
disable_response_storage = true

[model_providers.custom]
name = "deepseek"
base_url = "https://api.deepseek.com/"
wire_api = "responses"
experimental_bearer_token = "sk-old"

[plugins."documents@openai-primary-runtime"]
enabled = true

[desktop]
conversationDetailMode = "STEPS_PROSE"

[mcp_servers.node_repl]
args = []
command = 'C:\\temp\\node_repl.exe'

[projects.'d:\\code\\sketch']
trust_level = "trusted"
`;

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anyswitch-'));
}

const providers = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    wireApi: 'chat',
    authType: 'bearer',
    apiKey: 'sk-ds-123',
    envKey: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    enabled: true
  },
  {
    id: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    wireApi: 'chat',
    authType: 'bearer',
    apiKey: 'sk-qw-456',
    envKey: 'DASHSCOPE_API_KEY',
    models: ['qwen3-coder-plus'],
    defaultModel: 'qwen3-coder-plus',
    enabled: true
  },
  {
    id: 'moonshot',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    wireApi: 'chat',
    authType: 'env',
    apiKey: '',
    envKey: 'MOONSHOT_API_KEY',
    models: ['kimi-k2'],
    defaultModel: 'kimi-k2',
    enabled: false
  }
];

test('sync injects multiple providers and preserves other sections', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'config.toml'), SAMPLE, 'utf8');
  const res = cc.syncToCodex(dir, providers, { providerId: 'deepseek', model: 'deepseek-chat' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.changed, true);
  assert.ok(res.backup, 'a backup should be created when content changes');

  const text = fs.readFileSync(path.join(dir, 'config.toml'), 'utf8');
  assert.ok(text.includes('[model_providers.deepseek]'), 'deepseek section present');
  assert.ok(text.includes('[model_providers.qwen]'), 'qwen section present');
  assert.ok(!text.includes('[model_providers.moonshot]'), 'disabled provider omitted');
  assert.ok(text.includes('model = "deepseek-chat"'), 'active model set');
  assert.ok(text.includes('model_provider = "deepseek"'), 'active provider set');
  assert.ok(text.includes('experimental_bearer_token = "sk-ds-123"'), 'api key embedded');
  assert.ok(text.includes('env_key = "MOONSHOT_API_KEY"') === false, 'env provider omitted');
  // Preserve untouched sections exactly.
  assert.ok(text.includes('[plugins."documents@openai-primary-runtime"]'), 'plugins kept');
  assert.ok(text.includes('conversationDetailMode = "STEPS_PROSE"'), 'desktop kept');
  assert.ok(text.includes('[mcp_servers.node_repl]'), 'mcp kept');
  assert.ok(text.includes("[projects.'d:\\code\\sketch']"), 'projects kept');
  assert.ok(text.includes('preferred_auth_method = "apikey"'), 'api key mode forced');
  assert.ok(text.includes('forced_login_method = "api"'), 'login method forced');
});

test('switching active updates model/provider but not other sections', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'config.toml'), SAMPLE, 'utf8');
  cc.syncToCodex(dir, providers, { providerId: 'deepseek', model: 'deepseek-chat' });
  // Now switch to qwen.
  const res = cc.syncToCodex(dir, providers, { providerId: 'qwen', model: 'qwen3-coder-plus' });
  const text = fs.readFileSync(path.join(dir, 'config.toml'), 'utf8');
  assert.ok(res.ok);
  assert.ok(text.includes('model_provider = "qwen"'));
  assert.ok(text.includes('model = "qwen3-coder-plus"'));
  assert.ok(text.includes('[model_providers.deepseek]'), 'deepseek still available');
  assert.ok(text.includes('[model_providers.qwen]'));
  assert.ok(text.includes('[plugins."documents@openai-primary-runtime"]'));
  assert.ok(text.includes("trust_level = \"trusted\""));
});

test('detectProviders reads existing sections and marks managed', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'config.toml'), SAMPLE, 'utf8');
  const detected = cc.detectProviders(dir);
  assert.strictEqual(detected.length, 1);
  assert.strictEqual(detected[0].id, 'custom');
  assert.strictEqual(detected[0].name, 'deepseek');
  assert.strictEqual(detected[0].wireApi, 'responses');
  assert.strictEqual(detected[0].apiKey, 'sk-old');
  assert.strictEqual(detected[0].managed, false);
});

test('readActive reflects top-level model fields', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'config.toml'), SAMPLE, 'utf8');
  const active = cc.readActive(cc.parseConfig(fs.readFileSync(path.join(dir, 'config.toml'), 'utf8')).entries);
  assert.strictEqual(active.providerId, 'openai');
  assert.strictEqual(active.model, 'gpt-5');
});

test('creates config when missing and supports env_key providers', () => {
  const dir = makeTmp();
  const res = cc.syncToCodex(dir, providers.filter((p) => p.id === 'moonshot').map((p) => ({ ...p, enabled: true })),
    { providerId: 'moonshot', model: 'kimi-k2' });
  assert.strictEqual(res.created, true);
  const text = fs.readFileSync(path.join(dir, 'config.toml'), 'utf8');
  assert.ok(text.includes('[model_providers.moonshot]'));
  assert.ok(text.includes('env_key = "MOONSHOT_API_KEY"'));
  assert.ok(!text.includes('experimental_bearer_token'), 'no token for env auth');
});

test('backup / list / restore round-trips config', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'config.toml'), SAMPLE, 'utf8');
  const before = readConfig(dir);
  const made = cc.backupFiles(dir);
  assert.strictEqual(made.length, 1);
  fs.writeFileSync(path.join(dir, 'config.toml'), 'model = "x"\nmodel_provider = "y"\n', 'utf8');
  const list = cc.listBackups(dir);
  assert.strictEqual(list.length, 1);
  cc.restoreBackup(dir, list[0].file);
  assert.strictEqual(readConfig(dir), before);
});

test('modelCatalogPath and catalogContains resolve models', () => {
  const dir = makeTmp();
  const cat = path.join(dir, 'cat.json');
  fs.writeFileSync(
    cat,
    JSON.stringify({ models: [{ slug: 'deepseek-chat' }, { slug: 'glm-4.6' }] }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'config.toml'),
    `model = "glm-4.6"\nmodel_provider = "zhipu"\nmodel_catalog_json = ${JSON.stringify(cat)}\n`,
    'utf8'
  );
  const text = fs.readFileSync(path.join(dir, 'config.toml'), 'utf8');
  assert.strictEqual(cc.modelCatalogPath(text), cat);
  assert.strictEqual(cc.catalogContains(cat, 'glm-4.6'), true);
  assert.strictEqual(cc.catalogContains(cat, 'qwen3-coder-plus'), false);
  assert.strictEqual(cc.catalogContains(path.join(dir, 'missing.json'), 'glm-4.6'), null);
});

function readConfig(dir) {
  return fs.readFileSync(path.join(dir, 'config.toml'), 'utf8');
}
