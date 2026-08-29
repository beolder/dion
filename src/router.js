'use strict';

const http = require('http');
const { URL } = require('url');

function normalizeBase(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

function buildModelList(providers) {
  const out = [];
  const seen = new Set();
  for (const p of providers) {
    if (p.enabled === false) continue;
    for (const m of p.models || []) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push({ id: m, object: 'model', owned_by: p.name });
      }
    }
  }
  return out;
}

function resolveProvider(providers, model) {
  const enabled = providers.filter((p) => p.enabled !== false);
  for (const p of enabled) {
    if ((p.models || []).includes(model)) return p;
  }
  for (const p of enabled) {
    if (p.defaultModel === model) return p;
  }
  return null;
}

async function handleResponses(res, body, providers) {
  const model = body && body.model;
  const provider = resolveProvider(providers, model);
  if (!provider) {
    return sendJson(res, 400, { error: { message: `没有找到模型 ${model || '?'} 对应的 Provider` } });
  }
  const base = normalizeBase(provider.baseUrl);
  if (!base) return sendJson(res, 400, { error: { message: '该 Provider 未配置 Base URL' } });
  if (provider.wireApi !== 'responses') {
    return sendJson(res, 400, {
      error: { message: `${provider.name} 仅支持 chat 接口。请改用支持 /responses 的服务，或只开启 responses 型 Provider。` }
    });
  }
  const apiKey = provider.authType === 'env' ? process.env[provider.envKey] || '' : provider.apiKey || '';
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let upstream;
  try {
    upstream = await fetch(`${base}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  } catch (e) {
    return sendJson(res, 502, { error: { message: `上游请求失败: ${e.message}` } });
  }

  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') || 'application/json'
  });
  if (upstream.body) {
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

function createRouterServer({ getProviders }) {
  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      return sendJson(res, 400, { error: { message: 'bad url' } });
    }
    const path = (url.pathname || '/').replace(/\/+$/, '') || '/';

    try {
      if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
        return sendJson(res, 200, { object: 'list', data: buildModelList(getProviders()) });
      }
      if (req.method === 'GET' && path === '/health') {
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && (path === '/v1/responses' || path === '/responses')) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          return sendJson(res, 400, { error: { message: 'invalid JSON' } });
        }
        return handleResponses(res, body, getProviders());
      }
      return sendJson(res, 404, { error: { message: 'not found' } });
    } catch (e) {
      return sendJson(res, 500, { error: { message: `router error: ${e.message}` } });
    }
  });

  return {
    listen(port = 8788) {
      return new Promise((resolve) => {
        const tryPort = (p, attempts) => {
          const onError = (e) => {
            server.removeListener('listening', onListening);
            if (e.code === 'EADDRINUSE' && attempts < 20) return tryPort(p + 1, attempts + 1);
            resolve({ ok: false, error: e.message });
          };
          const onListening = () => {
            server.removeListener('error', onError);
            resolve({ ok: true, port: server.address().port });
          };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(p, '127.0.0.1');
        };
        tryPort(port, 0);
      });
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
    },
    port: () => server.address() && server.address().port,
    server
  };
}

module.exports = { createRouterServer, normalizeBase };
