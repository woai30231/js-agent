import express from 'express';
import { chat } from './llm.js';

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

// 问答接口：sources 字段预留给下阶段 RAG 检索片段
app.post('/api/chat', async (req, res) => {
    const question = req.body?.question;

    // 入参校验：question 必须是非空字符串
    if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'question 不能为空' });
    }

    try {
        const messages = [{ role: 'user', content: question.trim() }];
        const reply = await chat({ messages });

        // 注意：当前 llm.js 的 chat 返回的是"裸 message"（含 content 字段）。
        // 后续把 llm.js 重构为返回 { message, usage, model } 时，这里要改成 reply.message.content。
        const answer = reply.content ?? '（模型没有返回内容）';

        res.json({
            answer,
            sources: [], // 预留给 RAG 的检索片段，当前阶段恒为空数组
        });
    } catch (err) {
        // 不把堆栈和 apiKey 暴露给客户端，只返回可读信息
        console.error('[chat] 调用失败：', err.message);
        res.status(500).json({ error: '调用模型失败，请稍后重试' });
    }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
    console.log(`✅ HTTP 服务已启动：http://localhost:${PORT}`);
});
