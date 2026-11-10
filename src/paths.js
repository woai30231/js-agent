import path from 'node:path';

// 判断 target 是否真的在 root 目录内。
// 注意不能简单用 target.startsWith(root)：E:\proj-evil 也会以 E:\proj 开头。
// Windows 路径大小写不敏感，比较前统一小写。
function normalizeForCompare(p) {
    return process.platform === 'win32' ? p.toLowerCase() : p;
}

export function isInsideRoot(root, target) {
    const rel = path.relative(normalizeForCompare(root), normalizeForCompare(target));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// 把用户/模型给的路径解析成绝对路径，并强制它落在 root 内。
// 绝对路径、..、以及“同前缀兄弟目录”都会被拦下来。
export function resolveInsideRoot(root, input) {
    const target = path.resolve(root, input);
    if (!isInsideRoot(root, target)) {
        throw new Error(`禁止访问项目目录之外的路径：${input}`);
    }
    return target;
}
