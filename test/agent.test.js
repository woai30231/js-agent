import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DEEPSEEK_API_KEY ||= 'sk-test';
process.env.NODE_ENV ||= 'development';

const { runAgent } = await import('../src/agent.js');

function usage(prompt, completion) {
    return {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion,
    };
}

test('agent 执行工具并把结果喂回模型', async () => {
    const calls = [];
    const fakeModel = async ({ messages }) => {
        calls.push(structuredClone(messages));
        if (calls.length === 1) {
            return {
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'calculator', arguments: '{"expression":"2+3"}' },
                    }],
                },
                usage: usage(10, 5),
            };
        }
        return { message: { role: 'assistant', content: '结果是 5' }, usage: usage(20, 3) };
    };

    const messages = [{ role: 'system', content: 'test' }];
    const events = [];
    const result = await runAgent('算一下 2+3', messages, {
        callModel: fakeModel,
        onEvent: (event) => events.push(event),
    });

    assert.equal(result.content, '结果是 5');
    assert.equal(result.stats.modelCalls, 2);
    assert.equal(result.stats.toolCalls, 1);
    assert.equal(result.stats.toolErrors, 0);
    assert.equal(result.stats.usage.total_tokens, 38);

    const toolMessage = messages.find((message) => message.role === 'tool');
    assert.ok(toolMessage);
    assert.equal(toolMessage.tool_call_id, 'call_1');
    assert.equal(toolMessage.content, '5');

    assert.ok(events.some((event) => event.type === 'tool_end' && event.ok === true));
    assert.ok(events.some((event) => event.type === 'final'));
});

test('多个工具并行执行，结果按调用顺序回填', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const executeTool = async (name) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return { ok: true, result: `${name}-ok` };
    };

    let call = 0;
    const fakeModel = async () => {
        call += 1;
        if (call === 1) {
            return {
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                        { id: 'a', function: { name: 't1', arguments: '{}' } },
                        { id: 'b', function: { name: 't2', arguments: '{}' } },
                    ],
                },
                usage: null,
            };
        }
        return { message: { role: 'assistant', content: 'done' }, usage: null };
    };

    const messages = [];
    const result = await runAgent('x', messages, { callModel: fakeModel, executeTool });

    assert.equal(maxInFlight, 2);
    const toolMessages = messages.filter((message) => message.role === 'tool');
    assert.deepEqual(toolMessages.map((message) => message.tool_call_id), ['a', 'b']);
    assert.equal(result.stats.toolCalls, 2);
});

test('工具抛异常时被隔离，模型仍能收尾', async () => {
    const executeTool = async () => {
        throw new Error('boom');
    };

    let call = 0;
    const fakeModel = async () => {
        call += 1;
        if (call === 1) {
            return {
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{ id: 'x', function: { name: 'bad', arguments: '{}' } }],
                },
                usage: null,
            };
        }
        return { message: { role: 'assistant', content: '工具失败了，我换个办法' }, usage: null };
    };

    const messages = [];
    const result = await runAgent('x', messages, { callModel: fakeModel, executeTool });

    assert.equal(result.stats.toolErrors, 1);
    assert.match(messages.find((message) => message.role === 'tool').content, /boom/);
    assert.equal(result.content, '工具失败了，我换个办法');
});

test('达到最大轮次会提前结束', async () => {
    const fakeModel = async () => ({
        message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: 'x',
                function: { name: 'calculator', arguments: '{"expression":"1+1"}' },
            }],
        },
        usage: null,
    });

    const result = await runAgent('x', [], { callModel: fakeModel, maxTurns: 2 });
    assert.match(result.content, /最大轮次/);
    assert.equal(result.stats.turns, 2);
    assert.equal(result.stats.modelCalls, 2);
    assert.equal(result.stats.toolCalls, 2);
});

test('assistant 的 reasoning_content 不会写回历史', async () => {
    const fakeModel = async () => ({
        message: { role: 'assistant', content: 'ok', reasoning_content: '内部推理' },
        usage: null,
    });

    const messages = [];
    await runAgent('x', messages, { callModel: fakeModel });
    assert.equal(messages.find((message) => message.role === 'assistant').reasoning_content, undefined);
});
