# 文案生成速度优化计划

## 概述

优化"小白白"智能体的文案生成速度。当前文案模式耗时约 4-5 秒（联网搜索 1-3s + LLM 首 token 0.5-1.5s + 生成 1-2s），目标降至 2 秒内出首字。

## 技术方案

| 维度 | 当前 | 优化后 | 理由 |
|------|------|--------|------|
| 文案模型 | `doubao-seed-2-0-lite-260215` | `doubao-1-5-lite-32k-250115` | seed-2-0 推理更慢，1-5-lite 速度更快且质量足够 |
| 文案 System Prompt | ~600 tokens（5 段详细指导） | ~250 tokens（精简核心规则） | prompt 越长首 token 越慢 |
| max_tokens | 2000 | 1200 | 文案通常 500-800 tokens 足够，减少生成时间 |
| 联网搜索策略 | 缓存未命中时等待 1.5s | 缓存未命中时直接跳过，仅用知识库 | 避免联网阻塞主流程 |

## 功能模块

### 1. 模型统一（llm-client.ts）

移除 `COPYWRITING_MODEL` 常量，文案生成不再单独指定模型，统一使用默认的 `doubao-1-5-lite-32k-250115`。

### 2. 精简文案 System Prompt（route.ts）

将 `buildCopywritingSystemPrompt` 中的文案创作指导从 5 段压缩为 3 条核心规则：

**当前**（~600 tokens）：
- 你的文案能力（4 行）
- 文案创作原则（5 条）
- 文案格式要求（4 条）
- 文案风格（4 条）
- 禁止内容（3 条）

**优化后**（~250 tokens）：
```
你是"小白白"，专精小红书/抖音校园生活文案创作。

## 核心规则
1. 第一人称学长/学姐视角，口语化+emoji，段落短小
2. 标题用数字+痛点+好奇心，正文：共鸣开头→干货故事→互动结尾
3. 禁止出现：校园卡/电话卡/办卡/微信号/二维码/虚假承诺

## 格式
- 标题 + 正文（200-400字）+ 5-10个标签 + [表情包: xxx]引流标注
```

### 3. 联网搜索降级策略（route.ts）

`searchTrendingContent` 函数：
- 缓存命中 → 直接返回（现有逻辑不变）
- 缓存未命中 → **不再等待联网搜索**，直接返回空字符串，让 LLM 仅基于知识库生成
- 联网搜索改为后台异步执行，结果写入缓存供下次使用

### 4. 降低 max_tokens（route.ts）

文案生成 `maxTokens` 从 2000 降到 1200。

## 是否有原型设计

否（纯后端逻辑优化，不涉及 UI 改动）

## 实施步骤

1. **统一模型 + 精简 Prompt + 降低 max_tokens**
   - 修改 `src/lib/llm-client.ts`：移除 `COPYWRITING_MODEL`
   - 修改 `src/app/api/chat/route.ts`：精简 `buildCopywritingSystemPrompt`，`maxTokens` 改为 1200
   - 涉及文件：`src/lib/llm-client.ts`、`src/app/api/chat/route.ts`

2. **联网搜索降级为异步**
   - 修改 `searchTrendingContent`：缓存未命中时直接返回空，联网搜索改为 fire-and-forget 后台执行
   - 涉及文件：`src/app/api/chat/route.ts`

3. **验证**
   - 静态检查（lint + ts-check）
   - 接口冒烟测试（文案模式请求）
