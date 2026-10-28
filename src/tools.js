import fs from "node:fs/promises";
import path from "node:path";

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
            description: '计算数学表达式，支持+ - * / ()和小数点',
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
            description: '列出指定目录下的文件和子目录',
            parameters: {
                type: 'object',
                properties: {
                    dir: {
                        type: 'string',
                        description: '目录路径，默认当前目录'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: '读取一个文本文件的内容',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: '文件路径' }
                },
                required: ['file_path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: "把文本内容写入文件（只能写当前项目目录内的文件）",
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: '目标文件路径' },
                    content: { type: 'string', description: '要写入的内容' }
                },
                required: ['file_path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fetch_webpage',
            description: '读取一个网页的内容，用于获取最新信息',
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
            name: 'delete_file',
            description: '删除一个文件（只能删除当前项目目录内的文件，且不能删除项目关键文件）',
            parameters: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: '要删除的文件路径'
                    }
                },
                required: ['file_path']
            },
        }
    }
]

export const toolHandlers = {
    async get_current_time() {
        return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    },
    async calculator({ expression }) {
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
            throw new Error('只支持数字和 + - * / ( )');
        }
        const result = new Function(`return (${expression})`)();
        return String(result);
    },
    async list_files({ dir = '.' } = {}) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries.map((e) => e.name + (e.isDirectory() ? '/' : '')).join('\n');
    },
    async read_file({ file_path }) {
        return await fs.readFile(file_path, 'utf-8');
    },
    async write_file({ file_path, content }) {
        // 安全限制：只允许写进当前项目目录，防止模型把文件写到别的地方
        const target = path.resolve(file_path);
        const root = path.resolve('.');
        if (!target.startsWith(root)) {
            throw new Error('禁止写到项目目录之外');
        }
        await fs.writeFile(target, content, 'utf-8');
        return `已写入 ${target}`;
    },
    async delete_file({ file_path }) {
        const target = path.resolve(file_path);
        const root = path.resolve(".");
        if (!target.startsWith(root)) {
            throw new Error("禁止删除除项目目录之外的文件");
        };

        const protectedNames = [
            'package.json', '.env', '.gitignore',
            'llm.js', 'tools.js', 'agent.js', 'main.js'
        ]
        if (protectedNames.includes(path.basename(target))) {
            throw new Error("这是一个项目关键文件，禁止删除");
        };

        await fs.unlink(target);
        return `已删除${target}`;
    },
    async fetch_webpage({ url }) {
        if (!/^https?:\/\//.test(url)) {
            throw new Error('url 必须以 http:// 或 https:// 开头');
        }

        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15000), // 15 秒超时，防止卡死
        });
        if (!res.ok) throw new Error(`网页返回 ${res.status}`);

        const text = htmlToText(await res.text());

        // 关键：必须截断！网页动辄几十万字，全塞进历史会把 token 撑爆
        return text.slice(0, 4000);
    },
}

// 把 HTML 粗略转成纯文本：去掉脚本样式标签，再剥离剩余标签
function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
// ============ 统一入口：模型报工具名 + 参数 JSON，我们负责执行 ============
export async function runTool(name, argsJson) {
    const handler = toolHandlers[name];
    if (!handler) return `错误：工具 ${name} 不存在`;

    try {
        const args = argsJson ? JSON.parse(argsJson) : {};
        return await handler(args);
    } catch (err) {
        // 出错也要把错误信息返回给模型，它会自己调整策略重试
        return `工具执行出错：${err.message}`;
    }
}