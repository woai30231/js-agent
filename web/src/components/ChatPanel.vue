<script setup>
defineProps({
    messages: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
});
</script>

<template>
    <div class="chat-panel">
        <div v-if="messages.length === 0" class="empty">
            <div class="empty-icon">💬</div>
            <p class="empty-title">开始你的知识库问答</p>
            <p class="empty-sub">输入问题，AI 会检索知识库并给出回答</p>
        </div>

        <div v-for="(msg, index) in messages" :key="index" class="message-row" :class="msg.role">
            <div class="bubble">{{ msg.content }}</div>
        </div>

        <div v-if="loading" class="message-row assistant">
            <div class="bubble typing">
                <span class="dot" />
                <span class="dot" />
                <span class="dot" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.chat-panel {
    flex: 1;
    overflow-y: auto;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.empty {
    margin: auto;
    text-align: center;
    color: #909399;
}

.empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
}

.empty-title {
    font-size: 18px;
    font-weight: 600;
    color: #606266;
    margin: 0 0 6px;
}

.empty-sub {
    font-size: 14px;
    margin: 0;
}

.message-row {
    display: flex;
}

.message-row.user {
    justify-content: flex-end;
}

.bubble {
    max-width: 72%;
    padding: 12px 16px;
    border-radius: 14px;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;
}

.user .bubble {
    background: linear-gradient(135deg, #409eff, #6366f1);
    color: #fff;
    border-bottom-right-radius: 4px;
}

.assistant .bubble {
    background: #fff;
    color: #303133;
    box-shadow: 0 2px 12px rgba(99, 102, 241, 0.08);
    border: 1px solid #f0f2f5;
    border-bottom-left-radius: 4px;
}

.typing {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 16px;
}

.typing .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #909399;
    animation: blink 1.2s infinite ease-in-out;
}

.typing .dot:nth-child(2) {
    animation-delay: 0.2s;
}

.typing .dot:nth-child(3) {
    animation-delay: 0.4s;
}

@keyframes blink {
    0%, 80%, 100% {
        opacity: 0.2;
        transform: translateY(0);
    }
    40% {
        opacity: 1;
        transform: translateY(-4px);
    }
}
</style>
