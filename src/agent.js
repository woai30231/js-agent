import { chat } from './llm.js';
import { toolSchemas, runTool } from './tools.js';
export const SYSTEM_PROMPT = `你是一个能使用工具的智能助手。
规则：
1. 需要真实信息（时间、文件内容、计算结果）时必须调用工具，不要凭空编造。
2. 一次可以调用多个工具，也可以分多轮调用，一步步把任务做完。
3. 任务全部完成后，用简洁的中文告诉用户你做了什么。`;

export async function runAgent(userInput, messages, { maxTurns = 12 } = {}) {
    messages.push({ role: 'user', content: userInput })

    for (let turn = 1; turn <= maxTurns; turn++) {
        const assistantMsg = await chat({ messages, tools: toolSchemas })

        messages.push(assistantMsg);
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
            return assistantMsg.content;
        }
        // ③ 行动 + 观察：执行它点名的每个工具，把结果喂回历史
        for (const call of assistantMsg.tool_calls) {
            const { name, arguments: argsJson } = call.function;
            console.log(`[思考] 调用工具 ${name}(${argsJson})`);

            const result = await runTool(name, argsJson);
            console.log(`[观察] ${result}`);

            messages.push({
                role: 'tool',
                tool_call_id: call.id, // 这个 id 必须对应上，模型才知道是哪个调用的结果
                content: result,
            });
        }
    }

    return '⚠️ 已达到最大轮次限制，任务提前结束。';
}