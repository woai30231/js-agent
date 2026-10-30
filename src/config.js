import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env.NODE_ENV ?? 'development';
const isProd = env === 'production';

const files = isProd
    ? [`.env.${env}`, '.env']
    : [`.env.local`, `.env.${env}`, '.env'];


for (const f of files) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    try {
        loadEnvFile(p);
    } catch (e) {
        console.log(`❌️ ${f}解析失败：${e.message}`);
        process.exit(1);
    }
}

const REQUIRED = ['DEEPSEEK_API_KEY'];
const missing = REQUIRED.filter((k) => {
    const v = process.env[k];
    console.log(v)
    return !v || !v.startsWith('sk-');
})

if (missing.length) {
    console.error(`❌️ 缺少环境变量：${missing.join(',')}`);
    console.error('   请执行： cp .env.example .env 然后填入真实值');
    process.exit(1);
}

// 5) 集中导出
export const config = Object.freeze({
    env,
    isProd,
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiUrl: process.env.DEEPSEEK_API_URL ?? 'https://api.deepseek.com/chat/completions',
    model: process.env.DEEPSEEK_MODEL ?? (isProd ? 'deepseek-chat' : 'deepseek-chat'),
    temperature: Number(process.env.LLM_TEMPERATURE ?? (isProd ? 0.2 : 0.7)),
    debug: !isProd,
});