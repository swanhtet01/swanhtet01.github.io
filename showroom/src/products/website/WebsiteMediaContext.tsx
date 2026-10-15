import { createContext, useContext } from 'react'
import type { WebsiteMediaClient } from './website-media-client'

export const WebsiteMediaContext = createContext<{
  client: WebsiteMediaClient | null
  onEditingChange?: (editing: boolean) => void
}>({ client: null })
export const useWebsiteMedia = () => useContext(WebsiteMediaContext)
