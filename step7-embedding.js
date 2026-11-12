import { toVector, cosineSimilarity } from './src/embedding.js';

const question = 'Agent 最多能执行多少轮？';
const related = 'Agent 执行循环有最大轮次限制，默认最多 12 轮，超过会提前结束';
const unrelated = '今天天气晴朗，适合出门散步';

const q = toVector(question);
const vRelated = toVector(related);
const vUnrelated = toVector(unrelated);

console.log('问题 vs 相关文本  相似度：', cosineSimilarity(q, vRelated).toFixed(4));
console.log('问题 vs 无关文本  相似度：', cosineSimilarity(q, vUnrelated).toFixed(4));
