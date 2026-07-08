# AGENTS.md - 小白白智能体

## 项目概览
"小白白"是一个代理运营教练智能体网站，为团队内部代理提供产品咨询、业务流程指导和社媒运营培训。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **LLM**: coze-coding-dev-sdk (doubao-seed-2-0-lite-260215)
- **Knowledge**: coze-coding-dev-sdk KnowledgeClient

## 目录结构
```
src/
├── app/
│   ├── admin/
│   │   └── page.tsx               # 知识库管理后台页面
│   ├── api/
│   │   ├── chat/route.ts          # LLM 流式对话 API (SSE)
│   │   └── knowledge/
│   │       ├── route.ts           # 知识库列表 + 语义搜索
│   │       ├── init/route.ts      # 知识库初始化（导入数据）
│   │       ├── manage/route.ts    # 知识库管理（添加/删除）
│   │       └── upload/route.ts    # 文件上传解析（PDF/Word/TXT/MD/CSV）
│   ├── layout.tsx                 # 根布局
│   ├── page.tsx                   # 主页面（聊天界面）
│   └── globals.css                # 全局样式
├── components/
│   ├── chat/
│   │   ├── chat-interface.tsx     # 聊天主容器（状态管理）
│   │   ├── chat-messages.tsx      # 消息列表（自动滚动）
│   │   ├── message-bubble.tsx     # 消息气泡（Markdown渲染）
│   │   ├── chat-input.tsx         # 输入框（流式控制）
│   │   ├── chat-sidebar.tsx       # 侧边栏（知识库管理）
│   │   └── mobile-header.tsx      # 移动端顶栏
│   └── ui/                        # shadcn/ui 组件
```

## 核心功能
1. **流式对话**: 前端通过 fetch + ReadableStream 实现打字机效果
2. **知识库检索**: 用户提问时自动从三个知识库检索相关内容，注入到 system prompt
3. **知识库管理**: 侧边栏可选择启用/禁用知识库
4. **知识库管理后台**: `/admin` 页面支持文本输入、URL 导入和文档上传三种方式添加知识
5. **响应式设计**: 桌面端侧边栏 + 移动端抽屉式导航

## 知识库
| 数据集名 | 用途 | 内容 |
|----------|------|------|
| business_basics | 校园卡业务知识 | 校园卡套餐资费、办卡流程、常见问题 |
| agency_ops | 引流运营知识 | 小红书/抖音学长学姐人设打造、引流到微信技巧 |
| sales_conversion | 校园卡销售知识 | 办卡话术、客户跟进、成交转化技巧 |

## 开发命令
- 开发: `pnpm dev`
- 构建: `pnpm build`
- 启动: `pnpm start`
- 类型检查: `pnpm ts-check`
- 代码检查: `pnpm lint`

## 设计规范
- 主色: 珊瑚橘 #FF6B4A
- 背景: 暖灰 #F5F0EB
- 文本: 深色 #1A1A2E（非纯黑）
- 详见 DESIGN.md
