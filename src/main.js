import readline from 'node:readline/promises';
import { runAgent, SYSTEM_PROMPT } from './agent.js';

const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('🤖 Agent 已启动。输入问题开始，输入 exit 退出。\n');

while (true) {
    const input = (await rl.question('你> ')).trim();
    if (['exit', 'quit', '退出'].includes(input)) break;
    if (!input) continue;

    const answer = await runAgent(input, messages);
    console.log(`\n🤖 ${answer}\n`);
}

rl.close();