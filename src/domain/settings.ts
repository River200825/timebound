export interface AiSettings {
  preset: string
  baseURL: string
  apiKey: string
  model: string
  temperature: number
}

export interface ReminderSettings {
  offsets: number[]
  defaultDueTime: string
  quietEnabled: boolean
  quietStart: string
  quietEnd: string
  browser: boolean
  inApp: boolean
  wecom: boolean
  wecomWebhook: string
}

export interface CustomSkill {
  id: string
  name: string
  prompt: string
  createdAt: string
}

export interface SkillsSettings {
  /** builtin skill id → enabled；缺项视为启用（decompose 始终启用） */
  builtin: Record<string, boolean>
  custom: CustomSkill[]
}

export interface AppSettings {
  ai: AiSettings
  reminder: ReminderSettings
  skills: SkillsSettings
  weekStartsOn: 0 | 1
  repeatSpanning: boolean
  theme: 'light' | 'dark'
  onboardingDone: boolean
}

export const AI_PRESETS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    browserDirect: true,
    note: '浏览器可直连 DeepSeek API',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    browserDirect: true,
    note: '浏览器可直连 api.openai.com',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM（免费，推荐）',
    baseURL: '/api/zhipu',
    model: 'glm-4-flash-250414',
    browserDirect: true,
    note: '已内置同源代理转发，无须额外配置，开箱即用',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseURL: '/api/qwen/v1',
    model: 'qwen-plus',
    browserDirect: true,
    note: '已内置同源代理转发，无须额外配置，开箱即用',
  },
  {
    id: 'moonshot',
    name: 'Kimi',
    baseURL: '/api/kimi',
    model: 'moonshot-v1-8k',
    browserDirect: true,
    note: '已内置同源代理转发，无须额外配置，开箱即用',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseURL: '',
    model: '',
    browserDirect: false,
    note: '视服务商是否返回 Access-Control-Allow-Origin 而定；不支持则需配置代理（见 README「同源代理」）',
  },
]

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    preset: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    temperature: 0.2,
  },
  reminder: {
    offsets: [1440, 60, 15],
    defaultDueTime: '18:00',
    quietEnabled: false,
    quietStart: '22:00',
    quietEnd: '08:00',
    browser: true,
    inApp: true,
    wecom: false,
    wecomWebhook: '',
  },
  skills: {
    builtin: {},
    custom: [],
  },
  weekStartsOn: 1,
  repeatSpanning: false,
  theme: 'light',
  onboardingDone: false,
}

export function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    ai: { ...DEFAULT_SETTINGS.ai, ...(raw?.ai ?? {}) },
    reminder: { ...DEFAULT_SETTINGS.reminder, ...(raw?.reminder ?? {}) },
    skills: {
      builtin: { ...DEFAULT_SETTINGS.skills.builtin, ...(raw?.skills?.builtin ?? {}) },
      custom: raw?.skills?.custom ?? DEFAULT_SETTINGS.skills.custom,
    },
  }
}
