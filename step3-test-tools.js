import { runTool } from './src/tools.js';

console.log(await runTool('get_current_time'));
console.log(await runTool('calculator', JSON.stringify({ expression: '(1+2)*3' })));
console.log(await runTool('list_files', JSON.stringify({ dir: '.' })));
console.log(await runTool('write_file', JSON.stringify({ file_path: 'test.txt', content: '你好' })));
console.log(await runTool('read_file', JSON.stringify({ file_path: 'test.txt' })));
