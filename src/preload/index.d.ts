import type { PersonalEditorApi } from './index'

declare global {
  interface Window {
    pe: PersonalEditorApi
  }
}

export {}
