<script setup>
import { ref, onMounted } from 'vue';
import ChatPanel from './components/ChatPanel.vue';
import QuestionInput from './components/QuestionInput.vue';
import SourcesPanel from './components/SourcesPanel.vue';
import { askChat, checkHealth } from './api/chat.js';

const messages = ref([]);
const sources = ref([]);
const loading = ref(false);
const serverStatus = ref('checking'); // 'checking' | 'online' | 'offline'

onMounted(async () => {
    serverStatus.value = (await checkHealth()) ? 'online' : 'offline';
});

async function handleSubmit(question) {
    messages.value.push({ role: 'user', content: question });
    sources.value = [];
    loading.value = true;
    try {
        const data = await askChat(question);
        messages.value.push({ role: 'assistant', content: data.answer });
        sources.value = data.sources ?? [];
    } catch (err) {
        console.error('问答请求失败：', err.message);
        messages.value.push({ role: 'assistant', content: `出错了：${err.message}` });
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="app">
        <header class="topbar">
            <div class="brand">
                <span class="brand-logo">🧠</span>
                <div class="brand-text">
                    <span class="brand-name">Agent 知识库问答</span>
                    <span class="brand-sub">RAG 演示 · knowledge/</span>
                </div>
            </div>
            <el-tag
                :type="serverStatus === 'online' ? 'success' : serverStatus === 'offline' ? 'danger' : 'info'"
                effect="light"
                round
            >
                {{ serverStatus === 'online' ? '接口已连接' : serverStatus === 'offline' ? '接口未连接' : '连接中…' }}
            </el-tag>
        </header>

        <main class="content">
            <section class="chat-area">
                <ChatPanel :messages="messages" :loading="loading" />
                <QuestionInput :loading="loading" @submit="handleSubmit" />
            </section>
            <aside class="sources-area">
                <SourcesPanel :sources="sources" />
            </aside>
        </main>
    </div>
</template>

<style>
* {
    box-sizing: border-box;
}

html,
body,
#app {
    height: 100%;
    margin: 0;
}

body {
    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
    background: #f5f7fa;
}
</style>

<style scoped>
.app {
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background: linear-gradient(135deg, #409eff, #6366f1 55%, #7c3aed);
    color: #fff;
    z-index: 10;
    box-shadow: 0 2px 16px rgba(99, 102, 241, 0.3);
}

.brand {
    display: flex;
    align-items: center;
    gap: 12px;
}

.brand-logo {
    font-size: 26px;
}

.brand-text {
    display: flex;
    flex-direction: column;
}

.brand-name {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.brand-sub {
    font-size: 12px;
    opacity: 0.85;
}

.content {
    flex: 1;
    display: flex;
    padding-top: 60px;
    overflow: hidden;
}

.chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.sources-area {
    width: 340px;
    border-left: 1px solid #f0f2f5;
    background: #fbfbfd;
}
</style>
