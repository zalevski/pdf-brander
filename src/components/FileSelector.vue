<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { FileStatus } from '../../shared/types'

type ListedInputFile = {
  path: string
  name: string
  status: FileStatus
}

const props = defineProps<{
  title: string
  valueLabel: string
  actionLabel: string
  clearLabel: string
  removeLabel?: string
  dropLabel: string
  stateLabel: string
  icon: string
  canClear: boolean
  stateColor?: 'neutral' | 'warning' | 'primary' | 'success' | 'error'
  isSelected?: boolean
  truncateStart?: boolean
  showDropZone?: boolean
  files?: ListedInputFile[]
  statusLabel?: (status: FileStatus) => string
  emptyTitle?: string
  emptyDescription?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'action'): void
  (event: 'clear'): void
  (event: 'drop', paths: string[]): void
  (event: 'remove-file', path: string): void
}>()

const isDragging = ref(false)
const dropZone = ref<HTMLElement | null>(null)
let unlistenDragDrop: (() => void) | null = null

function normalizePath(path: string): string {
  return path.trim().toLowerCase()
}

function isPointInsideDropZone(x: number, y: number): boolean {
  const element = dropZone.value
  if (!element) {
    return false
  }

  const rect = element.getBoundingClientRect()
  const scale = window.devicePixelRatio || 1

  return (
    x >= rect.left * scale &&
    x <= rect.right * scale &&
    y >= rect.top * scale &&
    y <= rect.bottom * scale
  )
}

function handleDragOver(event: DragEvent): void {
  if (props.disabled) {
    return
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }

  isDragging.value = true
}

function handleDragLeave(): void {
  if (props.disabled) {
    return
  }

  isDragging.value = false
}

function handleDrop(event: DragEvent): void {
  if (props.disabled) {
    return
  }

  isDragging.value = false
  event.dataTransfer?.clearData()
}

async function installDragDropListener(): Promise<void> {
  if (typeof window === 'undefined' || !dropZone.value) {
    return
  }

  const webview = getCurrentWebview()
  unlistenDragDrop = await webview.onDragDropEvent((event) => {
    if (props.disabled || event.payload.type !== 'drop' || !isPointInsideDropZone(event.payload.position.x, event.payload.position.y)) {
      return
    }

    const uniquePaths = Array.from(new Map(
      event.payload.paths.map((path) => [normalizePath(path), path])
    ).values())

    if (uniquePaths.length > 0) {
      emit('drop', uniquePaths)
    }
  })
}

onMounted(() => {
  void installDragDropListener()
})

onBeforeUnmount(() => {
  if (unlistenDragDrop) {
    unlistenDragDrop()
    unlistenDragDrop = null
  }
})
</script>

<template>
  <UCard
    class="workflow-card"
    :ui="{
      header: 'px-4 pt-4 pb-3 sm:px-5',
      body: 'px-4 pb-4 sm:px-5 workflow-card__body',
      footer: 'px-4 pb-4 pt-0 sm:px-5',
      base: 'overflow-hidden border border-default/70 bg-elevated/80 shadow-sm backdrop-blur'
    }"
  >
    <template #header>
      <div class="workflow-card__header">
        <div class="workflow-card__heading">
          <div class="workflow-card__title-row">
            <UIcon :name="props.icon" class="workflow-card__icon" />
            <h2>{{ props.title }}</h2>
          </div>
          <p v-if="props.files || !props.isSelected" class="workflow-card__value">{{ props.valueLabel }}</p>
        </div>

        <UBadge :color="props.stateColor ?? 'neutral'" variant="soft" class="workflow-card__badge">
          {{ props.stateLabel }}
        </UBadge>
      </div>
    </template>

    <div v-if="props.showDropZone !== false" class="workflow-card__drop-wrapper">
      <div
        ref="dropZone"
        class="workflow-card__drop"
        :class="{
          'workflow-card__drop--active': isDragging,
          'workflow-card__drop--selected': props.isSelected && !props.files
        }"
        @dragenter.prevent="handleDragOver"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <div class="workflow-card__drop-inner">
          <UIcon :name="props.icon" class="workflow-card__drop-icon" />
          <div class="workflow-card__drop-content">
            <p class="workflow-card__drop-label">
              {{ props.isSelected && !props.files ? props.stateLabel : props.dropLabel }}
            </p>
            <p
              v-if="props.isSelected && !props.files"
              :class="['workflow-card__drop-value', { 'workflow-card__drop-value--start': props.truncateStart }]"
            >
              {{ props.valueLabel }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="props.files" class="workflow-card__files">
      <UAlert
        v-if="props.files.length === 0 && props.emptyTitle && props.emptyDescription"
        :title="props.emptyTitle"
        :description="props.emptyDescription"
        icon="i-lucide-file-text"
        color="neutral"
        variant="soft"
      />

      <ul v-else class="workflow-card__list">
        <li v-for="file in props.files" :key="file.path" class="workflow-card__item">
          <span class="workflow-card__file-name">{{ file.name }}</span>
          <div class="workflow-card__item-actions">
            <UBadge :color="file.status === 'error' ? 'error' : file.status === 'done' ? 'success' : file.status === 'processing' ? 'primary' : 'neutral'" variant="soft">
              {{ props.statusLabel ? props.statusLabel(file.status) : file.status }}
            </UBadge>
            <UButton
              v-if="props.files.length > 1"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              class="workflow-card__remove"
              :aria-label="props.removeLabel ?? file.name"
              @click="emit('remove-file', file.path)"
            />
          </div>
        </li>
      </ul>
    </div>

    <template #footer>
      <div class="workflow-card__actions">
        <UButton
          :label="props.actionLabel"
          :icon="props.icon"
          color="primary"
          variant="solid"
          :disabled="props.disabled"
          class="workflow-card__button"
          @click="emit('action')"
        />
      </div>
    </template>
  </UCard>
</template>

<style scoped>
.workflow-card {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.workflow-card :deep(.workflow-card__body) {
  flex: 1 1 auto;
}

.workflow-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.workflow-card__heading {
  min-width: 0;
}

.workflow-card__title-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

h2 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.2;
  color: rgb(var(--ui-text-highlighted));
}

.workflow-card__icon {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: rgb(var(--ui-primary));
}

.workflow-card__value {
  margin: 0.45rem 0 0;
  color: rgb(var(--ui-text-muted));
  font-size: 0.9rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card__badge {
  flex-shrink: 0;
}

.workflow-card__drop {
  width: 100%;
  min-width: 0;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.28);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.workflow-card__drop--selected {
  border-style: solid;
  background: rgba(15, 23, 42, 0.18);
}

.workflow-card__drop-wrapper {
  min-width: 0;
  margin-top: 0.2rem;
}

.workflow-card__drop--active {
  border-color: rgba(129, 140, 248, 0.9);
  background: rgba(79, 70, 229, 0.12);
  transform: translateY(-1px);
}

.workflow-card__drop-inner {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  min-width: 0;
  padding: 1rem;
}

.workflow-card__drop-content {
  min-width: 0;
  flex: 1 1 auto;
}

.workflow-card__drop-icon {
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  color: rgb(var(--ui-primary));
}

.workflow-card__drop-label {
  margin: 0;
  color: rgb(var(--ui-text-default));
  font-weight: 600;
}

.workflow-card__drop-value {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0.2rem 0 0;
  color: rgb(var(--ui-text-muted));
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card__drop-value--start {
  direction: rtl;
  text-align: left;
  unicode-bidi: plaintext;
}

.workflow-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: auto;
  padding-top: 0.9rem;
}

.workflow-card__button {
  flex-shrink: 0;
}

.workflow-card__files {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.85rem;
  flex: 1 1 auto;
}

.workflow-card__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.workflow-card__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.workflow-card__item-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.workflow-card__file-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgb(var(--ui-text-default));
  font-weight: 600;
}

.workflow-card__remove {
  width: 1.9rem;
  height: 1.9rem;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.workflow-card__remove :deep(svg) {
  width: 0.85rem;
  height: 0.85rem;
}
</style>
