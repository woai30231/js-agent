// 第一版"向量化"：用字符 2-gram 词频向量。
// 原理和真 embedding 完全一样：把文本变成数字向量，用余弦相似度衡量相关性。
// 后续要换真 embedding 模型，只需替换 toVector 这一个函数的实现。

// 把文本拆成 token：中文按相邻两字（2-gram），英文/数字按单词
export function toTokens(text) {
    const clean = text.toLowerCase();
    const tokens = [];

    // 连续中文 → 相邻两字一组
    const chineseRuns = clean.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const run of chineseRuns) {
        for (let i = 0; i < run.length - 1; i++) {
            tokens.push(run.slice(i, i + 2));
        }
    }

    // 英文单词 / 数字
    const words = clean.match(/[a-z0-9]+/g) || [];
    tokens.push(...words);

    return tokens;
}

// 把 tokens 转成词频向量（对象形式：{ token: 出现次数 }）
export function toVector(text) {
    const vec = {};
    for (const token of toTokens(text)) {
        vec[token] = (vec[token] || 0) + 1;
    }
    return vec;
}

// 余弦相似度：两个向量的"夹角"越小越相似，结果在 0~1 之间
export function cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const key in a) {
        normA += a[key] * a[key];
        if (b[key]) dot += a[key] * b[key];
    }
    for (const key in b) {
        normB += b[key] * b[key];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
