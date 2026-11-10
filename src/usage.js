// Token 用量统计：把每一轮模型返回的 usage 累加起来。
// DeepSeek 的 usage 里还会带 prompt_cache_hit_tokens / prompt_cache_miss_tokens，
// 缓存命中部分价格低很多，这里一并统计出来。

export function emptyUsage() {
    return {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 0,
    };
}

export function addUsage(total, usage) {
    if (!usage) return total;
    total.prompt_tokens += usage.prompt_tokens ?? 0;
    total.completion_tokens += usage.completion_tokens ?? 0;
    total.total_tokens += usage.total_tokens ?? 0;
    total.prompt_cache_hit_tokens += usage.prompt_cache_hit_tokens ?? 0;
    total.prompt_cache_miss_tokens += usage.prompt_cache_miss_tokens ?? 0;
    return total;
}

export function formatUsage(usage) {
    if (!usage) return '';
    const parts = [`入 ${usage.prompt_tokens}`, `出 ${usage.completion_tokens}`];
    if (usage.total_tokens) parts.push(`共 ${usage.total_tokens}`);
    if (usage.prompt_cache_hit_tokens) parts.push(`缓存命中 ${usage.prompt_cache_hit_tokens}`);
    return parts.join(' / ');
}
