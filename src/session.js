import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './config.js';
import { resolveInsideRoot } from './paths.js';

const SESSION_DIR = path.join(projectRoot, 'sessions');

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

// 保存会话：messages 是完整的对话历史，stats 是本会话的累计统计。
export async function saveSession(file, { messages, stats, model }) {
    const target = file
        ? resolveInsideRoot(projectRoot, file)
        : path.join(SESSION_DIR, `session-${stamp()}.json`);

    await fs.mkdir(path.dirname(target), { recursive: true });
    const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        model,
        stats,
        messages,
    };
    await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf-8');
    return target;
}

// 加载会话：不传文件时自动找 sessions/ 里最近修改的那个。
export async function loadSession(file) {
    const target = file ? resolveInsideRoot(projectRoot, file) : await latestSession();
    if (!target) throw new Error('sessions/ 目录下没有可加载的会话');

    let data;
    try {
        data = JSON.parse(await fs.readFile(target, 'utf-8'));
    } catch (err) {
        throw new Error(`会话文件解析失败：${err.message}`);
    }

    if (!Array.isArray(data.messages) || data.messages.length === 0) {
        throw new Error('会话文件格式不正确：缺少 messages 数组');
    }
    for (const message of data.messages) {
        if (!message || typeof message !== 'object' || typeof message.role !== 'string') {
            throw new Error('会话文件格式不正确：消息缺少 role');
        }
    }

    return { ...data, file: target };
}

async function latestSession() {
    let entries;
    try {
        entries = await fs.readdir(SESSION_DIR, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }

    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.join(SESSION_DIR, entry.name));
    if (files.length === 0) return null;

    const withTime = await Promise.all(
        files.map(async (file) => ({ file, mtimeMs: (await fs.stat(file)).mtimeMs })),
    );
    withTime.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withTime[0].file;
}
