# agent-study-1

一个基于 DeepSeek 的 **AI 智能体（Agent）Demo**：它不只会聊天，还能在需要真实信息时主动调用工具——查时间、算数学、列目录、读写文件、联网搜索、抓取网页，然后把结果整理成中文回答。

这个项目刻意保持“小”，但把 Agent 工程里最关键的几层都摆了出来，适合拿来学习和拆改。

## 这次升级了什么

从“能跑通 ReAct 循环”升级到“**可观察、可恢复、可测试**”：

| 主题 | 实现 | 学到的概念 |
| --- | --- | --- |
| 流式输出 | 解析 SSE，逐 token 打印 | 流式协议、增量 tool_calls 归并 |
| 可靠性 | 超时 + 指数退避重试 + 错误分类 | 哪些错误该重试、哪些不该 |
| 可观测性 | Token 统计、缓存命中、JSONL 轨迹 | usage、trace、成本分析 |
| 执行编排 | 多个工具并行执行、错误隔离 | Promise.all、结果顺序与 id 对齐 |
| 状态管理 | `/save` `/load` 会话持久化 | 对话状态序列化与恢复 |
| 安全约束 | 统一路径沙箱、关键文件保护、SSRF 粗筛 | 工具权限边界 |
| 可测试性 | 依赖注入 `callModel` + `node:test` | 不调真实 API 也能测 Agent 循环 |
| 新工具 | `web_search`（Tavily） | 搜索 → 抓取 → 回答的常见链路 |

## 核心思路

普通聊天模型只能“凭记忆说话”，容易编造。本项目实现了一个最小的 **ReAct 式循环**：

```
用户提问 → 模型思考 → 决定调用工具 → 执行工具 → 把结果喂回模型 → 再思考 …… → 输出最终答案
```

模型负责“决定做什么”，代码负责“真正去做”，两者通过工具调用（tool_calls）串起来。

## 目录结构

```
agent-study-1/
├── src/
│   ├── main.js      # 入口：CLI 交互 + 斜杠命令 + 渲染
│   ├── agent.js     # 智能体核心：多轮“思考-行动-观察”循环
│   ├── llm.js       # DeepSeek 调用：非流式 / 流式 / 超时 / 重试
│   ├── tools.js     # 工具 schema + 实现 + 统一执行入口
│   ├── config.js    # 环境变量加载与集中配置
│   ├── trace.js     # JSONL 轨迹日志
│   ├── session.js   # 会话保存 / 加载
│   ├── usage.js     # Token 用量累计与格式化
│   ├── paths.js     # 路径沙箱（防目录穿越）
│   └── llm2.js      # OpenAI SDK 试验文件（未接入主流程）
├── test/
│   ├── tools.test.js  # 工具与沙箱测试
│   ├── agent.test.js  # Agent 循环测试（注入假模型）
│   └── llm.test.js    # SSE 解析与重试测试（mock fetch）
├── step1-hello.js     # 入门示例：单次对话
├── step3-test-tools.js# 工具测试脚本：逐个调用各工具
├── step5-probe.js     # Tavily 搜索探针
├── logs/              # 运行时生成的轨迹（已 gitignore）
├── sessions/          # 保存的会话（已 gitignore）
└── .env               # 存放 DEEPSEEK_API_KEY（已被 .gitignore 忽略）
```

## 模块说明

### `src/llm.js`
- 调用 `https://api.deepseek.com/chat/completions`，模型默认 `deepseek-chat`。
- `chat()`：非流式，返回 `{ message, usage, model }`。
- `chatStream()`：流式，边解析 SSE 边回调 `onToken`，返回值结构与非流式一致。
- 超时：每次请求用 `AbortSignal.timeout()`，默认 60 秒。
- 重试：对 429、5xx、超时、网络错误做指数退避；4xx 业务错误不重试。
- 流式重试的限制：已经输出过 token 就不再重试，避免用户看到重复文本。
- 工具调用增量：`id`、`name`、`arguments` 都可能分片到达，按 `index` 归并。

### `src/agent.js`
- 定义 `SYSTEM_PROMPT`：要求模型“需要真实信息时必须调用工具，不要编造”。
- `runAgent(userInput, messages, options)`：核心循环
  1. 把用户输入加入对话历史；
  2. 调用模型（流式或非流式）；
  3. 若返回 `tool_calls`，执行工具，把结果以 `role: 'tool'` 写回历史（`tool_call_id` 一一对应）；
  4. 重复直到模型不再调用工具；
  5. 超过 `maxTurns`（默认 12）则提前结束。
- 多个工具默认**并行执行**，结果按原调用顺序回填；某个工具失败会被隔离。
- 返回 `{ content, stats }`，`stats` 包含轮次、模型调用数、工具调用数、失败数、耗时和 token 用量。
- 通过 `callModel` / `executeTool` 支持依赖注入，方便离线测试。
- `reasoning_content` 不会写回下一轮上下文。

### `src/tools.js`
定义并实现 8 个工具：

| 工具名 | 作用 | 参数 |
| --- | --- | --- |
| `get_current_time` | 获取当前日期时间（Asia/Shanghai） | 无 |
| `calculator` | 计算数学表达式，支持 `+ - * / ( )` 和小数 | `expression` |
| `list_files` | 列出项目内目录的文件与子目录 | `dir`（默认当前目录） |
| `read_file` | 读取项目内文本文件（大文件截断） | `file_path` |
| `write_file` | 写入项目内文件（自动建父目录） | `file_path`, `content` |
| `delete_file` | 删除项目内文件（保护关键文件） | `file_path` |
| `fetch_webpage` | 抓取网页并转纯文本 | `url` |
| `web_search` | 联网搜索（Tavily），返回摘要和链接 | `query`, `max_results` |

安全设计：
- `calculator` 用正则白名单校验表达式，只允许数字和运算符。
- 所有文件工具统一走 `resolveInsideRoot()`，用 `path.relative` 判断，修复了 `startsWith` 会误放行同前缀兄弟目录的问题。
- `delete_file` 维护关键文件黑名单（`package.json`、`.env`、源码文件等），且只允许删文件。
- `read_file` 限制读取大小并拒绝二进制文件；`list_files` 跳过 `node_modules` / `.git` 并限制条数。
- `fetch_webpage` 只允许 http/https，并对 localhost、内网 IP 做基础 SSRF 拦截（不是完整防护）。
- `runToolSafe()` 返回 `{ ok, result }`；`runTool()` 保持旧的字符串接口，错误作为结果返回给模型，让它自行调整重试。

### `src/main.js`
- 基于 `node:readline/promises` 的 CLI，支持交互终端和管道输入。
- 流式渲染回答，并打印工具调用、结果、耗时、token 统计。
- 对话失败会自动回滚本轮，避免历史里留下“有提问没回答”的半截消息。
- 会话状态常驻内存，支持多轮上下文。

### `src/trace.js`
- 每轮模型调用、工具调用、耗时、usage 写成 JSONL，默认保存在 `logs/`。
- 超长字符串会截断，避免把整个文件写进日志。
- 用 `AGENT_TRACE=false` 可关闭。

### `src/session.js`
- `/save` 保存完整消息历史 + 累计统计到 `sessions/`。
- `/load` 从指定文件或最近一次会话恢复。
- 路径同样受项目根目录沙箱限制。

## 快速开始

1. 安装依赖（运行时仅用 Node 内置模块；`openai` 只用于 `llm2.js` 试验）。
2. 在项目根目录创建 `.env`：

   ```
   DEEPSEEK_API_KEY=你的密钥
   ```

3. 启动交互式 Agent：

   ```bash
   npm start
   ```

4. 其他脚本：

   ```bash
   node step1-hello.js        # 单次对话示例
   node step3-test-tools.js   # 逐个测试工具
   npm test                   # 离线测试，不消耗 API 额度
   ```

> 需要 Node.js 20.12+（`AbortSignal.any`、`process.loadEnvFile`）。

## CLI 命令

| 命令 | 作用 |
| --- | --- |
| `/help` | 显示帮助 |
| `/tools` | 列出当前注册的工具 |
| `/history [n]` | 查看最近 n 条消息（默认 10） |
| `/clear` | 清空对话历史（保留 system prompt） |
| `/save [文件]` | 保存会话到 `sessions/` 或指定文件 |
| `/load [文件]` | 加载会话（不传文件则加载最近一次） |
| `/stats` | 显示本次会话统计 |
| `exit` / `quit` | 退出 |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 必填 | DeepSeek API Key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名 |
| `DEEPSEEK_API_URL` | `https://api.deepseek.com/chat/completions` | API 地址 |
| `LLM_TEMPERATURE` | 开发 0.7 / 生产 0.2 | 采样温度 |
| `LLM_TIMEOUT_MS` | `60000` | 单次请求超时 |
| `LLM_MAX_RETRIES` | `2` | 失败后的最大重试次数 |
| `LLM_RETRY_BASE_MS` | `500` | 指数退避基数 |
| `AGENT_MAX_TURNS` | `12` | 单次任务最大轮次 |
| `AGENT_STREAM` | `true` | 是否流式输出 |
| `AGENT_TRACE` | `true` | 是否写 JSONL 轨迹 |
| `TAVILY_API_KEY` | 空 | `web_search` 工具需要 |

## 测试

```bash
npm test
```

测试完全离线：
- `llm.test.js` 用 mock `fetch` 验证 SSE 分片解析、工具调用增量归并、5xx 重试、401 不重试。
- `agent.test.js` 注入假模型，验证工具结果回填、并行执行、错误隔离、最大轮次、usage 累计。
- `tools.test.js` 验证计算器、路径沙箱、关键文件保护、文件读写删闭环。

## 一次运行的轨迹长什么样

`logs/agent-*.jsonl` 每行一个事件，可以直接用 `jq` 或脚本分析：

```json
{"ts":"...","type":"turn_start","turn":1}
{"ts":"...","type":"model_done","turn":1,"ms":1567,"usage":{"prompt_tokens":909,"completion_tokens":51,"total_tokens":960},"toolCallCount":2}
{"ts":"...","type":"tool_start","name":"get_current_time","args":"{}"}
{"ts":"...","type":"tool_start","name":"calculator","args":"{\"expression\":\"123*456\"}"}
{"ts":"...","type":"tool_end","name":"calculator","ok":true,"ms":2,"result":"56088"}
{"ts":"...","type":"turn_start","turn":2}
{"ts":"...","type":"final","stats":{"turns":2,"modelCalls":2,"toolCalls":2,"usage":{"total_tokens":1999}}}
```

## 学习地图

| 你看到的代码 | 背后的 Agent 概念 |
| --- | --- |
| `agent.js` 的 for 循环 | ReAct：思考 → 行动 → 观察 |
| `tools.js` 的 schema + handler | 工具定义与真实执行分离 |
| `runToolSafe` 的错误结果 | 反馈：错误也是观察的一部分 |
| `messages` 里的 `tool_call_id` | 工具结果与调用的一一对应 |
| `llm.js` 的流式解析 | 模型输出的增量协议 |
| `trace.js` | 可观测性：从“黑盒”到“可回放” |
| `session.js` | 状态管理：对话可以被保存和恢复 |
| `paths.js` | 约束：Agent 的权限边界 |
| `test/agent.test.js` | 依赖注入：让 Agent 循环可测试 |

## 可扩展方向

- 把 `SYSTEM_PROMPT`、工具开关、模型参数抽成配置文件。
- 加入上下文压缩：历史过长时自动摘要，而不是直接截断。
- 给工具加执行超时和并发上限。
- 把 trace 接到可视化的回放界面。
- 增加更多工具：数据库查询、代码执行沙箱、MCP 服务。
- 加入人工确认机制：危险工具调用前先询问用户。

## License

ISC
