import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env.NODE_ENV ?? 'development';
const isProd = env === 'production';

const files = isProd
    ? [`.env.${env}`, '.env']
    : ['.env.local', `.env.${env}`, '.env'];

for (const f of files) {
    const p = join(projectRoot, f);
    if (!existsSync(p)) continue;
    try {
        loadEnvFile(p);
    } catch (e) {
        console.error(`❌ ${f} 解析失败：${e.message}`);
        process.exit(1);
    }
}

const REQUIRED = ['DEEPSEEK_API_KEY'];
const missing = REQUIRED.filter((key) => {
    const value = process.env[key];
    return !value || !value.startsWith('sk-');
});

if (missing.length) {
    console.error(`❌ 缺少环境变量：${missing.join(',')}`);
    console.error('   请执行： cp .env.example .env 然后填入真实值');
    process.exit(1);
}

function toInt(value, fallback, min = 1) {
    const n = Number.parseInt(value ?? '', 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
}

function toBool(value, fallback) {
    if (value == null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const temperature = Number(process.env.LLM_TEMPERATURE ?? (isProd ? 0.2 : 0.7));

export const config = Object.freeze({
    env,
    isProd,
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiUrl: process.env.DEEPSEEK_API_URL ?? 'https://api.deepseek.com/chat/completions',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    debug: !isProd,

    // 网络层：超时与重试
    timeoutMs: toInt(process.env.LLM_TIMEOUT_MS, 60_000),
    maxRetries: toInt(process.env.LLM_MAX_RETRIES, 2, 0),
    retryBaseMs: toInt(process.env.LLM_RETRY_BASE_MS, 500),

    // Agent 行为
    maxTurns: toInt(process.env.AGENT_MAX_TURNS, 12),
    stream: toBool(process.env.AGENT_STREAM, true),
    trace: toBool(process.env.AGENT_TRACE, true),

    // 外部工具
    tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
});
