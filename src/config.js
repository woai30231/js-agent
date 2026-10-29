import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(join(root, '.env'))) {
    loadEnvFile(join(root, '.env'))
}

const REQUIRED = ['DEEPSEEK_API_KEY'];
const missing = REQUIRED.filter((k) => {
    const v = process.env[k];
    return !v || v.startsWith('你的');
})

if (missing.length) {
    console.error(`❌️ 缺少环境变量：${missing.join(',')}`);
    console.error('   请执行： cp .env.example .env 然后填入真实值');
    process.exit(1);
}

export const config = Object.freeze({
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiUrl: process.env.DEEPSEEK_API_URL ?? 'https://api.deepseek.com/chat/completions',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2)
})