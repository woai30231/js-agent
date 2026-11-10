import fs from 'node:fs';
import path from 'node:path';
import { config, projectRoot } from './config.js';

// 把 Agent 循环里的关键事件写成 JSONL，一行一个事件。
// 这是最朴素的“可观测性”：出了问题可以回放每一轮模型调用、工具参数、耗时和结果。
export function createTrace({ enabled = config.trace, dir = path.join(projectRoot, 'logs') } = {}) {
    if (!enabled) {
        return { file: null, log() {}, close() {} };
    }

    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `agent-${stamp}.jsonl`);
    const fd = fs.openSync(file, 'a');
    let closed = false;

    return {
        file,
        log(event) {
            if (closed) return;
            const record = { ts: new Date().toISOString(), ...event };
            fs.writeSync(fd, `${JSON.stringify(record, truncateLongStrings)}\n`);
        },
        close() {
            if (closed) return;
            closed = true;
            try {
                fs.closeSync(fd);
            } catch {
                // 关闭失败不影响退出
            }
        },
    };
}

// 工具结果可能是整个文件或网页，原样写进日志会把日志撑爆。
function truncateLongStrings(key, value) {
    if (typeof value === 'string' && value.length > 2000) {
        return `${value.slice(0, 2000)}…（截断，原长 ${value.length} 字符）`;
    }
    return value;
}
