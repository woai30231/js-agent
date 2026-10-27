# agent-study-1

一个基于 DeepSeek 的 **AI 智能体（Agent）Demo**：它不只会聊天，还能在需要真实信息时主动调用工具——查时间、算数学、列目录、读文件、写文件、删文件，然后把结果整理成中文回答。

## 核心思路

普通聊天模型只能"凭记忆说话"，容易编造。本项目实现了一个最小的 **ReAct 式循环**：

```
用户提问 → 模型思考 → 决定调用工具 → 执行工具 → 把结果喂回模型 → 再思考 …… → 输出最终答案
```

模型负责"决定做什么"，代码负责"真正去做"，两者通过工具调用（tool_calls）串起来。

## 目录结构

```
agent-study-1/
├── src/
│   ├── main.js      # 入口：命令行交互循环（npm start）
│   ├── agent.js     # 智能体核心：多轮"思考-行动-观察"循环
│   ├── llm.js       # 封装 DeepSeek Chat API 调用
│   └── tools.js     # 工具定义（schema）+ 具体实现 + 统一执行入口
├── step1-hello.js   # 入门示例：单次对话
├── step3-test-tools.js # 工具测试脚本：逐个调用各工具
├── package.json
├── .env             # 存放 DEEPSEEK_API_KEY（已被 .gitignore 忽略）
├── .gitignore
└── result.txt       # 示例输出
```

## 模块说明

### `src/llm.js`
- 调用 `https://api.deepseek.com/chat/completions`，模型为 `deepseek-chat`。
- 从环境变量 `DEEPSEEK_API_KEY` 读取密钥，未配置时给出明确报错。
- 支持传入 `tools`（工具定义）和 `temperature`（默认 0.2）。

### `src/agent.js`
- 定义 `SYSTEM_PROMPT`：要求模型"需要真实信息时必须调用工具，不要编造"。
- `runAgent(userInput, messages, { maxTurns })`：核心循环
  1. 把用户输入加入对话历史；
  2. 调用模型；
  3. 若模型返回 `tool_calls`，逐个执行工具，把结果以 `role: 'tool'` 写回历史（`tool_call_id` 一一对应）；
  4. 重复直到模型不再调用工具，返回最终文本；
  5. 超过 `maxTurns`（默认 12）则提前结束，防止死循环。

### `src/tools.js`
定义并实现 6 个工具：

| 工具名 | 作用 | 参数 |
| --- | --- | --- |
| `get_current_time` | 获取当前日期时间（Asia/Shanghai） | 无 |
| `calculator` | 计算数学表达式，支持 `+ - * / ( )` 和小数 | `expression` |
| `list_files` | 列出目录下的文件与子目录 | `dir`（默认当前目录） |
| `read_file` | 读取文本文件内容 | `file_path` |
| `write_file` | 写入文本文件（**仅限项目目录内**） | `file_path`, `content` |
| `delete_file` | 删除文件（**仅限项目目录内，且不能删关键文件**） | `file_path` |

安全设计：
- `calculator` 用正则白名单校验表达式，只允许数字和运算符。
- `write_file` / `delete_file` 用 `path.resolve` 校验目标路径必须位于项目根目录内，防止操作到系统其他位置。
- `delete_file` 额外维护一份关键文件黑名单（`package.json`、`.env`、`.gitignore`、`llm.js`、`tools.js`、`agent.js`、`main.js`），禁止删除。
- `runTool` 统一入口：工具不存在或执行出错时，把错误信息作为结果返回给模型，让模型自行调整重试。

### `src/main.js`
- 基于 `node:readline` 的命令行交互界面。
- 输入问题开始对话，输入 `exit` / `quit` / `退出` 结束。
- 全程复用同一个 `messages` 数组，因此具备多轮上下文记忆。

## 快速开始

1. 安装依赖（本项目仅用 Node 内置模块，无需额外依赖）。
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
   ```

> 需要 Node.js 18+（使用内置 `fetch`）以及支持 `--env-file` 的版本（Node 20.6+）。

## 运行效果示例

```
你> 现在几点？顺便算一下 123*456

[思考] 调用工具 get_current_time({})
[观察] 2026/10/27 14:32:43
[思考] 调用工具 calculator({"expression":"123*456"})
[观察] 56088

🤖 现在是 2026/10/27 14:32:43，123 × 456 = 56088。
```

## 可扩展方向

- 增加更多工具（联网搜索、执行命令、数据库查询等）。
- 支持流式输出（`stream: true`）。
- 加入工具调用日志持久化、错误重试与超时控制。
- 把 `SYSTEM_PROMPT` 与工具配置抽成可配置项。

## License

ISC
