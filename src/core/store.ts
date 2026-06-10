import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

export interface Store {
  get<T>(collection: string, id: string): Promise<T | null>
  set<T>(collection: string, id: string, value: T): Promise<void>
  list<T>(collection: string, filter?: (item: T) => boolean): Promise<T[]>
  delete(collection: string, id: string): Promise<void>
  append<T>(collection: string, id: string, value: T): Promise<void>
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
    return `${this.basePath}/${collection}.json`
  }

  private async ensureDir(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
  }

  private async readCollection(collection: string): Promise<StoreData> {
    const cached = this.cache.get(collection)
    if (cached) return cached

    try {
      const raw = await readFile(this.filePath(collection), 'utf-8')
      const data = JSON.parse(raw) as StoreData
      this.cache.set(collection, data)
      return data
    } catch {
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
    this.writeLocks.set(collection, current.then(() => {}))
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

  async append<T>(
    collection: string,
    id: string,
    value: T,
  ): Promise<void> {
    await this.set(collection, id, value)
  }

  clearCache(): void {
    this.cache.clear()
  }
}
