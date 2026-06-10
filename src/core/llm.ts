import Anthropic from '@anthropic-ai/sdk'
import type { ZodSchema } from 'zod'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  system?: string
}

export interface LLMProvider {
  chat(messages: Message[], options?: LLMOptions): Promise<string>
  chatJSON<T>(messages: Message[], schema: ZodSchema<T>, options?: LLMOptions): Promise<T>
}

// ============================================================
// ClaudeProvider — Anthropic SDK
// ============================================================
export class ClaudeProvider implements LLMProvider {
  private client: Anthropic
  private defaultModel: string

  constructor(config: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.defaultModel = config.model ?? 'claude-sonnet-4-6'
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<string> {
    const system = options?.system
    const response = await this.client.messages.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.max_tokens ?? 4096,
      temperature: options?.temperature ?? 0,
      ...(system ? { system } : {}),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const block = response.content[0]
    if (block?.type !== 'text') {
      throw new Error(`Unexpected response type: ${block?.type}`)
    }
    return block.text
  }

  async chatJSON<T>(messages: Message[], schema: ZodSchema<T>, options?: LLMOptions): Promise<T> {
    const raw = await this.chat(messages, {
      ...options,
      system: (options?.system ?? '') + '\n\nYou must respond with valid JSON only. No markdown fences, no explanation, just the JSON object.',
    })

    // Extract JSON from potential markdown fences
    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)
    return schema.parse(parsed)
  }
}

// ============================================================
// MockProvider — 用于测试
// ============================================================
type MockResponseFn = (messages: Message[], options?: LLMOptions) => string

export class MockProvider implements LLMProvider {
  private responses: MockResponseFn[]

  constructor(responses: MockResponseFn[]) {
    this.responses = responses
  }

  private callIndex = 0

  async chat(messages: Message[], options?: LLMOptions): Promise<string> {
    const fn = this.responses[this.callIndex % this.responses.length]
    this.callIndex++
    return fn(messages, options)
  }

  async chatJSON<T>(messages: Message[], schema: ZodSchema<T>, options?: LLMOptions): Promise<T> {
    const raw = await this.chat(messages, options)
    const parsed = JSON.parse(raw)
    return schema.parse(parsed)
  }
}
