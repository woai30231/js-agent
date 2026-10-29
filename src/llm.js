
import { config } from './config.js';

export async function chat({ messages, tools, temperature = config.temperature }) {

    const res = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
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
    return data.choices[0].message;
}
