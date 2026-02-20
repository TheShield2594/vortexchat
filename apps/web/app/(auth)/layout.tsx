export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a1b1e] via-[#2d2f36] to-[#1a1b1e]">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
