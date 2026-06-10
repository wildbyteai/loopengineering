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

export interface LLMUsage {
  input_tokens: number
  output_tokens: number
}

export interface LLMResponse {
  text: string
  usage: LLMUsage
}

export interface LLMProvider {
  chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse>
  chatText(messages: Message[], options?: LLMOptions): Promise<string>
  chatJSON<T>(messages: Message[], schema: ZodSchema<T>, options?: LLMOptions): Promise<T>
}

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic
  private defaultModel: string

  constructor(config: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.defaultModel = config.model ?? 'claude-sonnet-4-6'
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
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
    return {
      text: block.text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    }
  }

  async chatText(messages: Message[], options?: LLMOptions): Promise<string> {
    const resp = await this.chat(messages, options)
    return resp.text
  }

  async chatJSON<T>(messages: Message[], schema: ZodSchema<T>, options?: LLMOptions): Promise<T> {
    const resp = await this.chat(messages, {
      ...options,
      system: (options?.system ?? '') + '\n\nRespond with valid JSON only. No markdown fences.',
    })

    let jsonStr = resp.text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)
    return schema.parse(parsed)
  }
}

type MockResponseFn = (messages: Message[], options?: LLMOptions) => string

export class MockProvider implements LLMProvider {
  private responses: MockResponseFn[]
  private callIndex = 0

  constructor(responses: MockResponseFn[]) {
    this.responses = responses
  }

  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const fn = this.responses[this.callIndex % this.responses.length]
    this.callIndex++
    const text = fn(messages, options)
    return {
      text,
      usage: { input_tokens: 100, output_tokens: 50 },
    }
  }

  async chatText(messages: Message[], options?: LLMOptions): Promise<string> {
    const resp = await this.chat(messages, options)
    return resp.text
  }

  async chatJSON<T>(messages: Message[], schema: ZodSchema<T>, options?: LLMOptions): Promise<T> {
    const resp = await this.chat(messages, options)
    const parsed = JSON.parse(resp.text)
    return schema.parse(parsed)
  }
}
