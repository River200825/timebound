# timebound · 轻重缓急工作表

基于浏览器本地存储的时间管理工具，用「重要 × 紧急」自动排优先级，支持 AI 对话录入、OKR 拆解与到期三档提醒。

## 功能

- 任务表：按周 / 按状态分组，行内编辑重要、紧急、工作量，系统按 9 宫格矩阵自动计算优先级（S / A / B+ / B / B- / C）。
- AI 助手：用自然语言、截图或文件录入任务，AI 抽取字段，优先级由系统统一计算；草稿可编辑、拆分、勾选后批量入表。
- OKR 管理：季度目标与关键结果，按工作量加权计算进度（70/30 公式）；支持 AI 拆解与手工 WBS 表单。
- WBS 视图：阶段 → 流程 → 任务三级结构，甘特时间轴，支持日 / 周 / 月缩放与导出。
- 提醒中心：截止前 1 天 / 1 小时 / 15 分钟三档提醒，支持应用内、浏览器通知与企业微信机器人。
- 本地优先：所有数据仅存于浏览器 IndexedDB，无自有后端；支持 JSON 备份导出 / 导入。

## 技术栈

Vue 3 + TypeScript + Vite + Pinia + Vue Router；Dexie（IndexedDB）；UnoCSS；vite-plugin-pwa（可离线安装）；Vitest（happy-dom）。

## 快速开始

```bash
npm install
npm run dev        # 本地开发
npm run build      # 类型检查 + 生产构建（产物在 dist/）
npm run preview    # 预览构建产物
npm run test       # 运行单元测试
npm run typecheck  # 仅类型检查
```

> 若系统 PowerShell 执行策略禁止脚本，可直接调用本地可执行文件：
> `node ./node_modules/vue-tsc/bin/vue-tsc.js --noEmit`
> `node ./node_modules/vite/bin/vite.js build`

## AI 配置

设置页 → AI 配置，选择服务商预设（DeepSeek / OpenAI / **智谱 GLM（免费）** / 通义千问 / Kimi / 自定义），填写 API Key 与模型名。

- API Key 仅保存在本地浏览器，不进入任何导出文件与日志。
- AI 只负责从自然语言 / 图片 / 文件中提取任务字段，优先级一律由系统按重要紧急重算。
- **推荐免费组合**：智谱 GLM-4-Flash（账号免费，实际额度以智谱官方为准）；把预设切到「智谱 GLM（免费，推荐）」即可直接点「测试连接」。

### 开发期连通：智谱 GLM（本地代理）

智谱 API **不支持浏览器直连**（预检 OPTIONS 200 但无 `Access-Control-Allow-Origin`）。本地验收可在设置里把 Base URL 填 `/ai-proxy/bigmodel/api/paas/v4`，推荐模型：

- 文本抽取：`glm-4-flash-250414`（免费，128K，非推理）
- 截图/文件抽取：`glm-4.6v-flash`（免费，128K，多模态）

`vite.config.ts` 已内置开发代理 `/ai-proxy/bigmodel → https://open.bigmodel.cn`。

## 企业微信提醒

设置页 → 提醒设置，填写企微群机器人 Webhook 地址后，提醒会通过浏览器直连该地址。

- 企微 Webhook 接口存在 CORS 限制，发送失败时本工具会尝试无凭证（no-cors）重试，结果标记为「未知」，不会阻塞主流程。

## 部署

`npm run build` 产物为纯静态文件（含 PWA Service Worker），可直接托管到任意静态服务器（如 GitHub Pages、对象存储、企业内网静态站点）。

```
dist/
  index.html
  assets/
  sw.js              # PWA Service Worker
  manifest.webmanifest
```

### SPA fallback（必需）

本工具为单页应用，所有路由由前端处理。部署时必须将所有路径回退到 `index.html`，否则直接访问 `/settings` 等子路径会 404。各平台配置示例：

- **Nginx**：`location / { try_files $uri /index.html; }`
- **GitHub Pages / 静态托管**：配置 404.html 指向 index.html（或设置 SPA 模式）
- **Vercel / Netlify**：自动识别 Vue 项目，框架预设选 "Vite"，SPA fallback 已内置
- **企业内网静态站点**：同 Nginx 配置

### 部署到 Vercel（零门槛，推荐）

本仓库自带 `vercel.json`，里面已对智谱 / 通义千问 / Kimi 做了 rewrite 代理到它们的 API。只需在项目根目录执行一次：

```bash
npx vercel
```

选择默认配置即可。部署完在 Settings → AI 配置选择对应预设（如"智谱 GLM · Flash"），填入你的 Key，点测试连接即可用。**无需 Nginx，无需自己写代理。**

### 本地开发（vite dev server）

`vite.config.ts` 已内置同样的代理路径：
- `/api/zhipu` → https://open.bigmodel.cn/api/paas/v4
- `/api/qwen` → https://dashscope.aliyuncs.com/compatible-mode
- `/api/kimi` → https://api.moonshot.cn/v1

`npm run dev` 跑起来后选对应预设即可直接调。

### 验收状态（截至 2026-11）

- `npm run typecheck`、`npm run test`（35/35）、`npm run build` 全部通过。
- 已手动验证：任务创建/删除、优先级自动计算（高×高 → S）、按周归类、WBS 表格、AI 页无 Key 降级、引导可跳过与持久化。
- 待验证：GWT 逐条走查、企微直连发送、AI 真实 Key 抽取、甘特拖拽改期（MVP 不含）。

## 隐私说明

- 无自有后端，数据仅存本地浏览器 IndexedDB。
- API Key 不进入备份与日志。
- 企微提醒为浏览器直连，密钥不上传本工具服务器。
- 跨设备迁移请使用「数据管理 → 备份导出 / 导入」。

## 项目结构

```
src/
  domain/     纯函数领域模型（task / priority / date / okr / wbs / reminder / settings）
  data/       Dexie 数据库与备份导入导出
  services/   AI 管线、导出、提醒调度
  stores/     Pinia 状态管理
  views/      六大页面
  components/ 通用与业务组件
tests/        领域层单元测试（priority / week / okr / wbs / occurrences）
docs/specx/   需求澄清、规格、设计、任务拆解文档
```
