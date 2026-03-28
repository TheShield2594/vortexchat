"use client"

import { lazy, Suspense } from "react"
import { Activity, BookOpen, Eye, Flag, Heart, Palette, Shield, ShieldCheck, Zap } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AutoModTab, EmojisTab, ModerationTab, ScreeningTab, WebhooksTab } from "@/components/modals/server-settings-modal"

// Lazy-load heavy tab components that aren't needed on initial render
const RoleManager = lazy(() => import("@/components/roles/role-manager").then((m) => ({ default: m.RoleManager })))
const TemplateManager = lazy(() => import("@/components/modals/template-manager").then((m) => ({ default: m.TemplateManager })))
const AppsTab = lazy(() => import("@/components/settings/apps-tab").then((m) => ({ default: m.AppsTab })))
const ReportsTab = lazy(() => import("@/components/settings/reports-tab").then((m) => ({ default: m.ReportsTab })))
const AdminActivityTimeline = lazy(() => import("@/components/admin/admin-activity-timeline").then((m) => ({ default: m.AdminActivityTimeline })))
const PermissionSimulator = lazy(() => import("@/components/admin/permission-simulator").then((m) => ({ default: m.PermissionSimulator })))
const AuditLogPage = lazy(() => import("@/components/admin/audit-log-page").then((m) => ({ default: m.AuditLogPage })))
const CommunityHealthDashboard = lazy(() => import("@/components/admin/community-health-dashboard").then((m) => ({ default: m.CommunityHealthDashboard })))
const ServerRecommendedTheme = lazy(() => import("@/components/settings/theme-identity-section").then((m) => ({ default: m.ServerRecommendedTheme })))

interface Channel {
  id: string
  name: string
}

interface Props {
  serverId: string
  serverName: string
  isOwner: boolean
  channels: Channel[]
}

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-pulse text-sm" style={{ color: "var(--theme-text-muted)" }}>Loading...</div>
    </div>
  )
}

export function ServerSettingsAdmin({ serverId, serverName, isOwner, channels }: Props) {
  return (
    <main className="flex-1 overflow-y-auto p-6" style={{ background: "var(--theme-bg-tertiary)" }}>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-white">Server Settings</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted)" }}>{serverName}</p>

        <Tabs defaultValue="roles" className="mt-6 flex gap-6">
          <div className="w-56 flex-shrink-0">
            <TabsList className="flex h-auto w-full flex-col gap-1 bg-transparent p-0">
              <TabsTrigger value="roles" className="w-full justify-start">Roles</TabsTrigger>
              <TabsTrigger value="emojis" className="w-full justify-start">Emoji</TabsTrigger>
              <TabsTrigger value="webhooks" className="w-full justify-start">Webhooks</TabsTrigger>
              <TabsTrigger value="apps" className="w-full justify-start">Apps</TabsTrigger>
              <div className="mt-2 mb-1 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                Moderation
              </div>
              <TabsTrigger value="moderation" className="w-full justify-start">
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="screening" className="w-full justify-start">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Screening
              </TabsTrigger>
              <TabsTrigger value="automod" className="w-full justify-start">
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                AutoMod
              </TabsTrigger>
              <TabsTrigger value="reports" className="w-full justify-start">
                <Flag className="mr-1.5 h-3.5 w-3.5" />
                Reports
              </TabsTrigger>
              <TabsTrigger value="templates" className="w-full justify-start">Templates</TabsTrigger>
              <div className="mt-2 mb-1 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                Safety Tools
              </div>
              <TabsTrigger value="audit-log" className="w-full justify-start">
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                Audit Log
              </TabsTrigger>
              <TabsTrigger value="admin-activity" className="w-full justify-start">
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                Activity Log
              </TabsTrigger>
              <TabsTrigger value="permission-simulator" className="w-full justify-start">
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Perm Sandbox
              </TabsTrigger>
              <div className="mt-2 mb-1 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                Insights
              </div>
              <TabsTrigger value="community-health" className="w-full justify-start">
                <Heart className="mr-1.5 h-3.5 w-3.5" />
                Community Health
              </TabsTrigger>
              <TabsTrigger value="server-theme" className="w-full justify-start">
                <Palette className="mr-1.5 h-3.5 w-3.5" />
                Server Theme
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-w-0 flex-1 rounded-md p-4" style={{ background: "var(--theme-bg-primary)" }}>
            <Suspense fallback={<TabLoadingFallback />}>
              <TabsContent value="roles" className="mt-0">
                <RoleManager serverId={serverId} isOwner={isOwner} />
              </TabsContent>
              <TabsContent value="emojis" className="mt-0">
                <EmojisTab serverId={serverId} />
              </TabsContent>
              <TabsContent value="webhooks" className="mt-0">
                <WebhooksTab serverId={serverId} channels={channels} open />
              </TabsContent>
              <TabsContent value="apps" className="mt-0">
                <AppsTab serverId={serverId} canManageApps={isOwner} />
              </TabsContent>
              <TabsContent value="moderation" className="mt-0">
                <ModerationTab serverId={serverId} open />
              </TabsContent>
              <TabsContent value="screening" className="mt-0">
                <ScreeningTab serverId={serverId} open />
              </TabsContent>
              <TabsContent value="automod" className="mt-0">
                <AutoModTab serverId={serverId} channels={channels} open />
              </TabsContent>
              <TabsContent value="reports" className="mt-0">
                <ReportsTab serverId={serverId} />
              </TabsContent>
              <TabsContent value="templates" className="mt-0">
                {isOwner ? <TemplateManager serverId={serverId} /> : <p style={{ color: "var(--theme-text-secondary)" }}>Only the owner can import/export templates.</p>}
              </TabsContent>
              <TabsContent value="audit-log" className="mt-0">
                <AuditLogPage serverId={serverId} />
              </TabsContent>
              <TabsContent value="admin-activity" className="mt-0">
                <AdminActivityTimeline serverId={serverId} />
              </TabsContent>
              <TabsContent value="permission-simulator" className="mt-0">
                <PermissionSimulator serverId={serverId} channels={channels} />
              </TabsContent>
              <TabsContent value="community-health" className="mt-0">
                <CommunityHealthDashboard serverId={serverId} />
              </TabsContent>
              <TabsContent value="server-theme" className="mt-0">
                <ServerRecommendedTheme serverId={serverId} />
              </TabsContent>
            </Suspense>
          </div>
        </Tabs>
      </div>
    </main>
  )
}
