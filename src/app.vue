<script setup lang="ts">
import { computed } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import FileSelector from './components/FileSelector.vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import ProcessingStatus from './components/ProcessingStatus.vue'
import SummaryCard from './components/SummaryCard.vue'
import { useI18n } from './composables/useI18n'
import { usePdfGenerator } from './composables/usePdfGenerator'
import { appendLog, getLogDirectoryLocation, logError } from './lib/logger'

const pdfGenerator = usePdfGenerator()
const { locale, setLocale, t } = await useI18n()
const colorMode = useColorMode()

if (colorMode.preference === 'system') {
  colorMode.preference = 'dark'
}

const {
  letterhead,
  inputFiles,
  outputDirectory,
  summary,
  statusMessage,
  isGenerating,
  canGenerate,
  selectLetterhead,
  selectInputs,
  selectOutput,
  clearSelection,
  clearLetterhead,
  clearInputs,
  removeInputFile,
  clearOutputDirectory,
  generate,
  setLetterheadFromDrop,
  setInputFilesFromDrop,
  setOutputDirectoryFromDrop,
  openOutputDirectory
} = pdfGenerator

const subtitle = computed(() => t('app.subtitle'))
const languageItems = computed(() => [
  { label: t('language.en'), value: 'en' },
  { label: t('language.pl'), value: 'pl' },
  { label: t('language.de'), value: 'de' }
])
const isDarkMode = computed(() => colorMode.preference !== 'light')
const iconTheme = computed(() => (isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon'))
const isDevMode = import.meta.dev

const letterheadStatus = computed(() => (letterhead.value ? t('states.selected') : t('states.missing')))
const outputStatus = computed(() => (outputDirectory.value ? t('states.selected') : t('states.missing')))
const letterheadStatusColor = computed(() => (letterhead.value ? 'success' : 'warning'))
const outputStatusColor = computed(() => (outputDirectory.value ? 'success' : 'warning'))
const inputStatusColor = computed(() => (inputFiles.value.length ? 'success' : 'warning'))
const inputDocumentsCount = computed(() => String(inputFiles.value.length))
const inputCountLabel = computed(() =>
  inputFiles.value.length ? t('messages.selectedFiles', { count: inputFiles.value.length }) : t('messages.nothingSelected')
)
const generationModeLabel = computed(() => t('summary.generationMode'))
const generationModeDescription = computed(() => t('summary.generationModeDescription'))
const sidebarStatusText = computed(() => {
  if (statusMessage.value === 'processing') {
    return t('messages.processing')
  }

  if (summary.value?.errorCode) {
    return t(`errors.${summary.value.errorCode}`)
  }

  if (summary.value) {
    if (summary.value.failureCount > 0) {
      return t('messages.generatedWithFailures', {
        success: summary.value.successCount,
        failure: summary.value.failureCount
      })
    }

    return t('messages.generatedSuccess', { success: summary.value.successCount })
  }

  if (!canGenerate.value) {
    return t('messages.selectAll')
  }

  return t('messages.ready')
})
const progressValue = computed(() => {
  if (summary.value) {
    return 100
  }

  if (!isGenerating.value || inputFiles.value.length === 0) {
    return 0
  }

  const completed = inputFiles.value.filter((file) => file.status === 'done' || file.status === 'error').length
  return Math.round((completed / inputFiles.value.length) * 100)
})

async function onGenerate(): Promise<void> {
  await generate()
}

async function onOpenOutputDirectory(): Promise<void> {
  try {
    await openOutputDirectory()
  } catch (error) {
    console.error(error)
    void logError('open-output-directory-failed', error)
  }
}

async function onOpenLogs(): Promise<void> {
  try {
    const logDirectory = await getLogDirectoryLocation()
    await revealItemInDir(logDirectory)
  } catch (error) {
    console.error('Failed to open log directory', error)
    void logError('open-log-directory-failed', error)
  }
}

async function onMinimizeWindow(): Promise<void> {
  try {
    await getCurrentWindow().minimize()
  } catch (error) {
    console.error('Failed to minimize window', error)
    void logError('window-minimize-failed', error)
  }
}

async function onToggleMaximizeWindow(): Promise<void> {
  try {
    await getCurrentWindow().toggleMaximize()
  } catch (error) {
    console.error('Failed to toggle maximize window', error)
    void logError('window-toggle-maximize-failed', error)
  }
}

async function onCloseWindow(): Promise<void> {
  try {
    await getCurrentWindow().close()
  } catch (error) {
    console.error('Failed to close window', error)
    void logError('window-close-failed', error)
  }
}

void appendLog('INFO', 'app-mounted')

function toggleTheme(): void {
  colorMode.preference = isDarkMode.value ? 'light' : 'dark'
}
</script>

<template>
  <UApp>
    <main class="shell" @dragover.prevent @drop.prevent>
      <div class="shell__glow shell__glow--a"></div>
      <div class="shell__glow shell__glow--b"></div>

      <div class="window-surface">
        <header class="topbar">
          <div class="topbar__title" data-tauri-drag-region>
            <h1>{{ t('app.title') }}</h1>
            <span class="topbar__subtitle">{{ subtitle }}</span>
          </div>

          <div class="topbar__drag-region" data-tauri-drag-region></div>

          <div class="topbar__actions">
            <UButton
              v-if="isDevMode"
              label="Open logs"
              icon="i-lucide-file-text"
              color="neutral"
              variant="soft"
              size="xs"
              class="logs-button"
              @click.stop="onOpenLogs"
            />

            <UTooltip :text="t('theme.toggle')">
              <UButton
                :icon="iconTheme"
                color="neutral"
                variant="soft"
                size="xs"
                class="theme-toggle"
                :aria-label="t('theme.toggle')"
                @click="toggleTheme"
              />
            </UTooltip>

            <LanguageSwitcher
              :locale="locale"
              :items="languageItems"
              :aria-label="t('language.label')"
              @update:locale="setLocale"
            />

            <div class="window-controls">
              <UTooltip :text="t('window.minimize')">
                <UButton
                  icon="i-lucide-minus"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="window-controls__button"
                  :aria-label="t('window.minimize')"
                  @click="onMinimizeWindow"
                />
              </UTooltip>
              <UTooltip :text="t('window.maximize')">
                <UButton
                  icon="i-lucide-square"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="window-controls__button"
                  :aria-label="t('window.maximize')"
                  @click="onToggleMaximizeWindow"
                />
              </UTooltip>
              <UTooltip :text="t('window.close')">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="window-controls__button"
                  :aria-label="t('window.close')"
                  @click="onCloseWindow"
                />
              </UTooltip>
            </div>
          </div>
        </header>

        <div class="content">
          <section class="workflow">
            <FileSelector
              :title="t('sections.letterhead')"
              :value-label="letterhead?.name ?? t('placeholders.noLetterhead')"
              :action-label="t('actions.selectLetterhead')"
              :clear-label="t('actions.clear')"
              :drop-label="t('drop.letterhead')"
              :state-label="letterheadStatus"
              :state-color="letterheadStatusColor"
              icon="i-lucide-file-text"
              :can-clear="Boolean(letterhead)"
              :is-selected="Boolean(letterhead)"
              :show-drop-zone="true"
              :disabled="isGenerating"
              @action="selectLetterhead"
              @clear="clearLetterhead"
              @drop="setLetterheadFromDrop"
            />

            <FileSelector
              :title="t('sections.output')"
              :value-label="outputDirectory?.path ?? t('placeholders.noOutput')"
              :action-label="t('actions.selectOutput')"
              :clear-label="t('actions.clear')"
              :drop-label="t('drop.output')"
              :state-label="outputStatus"
              :state-color="outputStatusColor"
              icon="i-lucide-folder-open"
              :can-clear="Boolean(outputDirectory)"
              :is-selected="Boolean(outputDirectory)"
              :truncate-start="true"
              :show-drop-zone="true"
              :disabled="isGenerating"
              @action="selectOutput"
              @clear="clearOutputDirectory"
              @drop="setOutputDirectoryFromDrop"
            />

            <FileSelector
              class="workflow__inputs"
              :title="t('sections.inputs')"
              :value-label="inputCountLabel"
              :action-label="t('actions.selectInputs')"
              :clear-label="t('actions.clear')"
              :drop-label="t('drop.inputs')"
              :state-label="inputFiles.length ? t('states.selected') : t('states.missing')"
              :state-color="inputStatusColor"
              icon="i-lucide-files"
              :can-clear="inputFiles.length > 0"
              :is-selected="false"
              :show-drop-zone="true"
              :remove-label="t('actions.removeFile')"
              :files="inputFiles"
              :status-label="(value) => t(`status.${value}`)"
              :empty-title="t('messages.inputFilesEmptyTitle')"
              :empty-description="t('messages.inputFilesEmptyDescription')"
              :disabled="isGenerating"
              @action="selectInputs"
              @clear="clearInputs"
              @drop="setInputFilesFromDrop"
              @remove-file="removeInputFile"
            />
          </section>

          <aside class="sidebar">
            <SummaryCard
              :title="t('sections.summary')"
              :letterhead-label="t('summary.letterhead')"
              :letterhead-status="letterheadStatus"
              :input-documents-label="t('summary.inputDocuments')"
              :input-documents-value="inputDocumentsCount"
              :output-label="t('summary.outputDirectory')"
              :output-status="outputStatus"
              :output-status-color="outputStatusColor"
              :generation-mode-label="generationModeLabel"
              :generation-mode-description="generationModeDescription"
              :letterhead-status-color="letterheadStatusColor"
            />

            <ProcessingStatus
              :title="t('sections.status')"
              :result="summary"
              :status-text="sidebarStatusText"
              :progress="progressValue"
              :can-open-output="Boolean(summary && summary.successCount > 0 && outputDirectory)"
              :open-output-label="t('actions.openOutput')"
              @open-output="onOpenOutputDirectory"
            />
          </aside>
        </div>

        <footer class="footer">
          <p class="privacy">{{ t('messages.privacy') }}</p>
          <div class="footer__actions">
            <UButton
              :label="t('actions.openOutput')"
              icon="i-lucide-folder-open"
              color="neutral"
              variant="soft"
              :disabled="!outputDirectory"
              class="footer__button"
              @click="onOpenOutputDirectory"
            />
            <UButton
              :label="t('actions.clear')"
              icon="i-lucide-eraser"
              color="neutral"
              variant="soft"
              :disabled="isGenerating"
              class="footer__button"
              @click="clearSelection"
            />
            <UButton
              :label="t('actions.generate')"
              icon="i-lucide-badge-check"
              color="primary"
              variant="solid"
              :disabled="!canGenerate"
              class="footer__button footer__button--primary"
              @click="onGenerate"
            />
          </div>
        </footer>
      </div>
    </main>
  </UApp>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  color: rgb(var(--ui-text-default));
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

:global(button) {
  font: inherit;
  white-space: nowrap;
}

.shell {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  padding: 0;
  background: var(--app-shell-bg);
}

.shell__glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(48px);
  opacity: 0.4;
  pointer-events: none;
}

.shell__glow--a {
  width: 280px;
  height: 280px;
  top: -90px;
  left: -80px;
  background: var(--app-shell-glow-a);
}

.shell__glow--b {
  width: 240px;
  height: 240px;
  right: -60px;
  bottom: -80px;
  background: var(--app-shell-glow-b);
}

.window-surface {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  max-height: 100vh;
  border: 1px solid var(--app-shell-surface-border);
  border-radius: 0;
  background: var(--app-shell-surface);
  backdrop-filter: blur(18px);
  padding: 0;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
  overflow: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
}

.window-surface::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.window-surface::-webkit-scrollbar-track {
  background: transparent;
}

.window-surface::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.window-surface::-webkit-scrollbar-thumb {
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: padding-box;
  background-color: rgba(148, 163, 184, 0.42);
}

.window-surface::-webkit-scrollbar-thumb:hover {
  background-color: rgba(148, 163, 184, 0.62);
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 12px 16px 10px;
  background: inherit;
  border-bottom: 1px solid var(--app-shell-surface-border);
}

.topbar__title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  cursor: default;
  user-select: none;
  /* pointer-events: none; */
}

.topbar__drag-region {
  flex: 1 1 auto;
  min-width: 1rem;
  align-self: stretch;
}

h1 {
  margin: 0;
  font-size: clamp(1.35rem, 2.4vw, 1.75rem);
  line-height: 1.05;
  color: rgb(var(--ui-text-highlighted));
}

.topbar__subtitle {
  color: rgb(var(--ui-text-muted));
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
  flex: 0 0 auto;
  cursor: default;
}

.topbar__title h1,
.topbar__subtitle {
  user-select: none;
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.window-controls__button {
  width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.window-controls__button :deep(.icon) {
  margin: 0;
  display: block;
}

.theme-toggle {
  width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.theme-toggle :deep(svg) {
  width: 0.95rem;
  height: 0.95rem;
}

.theme-toggle :deep(.icon) {
  margin: 0;
  display: block;
}

.content {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 0.95fr);
  gap: 1rem;
  align-items: start;
  padding: 18px;
}

.workflow {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
}

.workflow__inputs {
  grid-column: 1 / -1;
}

.sidebar {
  display: grid;
  gap: 1rem;
  position: sticky;
  top: 18px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin-top: 1rem;
  padding: 16px 18px 18px;
  background: inherit;
  border-top: 1px solid var(--app-shell-surface-border);
}

.privacy {
  margin: 0;
  color: rgb(var(--ui-text-muted));
  font-size: 0.92rem;
}

.footer__actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.footer__button {
  flex-shrink: 0;
}

@media (max-width: 1080px) {
  .content {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
  }
}

@media (max-width: 780px) {
  .window-surface {
    min-height: 100vh;
    border-radius: 0;
  }

  .topbar,
  .footer {
    grid-template-columns: 1fr;
    display: grid;
  }

  .topbar__actions,
  .footer__actions {
    justify-content: flex-start;
  }

  .topbar,
  .content,
  .footer {
    padding-left: 14px;
    padding-right: 14px;
  }

  .topbar {
    padding-top: 10px;
    padding-bottom: 8px;
  }

  .content {
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .footer {
    padding-bottom: 14px;
  }
}
</style>
