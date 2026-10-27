const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

export async function chat({ messages, tools, temperature = 0.2 }) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.startsWith('你的')) {
        throw new Error('没读到 DEEPSEEK_API_KEY，检查 .env 是否填好');
    }

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MODEL,
            messages,
            tools,          // 现在是 undefined，JSON 序列化时会自动忽略
            temperature,
            stream: false,
        }),
    });

    if (!res.ok) {
        throw new Error(`DeepSeek 返回 ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    console.log(data.choices[0].message)
    return data.choices[0].message;
}
