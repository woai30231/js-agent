import { chat, chatStream } from './llm.js';
import { toolSchemas, runToolSafe } from './tools.js';
import { config } from './config.js';
import { emptyUsage, addUsage } from './usage.js';

export const SYSTEM_PROMPT = `你是一个能使用工具的智能助手。
规则：
1. 需要真实信息（时间、文件内容、计算结果、最新网页信息）时必须调用工具，不要凭空编造。
2. 一次可以调用多个工具，也可以分多轮调用，一步步把任务做完。
3. 任务全部完成后，用简洁的中文告诉用户你做了什么。
4. 工具报错时先阅读错误信息，调整参数或换一种做法，不要原样重试。`;

function createStats() {
    return {
        turns: 0,
        modelCalls: 0,
        toolCalls: 0,
        toolErrors: 0,
        durationMs: 0,
        usage: emptyUsage(),
    };
}

// deepseek-reasoner 会返回 reasoning_content。它属于内部推理，
// 不应该再写回下一轮上下文，否则既浪费 token 也可能被 API 拒绝。
function toHistoryMessage(message) {
    if (!message || !('reasoning_content' in message)) return message;
    const { reasoning_content, ...rest } = message;
    return rest;
}

// 兼容注入的 executeTool：既接受 { ok, result }，也接受纯字符串。
function normalizeOutcome(raw) {
    if (raw && typeof raw === 'object' && 'ok' in raw) {
        return { ok: Boolean(raw.ok), result: String(raw.result ?? '') };
    }
    const result = String(raw ?? '');
    const ok = !result.startsWith('工具执行出错') && !result.startsWith('错误：');
    return { ok, result };
}

async function runToolCalls(calls, { executeTool, emit, parallel }) {
    const runOne = async (call) => {
        const name = call.function?.name ?? '(unknown)';
        const argsJson = call.function?.arguments ?? '{}';
        const started = performance.now();
        emit({ type: 'tool_start', id: call.id, name, args: argsJson });

        let outcome;
        try {
            outcome = normalizeOutcome(await executeTool(name, argsJson));
        } catch (err) {
            // 单个工具失败不能拖垮其他工具，也不能打断整个 Agent
            outcome = { ok: false, result: `工具执行出错：${err.message}` };
        }

        const ms = Math.round(performance.now() - started);
        emit({ type: 'tool_end', id: call.id, name, ok: outcome.ok, ms, result: outcome.result });
        return { id: call.id, result: outcome.result, ok: outcome.ok };
    };

    if (!parallel) {
        const outcomes = [];
        for (const call of calls) outcomes.push(await runOne(call));
        return outcomes;
    }
    // Promise.all 保持结果顺序与 calls 一致，因此 tool_call_id 不会错位
    return Promise.all(calls.map(runOne));
}

export async function runAgent(userInput, messages, options = {}) {
    const {
        maxTurns = config.maxTurns,
        stream = config.stream,
        trace = null,
        onEvent,
        callModel,
        executeTool = runToolSafe,
        parallelTools = true,
    } = options;

    const stats = createStats();
    const startedAt = performance.now();

    // token 事件只发给 UI，不写 JSONL——否则日志会被逐字输出撑爆
    const emit = (event) => {
        onEvent?.(event);
        if (event.type !== 'token') trace?.log(event);
    };

    // 注入 callModel 时（测试）走非流式；否则按配置选择流式/非流式。
    const useStream = stream && typeof callModel !== 'function';
    const onRetry = (info) => emit({
        type: 'retry',
        attempt: info.attempt,
        delayMs: info.delayMs,
        message: info.error?.message ?? String(info.error),
    });
    const modelCall = callModel ?? (useStream
        ? (args) => chatStream({ ...args, onToken: (text) => emit({ type: 'token', text }), onRetry })
        : (args) => chat({ ...args, onRetry }));

    messages.push({ role: 'user', content: userInput });

    for (let turn = 1; turn <= maxTurns; turn++) {
        stats.turns = turn;
        emit({ type: 'turn_start', turn });

        const modelStarted = performance.now();
        const { message, usage, model } = await modelCall({ messages, tools: toolSchemas });
        const modelMs = Math.round(performance.now() - modelStarted);

        stats.modelCalls += 1;
        addUsage(stats.usage, usage);
        emit({
            type: 'model_done',
            turn,
            model,
            ms: modelMs,
            usage,
            toolCallCount: message.tool_calls?.length ?? 0,
            content: message.content ?? '',
        });

        messages.push(toHistoryMessage(message));

        if (!message.tool_calls?.length) {
            const content = message.content || '（模型没有返回内容）';
            stats.durationMs = Math.round(performance.now() - startedAt);
            emit({ type: 'final', content, stats });
            return { content, stats };
        }

        // ③ 行动 + 观察：执行它点名的每个工具，把结果喂回历史
        const outcomes = await runToolCalls(message.tool_calls, {
            executeTool,
            emit,
            parallel: parallelTools,
        });
        stats.toolCalls += outcomes.length;
        stats.toolErrors += outcomes.filter((outcome) => !outcome.ok).length;

        for (const outcome of outcomes) {
            messages.push({
                role: 'tool',
                tool_call_id: outcome.id, // 这个 id 必须对应上，模型才知道是哪个调用的结果
                content: outcome.result,
            });
        }
    }

    const content = `⚠️ 已达到最大轮次限制（${maxTurns} 轮），任务提前结束。`;
    stats.durationMs = Math.round(performance.now() - startedAt);
    emit({ type: 'limit', maxTurns });
    emit({ type: 'final', content, stats });
    return { content, stats };
}
