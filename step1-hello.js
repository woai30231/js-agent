import { chat } from './src/llm.js';

const { message } = await chat({
    messages: [{ role: 'user', content: '用一句话介绍你自己' }],
});

console.log(message.content);
