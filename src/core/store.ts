import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

export interface Store {
  get<T>(collection: string, id: string): Promise<T | null>
  set<T>(collection: string, id: string, value: T): Promise<void>
  list<T>(collection: string, filter?: (item: T) => boolean): Promise<T[]>
  delete(collection: string, id: string): Promise<void>
  append<T>(collection: string, id: string, value: T): Promise<void>
  clearCache(): void
}

interface StoreData {
  [id: string]: unknown
}

export class JsonFileStore implements Store {
  private basePath: string
  private cache: Map<string, StoreData> = new Map()
  private writeLocks: Map<string, Promise<void>> = new Map()

  constructor(basePath: string) {
    this.basePath = basePath
  }

  private filePath(collection: string): string {
    const sanitized = collection.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${this.basePath}/${sanitized}.json`
  }

  private async ensureDir(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
  }

  private async readCollection(collection: string): Promise<StoreData> {
    try {
      const raw = await readFile(this.filePath(collection), 'utf-8')
      const data = JSON.parse(raw) as StoreData
      this.cache.set(collection, data)
      return data
    } catch {
      const cached = this.cache.get(collection)
      if (cached) return cached
      const empty: StoreData = {}
      this.cache.set(collection, empty)
      return empty
    }
  }

  private async writeCollection(collection: string, data: StoreData): Promise<void> {
    const path = this.filePath(collection)
    await this.ensureDir(path)
    const json = JSON.stringify(data, null, 2)
    await writeFile(path, json, 'utf-8')
    this.cache.set(collection, data)
  }

  private async withLock<T>(collection: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLocks.get(collection) ?? Promise.resolve()
    const current = prev.then(fn, fn)
    this.writeLocks.set(collection, current.then(() => {}, () => {}))
    return current
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const data = await this.readCollection(collection)
    const item = data[id]
    return item ? (item as T) : null
  }

  async set<T>(collection: string, id: string, value: T): Promise<void> {
    await this.withLock(collection, async () => {
      const data = await this.readCollection(collection)
      data[id] = value
      await this.writeCollection(collection, data)
    })
  }

  async list<T>(collection: string, filter?: (item: T) => boolean): Promise<T[]> {
    const data = await this.readCollection(collection)
    const items = Object.values(data) as T[]
    return filter ? items.filter(filter) : items
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.withLock(collection, async () => {
      const data = await this.readCollection(collection)
      delete data[id]
      await this.writeCollection(collection, data)
    })
  }

  async append<T>(collection: string, id: string, value: T): Promise<void> {
    await this.withLock(collection, async () => {
      const data = await this.readCollection(collection)
      const existing = data[id]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else if (existing === undefined || existing === null) {
        data[id] = [value]
      } else {
        data[id] = [existing, value]
      }
      await this.writeCollection(collection, data)
    })
  }

  clearCache(): void {
    this.cache.clear()
  }
}
