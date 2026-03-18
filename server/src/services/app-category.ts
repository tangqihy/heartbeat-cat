import { readFileSync } from 'fs'
import path from 'path'

export type AppCategory = 'office' | 'devtool' | 'game' | 'browser' | 'chat'
export type ResourceType = 'order_crystal' | 'creation_shard' | 'passion_spark' | 'info_fragment' | 'social_spark'

export interface CategoryMeta {
  name: string
  resource: ResourceType
  resource_name: string
  icon: string
  color: string
}

interface AppCategoriesConfig {
  categories: Record<AppCategory, CategoryMeta>
  mappings: Record<string, AppCategory>
  ai_activity_fallback: Record<string, AppCategory>
}

const configPath = path.resolve(__dirname, '../../data/app-categories.json')
const config: AppCategoriesConfig = JSON.parse(readFileSync(configPath, 'utf-8'))

const mappingEntries = Object.entries(config.mappings)

export function categorizeApp(
  appName: string,
  aiActivityType?: string | null,
): AppCategory | null {
  const key = (appName || '').toLowerCase().trim()
  if (!key || key === 'screen locked' || key === 'lock screen' || key === 'unknown') return null

  if (config.mappings[key]) return config.mappings[key]

  for (const [pattern, category] of mappingEntries) {
    if (key.startsWith(pattern) || key.includes(pattern)) return category
  }

  if (aiActivityType && config.ai_activity_fallback[aiActivityType]) {
    return config.ai_activity_fallback[aiActivityType]
  }

  return null
}

export function getCategoryMeta(category: AppCategory): CategoryMeta {
  return config.categories[category]
}

export function getResourceType(category: AppCategory): ResourceType {
  return config.categories[category].resource
}

export function getAllCategories(): Record<AppCategory, CategoryMeta> {
  return config.categories
}

export const ALL_RESOURCE_TYPES: ResourceType[] = [
  'order_crystal', 'creation_shard', 'passion_spark', 'info_fragment', 'social_spark',
]

export const CATEGORY_TO_RESOURCE: Record<AppCategory, ResourceType> = {
  office: 'order_crystal',
  devtool: 'creation_shard',
  game: 'passion_spark',
  browser: 'info_fragment',
  chat: 'social_spark',
}

export function getFullConfig(): AppCategoriesConfig {
  return config
}
