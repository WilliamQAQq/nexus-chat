# Nexus Chat · 自由接入任意 AI API 的增强型聊天工作台

纯前端 + 可选零依赖本地代理的双模 Web AI 聊天工作台。既可通过 **GitHub Pages** 在学校电脑、校园网等任意浏览器直接在线打开（或 `<iframe>` 嵌入其他网站），也可在本机通过 Node.js 一键启动。

## 在线使用 & 网页嵌入

- **GitHub Pages 在线访问**：**https://williamqaqq.github.io/nexus-chat/**
- **嵌入学校/个人网页 (`<iframe>`)**：
  ```html
  <iframe
    src="https://williamqaqq.github.io/nexus-chat/"
    style="width:100%;height:720px;border:1px solid #e1e4ec;border-radius:12px;"
    allow="clipboard-write"
    title="Nexus Chat">
  </iframe>
  ```
- **学校/公共电脑安全保护**：在“设置 → API 提供商”勾选 **🔒 公共/学校电脑保护** 后，API Key 仅保存在当前标签页的 `sessionStorage` 中，关闭网页标签即自动销毁，不在公用设备上留存密钥。

## 本地运行（可选，附带本地 CORS 代理）

- **方式一（Windows 一键启动）**：双击运行目录下的 `start.bat`，将自动启动本地服务并打开浏览器访问 `http://127.0.0.1:8787`。
- **方式二（命令行启动）**：
  ```bash
  node server.js
  ```
  然后在浏览器打开 `http://127.0.0.1:8787`（可通过环境变量 `PORT=3000` 修改端口，`HOST=0.0.0.0` 开启局域网访问）。

## 核心功能

### 1. 自由接入多协议 API
- **三大原生协议**：
  - **OpenAI 兼容协议**：支持 OpenAI、DeepSeek、OpenRouter、硅基流动 (SiliconFlow)、阿里云百炼、火山方舟、Moonshot (Kimi)、智谱 GLM、Groq、Mistral、xAI Grok、Ollama 本地模型，以及所有 OneAPI / NewAPI 中转站。
  - **Anthropic 原生协议**：支持 Claude 系列消息流、缓存 Token 统计及 Extended Thinking 思考过程展示。
  - **Google Gemini 原生协议**：支持 Gemini 系列 SSE 流式输出、思考链与多模态图片理解。
- **智能地址补全与实时端点预览**：输入裸域名自动补全 `/v1`（地址末尾加 `#` 可禁用自动补全），下方实时预览完整请求 URL。
- **自定义请求头 (Custom Headers)**：支持 `Header: Value` 或 JSON 格式，轻松适配企业网关、Cloudflare AI Gateway 等鉴权场景。
- **内置本地 CORS 代理**：勾选“通过本地服务器代理请求”即可彻底解决浏览器跨域报错，同时 API Key 仅保存在本机浏览器 `localStorage` 中。
- **一键拉取模型 & 连接测试**：自动调用 `/models` 拉取可用模型列表，或发起最小化对话请求验证连通性。

### 2. 上下文窗口额度监控与精细裁剪
- **四色分段实时进度条**：底部输入栏与右侧面板同步展示 **系统提示词 + 携带历史 + 正在输入 + 预留输出 (`max_tokens`)** 四部分占比，超过 80% 橙色预警、超过 100% 红色超限提醒。
- **单条消息上下文开关**：每条消息下方提供“移出/重新纳入上下文”（眼睛图标）按钮，无需删除聊天记录即可随时剔除冗长历史消息节省额度。
- **自动截断与条数限制**：支持按窗口上限自动滑窗截断最早消息，或固定仅携带最近 N 条历史消息。
- **真实账单用量统计**：每次回复后记录 API 返回的真实输入/输出 Token 数、生成耗时与吐字速度 (`tok/s`)，并在右侧汇总本对话累计消耗。

### 3. 系统提示词编辑与模板库
- **独立提示词编辑器**：每个对话拥有独立的 System Prompt，实时估算 Token 占用。
- **动态变量支持**：提示词内可使用 `{{date}}`、`{{time}}`、`{{weekday}}`、`{{model}}`，发送时自动注入实时上下文。
- **提示词模板库**：内置通用助手、代码专家、中英互译、写作润色、苏格拉底导师等预设，支持新建/编辑/设为新对话默认，以及在欢迎页一键切换角色。

### 4. 温度与多维生成参数控制
- **快捷档位**：一键切换 `严谨 0`、`代码 0.2`、`平衡 0.7`、`创意 1.2` 或 `不传温度`（适配 `o1`/`o3`/`R1` 等不支持温度参数的推理模型）。
- **独立参数开关**：`Temperature`、`Top P`、`Max Tokens`、`Presence Penalty`、`Frequency Penalty` 均配有独立勾选框、滑块与精确数值框，取消勾选即不向 API 发送该字段。
- **体验增强**：支持思考链 (`<think>` / `reasoning_content` / Claude & Gemini Thinking) 折叠展示、粘贴/拖拽图片与代码文本附件、消息二次编辑重发、代码块一键复制、对话搜索置顶、Markdown 导出及全量 JSON 备份恢复。
