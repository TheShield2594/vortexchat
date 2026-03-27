interface NavigatorUAData {
  platform?: string
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData
  }

  // React <19 does not include `inert` in HTMLAttributes
  namespace React {
    interface HTMLAttributes<T> {
      inert?: string
    }
  }
}

export {}
