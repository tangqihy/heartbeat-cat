/**
 * AI screen description — the "observe" step of the agent loop.
 * Activated automatically when ANTHROPIC_API_KEY is set in .env.
 *
 * Install: npm install @anthropic-ai/sdk screenshot-desktop
 */

export interface ScreenContext {
  activity_type: 'work' | 'entertainment' | 'communication' | 'browsing' | 'creative' | 'other'
  description:   string
  details?:      string
  apps_visible:  string[]
  is_idle:       boolean
}

const DESCRIBE_PROMPT = `
Look at this screenshot and respond with a JSON object (no markdown, just raw JSON):
{
  "activity_type": "work" | "entertainment" | "communication" | "browsing" | "creative" | "other",
  "description":   string,
  "details":       string,
  "apps_visible":  string[],
  "is_idle":       boolean
}
`.trim()

export async function describeScreen(imageBuffer: Buffer): Promise<ScreenContext | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey })
    const model     = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001'

    const response = await client.messages.create({
      model,
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
