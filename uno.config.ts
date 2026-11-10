import { defineConfig, presetAttributify, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetAttributify()],
  theme: {
    colors: {
      ink: '#1f2328',
      muted: '#6b7280',
      line: '#e6e6e3',
      paper: '#f7f7f5',
      surface: '#ffffff',
      brand: '#2f6fed',
    },
  },
  shortcuts: {
    btn: 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-transparent cursor-pointer transition select-none disabled:opacity-50 disabled:cursor-not-allowed',
    'btn-primary': 'btn bg-brand text-white hover:opacity-90',
    'btn-ghost': 'btn bg-transparent text-ink hover:bg-black/5',
    'btn-outline': 'btn bg-surface text-ink border-line hover:bg-black/5',
    'btn-danger': 'btn bg-red-600 text-white hover:opacity-90',
    field: 'w-full px-2.5 py-1.5 rounded-md border border-line bg-surface text-sm text-ink outline-none focus:border-brand',
    card: 'bg-surface border border-line rounded-xl',
    'text-muted': 'text-muted',
  },
})
