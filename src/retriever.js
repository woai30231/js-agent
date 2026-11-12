import { buildChunks } from './chunker.js';
import { toVector, cosineSimilarity } from './embedding.js';

// 建索引：把每个 chunk 预先向量化（离线做一次）
export async function buildIndex() {
    const chunks = await buildChunks();
    return chunks.map((c) => ({
        ...c,
        vector: toVector(c.content),  // 预先算好，检索时直接复用
    }));
}

// 检索：问题向量化 → 和所有 chunk 算相似度 → 返回 top-k
export async function retrieve(question, topK = 3) {
    const index = await buildIndex();
    const qVec = toVector(question);

    const scored = index.map((c) => ({
        ...c,
        score: cosineSimilarity(qVec, c.vector),
    }));

    scored.sort((a, b) => b.score - a.score);  // 按相似度从高到低排序
    return scored.slice(0, topK);
}
