# 个人 AI 工作台 — 操作指南

## 一、这是什么？

一个集 **任务管理 + 日报周报 + AI 学习 + 知识库** 于一体的个人工作台。本地浏览器运行，数据云端同步，手机也能打开。

### 整体原理

```
┌─────────────────────────────────────────────────┐
│              你的浏览器（Chrome）                  │
│         http://localhost:3000                    │
│                                                  │
│  仪表盘 │ TODO │ 日报 │ 周报 │ AI学习 │ 文档中心    │
└──────────────────┬──────────────────────────────┘
                   │  HTTPS
                   ▼
┌─────────────────────────────────────────────────┐
│            Supabase（云端数据库）                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 用户认证  │ │ PostgreSQL│ │ 文件存储  │         │
│  │ (登录)    │ │ (数据表)  │ │ (文档)   │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│  新加坡节点 · 免费版 · 500MB                       │
└─────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│           Claude Codex（AI 引擎）                 │
│   本地 CLI · 日报完善 · 周报生成 · AI 学习         │
└─────────────────────────────────────────────────┘
```

**简单说**：你的浏览器是操作界面，数据存在 Supabase 云端，AI 功能通过本地 Claude 命令行调用。

---

## 二、启动工作台

```bash
cd ~/workbench
npm run dev
```

浏览器打开 `http://localhost:3000`，登录即可使用。

---

## 三、Supabase 是什么？怎么操作？

### 3.1 它是什么

Supabase 是一个开源的后端云服务，相当于你个人的「线上数据库 + 用户系统」。免费版提供：

| 能力 | 说明 | 限额 |
|------|------|------|
| PostgreSQL 数据库 | 所有数据（任务、日报、文档等） | 500MB |
| 用户认证 | 邮箱注册/登录 | 无限用户 |
| 文件存储 | 上传文档原始文件 | 1GB |
| API 接口 | 自动生成 REST API | 免费 |

### 3.2 管理后台

访问 `https://supabase.com/dashboard/project/ubnconbabuspfnwxkvff`

常用操作路径：

| 要做什么 | 路径 |
|---------|------|
| 查看数据表 | 左侧菜单 → **Table Editor** |
| 手动删数据 | Table Editor → 选表 → 勾选行 → Delete |
| 执行 SQL | 左侧菜单 → **SQL Editor** |
| 管理用户 | 左侧菜单 → **Authentication** → Users |
| 改密码/设置 | Authentication → Settings |
| 查看 API Key | Settings → API |
| 查看数据库连接串 | Settings → Database → Connection string |

### 3.3 数据表说明

工作台用了 7 张表：

| 表名 | 存什么 | 关键字段 |
|------|--------|---------|
| `todos` | 任务 | title, completed, priority, due_date |
| `daily_reports` | 日报 | date, content, status (draft/final) |
| `weekly_reports` | 周报 | week_start, week_end, content |
| `documents` | 文档 | title, content, file_url, file_type, category |
| `ai_learnings` | AI 学习记录 | title, content, category, difficulty, learned |
| `habits` | 习惯打卡 | name, streak |
| `habit_logs` | 打卡日志 | date, completed |

**注意**：不要在 Table Editor 里手动改 `user_id` 字段，否则会导致数据归属混乱。

---

## 四、各模块操作说明

### 4.1 仪表盘

- 顶部四个统计卡片：任务数、日报数、文档数、AI学习天数
- **所有任务**：快速查看 + 打勾完成，点击「查看全部」进入任务中心
- **风险预警**：紧急未完成任务自动提醒
- **快捷操作**：快速跳转到各模块

### 4.2 任务中心（TODO）

```
新建 → 输入标题 → 选优先级（普通/重要/紧急） → 添加
勾选 = 标记完成
悬停 = 显示删除按钮
```

- 优先级：普通（灰）= 日常 / 重要（黄）= 优先处理 / 紧急（红）= 马上做
- 完成的任务自动移到下方「已完成」区域

### 4.3 日报

**四个部分**：今日工作 → 明日计划 → 今日心得 → 复盘反思

**操作流程**：
1. 在「今日工作」里写几句简要内容
2. 点「🪄 AI 完善」→ Claude 自动扩写
3. 审核修改 → 「保存草稿」（可反复改）或「定稿归档」（锁定）
4. 「发送飞书」（需配置 Webhook）

**粘贴导入**：展开「粘贴导入」面板，粘贴日报文本自动解析填充。

**历史记录**：点「历史」查看所有已定稿日报，点击展开查看全文。

### 4.4 周报

1. 切换到「周报」标签
2. 确认周区间（默认本周一至五）
3. 点「聚合日报」→ 加载本周所有日报
4. 点「AI 生成周报」→ Claude 自动生成
5. 审核修改 → 「保存周报」

周报格式同步你的 PPT 周报模板：本周综述 + 核心工作表格 + 心得 + 不足改进 + 下周计划。

### 4.5 AI 学习

1. 点「生成今日要点」→ Claude 基于真实知识生成一个 AI 知识点
2. 阅读内容 → 写笔记 → 标记「已学习」
3. 右侧列表按分类筛选，点击查看历史记录

**内容保证**：AI 生成的知识点要求基于训练数据中的真实信息，标注来源。

### 4.6 文档中心

**上传文档**：
- 拖拽文件到虚线框（支持多个文件同时拖入）
- 自动识别类型：TXT/MD/DOCX 提取文字、PDF/PPT 保留原文件
- 自动分类：根据文件名智能匹配类别
- 点「一键保存」入库

**浏览文档**：
- 左侧列表按分类筛选、按关键词搜索
- 单击查看内容，双击直接打开原始文件（新标签页）
- PDF 内嵌翻页阅读，DOCX 转换 HTML 保留排版

---

## 五、环境变量说明

文件位置：`.env.local`（不会被提交到 Git）

| 变量 | 作用 | 从哪里获取 |
|------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | 数据库地址 | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 客户端密钥 | Supabase → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥（绕过权限） | Supabase → Settings → API → service_role |
| `NEXT_PUBLIC_LARK_WEBHOOK_URL` | 飞书群机器人 Webhook | 飞书群 → 群设置 → 机器人 → Webhook 地址 |
| `DATABASE_URL` | 直连数据库（一般用不到） | Supabase → Settings → Database → Connection string |

---

## 六、常见问题

### Q: 数据存在哪里？安全吗？
数据存在 Supabase 云端（新加坡节点），只有你能通过邮箱密码登录访问。Supabase 是企业级服务，数据加密存储。

### Q: 手机怎么用？
手机浏览器打开 `http://<你电脑IP>:3000`（需同一 WiFi）。或部署到 Vercel（免费）后随时随地访问。

### Q: 怎么备份数据？
Supabase 免费版不支持自动备份。建议定期在 Table Editor 里导出 CSV，或用 `npx drizzle-kit generate` 生成迁移文件。

### Q: Claude CLI 不工作了？
检查 `~/.npm-global/bin/claude` 是否存在。如果提示认证过期，运行 `claude login` 重新登录。

### Q: 怎么修改 AI 提示词？
日报提示词在 `src/app/api/generate-report/route.ts`，周报在 `src/app/api/weekly-report/route.ts`，AI 学习在 `src/app/api/ai-learning/route.ts`。修改后热更新生效。

### Q: 怎么部署到外网？
推荐 Vercel（免费）：
```bash
npx vercel --prod
```
部署后设置环境变量，即可通过 `https://xxx.vercel.app` 访问。

---

## 七、技术架构速览

```
workbench/
├── src/app/              # 页面路由（Next.js App Router）
│   ├── (app)/            # 主应用页面（需登录）
│   │   ├── page.tsx      # 仪表盘
│   │   ├── todos/        # 任务中心
│   │   ├── reports/      # 日报+周报
│   │   ├── docs/         # 文档中心
│   │   ├── ai-learning/  # AI 学习
│   │   └── settings/     # 设置
│   ├── login/            # 登录页
│   └── api/              # API 路由（服务端逻辑）
├── src/hooks/            # React Hooks（状态管理）
├── src/components/       # UI 组件
│   ├── ui/               # shadcn/ui 基础组件
│   └── layout/           # 布局组件
├── src/lib/              # 工具库
│   ├── supabase/         # Supabase 客户端
│   └── db/               # 数据库 ORM
├── drizzle/schema/       # 数据库表结构定义
└── .env.local            # 环境变量（密钥）
```

**技术栈**：Next.js 16 + React 19 + TypeScript + Tailwind CSS + shadcn/ui + Supabase + Drizzle ORM + Claude CLI

---

> 最后更新：2026-07-10 | 版本 v0.1
