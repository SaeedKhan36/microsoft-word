import Anthropic from '@anthropic-ai/sdk'
import { getSettings } from './store'

const PROMPT =
  'Transcribe the handwritten text in this image exactly as written. Keep the original line breaks. ' +
  'Output only the transcription, with no commentary. If a word is unreadable, write [?] in its place.'

/** Optional AI handwriting recognition. Only runs when the user has added their own API key. */
export async function transcribeImage(dataUrl: string): Promise<string> {
  const apiKey = getSettings().aiApiKey
  if (!apiKey) throw new Error('Add your Claude API key in File → Options to use AI recognition.')
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s)
  if (!m) throw new Error('Unsupported image format.')
  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: m[2] } },
            { type: 'text', text: PROMPT }
          ]
        }
      ]
    })
    if (response.stop_reason === 'refusal') throw new Error('The AI declined to read this image.')
    return response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Your Claude API key was rejected. Check it in File → Options.')
    if (err instanceof Anthropic.RateLimitError) throw new Error('The AI service is busy. Try again in a moment.')
    if (err instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach the AI service. Check your internet connection.")
    if (err instanceof Anthropic.APIError) throw new Error(`AI error ${err.status}: ${err.message}`)
    throw err
  }
}
