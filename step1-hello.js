import { chat } from './src/llm.js';

const msg = await chat({
    messages: [{ role: 'user', content: '用一句话介绍你自己' }],
});

console.log(msg.content);
