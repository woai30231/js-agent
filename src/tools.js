import fs from 'node:fs/promises';
import path from 'node:path';
import { config, projectRoot } from './config.js';
import { resolveInsideRoot } from './paths.js';

const MAX_READ_BYTES = 120_000;
const MAX_LIST_ENTRIES = 200;
const MAX_WEB_CHARS = 4_000;
// node_modules / .git 对模型没有阅读价值，列目录时直接跳过
const SKIP_DIRS = new Set(['node_modules', '.git']);

export const toolSchemas = [
    {
        type: 'function',
        function: {
            name: 'get_current_time',
            description: '获取当前的日期和时间',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calculator',
            description: '计算数学表达式，支持 + - * / ( ) 和小数点',
            parameters: {
                type: 'object',
                properties: {
                    expression: {
                        type: 'string',
                        description: '例如 "(1+2)*3"'
                    }
                },
                required: ['expression']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_files',
            description: '列出项目目录下指定子目录的文件和子目录（不能访问项目外路径）',
            parameters: {
                type: 'object',
                properties: {
                    dir: {
                        type: 'string',
                        description: '相对于项目根目录的目录路径，默认当前目录'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: '读取项目目录内的一个文本文件（大文件会截断，不能访问项目外路径）',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: '相对于项目根目录的文件路径' }
                },
                required: ['file_path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: '把文本内容写入项目目录内的文件（会自动创建父目录，不能写到项目外）',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: '相对于项目根目录的目标文件路径' },
                    content: { type: 'string', description: '要写入的内容' }
                },
                required: ['file_path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_file',
            description: '删除项目目录内的一个文件（不能删除目录、关键文件或项目外文件）',
            parameters: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: '相对于项目根目录的文件路径'
                    }
                },
                required: ['file_path']
            },
        }
    },
    {
        type: 'function',
        function: {
            name: 'fetch_webpage',
            description: '读取一个网页并转成纯文本，用于获取最新或更详细的信息',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: '完整的网页地址，需以 http 或 https 开头' }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_search',
            description: '联网搜索最新信息，返回摘要和链接。适合查询新闻、版本号、文档等模型不知道的实时信息',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: '搜索关键词' },
                    max_results: { type: 'integer', description: '返回结果数量，1-5，默认 3' }
                },
                required: ['query']
            }
        }
    }
]

export const toolHandlers = {
    async get_current_time() {
        const now = new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false,
        });
        return `${now}（Asia/Shanghai）`;
    },

    async calculator({ expression }) {
        if (typeof expression !== 'string' || expression.length > 200) {
            throw new Error('表达式必须是不超过 200 个字符的字符串');
        }
        // 白名单校验，避免把任意 JS 交给 new Function 执行
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
            throw new Error('只支持数字和 + - * / ( )');
        }
        try {
            const result = new Function(`return (${expression})`)();
            if (typeof result !== 'number' || !Number.isFinite(result)) {
                throw new Error('结果不是有限数字');
            }
            return String(result);
        } catch (err) {
            throw new Error(`无法计算：${err.message}`);
        }
    },

    async list_files({ dir = '.' } = {}) {
        const target = resolveInsideRoot(projectRoot, dir);
        const entries = await fs.readdir(target, { withFileTypes: true });
        const visible = entries
            .filter((entry) => !SKIP_DIRS.has(entry.name))
            .sort((a, b) => a.name.localeCompare(b.name));

        const lines = visible
            .slice(0, MAX_LIST_ENTRIES)
            .map((entry) => entry.name + (entry.isDirectory() ? '/' : ''));

        if (visible.length > MAX_LIST_ENTRIES) {
            lines.push(`…（共 ${visible.length} 项，只显示前 ${MAX_LIST_ENTRIES} 项）`);
        }
        return lines.join('\n') || '（空目录）';
    },

    async read_file({ file_path }) {
        const target = resolveInsideRoot(projectRoot, file_path);
        const stat = await fs.stat(target);
        if (!stat.isFile()) throw new Error('目标不是文件');

        const handle = await fs.open(target, 'r');
        try {
            const length = Math.min(stat.size, MAX_READ_BYTES);
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, 0);
            let text = buffer.subarray(0, bytesRead).toString('utf-8');

            if (text.includes('\u0000')) {
                throw new Error('看起来是二进制文件，无法按文本读取');
            }
            if (stat.size > bytesRead) {
                text += `\n\n…（文件共 ${stat.size} 字节，已截断为前 ${bytesRead} 字节）`;
            }
            return text;
        } finally {
            await handle.close();
        }
    },

    async write_file({ file_path, content }) {
        const target = resolveInsideRoot(projectRoot, file_path);
        const text = String(content ?? '');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, text, 'utf-8');
        return `已写入 ${path.relative(projectRoot, target)}（${Buffer.byteLength(text, 'utf-8')} 字节）`;
    },

    async delete_file({ file_path }) {
        const target = resolveInsideRoot(projectRoot, file_path);
        const relative = path.relative(projectRoot, target);
        const segments = relative.split(path.sep);

        if (segments.includes('.git')) {
            throw new Error('禁止删除 .git 目录内的文件');
        }
        if (PROTECTED_NAMES.has(path.basename(target))) {
            throw new Error('这是一个项目关键文件，禁止删除');
        }

        const stat = await fs.lstat(target);
        if (stat.isDirectory()) throw new Error('只能删除文件，不能删除目录');

        await fs.unlink(target);
        return `已删除 ${relative}`;
    },

    async fetch_webpage({ url }) {
        const parsed = parseHttpUrl(url);
        assertPublicHost(parsed.hostname);

        const res = await fetch(parsed.href, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15_000), // 15 秒超时，防止卡死
        });
        if (!res.ok) throw new Error(`网页返回 ${res.status}`);

        const contentType = res.headers.get('content-type') ?? '';
        const raw = await res.text();
        const text = /html|xml/i.test(contentType) ? htmlToText(raw) : raw;

        // 关键：必须截断！网页动辄几十万字，全塞进历史会把 token 撑爆
        return truncate(text.trim(), MAX_WEB_CHARS);
    },

    async web_search({ query, max_results = 3 }) {
        if (!config.tavilyApiKey) {
            throw new Error('未配置 TAVILY_API_KEY，无法使用联网搜索');
        }

        const q = String(query ?? '').trim();
        if (!q) throw new Error('query 不能为空');
        const count = Math.min(Math.max(Number(max_results) || 3, 1), 5);

        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: config.tavilyApiKey,
                query: q,
                max_results: count,
                search_depth: 'basic',
                include_answer: true,
            }),
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            throw new Error(`搜索服务返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }

        const data = await res.json();
        const lines = [];
        if (data.answer) lines.push(`摘要：${data.answer}`);
        for (const item of data.results ?? []) {
            lines.push(`- ${item.title}\n  ${item.url}\n  ${(item.content ?? '').slice(0, 300)}`);
        }

        return truncate(lines.join('\n\n') || '没有找到结果', MAX_WEB_CHARS);
    },
}

// 关键文件黑名单：模型即使被误导，也不能删掉这些
const PROTECTED_NAMES = new Set([
    'package.json', 'package-lock.json',
    '.env', '.env.local', '.env.development', '.env.production', '.env.example',
    '.gitignore', 'readme.md',
    'agent.js', 'llm.js', 'tools.js', 'main.js', 'config.js',
    'session.js', 'trace.js', 'paths.js', 'usage.js',
]);

function parseHttpUrl(raw) {
    let url;
    try {
        url = new URL(String(raw));
    } catch {
        throw new Error('url 格式不正确');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('url 必须以 http:// 或 https:// 开头');
    }
    return url;
}

// 基础 SSRF 防护：禁止访问本机和内网地址。
// 注意这只是主机名层面的粗筛，并不能完全防住 DNS rebinding。
function assertPublicHost(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    const blocked =
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host === '[::1]' ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host);

    if (blocked) {
        throw new Error('禁止访问内网或本机地址');
    }
}

function truncate(text, max) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n…（已截断，原长 ${text.length} 字符）`;
}

// 把 HTML 粗略转成纯文本：去掉脚本样式标签，再剥离剩余标签
function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ============ 统一入口 ============
// runToolSafe 返回结构化结果，Agent 用它统计成功/失败；
// runTool 保持原来的“只返回字符串”接口，兼容 step3 之类的旧脚本。
export async function runToolSafe(name, argsJson) {
    const handler = toolHandlers[name];
    if (!handler) {
        return { ok: false, result: `错误：工具 ${name} 不存在` };
    }

    let args;
    try {
        args = argsJson ? JSON.parse(argsJson) : {};
    } catch (err) {
        return { ok: false, result: `工具参数不是合法 JSON：${err.message}` };
    }

    try {
        const result = await handler(args);
        return { ok: true, result: String(result ?? '') };
    } catch (err) {
        // 出错也要把错误信息返回给模型，它会自己调整策略重试
        return { ok: false, result: `工具执行出错：${err.message}` };
    }
}

export async function runTool(name, argsJson) {
    return (await runToolSafe(name, argsJson)).result;
}
