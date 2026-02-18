export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1b1e 0%, #2d2f36 50%, #1a1b1e 100%)' }}>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
