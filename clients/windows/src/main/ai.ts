export interface ScreenContext {
  activity_type: 'work' | 'entertainment' | 'communication' | 'browsing' | 'creative' | 'other'
  description:   string
  details?:      string
  apps_visible:  string[]
  is_idle:       boolean
}

const DESCRIBE_PROMPT = `
Look at this screenshot and respond with a JSON object (no markdown, just raw JSON) matching this schema:
{
  "activity_type": "work" | "entertainment" | "communication" | "browsing" | "creative" | "other",
  "description":   string,
  "details":       string,
  "apps_visible":  string[],
  "is_idle":       boolean
}
`.trim()

export async function describeScreen(
  imageBuffer: Buffer,
  apiKey: string,
  model?: string,
): Promise<ScreenContext | null> {
  if (!apiKey) return null
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: model ?? 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: 'image/png', data: imageBuffer.toString('base64') },
          },
          { type: 'text', text: DESCRIBE_PROMPT },
        ],
      }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return JSON.parse(text) as ScreenContext
  } catch (err) {
    console.warn('[ai] description failed:', (err as Error).message)
    return null
  }
}
