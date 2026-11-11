<script setup>
import { ref } from 'vue';

const props = defineProps({
    loading: { type: Boolean, default: false },
});

const emit = defineEmits(['submit']);

const text = ref('');

function handleSend() {
    const value = text.value.trim();
    if (!value || props.loading) return;
    emit('submit', value);
    text.value = '';
}

function handleKeydown(e) {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
}
</script>

<template>
    <div class="question-input">
        <el-input
            v-model="text"
            type="textarea"
            :rows="2"
            resize="none"
            placeholder="输入你的问题，例如：Agent 最多能执行多少轮？"
            @keydown="handleKeydown"
        />
        <el-button
            type="primary"
            class="send-btn"
            :loading="loading"
            :disabled="!text.trim()"
            @click="handleSend"
        >
            发送
        </el-button>
    </div>
</template>

<style scoped>
.question-input {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #f0f2f5;
    background: #fff;
}

.send-btn {
    height: 54px;
    padding: 0 28px;
    border-radius: 12px;
    background: linear-gradient(135deg, #409eff, #6366f1);
    border: none;
}

.send-btn:hover {
    background: linear-gradient(135deg, #3a8ee6, #5a5ae6);
    opacity: 0.95;
}
</style>
