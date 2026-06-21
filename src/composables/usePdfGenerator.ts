import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { desktopDir } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { generateLetterheadedPdfs } from '../lib/pdfProcessor'
import { appendLog, logError } from '../lib/logger'
import type {
  FileStatus,
  GeneratePdfsPayload,
  GeneratePdfsProgress,
  GeneratePdfsResult,
  SelectedDirectory,
  SelectedFile
} from '../../shared/types'

export interface ManagedInputFile extends SelectedFile {
  status: FileStatus
  errorCode?: string
}

export function usePdfGenerator() {
  const LETTERHEAD_KEY = 'pdf-brander-last-letterhead'
  const OUTPUT_DIR_KEY = 'pdf-brander-last-output-directory'

  const letterhead = ref<SelectedFile | null>(null)
  const inputFiles = ref<ManagedInputFile[]>([])
  const outputDirectory = ref<SelectedDirectory | null>(null)
  const isGenerating = ref(false)
  const summary = ref<GeneratePdfsResult | null>(null)
  const statusMessage = ref<string>('')
  const canGenerate = computed(() => Boolean(letterhead.value && inputFiles.value.length && outputDirectory.value && !isGenerating.value))

  function fileNameFromPath(filePath: string): string {
    const parts = filePath.split(/[/\\]/)
    return parts[parts.length - 1] || filePath
  }

  function normalizePath(filePath: string): string {
    return filePath.trim().toLowerCase()
  }

  function directoryNameFromPath(directoryPath: string): string {
    const parts = directoryPath.split(/[/\\]/)
    return parts[parts.length - 1] || directoryPath
  }

  function setLetterheadFromPath(filePath: string | null | undefined): void {
    if (!filePath) {
      letterhead.value = null
      return
    }

    letterhead.value = {
      path: filePath,
      name: fileNameFromPath(filePath)
    }
  }

  function setOutputDirectoryFromPath(directoryPath: string | null | undefined): void {
    if (!directoryPath) {
      outputDirectory.value = null
      return
    }

    outputDirectory.value = {
      path: directoryPath,
      name: directoryNameFromPath(directoryPath)
    }
  }

  function persistLetterhead(filePath: string | null): void {
    if (typeof window === 'undefined') {
      return
    }

    if (filePath) {
      localStorage.setItem(LETTERHEAD_KEY, filePath)
      return
    }

    localStorage.removeItem(LETTERHEAD_KEY)
  }

  function persistOutputDirectory(directoryPath: string | null): void {
    if (typeof window === 'undefined') {
      return
    }

    if (directoryPath) {
      localStorage.setItem(OUTPUT_DIR_KEY, directoryPath)
      return
    }

    localStorage.removeItem(OUTPUT_DIR_KEY)
  }

  async function initializeSelections(): Promise<void> {
    if (typeof window === 'undefined') {
      return
    }

    const storedLetterhead = localStorage.getItem(LETTERHEAD_KEY)
    const storedOutputDirectory = localStorage.getItem(OUTPUT_DIR_KEY)

    if (storedLetterhead) {
      setLetterheadFromPath(storedLetterhead)
    }

    if (storedOutputDirectory) {
      setOutputDirectoryFromPath(storedOutputDirectory)
      return
    }

    const desktop = await desktopDir()
    setOutputDirectoryFromPath(desktop)
  }

  function setInputFiles(files: SelectedFile[]): void {
    const uniqueFiles = Array.from(new Map(files.map((file) => [normalizePath(file.path), file])).values())

    inputFiles.value = uniqueFiles.map((file) => ({
      ...file,
      status: 'waiting'
    }))
    summary.value = null
    statusMessage.value = ''
  }

  function clearSelection(): void {
    letterhead.value = null
    inputFiles.value = []
    outputDirectory.value = null
    summary.value = null
    statusMessage.value = ''
    persistLetterhead(null)
    persistOutputDirectory(null)
  }

  function clearLetterhead(): void {
    letterhead.value = null
    summary.value = null
    statusMessage.value = ''
    persistLetterhead(null)
  }

  function clearInputs(): void {
    inputFiles.value = []
    summary.value = null
    statusMessage.value = ''
  }

  function removeInputFile(filePath: string): void {
    inputFiles.value = inputFiles.value.filter((file) => file.path !== filePath)
    summary.value = null
    statusMessage.value = ''
  }

  function clearOutputDirectory(): void {
    outputDirectory.value = null
    summary.value = null
    statusMessage.value = ''
    persistOutputDirectory(null)
  }

  function applyProgress(progress: GeneratePdfsProgress): void {
    if (!progress.inputPath) {
      if (progress.kind === 'all-finished') {
        isGenerating.value = false
      }
      return
    }

    const target = inputFiles.value.find((file) => file.path === progress.inputPath)
    if (!target) {
      return
    }

    if (progress.kind === 'file-started') {
      target.status = 'processing'
      target.errorCode = undefined
      return
    }

    if (progress.kind === 'file-finished') {
      target.status = 'done'
      target.errorCode = undefined
      return
    }

    if (progress.kind === 'file-error') {
      target.status = 'error'
      target.errorCode = progress.errorCode
    }
  }

  async function selectLetterhead(): Promise<void> {
    const selected = await open({
      title: 'Select letterhead PDF',
      multiple: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (typeof selected === 'string') {
      setLetterheadFromPath(selected)
      summary.value = null
      statusMessage.value = ''
      persistLetterhead(selected)
    }
  }

  async function selectInputs(): Promise<void> {
    const selected = await open({
      title: 'Select input PDFs',
      multiple: true,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (Array.isArray(selected) && selected.length > 0) {
      setInputFiles(selected.map((filePath) => ({
        path: filePath,
        name: fileNameFromPath(filePath)
      })))
    }
  }

  async function selectOutput(): Promise<void> {
    const selected = await open({
      title: 'Select output directory',
      directory: true,
      recursive: true,
      multiple: false,
      defaultPath: outputDirectory.value?.path ?? await desktopDir()
    })

    if (typeof selected === 'string') {
      setOutputDirectoryFromPath(selected)
      summary.value = null
      statusMessage.value = ''
      persistOutputDirectory(selected)
    }
  }

  function setLetterheadFromDrop(paths: string[]): void {
    const filePath = paths.find((path) => path.toLowerCase().endsWith('.pdf'))
    if (!filePath) {
      return
    }

    setLetterheadFromPath(filePath)
    persistLetterhead(filePath)
    summary.value = null
    statusMessage.value = ''
  }

  function setInputFilesFromDrop(paths: string[]): void {
    const inputPaths = Array.from(new Map(
      paths
        .filter((path) => path.toLowerCase().endsWith('.pdf'))
        .map((path) => [normalizePath(path), path])
    ).values())

    if (inputPaths.length === 0) {
      return
    }

    setInputFiles(inputPaths.map((path) => ({
      path,
      name: fileNameFromPath(path)
    })))
  }

  function setOutputDirectoryFromDrop(paths: string[]): void {
    const droppedPath = paths[0]
    if (!droppedPath || droppedPath.toLowerCase().endsWith('.pdf')) {
      return
    }

    setOutputDirectoryFromPath(droppedPath)
    persistOutputDirectory(droppedPath)
    summary.value = null
    statusMessage.value = ''
  }

  function collectPayload(): GeneratePdfsPayload | null {
    if (!letterhead.value || inputFiles.value.length === 0 || !outputDirectory.value) {
      return null
    }

    return {
      letterheadPath: letterhead.value.path,
      inputPdfPaths: inputFiles.value.map((file) => file.path),
      outputDirectory: outputDirectory.value.path
    }
  }

  async function generate(): Promise<GeneratePdfsResult | null> {
    const payload = collectPayload()
    if (!payload) {
      return null
    }

    void appendLog('INFO', 'generation-started', {
      inputs: payload.inputPdfPaths,
      outputDirectory: payload.outputDirectory,
      letterheadPath: payload.letterheadPath
    })

    isGenerating.value = true
    summary.value = null
    statusMessage.value = 'processing'
    inputFiles.value = inputFiles.value.map((file) => ({
      ...file,
      status: 'waiting',
      errorCode: undefined
    }))

    try {
      const result = await generateLetterheadedPdfs(payload, applyProgress)
      summary.value = result
      void appendLog('INFO', 'generation-finished', {
        successCount: result.successCount,
        failureCount: result.failureCount,
        outputDirectory: result.outputDirectory,
        errorCode: result.errorCode
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void logError('generation-failed', error, {
        inputCount: inputFiles.value.length,
        outputDirectory: outputDirectory.value?.path
      })
      summary.value = {
        successCount: 0,
        failureCount: inputFiles.value.length,
        fileResults: [],
        outputDirectory: outputDirectory.value?.path,
        errorCode: 'UNEXPECTED_PROCESSING_ERROR',
        errorMessage: message
      }
      return summary.value
    } finally {
      isGenerating.value = false
      statusMessage.value = ''
    }
  }

  async function openOutputDirectory(): Promise<void> {
    if (!outputDirectory.value) {
      return
    }

    await revealItemInDir(outputDirectory.value.path)
  }

  onMounted(() => {
    void initializeSelections()
  })

  onBeforeUnmount(() => {
    isGenerating.value = false
  })

  return {
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
    initializeSelections,
    setLetterheadFromDrop,
    setInputFilesFromDrop,
    setOutputDirectoryFromDrop,
    generate,
    openOutputDirectory
  }
}
