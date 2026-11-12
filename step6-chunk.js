import { buildChunks } from './src/chunker.js';

const chunks = await buildChunks();

console.log(`✅ 知识库共切出 ${chunks.length} 个 chunk\n`);

// 按文件统计
const byFile = {};
for (const c of chunks) {
    byFile[c.file] = (byFile[c.file] || 0) + 1;
}
console.log('按文件统计：');
for (const [file, count] of Object.entries(byFile)) {
    console.log(`  ${String(count).padStart(3)} 个  ${file}`);
}

// 总量统计
const total = chunks.reduce((sum, c) => sum + c.length, 0);
const avg = Math.round(total / chunks.length);
console.log(`\n总字符数 ${total}，平均每块 ${avg} 字符\n`);

// 打印前 3 个 chunk 示例
console.log('前 3 个 chunk 示例：\n');
for (const c of chunks.slice(0, 3)) {
    console.log(`【${c.file}】${c.title}（${c.length} 字符）`);
    console.log(`${c.content.slice(0, 100)}…\n`);
}
