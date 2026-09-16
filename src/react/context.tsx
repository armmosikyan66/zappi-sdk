import { createContext, useContext, type ReactNode } from 'react'
import type { ZappiClient } from '../client/zappi-client'

/**
 * React context that provides a {@link ZappiClient} to the SDK hooks. The
 * consumer (typically the Next.js app root) constructs one client and wraps
 * the tree. Hooks read the client from context, so the same SDK works in the
 * BFF (server) and the browser.
 *
 * No `'use client'` directive is forced on the package — the consumer opts in
 * by importing from `@zappi/sdk/react` and marking their own component
 * `'use client'` where appropriate. This file is the only one that needs
 * React.
 */
const ZappiClientContext = createContext<ZappiClient | null>(null)

export interface ZappiClientProviderProps {
  client: ZappiClient
  children: ReactNode
}

/** Provide a {@link ZappiClient} to all SDK hooks in the subtree. */
export function ZappiClientProvider({ client, children }: ZappiClientProviderProps) {
  return (
    <ZappiClientContext.Provider value={client}>
      {children}
    </ZappiClientContext.Provider>
  )
}

/** Read the {@link ZappiClient} from context. Throws if missing. */
export function useZappiClient(): ZappiClient {
  const client = useContext(ZappiClientContext)
  if (!client) {
    throw new Error(
      'useZappiClient: no ZappiClient found in context. Wrap your tree in <ZappiClientProvider>.',
    )
  }
  return client
}
