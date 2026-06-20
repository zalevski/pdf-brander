import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { PDFDocument } from 'pdf-lib'
import { appendLog, logError } from './logger'
import type {
  FileGenerationResult,
  GeneratePdfsPayload,
  GeneratePdfsProgress,
  GeneratePdfsResult,
  ProcessingErrorCode
} from '../../shared/types'

type ProgressReporter = (progress: GeneratePdfsProgress) => void

function createResult(
  fileResults: FileGenerationResult[],
  outputDirectory?: string,
  errorCode?: ProcessingErrorCode,
  errorMessage?: string
): GeneratePdfsResult {
  const successCount = fileResults.filter((result) => result.status === 'done').length
  const failureCount = fileResults.length - successCount

  return {
    successCount,
    failureCount,
    fileResults,
    outputDirectory,
    errorCode,
    errorMessage
  }
}

function createFileError(inputPath: string, errorCode: ProcessingErrorCode, errorMessage: string): FileGenerationResult {
  return {
    inputPath,
    status: 'error',
    errorCode,
    errorMessage
  }
}

function getFileExtension(filePath: string): string {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath
  const lastDot = fileName.lastIndexOf('.')
  return lastDot === -1 ? '' : fileName.slice(lastDot + 1).toLowerCase()
}

function getOutputFileName(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').split('/').pop() || inputPath
}

function getOutputFilePath(inputPath: string, outputDirectory: string): string {
  const fileName = getOutputFileName(inputPath)
  const separator = outputDirectory.includes('\\') ? '\\' : '/'
  return outputDirectory.endsWith('/') || outputDirectory.endsWith('\\')
    ? `${outputDirectory}${fileName}`
    : `${outputDirectory}${separator}${fileName}`
}

function classifyPdfLoadError(error: unknown): { code: ProcessingErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes('encrypt') || lowerMessage.includes('password')) {
    return { code: 'UNSUPPORTED_ENCRYPTED_PDF', message }
  }

  if (
    lowerMessage.includes('invalid pdf') ||
    lowerMessage.includes('pdf header') ||
    lowerMessage.includes('xref') ||
    lowerMessage.includes('truncated') ||
    lowerMessage.includes('unexpected end')
  ) {
    return { code: 'DAMAGED_PDF_FILE', message }
  }

  return { code: 'INVALID_PDF_FILE', message }
}

async function loadPdf(filePath: string, kind: 'input' | 'letterhead'): Promise<PDFDocument> {
  let bytes: Uint8Array

  try {
    bytes = await readFile(filePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${kind}:FAILED_TO_READ_FILE:${message}`)
  }

  try {
    return await PDFDocument.load(bytes)
  } catch (error) {
    const classified = classifyPdfLoadError(error)
    void logError('pdf-load-failed', error, { filePath, kind, classified })
    throw new Error(`${kind}:${classified.code}:${classified.message}`)
  }
}

async function composeSinglePdf(
  inputPath: string,
  outputDirectory: string,
  letterheadDoc: PDFDocument,
  reporter: ProgressReporter,
  index: number,
  total: number
): Promise<FileGenerationResult> {
  reporter({
    kind: 'file-started',
    index,
    total,
    inputPath
  })

  try {
    const inputDoc = await loadPdf(inputPath, 'input')
    if (inputDoc.getPageCount() === 0) {
      const errorCode: ProcessingErrorCode = 'INVALID_PDF_FILE'
      const errorMessage = 'PDF contains no pages'
      reporter({
        kind: 'file-error',
        index,
        total,
        inputPath,
        errorCode,
        errorMessage
      })
      return createFileError(inputPath, errorCode, errorMessage)
    }

    const outputDoc = await PDFDocument.create()
    const sourcePages = inputDoc.getPages()
    const letterheadPages = letterheadDoc.getPages()

    if (letterheadPages.length === 0) {
      const errorCode: ProcessingErrorCode = 'INVALID_PDF_FILE'
      const errorMessage = 'Letterhead PDF contains no pages'
      reporter({
        kind: 'file-error',
        index,
        total,
        inputPath,
        errorCode,
        errorMessage
      })
      return createFileError(inputPath, errorCode, errorMessage)
    }

    const embeddedLetterheadPages = new Map<number, Awaited<ReturnType<PDFDocument['embedPage']>>>()

    for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
      const sourcePage = sourcePages[pageIndex]!
      const pageWidth = sourcePage.getWidth()
      const pageHeight = sourcePage.getHeight()
      const outputPage = outputDoc.addPage([pageWidth, pageHeight])
      const letterheadIndex = pageIndex === 0 || letterheadPages.length === 1 ? 0 : 1
      const letterheadSourcePage = letterheadPages[Math.min(letterheadIndex, letterheadPages.length - 1)]!

      let embeddedLetterhead = embeddedLetterheadPages.get(letterheadIndex)
      if (!embeddedLetterhead) {
        embeddedLetterhead = await outputDoc.embedPage(letterheadSourcePage)
        embeddedLetterheadPages.set(letterheadIndex, embeddedLetterhead)
      }

      const embeddedInputPage = await outputDoc.embedPage(sourcePage)
      outputPage.drawPage(embeddedInputPage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight
      })

      const letterheadScale = Math.min(pageWidth / embeddedLetterhead.width, pageHeight / embeddedLetterhead.height)
      const letterheadBounds = {
        width: embeddedLetterhead.width * letterheadScale,
        height: embeddedLetterhead.height * letterheadScale
      }
      outputPage.drawPage(embeddedLetterhead, {
        x: (pageWidth - letterheadBounds.width) / 2,
        y: (pageHeight - letterheadBounds.height) / 2,
        width: letterheadBounds.width,
        height: letterheadBounds.height
      })
    }

    const outputBytes = await outputDoc.save({
      useObjectStreams: true,
      addDefaultPage: false
    })
    const outputPath = getOutputFilePath(inputPath, outputDirectory)

    try {
      await writeFile(outputPath, outputBytes)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void logError('pdf-write-failed', error, { inputPath, outputPath })
      const result = createFileError(inputPath, 'FAILED_TO_WRITE_FILE', message)
      reporter({
        kind: 'file-error',
        index,
        total,
        inputPath,
        errorCode: 'FAILED_TO_WRITE_FILE',
        errorMessage: message
      })
      return result
    }

    const result: FileGenerationResult = {
      inputPath,
      outputPath,
      status: 'done'
    }

    reporter({
      kind: 'file-finished',
      index,
      total,
      inputPath,
      outputPath
    })

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    void logError('compose-single-pdf-failed', error, { inputPath, outputDirectory })
    const [scope, code, ...rest] = message.split(':')
    const errorMessage = rest.join(':') || message

    let errorCode: ProcessingErrorCode = 'UNEXPECTED_PROCESSING_ERROR'
    if (scope === 'input' && code === 'FAILED_TO_READ_FILE') {
      errorCode = 'FAILED_TO_READ_FILE'
    }
    if (scope === 'input' && code === 'INVALID_PDF_FILE') {
      errorCode = 'INVALID_PDF_FILE'
    }
    if (scope === 'input' && code === 'DAMAGED_PDF_FILE') {
      errorCode = 'DAMAGED_PDF_FILE'
    }
    if (scope === 'input' && code === 'UNSUPPORTED_ENCRYPTED_PDF') {
      errorCode = 'UNSUPPORTED_ENCRYPTED_PDF'
    }

    const result = createFileError(inputPath, errorCode, errorMessage)

    reporter({
      kind: 'file-error',
      index,
      total,
      inputPath,
      errorCode,
      errorMessage
    })

    return result
  }
}

export async function generateLetterheadedPdfs(payload: GeneratePdfsPayload, reporter: ProgressReporter): Promise<GeneratePdfsResult> {
  if (!payload.letterheadPath) {
    void appendLog('WARN', 'generation-aborted-no-letterhead')
    return createResult([], undefined, 'NO_LETTERHEAD_SELECTED')
  }

  if (!payload.inputPdfPaths.length) {
    void appendLog('WARN', 'generation-aborted-no-inputs')
    return createResult([], undefined, 'NO_INPUT_PDFS_SELECTED')
  }

  if (!payload.outputDirectory) {
    void appendLog('WARN', 'generation-aborted-no-output-directory')
    return createResult([], undefined, 'NO_OUTPUT_DIRECTORY_SELECTED')
  }

  const outputDirectory = payload.outputDirectory
  const fileResults: FileGenerationResult[] = []

  let letterheadDoc: PDFDocument
  try {
    letterheadDoc = await loadPdf(payload.letterheadPath, 'letterhead')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    void logError('letterhead-load-failed', error, { letterheadPath: payload.letterheadPath })
    const [, code, ...rest] = message.split(':')
    const errorCode = (code as ProcessingErrorCode) || 'UNEXPECTED_PROCESSING_ERROR'
    const errorMessage = rest.join(':') || message

    for (let index = 0; index < payload.inputPdfPaths.length; index += 1) {
      const inputPath = payload.inputPdfPaths[index]!
      fileResults.push(createFileError(inputPath, errorCode, errorMessage))
      reporter({
        kind: 'file-error',
        index,
        total: payload.inputPdfPaths.length,
        inputPath,
        errorCode,
        errorMessage
      })
    }

    reporter({
      kind: 'all-finished',
      index: payload.inputPdfPaths.length,
      total: payload.inputPdfPaths.length
    })

    return createResult(fileResults, outputDirectory)
  }

  if (letterheadDoc.getPageCount() === 0) {
    void appendLog('ERROR', 'letterhead-has-no-pages', { letterheadPath: payload.letterheadPath })
    for (let index = 0; index < payload.inputPdfPaths.length; index += 1) {
      const inputPath = payload.inputPdfPaths[index]!
      const errorCode: ProcessingErrorCode = 'INVALID_PDF_FILE'
      const errorMessage = 'Letterhead PDF contains no pages'
      fileResults.push(createFileError(inputPath, errorCode, errorMessage))
      reporter({
        kind: 'file-error',
        index,
        total: payload.inputPdfPaths.length,
        inputPath,
        errorCode,
        errorMessage
      })
    }

    reporter({
      kind: 'all-finished',
      index: payload.inputPdfPaths.length,
      total: payload.inputPdfPaths.length
    })

    return createResult(fileResults, outputDirectory)
  }

  for (let index = 0; index < payload.inputPdfPaths.length; index += 1) {
    const inputPath = payload.inputPdfPaths[index]!
    const result = await composeSinglePdf(
      inputPath,
      outputDirectory,
      letterheadDoc,
      reporter,
      index,
      payload.inputPdfPaths.length
    )
    fileResults.push(result)
  }

  reporter({
    kind: 'all-finished',
    index: payload.inputPdfPaths.length,
    total: payload.inputPdfPaths.length
  })

  void appendLog('INFO', 'generation-complete', {
    successCount: fileResults.filter((result) => result.status === 'done').length,
    failureCount: fileResults.filter((result) => result.status === 'error').length
  })

  return createResult(fileResults, outputDirectory)
}
