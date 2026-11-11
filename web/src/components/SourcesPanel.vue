<script setup>
defineProps({
    sources: { type: Array, default: () => [] },
});
</script>

<template>
    <div class="sources-panel">
        <h3 class="panel-title">检索片段</h3>

        <div v-if="sources.length === 0" class="sources-empty">
            <div class="sources-empty-icon">🔍</div>
            <p>暂无检索片段</p>
            <p class="sources-empty-sub">接入 RAG 后，这里会展示知识库中检索到的相关内容</p>
        </div>

        <div v-else class="source-list">
            <div v-for="(item, index) in sources" :key="index" class="source-card">
                <div class="source-meta">
                    <span class="source-file">{{ item.file }}</span>
                    <span v-if="item.score != null" class="source-score">{{ (item.score * 100).toFixed(0) }}%</span>
                </div>
                <p class="source-content">{{ item.content }}</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.sources-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fbfbfd;
}

.panel-title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    padding: 18px 20px 12px;
    margin: 0;
    border-bottom: 1px solid #f0f2f5;
}

.sources-empty {
    margin: auto;
    text-align: center;
    color: #909399;
    padding: 0 20px;
}

.sources-empty-icon {
    font-size: 36px;
    margin-bottom: 10px;
}

.sources-empty p {
    font-size: 14px;
    margin: 0 0 6px;
}

.sources-empty-sub {
    font-size: 12px;
    color: #c0c4cc;
}

.source-list {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
}

.source-card {
    background: #fff;
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 2px 10px rgba(99, 102, 241, 0.06);
    border: 1px solid #f0f2f5;
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
}

.source-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.14);
}

.source-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.source-file {
    font-size: 12px;
    color: #6366f1;
    font-weight: 600;
}

.source-score {
    font-size: 12px;
    color: #409eff;
    font-weight: 600;
}

.source-content {
    font-size: 13px;
    color: #606266;
    line-height: 1.6;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
