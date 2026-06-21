import { appLogDir } from '@tauri-apps/api/path'
import { mkdir, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs'

const LOG_FILE_NAME = 'pdf-brander.log'

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message
  }

  return String(error)
}

function formatLogLine(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: unknown): string {
  const timestamp = new Date().toISOString()
  const suffix = details === undefined ? '' : ` ${JSON.stringify(details)}`
  return `[${timestamp}] [${level}] ${message}${suffix}\n`
}

async function ensureLogDirectory(): Promise<string> {
  const dir = await appLogDir()
  await mkdir(dir, { recursive: true })
  return dir
}

export async function appendLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: unknown): Promise<void> {
  try {
    await ensureLogDirectory()
    await writeTextFile(
      LOG_FILE_NAME,
      formatLogLine(level, message, details),
      {
        append: true,
        create: true,
        baseDir: BaseDirectory.AppLog
      }
    )
  } catch {
    // Logging must never interfere with the app flow.
  }
}

export async function logError(message: string, error: unknown, details?: unknown): Promise<void> {
  await appendLog('ERROR', message, {
    ...((details && typeof details === 'object') ? details as Record<string, unknown> : { details }),
    error: serializeError(error)
  })
}

export async function logInfo(message: string, details?: unknown): Promise<void> {
  await appendLog('INFO', message, details)
}

export async function getLogDirectoryLocation(): Promise<string> {
  return ensureLogDirectory()
}

export async function getLogFileLocation(): Promise<string> {
  const dir = await ensureLogDirectory()
  return `${dir}/${LOG_FILE_NAME}`
}
