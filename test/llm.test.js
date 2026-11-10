import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DEEPSEEK_API_KEY ||= 'sk-test';
process.env.NODE_ENV ||= 'development';

const { chat, chatStream } = await import('../src/llm.js');

function sse(payload) {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseResponse(chunks) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
    });
}

test('chatStream 解析文本增量、工具调用和 usage', async () => {
    const originalFetch = globalThis.fetch;
    const chunks = [
        sse({ choices: [{ delta: { content: '你' } }] }),
        sse({ choices: [{ delta: { content: '好' } }] }),
        sse({
            choices: [{
                delta: {
                    tool_calls: [{
                        index: 0,
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'calculator', arguments: '{"expr' },
                    }],
                },
            }],
        }),
        sse({
            choices: [{
                delta: {
                    tool_calls: [{
                        index: 0,
                        function: { arguments: 'ession":"1+1"}' },
                    }],
                },
            }],
        }),
        sse({
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }),
        'data: [DONE]\n\n',
    ];

    globalThis.fetch = async () => sseResponse(chunks);
    try {
        const tokens = [];
        const result = await chatStream({
            messages: [],
            onToken: (text) => tokens.push(text),
            maxRetries: 0,
        });

        assert.deepEqual(tokens, ['你', '好']);
        assert.equal(result.message.content, '你好');
        assert.equal(result.message.tool_calls.length, 1);
        assert.equal(result.message.tool_calls[0].id, 'call_1');
        assert.equal(result.message.tool_calls[0].function.name, 'calculator');
        assert.equal(result.message.tool_calls[0].function.arguments, '{"expression":"1+1"}');
        assert.equal(result.usage.total_tokens, 14);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('chat 对 5xx 自动重试，对 401 不重试', async () => {
    const originalFetch = globalThis.fetch;
    try {
        let attempts = 0;
        globalThis.fetch = async () => {
            attempts += 1;
            if (attempts === 1) return new Response('mock failure', { status: 500 });
            return new Response(JSON.stringify({
                choices: [{ message: { role: 'assistant', content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };

        const result = await chat({ messages: [], maxRetries: 1, retryBaseMs: 1 });
        assert.equal(result.message.content, 'ok');
        assert.equal(attempts, 2);

        attempts = 0;
        globalThis.fetch = async () => {
            attempts += 1;
            return new Response('unauthorized', { status: 401 });
        };

        await assert.rejects(chat({ messages: [], maxRetries: 3, retryBaseMs: 1 }), /401/);
        assert.equal(attempts, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
