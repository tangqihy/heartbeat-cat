export type ScreenshotBuffer = Buffer

export async function captureScreen(): Promise<ScreenshotBuffer | null> {
  try {
    const screenshot = (await import('screenshot-desktop')).default
    return (await screenshot({ format: 'png' })) as Buffer
  } catch {
    return null
  }
}
