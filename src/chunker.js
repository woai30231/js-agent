import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './config.js';

const KB_DIR = path.join(projectRoot, 'knowledge');

// 列出 knowledge/ 下所有 markdown 文件（按文件名排序）
export async function listKnowledgeFiles() {
    const entries = await fs.readdir(KB_DIR, { withFileTypes: true });
    return entries
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => path.join(KB_DIR, e.name))
        .sort((a, b) => a.localeCompare(b));
}

// 按 "## " 二级标题切块，每个小节一个 chunk
export function splitByHeading(markdown) {
    const lines = markdown.split(/\r?\n/);
    const chunks = [];
    let title = '';
    let buffer = [];

    const flush = () => {
        const content = buffer.join('\n').trim();
        if (content) chunks.push({ title, content });
        buffer = [];
    };

    for (const line of lines) {
        const match = line.match(/^##\s+(.+)$/);
        if (match) {
            flush();                 // 遇到新标题，先把上一个 chunk 收尾
            title = match[1].trim();
        } else {
            buffer.push(line);
        }
    }
    flush();                         // 最后一个 chunk

    return chunks;
}

// 把整个知识库切成 chunk 列表（附来源文件、序号、长度）
export async function buildChunks() {
    const files = await listKnowledgeFiles();
    const all = [];

    for (const file of files) {
        const raw = await fs.readFile(file, 'utf-8');
        const chunks = splitByHeading(raw);
        const rel = path.relative(KB_DIR, file);

        chunks.forEach((c, index) => {
            all.push({
                file: rel,
                index,
                title: c.title || '（文档开头）',
                content: c.content,
                length: c.content.length,
            });
        });
    }

    return all;
}
