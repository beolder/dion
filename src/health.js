'use strict';

function normalizeBase(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function headersFor(provider) {
  const h = { 'Content-Type': 'application/json' };
  if (provider.apiKey && provider.apiKey.trim()) {
    h['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
  }
  return h;
}

async function timedFetch(url, init, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Verify a provider without spending tokens where possible. It first probes the
 * OpenAI-compatible /models endpoint (free), then falls back to a one-token
 * chat completion if the endpoint does not expose /models.
 */
async function testProvider(provider) {
  const base = normalizeBase(provider.baseUrl);
  const started = Date.now();
  if (!/^https?:\/\/.+/i.test(base)) {
    return { ok: false, error: 'Base URL 不是有效的 http(s) 地址' };
  }
  if (!provider.apiKey || !provider.apiKey.trim()) {
    return { ok: false, error: '请先填写 API Key' };
  }

  const headers = headersFor(provider);
  // 1) Free capability check: GET /models
  let modelsResp = null;
  try {
    const res = await timedFetch(`${base}/models`, { method: 'GET', headers });
    modelsResp = res;
    const latencyMs = Date.now() - started;
    if (res.ok) {
      let ids = [];
      try {
        const j = await res.json();
        ids = (j.data || []).map((m) => m.id).slice(0, 12);
      } catch {
        /* ignore json parse */
      }
      return {
        ok: true,
        status: res.status,
        kind: 'models',
        latencyMs,
        models: ids,
        message: '连接成功'
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, latencyMs, error: '鉴权失败（401/403），请检查 API Key' };
    }
  } catch (e) {
    modelsResp = null;
    // fall through to chat
  }

  // 2) Fallback: minimal chat completion to validate the key + model.
  const model = provider.defaultModel || (provider.models && provider.models[0]);
  if (!model) {
    return { ok: false, error: '没有可用的 model 用于测试' };
  }
  try {
    const res = await timedFetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      })
    });
    const latencyMs = Date.now() - started;
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) {
      return { ok: true, status: res.status, kind: 'chat', latencyMs, model, message: '连接与 Key 均有效' };
    }
    const msg =
      (body && (body.error && body.error.message)) ||
      `HTTP ${res.status}`;
    return { ok: false, status: res.status, latencyMs, error: msg };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: `请求失败：${e.message}` };
  }
}

module.exports = { testProvider, normalizeBase };
