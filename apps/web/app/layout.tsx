import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"], variable: "--font-body" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" })

export const metadata: Metadata = {
  title: "VortexChat — Chat, Hang Out, Belong",
  description: "The chat platform for focused teams and creative communities",
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VortexChat",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#00e5ff",
}

/** Top-level HTML shell — applies Inter (body) + Space Grotesk (display/headings), dark theme, and global toast notifications. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans`} style={{ background: 'var(--theme-bg-primary)' }}>
        <a href="#main-content" className="skip-nav-link">Skip to main content</a>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
