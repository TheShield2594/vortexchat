"use client"

import { useEffect, useState } from "react"
import { BadgeCheck, Shield, Star, Trash2, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { WelcomeAppConfig } from "@/components/settings/welcome-app-config"
import { GiveawayAppConfig } from "@/components/settings/giveaway-app-config"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface InstalledApp {
  id: string
  app_id: string
  install_scopes: string[]
  granted_permissions: string[]
  installed_at: string
  app_catalog?: {
    name: string
    slug: string
    trust_badge: "verified" | "partner" | "internal" | null
  }
}

interface DiscoverApp {
  id: string
  name: string
  category: string
  trust_badge: "verified" | "partner" | "internal" | null
  average_rating: number
  review_count: number
}

interface AppsTabProps {
  serverId: string
  canManageApps: boolean
}

async function readErrorMessage(res: Response) {
  try {
    const payload = await res.json()
    if (payload?.error) return String(payload.error)
  } catch {
    // fallback to text
  }

  try {
    const text = await res.text()
    if (text) return text
  } catch {
    // ignore
  }

  return `Request failed (${res.status})`
}

export function AppsTab({ serverId, canManageApps }: AppsTabProps) {
  const { toast } = useToast()
  const [installed, setInstalled] = useState<InstalledApp[]>([])
  const [market, setMarket] = useState<DiscoverApp[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAppId, setBusyAppId] = useState<string | null>(null)
  const [pendingUninstallId, setPendingUninstallId] = useState<string | null>(null)
  const [expandedAppSlug, setExpandedAppSlug] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const [installedRes, marketRes] = await Promise.all([
        fetch(`/api/servers/${serverId}/apps`),
        fetch(`/api/apps/discover`),
      ])

      if (!installedRes.ok) throw new Error(await readErrorMessage(installedRes))
      if (!marketRes.ok) throw new Error(await readErrorMessage(marketRes))

      setInstalled(await installedRes.json())
      setMarket(await marketRes.json())
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to load apps",
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [serverId])

  async function install(appId: string) {
    setBusyAppId(appId)
    try {
      const res = await fetch(`/api/servers/${serverId}/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      })
      if (!res.ok) throw new Error(await readErrorMessage(res))
      await refresh()
      toast({ title: "App installed" })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Install failed",
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setBusyAppId(null)
    }
  }

  async function confirmUninstall() {
    const appId = pendingUninstallId
    if (!appId) return
    setPendingUninstallId(null)
    setBusyAppId(appId)
    try {
      const res = await fetch(`/api/servers/${serverId}/apps?appId=${appId}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await readErrorMessage(res))
      await refresh()
      toast({ title: "App uninstalled" })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Uninstall failed",
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setBusyAppId(null)
    }
  }

  const pendingAppName = pendingUninstallId
    ? (installed.find((a) => a.app_id === pendingUninstallId)?.app_catalog?.name ?? pendingUninstallId)
    : null

  const installedIds = new Set(installed.map((app) => app.app_id))

  return (
    <>
      <AlertDialog open={!!pendingUninstallId} onOpenChange={(open) => { if (!open) setPendingUninstallId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall {pendingAppName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the app and revoke all its permissions from your server. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUninstall}
              className="motion-interactive"
              style={{ background: "var(--theme-danger)", color: "#fff" }}
            >
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--theme-text-bright)" }}>Installed Apps</h3>
          <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>Install apps with scoped permissions. Webhooks continue to work unchanged.</p>
        </div>

        {loading ? <p style={{ color: "var(--theme-text-muted)" }}>Loading apps…</p> : (
          <div className="grid gap-3">
            {installed.length === 0 && <p style={{ color: "var(--theme-text-muted)" }}>No apps installed on this server.</p>}
            {installed.map((entry) => {
              const slug = entry.app_catalog?.slug
              const hasConfig = slug === "welcome-guide" || slug === "giveaway-bot"
              const isExpanded = expandedAppSlug === slug
              return (
                <div key={entry.id} className="rounded border" style={{ borderColor: "var(--theme-surface-elevated)" }}>
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium" style={{ color: "var(--theme-text-bright)" }}>{entry.app_catalog?.name ?? entry.app_id}</p>
                      <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                        Scopes: {entry.install_scopes.join(", ")} · Permissions: {entry.granted_permissions.join(", ")}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {hasConfig && canManageApps && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Configure ${entry.app_catalog?.name ?? entry.app_id}`}
                          onClick={() => setExpandedAppSlug(isExpanded ? null : slug!)}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canManageApps || busyAppId === entry.app_id}
                        aria-label={`Uninstall ${entry.app_catalog?.name ?? entry.app_id}`}
                        onClick={() => setPendingUninstallId(entry.app_id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t px-3 py-4" style={{ borderColor: "var(--theme-surface-elevated)" }}>
                      {slug === "welcome-guide" && <WelcomeAppConfig serverId={serverId} />}
                      {slug === "giveaway-bot" && <GiveawayAppConfig serverId={serverId} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div>
          <h4 className="text-md font-semibold mb-2" style={{ color: "var(--theme-text-bright)" }}>Marketplace quick install</h4>
          <div className="grid gap-3">
            {market.slice(0, 6).map((app) => (
              <div key={app.id} className="rounded border p-3 flex items-center justify-between" style={{ borderColor: "var(--theme-surface-elevated)" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <p style={{ color: "var(--theme-text-bright)" }}>{app.name}</p>
                    {app.trust_badge && (
                      <BadgeCheck className="w-4 h-4" style={{ color: "var(--theme-success)" }} aria-label="Verified app" />
                    )}
                  </div>
                  <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                    <Shield className="w-3 h-3 inline mr-1" />{app.category} · <Star className="w-3 h-3 inline mr-1" />{app.average_rating.toFixed(1)} ({app.review_count})
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!canManageApps || installedIds.has(app.id) || busyAppId === app.id}
                  onClick={() => install(app.id)}
                >
                  {installedIds.has(app.id) ? "Installed" : "Install"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
