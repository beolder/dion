'use strict';

// Built-in presets for the providers Any Switch manages. Every field is
// editable in the UI; these are meant to be correct, sensible starting points.
// `wireApi` defaults to "chat" because every provider below is OpenAI-compatible
// via /chat/completions. Providers that expose a real /responses endpoint can be
// switched to "responses".

const presets = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    wireApi: 'chat',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v3.2',
      'deepseek-r1',
      'deepseek-v4-flash'
    ],
    defaultModel: 'deepseek-chat',
    color: '#4d6bfe',
    note: '深度求索官方 API。高端推理可选 deepseek-reasoner。'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    vendor: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    wireApi: 'chat',
    envKey: 'ZHIPU_API_KEY',
    models: [
      'glm-4.6',
      'glm-5',
      'glm-5.2',
      'glm-4v-plus',
      'glm-4-flash'
    ],
    defaultModel: 'glm-5.2',
    color: '#6b4dff',
    note: '智谱 AI / 智谱清言 GLM 系列。'
  },
  {
    id: 'qwen',
    name: '通义千问 Qwen',
    vendor: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    wireApi: 'chat',
    envKey: 'DASHSCOPE_API_KEY',
    models: [
      'qwen3-coder-plus',
      'qwen3-coder-flash',
      'qwen-plus',
      'qwen-max',
      'qwen3-max',
      'qwq-plus',
      'qwen-vl-max'
    ],
    defaultModel: 'qwen3-coder-plus',
    color: '#3aa6b9',
    note: '阿里云百炼 DashScope，OpenAI 兼容模式。'
  },
  {
    id: 'moonshot',
    name: 'Kimi / 月之暗面',
    vendor: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    wireApi: 'chat',
    envKey: 'MOONSHOT_API_KEY',
    models: [
      'kimi-k2-0711-preview',
      'kimi-k2-turbo-preview',
      'kimi-latest',
      'moonshot-v1-128k',
      'moonshot-v1-32k',
      'moonshot-v1-8k'
    ],
    defaultModel: 'kimi-k2-turbo-preview',
    color: '#222a3f',
    note: '月之暗面 Kimi。'
  },
  {
    id: 'volcengine',
    name: '豆包 / 火山引擎',
    vendor: 'volcengine',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    wireApi: 'chat',
    envKey: 'ARK_API_KEY',
    models: [
      'doubao-seed-1.6-flash',
      'doubao-seed-1.6-vl',
      'doubao-1-5-pro-32k-250115'
    ],
    defaultModel: 'doubao-seed-1.6-flash',
    color: '#ff7a45',
    note: '火山方舟。model 可填模型名或推理接入点 ID（ep-xxx）。'
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    vendor: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    wireApi: 'chat',
    envKey: 'SILICONFLOW_API_KEY',
    models: [
      'Qwen/Qwen3-Coder-480B-A35B-Instruct',
      'deepseek-ai/DeepSeek-V3.1',
      'deepseek-ai/DeepSeek-R1',
      'THUDM/GLM-4.6'
    ],
    defaultModel: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    color: '#00d0a0',
    note: '聚合多家模型，按 model 全名调用。'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    vendor: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    wireApi: 'chat',
    envKey: 'OPENROUTER_API_KEY',
    models: [
      'deepseek/deepseek-chat',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'qwen/qwen3-coder'
    ],
    defaultModel: 'deepseek/deepseek-chat',
    color: '#8b5cf6',
    note: '海外聚合器，需要能访问外网。'
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容',
    vendor: 'custom',
    baseUrl: '',
    wireApi: 'chat',
    envKey: 'CUSTOM_API_KEY',
    models: [],
    defaultModel: '',
    color: '#64748b',
    note: '任意 OpenAI 兼容的 /chat/completions 或 /responses 服务。'
  }
];

/**
 * Materialize a preset into a full provider record, mixing in any overrides.
 */
function fromPreset(preset, overrides = {}) {
  return {
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
    enabled: true,
    ...overrides
  };
}

function findPreset(id) {
  return presets.find((p) => p.id === id) || null;
}

module.exports = { presets, fromPreset, findPreset };
