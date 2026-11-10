import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// 在导入 config.js 之前准备好最小环境，保证测试不依赖真实 .env
process.env.DEEPSEEK_API_KEY ||= 'sk-test';
process.env.NODE_ENV ||= 'development';

const { runTool, runToolSafe, toolSchemas } = await import('../src/tools.js');
const { projectRoot } = await import('../src/config.js');
const { resolveInsideRoot } = await import('../src/paths.js');

test('calculator 能算四则运算', async () => {
    assert.equal(await runTool('calculator', JSON.stringify({ expression: '(1+2)*3' })), '9');
});

test('calculator 拒绝非法字符', async () => {
    const outcome = await runToolSafe('calculator', JSON.stringify({ expression: 'process.exit()' }));
    assert.equal(outcome.ok, false);
    assert.match(outcome.result, /只支持数字/);
});

test('未知工具返回错误而不是抛异常', async () => {
    const outcome = await runToolSafe('not_a_tool', '{}');
    assert.equal(outcome.ok, false);
    assert.match(outcome.result, /不存在/);
});

test('坏 JSON 参数被友好处理', async () => {
    const outcome = await runToolSafe('calculator', '{not json');
    assert.equal(outcome.ok, false);
    assert.match(outcome.result, /JSON/);
});

test('路径沙箱拒绝 .. 和同前缀兄弟目录', () => {
    assert.throws(() => resolveInsideRoot(projectRoot, '../outside.txt'), /禁止/);
    assert.throws(() => resolveInsideRoot(projectRoot, `${projectRoot}-evil/x.txt`), /禁止/);
    assert.equal(
        resolveInsideRoot(projectRoot, 'src/agent.js'),
        path.join(projectRoot, 'src', 'agent.js'),
    );
});

test('文件工具拒绝访问项目外路径', async () => {
    const read = await runToolSafe('read_file', JSON.stringify({ file_path: '../secret.txt' }));
    assert.equal(read.ok, false);

    const write = await runToolSafe('write_file', JSON.stringify({ file_path: '../escape.txt', content: 'x' }));
    assert.equal(write.ok, false);

    const remove = await runToolSafe('delete_file', JSON.stringify({ file_path: '../escape.txt' }));
    assert.equal(remove.ok, false);
});

test('保护文件不可删除', async () => {
    const outcome = await runToolSafe('delete_file', JSON.stringify({ file_path: 'package.json' }));
    assert.equal(outcome.ok, false);
    assert.match(outcome.result, /关键文件/);
});

test('文件读写删闭环 + 列表', async () => {
    const dir = await fs.mkdtemp(path.join(projectRoot, 'test', '.tmp-'));
    const relative = path.relative(projectRoot, path.join(dir, 'note.txt'));

    try {
        const write = await runToolSafe('write_file', JSON.stringify({ file_path: relative, content: '你好' }));
        assert.equal(write.ok, true, write.result);

        const read = await runToolSafe('read_file', JSON.stringify({ file_path: relative }));
        assert.equal(read.ok, true, read.result);
        assert.equal(read.result, '你好');

        const list = await runTool('list_files', JSON.stringify({ dir: path.relative(projectRoot, dir) }));
        assert.match(list, /note\.txt/);

        const remove = await runToolSafe('delete_file', JSON.stringify({ file_path: relative }));
        assert.equal(remove.ok, true, remove.result);
        await assert.rejects(fs.access(path.join(dir, 'note.txt')));
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('工具 schema 至少包含核心工具', () => {
    const names = toolSchemas.map((tool) => tool.function.name);
    for (const name of [
        'get_current_time',
        'calculator',
        'list_files',
        'read_file',
        'write_file',
        'delete_file',
        'fetch_webpage',
        'web_search',
    ]) {
        assert.ok(names.includes(name), `缺少工具 ${name}`);
    }
});
