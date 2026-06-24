declare module 'posthog-js' {
  type EventPayload = Record<string, unknown> | undefined

  const posthog: {
    init: (apiKey: string, options?: Record<string, unknown>) => void
    capture: (event: string, properties?: EventPayload) => void
    identify: (userId: string, properties?: EventPayload) => void
  }

  export default posthog
}
