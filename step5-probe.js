console.log(process.env.TAVILY_API_KEY)
const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: 'Node.js 最新 LTS 版本',
        max_results: 3,
        search_depth: 'basic',
        include_answer: true,
    }),
});

console.log(await res.json());
