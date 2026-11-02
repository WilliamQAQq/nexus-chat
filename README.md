# Nexus Chat · 自由接入任意 AI API 的增强型聊天工作台
> **Nexus Chat**: An enhanced, privacy-first AI chat workspace for connecting any API freely with full English & Simplified Chinese internationalization (i18n).

[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-blue?style=flat&logo=github)](https://williamqaqq.github.io/nexus-chat/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Zero npm Dependencies](https://img.shields.io/badge/Dependencies-Zero%20npm%20deps-brightgreen.svg)](#)
[![Bilingual UI](https://img.shields.io/badge/i18n-English%20%26%20%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-orange)](#)

[English Documentation](#english-documentation) · [中文文档](#中文文档)

---

<h2 id="english-documentation">English Documentation</h2>

Nexus Chat is a pure modern frontend Web AI chat workspace (with an optional zero-npm-dependency local proxy server). You can access it directly online via **GitHub Pages** on any device or school PC, embed it into school or personal intranets via `<iframe>`, or launch it locally with Node.js.

### 🌐 Live Online Demo & Embedding

- **GitHub Pages Live**: **[https://williamqaqq.github.io/nexus-chat/](https://williamqaqq.github.io/nexus-chat/)**
- **Embed in School / Personal Webpages (`<iframe>`)**:
  ```html
  <iframe
    src="https://williamqaqq.github.io/nexus-chat/"
    style="width:100%;height:720px;border:1px solid #e1e4ec;border-radius:12px;"
    allow="clipboard-write"
    title="Nexus Chat">
  </iframe>
  ```
- **🔒 Public / School PC Security Protection**:
  Check **"🔒 Public/School PC Protection"** in *Settings → API Providers*. API Keys are stored strictly in `sessionStorage` for the current tab and destroyed automatically when the tab is closed, leaving zero trace on shared computers.

### 🌍 Multilingual / Internationalization (i18n)

- **1-Click Header Switcher**: Instant language toggle in the topbar (`🌐 EN` / `🌐 中文`), accessible across mobile and desktop.
- **Auto System Detection**: Automatically aligns with `navigator.language` and remembers preferences in `localStorage`.
- **General Settings Dropdown**: Choose between *Auto (System)*, *简体中文 (Chinese)*, and *English*.
- **Localized AI Compaction & Summary**: System instructions and prompt templates for context compression and summarization dynamically generate outputs in your active language.

### 🚀 Key Features

1. **Universal Multi-Protocol API Connectivity**:
   - **OpenAI Compatible Protocol**: OpenAI, DeepSeek, OpenRouter, SiliconFlow, Alibaba Cloud Qwen, Volcengine Ark, Moonshot (Kimi), Zhipu GLM, Groq, Mistral, xAI Grok, Ollama local models, and any OneAPI / NewAPI relays.
   - **Anthropic Claude Protocol**: Claude streaming responses, prompt token caching stats, and Extended Thinking traces.
   - **Google Gemini Protocol**: Gemini SSE streaming, reasoning thoughts, and multimodal image analysis.
   - **Auto Endpoint Preview & Smart `/v1` Normalization**: Instant preview of exact request endpoints before making calls.
   - **Built-in Local CORS Proxy**: Transparently bypass browser CORS restrictions with zero third-party dependencies.

2. **Context Window Quota Monitoring, Non-destructive Compaction & Summarization**:
   - **5-Segment Live Progress Bar**: Visualizes *System Prompt + Compressed Summary + Active History + Draft Input + Reserved Output (`max_tokens`)* with warning (>80%) and danger (>100%) thresholds.
   - **Non-destructive Context Compaction**: Condense earlier conversation turns into high-density memory summaries while archiving original messages in collapsible search-friendly tags. Supports rolling incremental updates and 1-click rollback.
   - **Multi-style Conversation Summary**: Four built-in templates (*Structured Minutes*, *Key Bullets*, *Tech & Code Review*, *Action Items*) with Markdown editing, `.md` export, and continuation forks.
   - **Turn-by-turn Exclude / Include**: Toggle individual messages in and out of context with the eye icon to save tokens without deleting message history.
   - **Real Billed Usage**: Displays exact input/output tokens, duration, and generation speed (`tok/s`).

3. **System Prompt Editor & Template Library**:
   - Dynamic variable expansions: `{{date}}`, `{{time}}`, `{{weekday}}`, `{{model}}`.
   - Built-in prompt presets with one-click role switching on the welcome screen.

4. **Multi-dimensional Generation Parameter Controls**:
   - Quick temperature chips: `Precise 0`, `Code 0.2`, `Balanced 0.7`, `Creative 1.2`, or `Omit Temp` (for reasoning models like `o1`/`o3`/`R1`).
   - Granular checkboxes, sliders, and numerical inputs for `Temperature`, `Top P`, `Max Output Tokens`, `Presence Penalty`, and `Frequency Penalty`.

---

<h2 id="中文文档">中文文档</h2>

纯前端 + 可选零依赖本地代理的双模 Web AI 聊天工作台。既可通过 **GitHub Pages** 在学校电脑、校园网等任意浏览器直接在线打开（或 `<iframe>` 嵌入其他网站），也可在本机通过 Node.js 一键启动。

## 在线使用 & 网页嵌入

- **GitHub Pages 在线访问**：**[https://williamqaqq.github.io/nexus-chat/](https://williamqaqq.github.io/nexus-chat/)**
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

### 1. 全界面中英双语国际化 (i18n)
- **顶栏一键切换**：顶栏显眼位置配备 `🌐 EN` / `🌐 中文` 语言切换按钮，移动端与桌面端均可一键即时无缝切换。
- **自动检测与持久化**：默认根据浏览器系统语言 (`navigator.language`) 自动显示英文或简体中文，并在通用设置中提供下拉切换与 `localStorage` 记忆。
- **多语言上下文压缩与总结**：激活英文模式时，压缩摘要与四种对话总结模板自动生成地道的英文纪要与分析报告。

### 2. 自由接入多协议 API
- **三大原生协议**：
  - **OpenAI 兼容协议**：支持 OpenAI、DeepSeek、OpenRouter、硅基流动 (SiliconFlow)、阿里云百炼、火山方舟、Moonshot (Kimi)、智谱 GLM、Groq、Mistral、xAI Grok、Ollama 本地模型，以及所有 OneAPI / NewAPI 中转站。
  - **Anthropic 原生协议**：支持 Claude 系列消息流、缓存 Token 统计及 Extended Thinking 思考过程展示。
  - **Google Gemini 原生协议**：支持 Gemini 系列 SSE 流式输出、思考链与多模态图片理解。
- **智能地址补全与实时端点预览**：输入裸域名自动补全 `/v1`（地址末尾加 `#` 可禁用自动补全），下方实时预览完整请求 URL。
- **自定义请求头 (Custom Headers)**：支持 `Header: Value` 或 JSON 格式，轻松适配企业网关、Cloudflare AI Gateway 等鉴权场景。
- **内置本地 CORS 代理**：勾选“通过本地服务器代理请求”即可彻底解决浏览器跨域报错，同时 API Key 仅保存在本机浏览器 `localStorage` 中。
- **一键拉取模型 & 连接测试**：自动调用 `/models` 拉取可用模型列表，或发起最小化对话请求验证连通性。

### 3. 上下文窗口额度监控、无损压缩与对话总结
- **五色分段实时进度条**：底部输入栏与右侧面板同步展示 **系统提示词 + 压缩摘要 + 携带历史 + 正在输入 + 预留输出 (`max_tokens`)** 五部分占比，超过 80% 橙色预警、超过 100% 红色超限提醒。
- **无损上下文压缩（Context Compaction）**：
  - 支持将早期长对话由 AI 浓缩为高密度记忆摘要（可选保留最近 `N` 条消息原文、指定重点保留信息、自由选择轻量模型省成本），支持多次**增量滚动合并**；
  - 原始早期消息自动折叠至 `<details>` 归档区（不丢失、仍支持浏览器页内搜索），后续请求仅发送 **压缩摘要 + 近期保留消息**，亦可随时手动编辑摘要或一键**撤销压缩**无损恢复；
  - 支持勾选 **占用超 80% 时发送前自动 AI 压缩早期历史**，长程对话不爆窗、不断片。
- **多风格对话总结（Conversation Summary）**：
  - 内置 **📋 结构化纪要**、**🎯 核心要点**、**💻 技术与代码复盘**、**✅ 待办行动项** 四种总结模板，支持自动提炼并更新对话标题；
  - 支持 Markdown 预览/源码编辑、一键复制、独立导出 `.md`、转为当前上下文压缩，或一键 **携带总结开启新对话**。
- **单条消息上下文开关**：每条消息下方提供“移出/重新纳入上下文”（眼睛图标）按钮，无需删除聊天记录即可随时剔除冗长历史消息节省额度。
- **自动截断与条数限制**：支持按窗口上限自动滑窗截断最早消息，或固定仅携带最近 N 条历史消息。
- **真实账单用量统计**：每次回复后记录 API 返回的真实输入/输出 Token 数、生成耗时与吐字速度 (`tok/s`)，并在右侧汇总本对话累计消耗。

### 4. 系统提示词编辑与模板库
- **独立提示词编辑器**：每个对话拥有独立的 System Prompt，实时估算 Token 占用。
- **动态变量支持**：提示词内可使用 `{{date}}`、`{{time}}`、`{{weekday}}`、`{{model}}`，发送时自动注入实时上下文。
- **提示词模板库**：内置通用助手、代码专家、中英互译、写作润色、苏格拉底导师等预设，支持新建/编辑/设为新对话默认，以及在欢迎页一键切换角色。

### 5. 温度与多维生成参数控制
- **快捷档位**：一键切换 `严谨 0`、`代码 0.2`、`平衡 0.7`、`创意 1.2` 或 `不传温度`（适配 `o1`/`o3`/`R1` 等不支持温度参数的推理模型）。
- **独立参数开关**：`Temperature`、`Top P`、`Max Tokens`、`Presence Penalty`、`Frequency Penalty` 均配有独立勾选框、滑块与精确数值框，取消勾选即不向 API 发送该字段。
- **体验增强**：支持思考链 (`<think>` / `reasoning_content` / Claude & Gemini Thinking) 折叠展示、粘贴/拖拽图片与代码文本附件、消息二次编辑重发、代码块一键复制、对话搜索置顶、Markdown 导出及全量 JSON 备份恢复。
