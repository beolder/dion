'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createRouterServer } = require('../src/router');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
}

function startUpstream() {
  const s = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/responses') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'resp_upstream_1', object: 'response', model: 'deepseek-chat' }));
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream 404' }));
    }
  });
  return s;
}

test('router lists models and routes by model id', async (t) => {
  const upstream = startUpstream();
  const upPort = await listen(upstream);
  t.after(() => close(upstream));
  const providers = [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: `http://127.0.0.1:${upPort}`,
      wireApi: 'responses',
      authType: 'bearer',
      apiKey: 'sk-up',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      enabled: true
    }
  ];
  const router = createRouterServer({ getProviders: () => providers });
  const res = await router.listen(0);
  assert.strictEqual(res.ok, true);
  t.after(() => router.close());
  const rp = res.port;

  // /v1/models lists models
  const listed = await (await fetch(`http://127.0.0.1:${rp}/v1/models`)).json();
  assert.ok(listed.data.some((m) => m.id === 'deepseek-chat'));
  assert.ok(listed.data.some((m) => m.id === 'deepseek-reasoner'));

  // /v1/responses routes to upstream (passthrough)
  const routed = await fetch(`http://127.0.0.1:${rp}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', input: 'hello' })
  });
  assert.strictEqual(routed.status, 200);
  const routedJson = await routed.json();
  assert.strictEqual(routedJson.id, 'resp_upstream_1');

  // unknown model -> 400
  const unknown = await fetch(`http://127.0.0.1:${rp}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'not-a-model', input: 'x' })
  });
  assert.strictEqual(unknown.status, 400);

});

test('router rejects chat-only providers with a clear message', async (t) => {
  const providers = [
    {
      id: 'qwen',
      name: 'Qwen',
      baseUrl: 'http://127.0.0.1:9',
      wireApi: 'chat',
      authType: 'bearer',
      apiKey: 'sk-q',
      models: ['qwen3-coder-plus'],
      defaultModel: 'qwen3-coder-plus',
      enabled: true
    }
  ];
  const router = createRouterServer({ getProviders: () => providers });
  const res = await router.listen(0);
  assert.strictEqual(res.ok, true);
  t.after(() => router.close());
  const rp = res.port;
  const out = await fetch(`http://127.0.0.1:${rp}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen3-coder-plus', input: 'x' })
  });
  assert.strictEqual(out.status, 400);
  const json = await out.json();
  assert.ok(/chat/i.test(json.error.message));
});
