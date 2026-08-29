# Any Switch

一个适配 **Windows** 和 **macOS** 的桌面工具，用于管理 **Codex** 的多个第三方 API 提供方（Provider），并一键切换当前使用的模型。

它和 `cc-switch` 类似，但解决了后者的一个痛点：cc-switch 在同一时间只能让 Codex 使用一种第三方 API；而 Any Switch 会把 **多个 Provider 同时写进 `~/.codex/config.toml`**，你可以在一个会话中用 `/model` 任意切换，也可以一键更换默认提供方。

## 为什么需要它

Codex 的 `config.toml` 支持 `[model_providers.*]`，你本来就可以同时配置多个提供方。问题在于手动编辑这个文件很繁琐：

- 每个提供方要写 `base_url`、`wire_api`、鉴权方式；
- 不同提供方的模型 ID 各不相同；
- 切换默认提供方要改 `model` 和 `model_provider` 两个字段；
- 稍不注意就可能改坏其他配置（插件、MCP、项目信任等）。

Any Switch 把这些都封装成一个图形界面，只做“外科手术式”的修改，其余内容原样保留。

## 内置提供方

- DeepSeek（深度求索）
- 智谱 GLM（智谱清言）
- 通义千问 Qwen（阿里云百炼）
- Kimi / 月之暗面（Moonshot）
- 豆包 / 火山引擎
- 硅基流动 SiliconFlow
- OpenRouter
- 自定义 OpenAI 兼容服务

所有字段都能在界面里直接编辑，也可以“复制”一个已有的作为模板。

## 功能

- **多 Provider 同时生效**：把所有启用的 Provider 写入 `[model_providers.*]`。
- **一键切换默认**：点击“设为当前”，自动写入 `model` 和 `model_provider`。
- **保留其他配置**：插件、MCP 服务器、项目信任路径、桌面选项等一律不动。
- **模型列表管理**：每个 Provider 可维护多个模型 ID，选择默认模型。
- **连接测试**：优先请求免额度的 `/models` 端点，失败时回退到一次最小 chat 请求（1 token）。
- **自动备份**：每次同步/切换前为 `config.toml` 生成备份，可在“备份”面板恢复。
- **导入已有配置**：检测 `config.toml` 里已有的 Provider，一键导入。
- **鉴权方式**：支持把 Key 直接写入 Provider（`experimental_bearer_token`），或引用环境变量（`env_key`）。
- **强制 API Key 模式**：自动写入 `preferred_auth_method = "apikey"` 与 `forced_login_method = "api"`。

## 环境要求

- Node.js 18+（推荐 20/22/24）
- 各平台构建需要在对应系统上执行（Windows 出 NSIS 安装包，macOS 出 DMG）

## 本地运行

```bash
npm install
npm start
```

如果你的网络访问 GitHub 较慢（Electron 二进制从 GitHub 下载），可以先设置镜像再安装：

```bash
# Windows PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

```bash
# macOS
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 构建安装包

> 注意：`electron-builder` 默认只能在自己的系统上构建对应的安装包。Windows 上构建 Windows 安装包，macOS 上构建 macOS 安装包。

```bash
# Windows（NSIS 安装程序，输出到 release/）
npm run dist:win

# macOS（DMG，同时打 x64 和 arm64）
npm run dist:mac
```

## 使用流程

1. 打开 App，点击“新建”，选一个预设，或直接自定义。
2. 填写 `Base URL`，选择 `wire_api`（见下文），填入 API Key。
3. 维护该 Provider 的模型列表和默认模型。
4. 点击“保存”。“设为当前”会用所选模型更新 Codex 配置。
5. 同步按钮会把所有启用的 Provider 一并写入 `config.toml`。
6. 在 Codex 里，可用 `/model <模型ID>` 在已配置的 Provider 间即时切换。

## wire_api：chat 还是 responses

- `chat`：走 OpenAI 兼容的 `/chat/completions`，绝大多数国内第三方都支持。
- `responses`：走 OpenAI `/responses` 接口，仅有少数提供方（如 DeepSeek 或聚合中继服务）支持。

不确定就先用 `chat`。如果你的提供方明确支持 Responses 接口，再切到 `responses`，Codex 的工具调用能力会更完整。

## 鉴权方式

- **Bearer Token**：把 Key 写入 `[model_providers.<id>]` 的 `experimental_bearer_token`。多个 Provider 可各用各的 Key，互不干扰，这也是本工具“同时支持多种第三方 API”的关键。
- **环境变量**：写入 `env_key`，Codex 从环境变量读取 Key。适合不想把 Key 落到 `config.toml` 的场景（例如用 `.env` 或系统环境变量）。

## 数据与配置文件

- Codex 配置：`~/.codex/config.toml`（可用 `CODEX_HOME` 覆盖）
- Any Switch 自己的数据（Provider 列表、当前选择、设置）：存放在 Electron 的 `userData` 目录：
  - Windows：`%APPDATA%\Any Switch\any-switch.json`
  - macOS：`~/Library/Application Support/Any Switch/any-switch.json`
  - 可用环境变量 `ANY_SWITCH_HOME` 覆盖

## 常见问题

**切换后 Codex 没反应？**
Codex 一般只在启动或新会话时读取配置。切换后新开一个会话，或重启 Codex。

**提示模型不存在 / 鉴权失败？**
确认所选模型 ID 确实是该提供方支持的，且 `wire_api` 与提供方匹配。用“测试连接”先验证 Key 和地址。

**界面里提示“该模型不在模型目录中”？**
Codex 会维护一份模型目录（`model_catalog_json`，通常是 `~/.codex/models.json`），并在你选定某个 Provider 时从中读取模型。切换到新的 Provider 后，Codex 会重新拉取该提供方的模型列表；如果 `model` 暂时不在目录里，重启 Codex 或在其模型选择器里刷新一次即可。

**Key 写进了配置文件？**
Bearer 模式下会写进 `config.toml`，这也是 Codex 原生本身支持的存储方式。若不希望保存明文 Key，改用“环境变量”鉴权。

**会不会改坏我的其它配置？**
不会。工具只替换顶层的 `model` / `model_provider` 以及 `[model_providers.*]` 段，其余内容逐字保留；同步前还会自动备份。

## 项目结构

```
main.js                 Electron 主进程：窗口 + IPC 处理器
preload.js              contextBridge，暴露 window.anySwitch
renderer/
  index.html            界面骨架与内联图标
  styles.css            UI 样式
  app.js                界面逻辑（纯 JavaScript，无构建步骤）
src/
  codex-config.js       核心：对 config.toml 做安全改写
  presets.js            内置 Provider 预设
  store.js              数据持久化
  health.js             连接测试
test/
  codex-config.test.js  核心逻辑单元测试
  smoke-renderer.js     界面冒烟测试（假 DOM）
```

## 测试

```bash
npm test
```

会运行 `codex-config` 的 6 个断言（注入多 Provider、切换、识别、备份恢复）以及渲染器的冒烟测试。核心逻辑不依赖 Electron，可单独在 Node 里跑。

## License

MIT
