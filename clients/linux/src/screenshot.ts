export type ScreenshotBuffer = Buffer

/**
 * Capture the primary monitor as PNG.
 * Returns null when the optional `screenshot-desktop` package is not installed.
 * Install: npm install screenshot-desktop
 */
export async function captureScreen(): Promise<ScreenshotBuffer | null> {
  try {
    const screenshot = (await import('screenshot-desktop')).default
    return (await screenshot({ format: 'png' })) as Buffer
  } catch {
    return null
  }
}
