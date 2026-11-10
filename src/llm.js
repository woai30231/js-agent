import { config } from './config.js';

// 统一的 LLM 错误类型：把“能不能重试”这件事显式化。
export class LlmError extends Error {
    constructor(message, { status, retryable = false, retryAfterMs, cause } = {}) {
        super(message, { cause });
        this.name = 'LlmError';
        this.status = status;
        this.retryable = retryable;
        this.retryAfterMs = retryAfterMs;
    }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function isRetryable(err) {
    if (!err) return false;
    if (err.retryable) return true;
    if (err.status && RETRYABLE_STATUS.has(err.status)) return true;
    // 超时 / 主动取消
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
    // fetch 的网络层错误通常是 TypeError（DNS 失败、连接被重置等）
    if (err instanceof TypeError) return true;
    return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt, baseMs) {
    const exponential = Math.min(8000, baseMs * 2 ** attempt);
    return exponential + Math.floor(Math.random() * 250);
}

async function withRetry(fn, { retries, baseMs, onRetry, shouldRetry = () => true }) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (!isRetryable(err) || attempt >= retries || !shouldRetry(err)) {
                throw err;
            }
            const delayMs = err.retryAfterMs ?? backoffMs(attempt, baseMs);
            onRetry?.({ attempt: attempt + 1, delayMs, error: err });
            await sleep(delayMs);
        }
    }
}

async function fetchChat(body, { timeoutMs, signal }) {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (signal) signals.push(signal);

    const res = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new LlmError(`DeepSeek 返回 ${res.status}: ${text.slice(0, 500)}`, {
            status: res.status,
            retryable: RETRYABLE_STATUS.has(res.status),
            retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        });
    }

    return res;
}

// 非流式调用：返回完整 assistant message 和 usage。
export async function chat({
    messages,
    tools,
    temperature = config.temperature,
    timeoutMs = config.timeoutMs,
    maxRetries = config.maxRetries,
    retryBaseMs = config.retryBaseMs,
    signal,
    onRetry,
} = {}) {
    return withRetry(async () => {
        const res = await fetchChat(
            { model: config.model, messages, tools, temperature, stream: false },
            { timeoutMs, signal },
        );

        let data;
        try {
            data = await res.json();
        } catch (err) {
            throw new LlmError(`模型返回的不是合法 JSON：${err.message}`, {
                retryable: true,
                cause: err,
            });
        }

        const message = data.choices?.[0]?.message;
        if (!message) throw new LlmError('模型返回格式异常：缺少 choices[0].message');
        return { message, usage: data.usage ?? null, model: data.model ?? config.model };
    }, { retries: maxRetries, baseMs: retryBaseMs, onRetry });
}

// 流式调用：一边解析 SSE 一边把文本增量交给 onToken。
// 返回值和非流式保持一致：{ message, usage, model }。
export async function chatStream({
    messages,
    tools,
    temperature = config.temperature,
    timeoutMs = config.timeoutMs,
    maxRetries = config.maxRetries,
    retryBaseMs = config.retryBaseMs,
    signal,
    onToken,
    onRetry,
} = {}) {
    let emitted = false;

    return withRetry(async () => {
        emitted = false;
        const res = await fetchChat(
            {
                model: config.model,
                messages,
                tools,
                temperature,
                stream: true,
                stream_options: { include_usage: true },
            },
            { timeoutMs, signal },
        );

        return parseSseStream(res, {
            onToken: (text) => {
                emitted = true;
                onToken?.(text);
            },
        });
    }, {
        retries: maxRetries,
        baseMs: retryBaseMs,
        onRetry,
        // 已经吐出一部分内容再重试会让用户看到重复文本，所以只允许“干净”重试
        shouldRetry: () => !emitted,
    });
}

async function parseSseStream(res, { onToken } = {}) {
    if (!res.body) throw new LlmError('流式响应没有 body', { retryable: true });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoning = '';
    let usage = null;
    const toolCalls = [];

    const handleData = (payload) => {
        if (payload === '[DONE]') return;

        let data;
        try {
            data = JSON.parse(payload);
        } catch {
            return; // 忽略心跳或无法解析的行
        }

        if (data.usage) usage = data.usage;

        const choice = data.choices?.[0];
        if (!choice) return;
        const delta = choice.delta ?? {};

        if (typeof delta.content === 'string' && delta.content) {
            content += delta.content;
            onToken?.(delta.content);
        }
        if (typeof delta.reasoning_content === 'string') {
            reasoning += delta.reasoning_content;
        }

        // 工具调用是分片到达的：id/name/arguments 都可能被拆成多个 delta，
        // 必须按 index 归并、把 arguments 字符串拼起来。
        for (const tc of delta.tool_calls ?? []) {
            const index = tc.index ?? 0;
            if (!toolCalls[index]) {
                toolCalls[index] = {
                    id: '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                };
            }
            const slot = toolCalls[index];
            if (tc.id) slot.id = tc.id;
            if (tc.type) slot.type = tc.type;
            if (tc.function?.name) slot.function.name += tc.function.name;
            if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
        }
    };

    const drain = (flush = false) => {
        while (true) {
            const match = buffer.match(/\r?\n\r?\n/);
            if (!match) break;
            const rawEvent = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);

            for (const line of rawEvent.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                if (trimmed.startsWith('data:')) handleData(trimmed.slice(5).trim());
            }
        }

        if (flush && buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data:')) handleData(trimmed.slice(5).trim());
            buffer = '';
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        drain();
    }
    buffer += decoder.decode();
    drain(true);

    const calls = toolCalls
        .filter(Boolean)
        .filter((call) => call.function.name || call.function.arguments);
    calls.forEach((call, index) => {
        if (!call.id) call.id = `call_${Date.now().toString(36)}_${index}`;
    });

    const message = { role: 'assistant', content: content || null };
    if (calls.length > 0) message.tool_calls = calls;
    if (reasoning) message.reasoning_content = reasoning;

    return { message, usage: usage ?? null, model: config.model };
}
