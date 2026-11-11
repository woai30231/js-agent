// 健康检查：确认后端接口连通
export async function checkHealth() {
    try {
        const res = await fetch('/api/health');
        if (!res.ok) return false;
        const data = await res.json();
        return data.ok === true;
    } catch (err) {
        console.error('健康检查失败：', err.message);
        return false;
    }
}

// 问答请求：返回 { answer, sources }
export async function askChat(question) {
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
    });

    let data = {};
    try {
        data = await res.json();
    } catch {
        // 非 JSON 响应，忽略
    }

    if (!res.ok) {
        throw new Error(data.error || `请求失败（${res.status}）`);
    }

    return data; // { answer, sources }
}
