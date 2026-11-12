import express from 'express';
import { chat } from './llm.js';
import { retrieve } from './retriever.js';


const app = express();
app.use(express.json());

// 简单 CORS：方便开发期跨端口调试（前端 5173 访问后端 3000）
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// 健康检查：确认服务活着
app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

// 问答接口：RAG 全流程 —— 检索 → 拼prompt → 生成 → 返回 answer + sources
app.post('/api/chat', async (req, res) => {
    const question = req.body?.question;

    if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'question 不能为空' });
    }

    try {
        // ① 检索：从知识库找出最相关的 top-3 片段
        const hits = await retrieve(question, 3);

        // ② 把片段拼成"资料"上下文
        const context = hits
            .map((s, i) => `【资料${i + 1}】（来源：${s.file} · ${s.title}）\n${s.content}`)
            .join('\n\n');

        // ③ 让模型基于资料回答，禁止编造
        const messages = [
            {
                role: 'system',
                content: '你是知识库问答助手。请严格根据下面提供的资料回答用户问题；如果资料里没有答案，就回答"知识库中未找到相关内容"，不要凭记忆编造。',
            },
            {
                role: 'user',
                content: `【资料】\n${context}\n\n【问题】\n${question.trim()}`,
            },
        ];

        // ④ 调模型生成
        const reply = await chat({ messages });
        const answer = reply.content ?? '（模型没有返回内容）';

        // ⑤ sources 填真实检索结果（content 截断，避免响应过大）
        res.json({
            answer,
            sources: hits.map((s) => ({
                file: s.file,
                title: s.title,
                content: s.content.slice(0, 200),
                score: Number(s.score.toFixed(4)),
            })),
        });
    } catch (err) {
        console.error('[chat] 调用失败：', err.message);
        res.status(500).json({ error: '调用模型失败，请稍后重试' });
    }
});


const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
    console.log(`✅ HTTP 服务已启动：http://localhost:${PORT}`);
});
