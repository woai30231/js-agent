import { retrieve } from './src/retriever.js';

const question = '为什么要设置最大轮次';
const results = await retrieve(question, 3);

console.log(`问题：${question}\n`);
for (const [i, r] of results.entries()) {
    console.log(`第 ${i + 1} 名（相似度 ${r.score.toFixed(4)}）`);
    console.log(`  来源：${r.file} · ${r.title}`);
    console.log(`  内容：${r.content.slice(0, 80)}…\n`);
}
