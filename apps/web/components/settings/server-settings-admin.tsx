"use client"

import { Shield, ShieldCheck, Zap } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RoleManager } from "@/components/roles/role-manager"
import { TemplateManager } from "@/components/modals/template-manager"
import { AutoModTab, EmojisTab, ModerationTab, ScreeningTab, WebhooksTab } from "@/components/modals/server-settings-modal"

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

export function ServerSettingsAdmin({ serverId, serverName, isOwner, channels }: Props) {
  return (
    <main className="flex-1 overflow-y-auto p-6" style={{ background: "#1e1f22" }}>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-white">Server Settings</h1>
        <p className="mt-1 text-sm" style={{ color: "#949ba4" }}>{serverName}</p>

        <Tabs defaultValue="roles" className="mt-6 flex gap-6">
          <div className="w-56 flex-shrink-0">
            <TabsList className="flex h-auto w-full flex-col gap-1 bg-transparent p-0">
              <TabsTrigger value="roles" className="w-full justify-start">Roles</TabsTrigger>
              <TabsTrigger value="emojis" className="w-full justify-start">Emoji</TabsTrigger>
              <TabsTrigger value="webhooks" className="w-full justify-start">Integrations</TabsTrigger>
              <div className="mt-2 mb-1 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "#949ba4" }}>
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
              <TabsTrigger value="templates" className="w-full justify-start">Templates</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-w-0 flex-1 rounded-md p-4" style={{ background: "#313338" }}>
            <TabsContent value="roles" className="mt-0">
              <RoleManager serverId={serverId} isOwner={isOwner} />
            </TabsContent>
            <TabsContent value="emojis" className="mt-0">
              <EmojisTab serverId={serverId} />
            </TabsContent>
            <TabsContent value="webhooks" className="mt-0">
              <WebhooksTab serverId={serverId} channels={channels} open />
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
            <TabsContent value="templates" className="mt-0">
              {isOwner ? <TemplateManager serverId={serverId} /> : <p style={{ color: "#b5bac1" }}>Only the owner can import/export templates.</p>}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </main>
  )
}
