'use strict';

const api = window.anySwitch;

const S = {
  state: null,
  presets: [],
  selectedId: null,
  search: ''
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function icon(name) {
  return `<svg class="ic" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function toast(msg, type = '', timeout = 3200) {
  const root = $('#toastRoot');
  const t = document.createElement('div');
  t.className = `toast ${type}`.trim();
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 220);
  }, timeout);
}

function maskKey(k) {
  if (!k) return '未设置';
  if (k.length <= 6) return '••••';
  return '••••••••' + k.slice(-4);
}

function initial(name) {
  const s = (name || '?').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}

function providers() {
  return (S.state && S.state.data && S.state.data.providers) || [];
}
function active() {
  return (S.state && S.state.data && S.state.data.active) || { providerId: null, model: null };
}
function findProvider(id) {
  return providers().find((p) => p.id === id) || null;
}

function render() {
  renderChip();
  renderList();
  renderActive();
  renderEditor();
  renderSideFoot();
}

function renderChip() {
  const chip = $('#codexHomeChip');
  const home = S.state ? S.state.codexHome : '';
  chip.textContent = home ? (S.state.configExists ? '已连接' : '未创建') : '…';
  chip.title = home;
}

function renderSideFoot() {
  const foot = $('#sideFoot');
  const detected = (S.state && S.state.detected) || [];
  const missing = detected.filter((d) => !providers().some((p) => p.id === d.id));
  if (missing.length === 0) {
    foot.innerHTML = '<div class="pd-none">在 config.toml 中检测到 0 个新 Provider</div>';
    return;
  }
  foot.innerHTML = `
    <button class="link-btn" id="btnImport" data-n="${missing.length}">
      ${icon('down')}<span>导入检测到的 ${missing.length} 个 Provider</span>
    </button>`;
  $('#btnImport').addEventListener('click', () => api.importDetected().then(applyState));
}

function renderList() {
  const ul = $('#providerList');
  const list = providers().filter((p) => {
    if (!S.search) return true;
    const q = S.search.toLowerCase();
    return (p.name + ' ' + p.id + ' ' + (p.models || []).join(' ')).toLowerCase().includes(q);
  });
  if (list.length === 0) {
    ul.innerHTML = `<div class="pd-none">${providers().length ? '没有匹配的 Provider' : '还没有 Provider，点击上方“新建”开始'}</div>`;
    return;
  }
  const activeId = active().providerId;
  ul.innerHTML = list
    .map((p) => {
      const isActive = p.id === activeId;
      const isSel = p.id === S.selectedId;
      const cls = ['provider-item'];
      if (isActive) cls.push('active');
      if (isSel) cls.push('selected');
      return `
        <li class="${cls.join(' ')}" data-id="${esc(p.id)}">
          <span class="dot" style="background:${esc(p.color || '#64748b')}"></span>
          <div class="provider-meta">
            <div class="provider-name">${esc(p.name)} <span class="badge">(${p.enabled === false ? '停用' : (p.models || []).length + ' 模型'})</span></div>
            <div class="provider-sub">${esc(p.baseUrl || '未设置 Base URL')}</div>
          </div>
          <span class="provider-radio ${isActive ? 'on' : ''}" title="${isActive ? '当前活跃' : ''}">
            ${icon(isActive ? 'radio' : 'circle')}
          </span>
        </li>`;
    })
    .join('');
  $$('#providerList .provider-item').forEach((li) => {
    li.addEventListener('click', () => {
      S.selectedId = li.dataset.id;
      render();
    });
  });
}

function renderActive() {
  const el = $('#activePanel');
  const act = active();
  const p = findProvider(act.providerId);
  if (!p) {
    el.innerHTML = `
      <h2>当前使用的 Provider</h2>
      <p class="desc">还没有设置活跃的 Provider。</p>
      <div class="inactive-note">从左侧选择一个 <b>Provider</b>，然后点击“设为当前”即可写入 Codex 配置。</div>`;
    return;
  }
  const models = unique([...(p.models || []), act.model].filter(Boolean));
  const opts = models
    .map((m) => `<option value="${esc(m)}" ${m === act.model ? 'selected' : ''}>${esc(m)}</option>`)
    .join('');
  el.innerHTML = `
    <h2>当前使用的 Provider</h2>
    <p class="desc">Codex 当前读取的模型提供方。切换会立即写入 config.toml。</p>
    <div class="active-summary">
      <div class="active-big">
        <div class="active-dot" style="background:${esc(p.color || '#5b8def')}">${esc(initial(p.name))}</div>
        <div>
          <div class="active-name">${esc(p.name)}</div>
          <div class="active-sub">model_provider = ${esc(p.id)} · wire_api = ${esc(p.wireApi)}</div>
        </div>
      </div>
      <div class="active-actions">
        <select id="activeModel" class="select-model">${opts}</select>
        <button class="btn" id="btnTestActive">${icon('server')} 测试</button>
        <button class="btn primary" id="btnApplyActive">${icon('zap')} 设为当前</button>
      </div>
    </div>
    <div class="status-line">
      <span class="status-dot ${S.state.configExists ? 'ok' : 'warn'}"></span>
      <span>config.toml 当前：</span>
      <code>model_provider = ${esc(S.state.activeInConfig.providerId || '—')}</code>
      <code>model = ${esc(S.state.activeInConfig.model || '—')}</code>
      ${S.state.configError ? `<span class="err">${esc(S.state.configError)}</span>` : ''}
    </div>
    ${S.state.activeModelInCatalog === false
      ? `<div class="status-line" style="border-color:rgba(251,191,36,0.4)">
          <span class="status-dot" style="background:var(--warning)"></span>
          <span class="warn">该模型不在当前模型目录（model_catalog_json）中。请重启 Codex 或在其模型选择器里刷新，Codex 会从该 Provider 重新获取模型。</span>
        </div>`
      : ''}`;
  $('#btnApplyActive').addEventListener('click', async () => {
    const model = $('#activeModel').value;
    const res = await api.setActive(p.id, model, true);
    applyState(res.state);
    if (res.ok) {
      const changed = res.sync && res.sync.changed;
      toast(`已切换为 ${p.name}（${model}）`, 'success');
      if (res.sync && res.sync.backup) toast('切换前已自动备份 config.toml', 'warn');
      void changed;
    } else {
      toast(res.error || '切换失败', 'error');
    }
  });
  $('#btnTestActive').addEventListener('click', () => testProvider(p.id));
}

function renderEditor() {
  const el = $('#editorPanel');
  const p = findProvider(S.selectedId);
  if (!p) {
    el.innerHTML = `
      <h2>编辑 Provider</h2>
      <p class="desc">选择左侧的 Provider 进行编辑。</p>
      <div class="inactive-note">新建一个 Provider 后，可在这里配置 Base URL、API Key、模型列表，并一键写入 Codex。</div>`;
    return;
  }
  const act = active();
  const isActive = act.providerId === p.id;
  const isEnv = p.authType === 'env';
  const models = p.models || [];
  const defaultModel = p.defaultModel || models[0] || '';
  el.innerHTML = `
    <h2>编辑 Provider</h2>
    <p class="desc">${esc(p.note || '')}</p>
    <div class="field-grid">
      <div class="field full">
        <label>名称</label>
        <input id="fName" value="${esc(p.name)}" placeholder="DeepSeek" />
      </div>
      <div class="field full">
        <label>Base URL（OpenAI 兼容接口）</label>
        <input id="fBase" value="${esc(p.baseUrl)}" placeholder="https://api.example.com/v1" />
      </div>
      <div class="field">
        <label>Wire API</label>
        <div class="seg" id="fWire">
          <button data-v="chat" class="${p.wireApi !== 'responses' ? 'on' : ''}">chat</button>
          <button data-v="responses" class="${p.wireApi === 'responses' ? 'on' : ''}">responses</button>
        </div>
      </div>
      <div class="field">
        <label>鉴权方式</label>
        <div class="seg" id="fAuth">
          <button data-v="bearer" class="${!isEnv ? 'on' : ''}">Bearer Token</button>
          <button data-v="env" class="${isEnv ? 'on' : ''}">环境变量</button>
        </div>
      </div>
      <div class="field full" id="fKeyWrap" ${isEnv ? 'hidden' : ''}>
        <label>API Key</label>
        <div class="input-wrap">
          <input class="key" id="fKey" type="password" value="${esc(p.apiKey || '')}" placeholder="sk-…" />
          <button class="toggle-eye" id="fEye" type="button">${icon('eye')}</button>
        </div>
      </div>
      <div class="field full" id="fEnvWrap" ${isEnv ? '' : 'hidden'}>
        <label>环境变量名（env_key）</label>
        <input id="fEnv" value="${esc(p.envKey || '')}" placeholder="DEEPSEEK_API_KEY" />
      </div>
      <div class="field full">
        <label>默认模型</label>
        <select id="fDefault">
          ${(models.length ? models : [defaultModel]).map((m) => `<option value="${esc(m)}" ${m === defaultModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="field full">
        <label>模型列表</label>
        <div class="model-chips" id="fModels">
          ${models.map((m) => `<span class="chip-model"><span>${esc(m)}</span><button data-m="${esc(m)}" title="移除">${icon('x')}</button></span>`).join('')}
        </div>
        <div class="add-model">
          <input id="fNewModel" placeholder="添加模型 ID，回车确认" />
          <button class="btn small" id="btnAddModel">${icon('plus')} 添加</button>
        </div>
      </div>
      <div class="field full">
        <div class="row-between">
          <span class="lbl">启用（写入 config.toml）</span>
          <button class="switch ${p.enabled !== false ? 'on' : ''}" id="fEnabled" type="button" aria-label="启用"></button>
        </div>
      </div>
    </div>
    <div class="editor-actions">
      <button class="btn primary" id="btnSave">${icon('check')} 保存</button>
      ${isActive ? '' : `<button class="btn" id="btnSetActive">${icon('zap')} 设为当前</button>`}
      <button class="btn" id="btnTest">${icon('server')} 测试连接</button>
      <button class="btn" id="btnDup">${icon('copy')} 复制</button>
      <button class="btn danger" id="btnDel">${icon('trash')} 删除</button>
    </div>
    <div id="editorTest" class="test-result"></div>`;

  // Wire / auth segmented controls
  $$('#fWire button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#fWire button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    })
  );
  $$('#fAuth button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#fAuth button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const isEnv = b.dataset.v === 'env';
      $('#fKeyWrap').hidden = isEnv;
      $('#fEnvWrap').hidden = !isEnv;
    })
  );
  $('#fEye').addEventListener('click', () => {
    const inp = $('#fKey');
    const isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    $('#fEye').innerHTML = icon(isPass ? 'eyeoff' : 'eye');
  });
  $('#btnAddModel').addEventListener('click', addModel);
  $('#fNewModel').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addModel();
    }
  });
  $$('#fModels button').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.m;
      const dom = $('#fModels');
      $$('#fModels .chip-model', dom).forEach((chip) => {
        if (chip.querySelector('span').textContent === m) chip.remove();
      });
    })
  );
  $('#fEnabled').addEventListener('click', () => $('#fEnabled').classList.toggle('on'));
  $('#btnSave').addEventListener('click', () => saveEditor(p));
  $('#btnDup').addEventListener('click', async () => {
    const res = await api.duplicateProvider(p.id);
    if (res.ok) {
      S.selectedId = res.state.data.providers.find((x) => x.name.includes('副本'))?.id || p.id;
      applyState(res.state);
      toast('已复制 Provider', 'success');
    }
  });
  $('#btnDel').addEventListener('click', async () => {
    if (!confirm(`确定删除 Provider「${p.name}」？\n（不会删除已写入 config.toml 的片段，除非再次同步）`)) return;
    const res = await api.deleteProvider(p.id);
    if (res.ok) {
      S.selectedId = null;
      applyState(res.state);
      toast('已删除 Provider', 'success');
    } else toast(res.error || '删除失败', 'error');
  });
  $('#btnTest').addEventListener('click', () => testProvider(p.id, $('#editorTest')));
  const setActiveBtn = $('#btnSetActive');
  if (setActiveBtn) {
    setActiveBtn.addEventListener('click', async () => {
      const model = $('#fDefault').value || models[0] || '';
      const res = await api.setActive(p.id, model, true);
      applyState(res.state);
      if (res.ok) toast(`已设为当前：${p.name}（${model}）`, 'success');
      else toast(res.error || '切换失败', 'error');
    });
  }
}

function addModel() {
  const inp = $('#fNewModel');
  const v = inp.value.trim();
  if (!v) return;
  const dom = $('#fModels');
  if (![...dom.querySelectorAll('span')].some((s) => s.textContent === v)) {
    const chip = document.createElement('span');
    chip.className = 'chip-model';
    chip.innerHTML = `<span>${esc(v)}</span><button data-m="${esc(v)}" title="移除">${icon('x')}</button>`;
    dom.appendChild(chip);
    chip.querySelector('button').addEventListener('click', () => chip.remove());
    // refresh default select
    const sel = $('#fDefault');
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
    if (!sel.value) sel.value = v;
  }
  inp.value = '';
}

function readEditor() {
  const segVal = (id) => {
    const on = $(`#${id} button.on`);
    return on ? on.dataset.v : '';
  };
  const models = $$('#fModels .chip-model').map((c) => c.querySelector('span').textContent);
  return {
    name: $('#fName').value.trim() || '未命名',
    baseUrl: $('#fBase').value.trim(),
    wireApi: segVal('fWire') || 'chat',
    authType: segVal('fAuth') || 'bearer',
    apiKey: $('#fKey').value.trim(),
    envKey: $('#fEnv') ? $('#fEnv').value.trim() : '',
    defaultModel: $('#fDefault').value,
    models,
    enabled: $('#fEnabled').classList.contains('on')
  };
}

async function saveEditor(p) {
  const rec = readEditor();
  const merged = {
    ...p,
    ...rec,
    id: p.id,
    note: p.note,
    color: p.color,
    vendor: p.vendor,
    builtin: p.builtin
  };
  const res = await api.saveProvider(merged);
  if (res.ok) {
    applyState(res.state);
    toast('已保存 Provider', 'success');
  } else {
    toast(res.error || '保存失败', 'error');
  }
}

async function testProvider(id, targetEl) {
  const btn = $(targetEl ? '#btnTest' : '#btnTestActive');
  const setBusy = (on) => {
    if (!btn) return;
    btn.disabled = on;
    btn.innerHTML = on ? '<span style="font-size:12px">测试中…</span>' : `${icon('server')} 测试连接`;
  };
  setBusy(true);
  const res = await api.testConnection(id);
  setBusy(false);
  if (targetEl) {
    targetEl.innerHTML = res.ok
      ? `<span class="ok">${icon('checkcircle')}</span><span>${esc(res.message || '连接成功')} <span class="ml">· ${res.kind === 'models' ? `模型 ${res.models.length} 个` : `model=${esc(res.model)}`} · ${res.latencyMs}ms</span></span>`
      : `<span class="err">${icon('warn')}</span><span>${esc(res.error || '连接失败')}</span>`;
  } else {
    toast(res.ok ? `连接成功 · ${res.latencyMs}ms · ${res.status}` : `连接失败：${res.error}`, res.ok ? 'success' : 'error');
  }
  return res;
}

function openNewModal() {
  const presets = S.presets;
  openModal(`
    <h3>新建 Provider</h3>
    <p class="desc" style="margin:6px 0 14px">选择一个预设，或直接自定义。所有内容之后都能编辑。</p>
    <div class="preset-grid">
      ${presets
        .map(
          (p) => `
        <div class="preset-card" data-id="${esc(p.id)}">
          <span class="dot" style="background:${esc(p.color)}"></span>
          <div class="pc-meta">
            <div class="pc-name">${esc(p.name)}</div>
            <div class="pc-note">${esc(p.note || '')}</div>
          </div>
        </div>`
        )
        .join('')}
    </div>`, () => {});
  $$('#modalRoot .preset-card').forEach((card) =>
    card.addEventListener('click', async () => {
      const preset = S.presets.find((p) => p.id === card.dataset.id);
      const rec = {
        id: preset.id,
        name: preset.name,
        vendor: preset.vendor,
        baseUrl: preset.baseUrl,
        wireApi: preset.wireApi,
        authType: 'bearer',
        envKey: preset.envKey,
        apiKey: '',
        models: [...preset.models],
        defaultModel: preset.defaultModel,
        color: preset.color,
        note: preset.note,
        builtin: true,
        enabled: true
      };
      closeModal();
      const res = await api.saveProvider(rec);
      if (res.ok) {
        S.selectedId = rec.id;
        applyState(res.state);
        toast(`已创建 ${rec.name}，请填写 API Key`, 'success');
      }
    })
  );
}

function openSettings() {
  const s = S.state;
  openModal(`
    <h3>设置</h3>
    <div class="modal-body" style="padding-top:12px">
      <div class="list-row">
        <span class="lbl">Codex 配置目录</span>
        <div class="row-between">
          <input id="setHome" value="${esc(s.data.settings.codexHome || '')}" placeholder="留空则使用默认 (~/.codex)" style="flex:1;margin-right:8px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px" />
          <button class="btn small" id="btnHomeSave">${icon('check')} 保存</button>
        </div>
      </div>
      <div class="list-row row-between">
        <span class="lbl">强制使用 API Key 鉴权（写入 preferred_auth_method / forced_login_method）</span>
        <button class="switch ${s.data.settings.forceApiKeyMode !== false ? 'on' : ''}" id="setForce" type="button"></button>
      </div>
      <div class="list-row" style="color:var(--muted);font-size:12px">
        当前目录：<code style="color:var(--text)">${esc(s.codexHome)}</code>
      </div>
      <div class="list-row" style="color:var(--muted);font-size:12px">
        版本：Any Switch ${esc(S.appVersion || '1.0.0')} · Electron ${esc((S.ver && S.ver.electron) || '')} · Node ${esc((S.ver && S.ver.node) || '')}
      </div>
    </div>`, (root) => {
    $('#btnHomeSave').addEventListener('click', async () => {
      const res = await api.setCodexHome($('#setHome').value.trim());
      applyState(res.state);
      toast('已更新配置目录', 'success');
    });
    $('#setForce').addEventListener('click', async () => {
      const next = !$('#setForce').classList.contains('on');
      $('#setForce').classList.toggle('on', next);
      const res = await api.setForceApiKey(next);
      applyState(res.state);
    });
  });
}

function openBackup() {
  api.listBackups().then((res) => {
    const files = (res.files || []).slice(0, 20);
    openModal(`
      <h3>备份与恢复</h3>
      <div class="modal-body" style="padding-top:12px">
        <p class="desc" style="margin:0 0 12px">同步或切换前会自动备份 config.toml。也可以手动创建备份。</p>
        <button class="btn" id="btnMakeBackup" style="margin-bottom:12px">${icon('db')} 立即创建备份</button>
        <div id="backupList">
          ${files.length
            ? files.map((f) => `
              <div class="list-row row-between">
                <div style="min-width:0">
                  <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
                  <div class="lbl" style="font-size:11px">${(f.size / 1024).toFixed(1)} KB · ${new Date(f.mtime).toLocaleString()}</div>
                </div>
                <button class="btn small" data-restore="${esc(f.file)}">${icon('up')} 恢复</button>
              </div>`).join('')
            : '<div class="pd-none">暂无备份</div>'}
        </div>
      </div>`, () => {
      $('#btnMakeBackup').addEventListener('click', async () => {
        const r = await api.createBackup();
        if (r.ok) {
          toast('已创建备份', 'success');
          openBackup();
        } else toast(r.error || '备份失败', 'error');
      });
      $$('#backupList [data-restore]').forEach((b) =>
        b.addEventListener('click', async () => {
          if (!confirm('恢复备份会覆盖当前 config.toml / auth.json，确定继续？')) return;
          const r = await api.restoreBackup(b.dataset.restore);
          if (r.ok) {
            applyState(r.state);
            toast('已恢复备份', 'success');
            openBackup();
          } else toast(r.error || '恢复失败', 'error');
        })
      );
    });
  });
}

let modalCleanup = null;
function openModal(innerHTML, cleanup) {
  const root = $('#modalRoot');
  closeModal();
  const title = (innerHTML.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '提示';
  const body = innerHTML.replace(/<h3>[\s\S]*?<\/h3>/, '');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>${title}</h3><button class="icon-close" data-close>${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"><button class="btn" data-close>${icon('x')} 关闭</button></div>
    </div>`;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) closeModal();
  });
  root.appendChild(backdrop);
  modalCleanup = cleanup;
  if (cleanup) cleanup(backdrop);
}
function closeModal() {
  if (modalCleanup) {
    const c = modalCleanup;
    modalCleanup = null;
    c();
  }
  $('#modalRoot').innerHTML = '';
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function applyState(state) {
  S.state = state;
  if (state && state.data && state.data.providers.length) {
    if (!S.selectedId || !state.data.providers.some((p) => p.id === S.selectedId)) {
      const activeId = state.data.active.providerId;
      S.selectedId = activeId || state.data.providers[0].id;
    }
  } else {
    S.selectedId = null;
  }
  render();
}

async function init() {
  try {
    S.presets = await api.presets();
  } catch {
    S.presets = [];
  }
  try {
    S.ver = await api.version();
    S.appVersion = S.ver.app;
  } catch {
    S.ver = null;
  }
  const state = await api.getState();
  applyState(state);

  $('#btnNew').addEventListener('click', openNewModal);
  $('#btnSync').addEventListener('click', async () => {
    const btn = $('#btnSync');
    btn.disabled = true;
    btn.innerHTML = `<span style="font-size:13px">同步中…</span>`;
    const res = await api.sync();
    btn.disabled = false;
    btn.innerHTML = `${icon('zap')}<span>同步到 Codex</span>`;
    if (res.ok) {
      applyState(res.state);
      toast(res.result.changed ? `已同步到 Codex ${res.result.backup ? '（已自动备份）' : ''}` : '配置已是最新', res.result.changed ? 'success' : '');
    } else {
      toast(res.error || '同步失败', 'error');
    }
  });
  $('#btnBackup').addEventListener('click', openBackup);
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnOpenDir').addEventListener('click', async () => {
    await api.openConfigDir();
  });
  $('#search').addEventListener('input', (e) => {
    S.search = e.target.value.trim();
    renderList();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

init();
