import path from 'node:path';
import readline from 'node:readline/promises';
import { config, projectRoot } from './config.js';
import { runAgent, SYSTEM_PROMPT } from './agent.js';
import { toolSchemas } from './tools.js';
import { createTrace } from './trace.js';
import { saveSession, loadSession } from './session.js';
import { emptyUsage, addUsage, formatUsage } from './usage.js';

const trace = createTrace();

let messages = [{ role: 'system', content: SYSTEM_PROMPT }];
let sessionStats = createStats();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
});

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

function addStats(total, stats) {
    total.turns += stats.turns;
    total.modelCalls += stats.modelCalls;
    total.toolCalls += stats.toolCalls;
    total.toolErrors += stats.toolErrors;
    total.durationMs += stats.durationMs;
    addUsage(total.usage, stats.usage);
}

function restoreStats(saved) {
    const stats = createStats();
    if (!saved) return stats;
    stats.turns = saved.turns ?? 0;
    stats.modelCalls = saved.modelCalls ?? 0;
    stats.toolCalls = saved.toolCalls ?? 0;
    stats.toolErrors = saved.toolErrors ?? 0;
    stats.durationMs = saved.durationMs ?? 0;
    addUsage(stats.usage, saved.usage);
    return stats;
}

function preview(text, max = 120) {
    const oneLine = String(text ?? '').replace(/\s+/g, ' ').trim();
    return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function printHelp() {
    console.log(`
可用命令：
  /help            显示帮助
  /tools           列出当前注册的工具
  /history [n]     查看最近 n 条消息（默认 10）
  /clear           清空对话历史（保留 system prompt）
  /save [文件]     保存会话到 sessions/ 或指定文件
  /load [文件]     加载会话（不传文件则加载最近一次）
  /stats           显示本次会话统计
  exit / quit      退出
`);
}

function printTools() {
    for (const tool of toolSchemas) {
        console.log(`  - ${tool.function.name}: ${tool.function.description}`);
    }
}

function printHistory(limit = 10) {
    const count = Math.max(1, Math.min(limit, 100));
    const start = Math.max(0, messages.length - count);
    const items = messages.slice(start);
    if (items.length === 0) {
        console.log('（没有历史消息）');
        return;
    }

    items.forEach((message, offset) => {
        const index = start + offset;
        if (message.role === 'assistant' && message.tool_calls?.length) {
            const names = message.tool_calls
                .map((call) => call.function?.name ?? '?')
                .join(', ');
            console.log(`  #${index} assistant → 调用 ${names}`);
        } else if (message.role === 'tool') {
            console.log(`  #${index} tool(${message.tool_call_id ?? '?'}) ← ${preview(message.content, 100)}`);
        } else {
            console.log(`  #${index} ${message.role}: ${preview(message.content, 100)}`);
        }
    });
}

function printStats() {
    const traceFile = trace.file ? path.relative(projectRoot, trace.file) : '关闭';
    console.log(`
会话统计：
  模型        ${config.model}
  流式输出    ${config.stream ? '开' : '关'}
  历史消息    ${messages.length} 条
  轮次        ${sessionStats.turns}
  模型调用    ${sessionStats.modelCalls}
  工具调用    ${sessionStats.toolCalls}（失败 ${sessionStats.toolErrors}）
  Token       ${formatUsage(sessionStats.usage) || '0'}
  累计耗时    ${(sessionStats.durationMs / 1000).toFixed(1)}s
  轨迹日志    ${traceFile}
`);
}

async function handleCommand(input) {
    const space = input.indexOf(' ');
    const command = space === -1 ? input : input.slice(0, space);
    const arg = space === -1 ? '' : input.slice(space + 1).trim();

    switch (command) {
        case '/help':
            printHelp();
            return;
        case '/tools':
            printTools();
            return;
        case '/history':
            printHistory(Number(arg) || 10);
            return;
        case '/clear':
            messages = [{ role: 'system', content: SYSTEM_PROMPT }];
            sessionStats = createStats();
            console.log('✅ 已清空对话历史');
            return;
        case '/stats':
            printStats();
            return;
        case '/save': {
            if (messages.length <= 1) {
                console.log('还没有可保存的对话');
                return;
            }
            const file = await saveSession(arg, {
                messages,
                stats: sessionStats,
                model: config.model,
            });
            console.log(`✅ 已保存到 ${path.relative(projectRoot, file)}`);
            return;
        }
        case '/load': {
            const data = await loadSession(arg);
            messages = data.messages[0]?.role === 'system'
                ? data.messages
                : [{ role: 'system', content: SYSTEM_PROMPT }, ...data.messages];
            sessionStats = restoreStats(data.stats);
            console.log(`✅ 已加载 ${path.relative(projectRoot, data.file)}（${messages.length} 条消息）`);
            return;
        }
        default:
            console.log(`未知命令：${command}，输入 /help 查看可用命令`);
    }
}

console.log('🤖 Agent 已启动');
console.log(`   模型 ${config.model} · 流式${config.stream ? '开' : '关'} · 最大 ${config.maxTurns} 轮`);
console.log(`   轨迹 ${trace.file ? path.relative(projectRoot, trace.file) : '关闭'} · 输入 /help 查看命令\n`);

process.on('SIGINT', () => {
    console.log('\n👋 再见');
    trace.close();
    process.exit(0);
});

function prompt() {
    if (process.stdin.isTTY) process.stdout.write('你> ');
}

try {
    prompt();
    for await (const line of rl) {
        const input = line.trim();
        if (!input) {
            prompt();
            continue;
        }
        if (['exit', 'quit', '退出', '/exit', '/quit'].includes(input)) break;

        if (input.startsWith('/')) {
            try {
                await handleCommand(input);
            } catch (err) {
                console.error(`❌ ${err.message}`);
            }
            prompt();
            continue;
        }

        trace.log({ type: 'user', content: input });

        const before = messages.length;
        let streamedThisTurn = false;
        let lineOpen = false;

        const ensureNewline = () => {
            if (lineOpen) {
                process.stdout.write('\n');
                lineOpen = false;
            }
        };

        try {
            const { content, stats } = await runAgent(input, messages, {
                trace,
                onEvent(event) {
                    switch (event.type) {
                        case 'turn_start':
                            streamedThisTurn = false;
                            break;
                        case 'token':
                            if (!streamedThisTurn) {
                                process.stdout.write('🤖 ');
                                streamedThisTurn = true;
                            }
                            lineOpen = true;
                            process.stdout.write(event.text);
                            break;
                        case 'tool_start': {
                            ensureNewline();
                            const args = !event.args || event.args === '{}' ? '' : preview(event.args, 100);
                            console.log(`  ⚙ ${event.name}(${args})`);
                            break;
                        }
                        case 'tool_end':
                            ensureNewline();
                            console.log(`  ${event.ok ? '✓' : '✗'} ${preview(event.result, 160) || '(无输出)'}  ${event.ms}ms`);
                            break;
                        case 'retry':
                            ensureNewline();
                            console.log(`  ↻ 请求失败，${event.delayMs}ms 后第 ${event.attempt} 次重试：${preview(event.message, 120)}`);
                            break;
                        case 'limit':
                            ensureNewline();
                            break;
                        default:
                            break;
                    }
                },
            });

            const lastTurnStreamed = streamedThisTurn;
            ensureNewline();
            if (!lastTurnStreamed && content) {
                console.log(`🤖 ${content}`);
            }

            addStats(sessionStats, stats);
            const usageText = formatUsage(stats.usage);
            const errorText = stats.toolErrors ? `（失败 ${stats.toolErrors}）` : '';
            console.log(`  ↳ ${stats.turns} 轮 · ${stats.modelCalls} 次模型调用 · 工具 ${stats.toolCalls} 次${errorText}${usageText ? ` · ${usageText}` : ''} · ${(stats.durationMs / 1000).toFixed(1)}s\n`);
        } catch (err) {
            ensureNewline();
            // 本轮失败就回滚，避免历史里留下“有提问没回答”的半截对话
            messages.length = before;
            console.error(`❌ 调用失败：${err.message}`);
            console.error('   本轮已回滚，历史未受影响。\n');
        }

        prompt();
    }
} finally {
    trace.close();
    rl.close();
}

console.log('👋 再见');
