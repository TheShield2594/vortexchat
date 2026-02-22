export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          banner_color: string | null
          banner_url: string | null
          bio: string | null
          custom_tag: string | null
          status: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'
          status_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          banner_color?: string | null
          banner_url?: string | null
          bio?: string | null
          custom_tag?: string | null
          status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'
          status_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          banner_color?: string | null
          banner_url?: string | null
          bio?: string | null
          custom_tag?: string | null
          status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'
          status_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      servers: {
        Row: {
          id: string
          name: string
          icon_url: string | null
          owner_id: string
          invite_code: string
          description: string | null
          is_public: boolean
          member_count: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          icon_url?: string | null
          owner_id: string
          invite_code?: string
          description?: string | null
          is_public?: boolean
          member_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          icon_url?: string | null
          owner_id?: string
          invite_code?: string
          description?: string | null
          is_public?: boolean
          member_count?: number
          created_at?: string
        }
        Relationships: []
      }
      server_members: {
        Row: {
          server_id: string
          user_id: string
          nickname: string | null
          joined_at: string
        }
        Insert: {
          server_id: string
          user_id: string
          nickname?: string | null
          joined_at?: string
        }
        Update: {
          server_id?: string
          user_id?: string
          nickname?: string | null
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          }
        ]
      }
      roles: {
        Row: {
          id: string
          server_id: string
          name: string
          color: string
          position: number
          permissions: number
          is_hoisted: boolean
          mentionable: boolean
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          color?: string
          position?: number
          permissions?: number
          is_hoisted?: boolean
          mentionable?: boolean
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          name?: string
          color?: string
          position?: number
          permissions?: number
          is_hoisted?: boolean
          mentionable?: boolean
          is_default?: boolean
          created_at?: string
        }
        Relationships: []
      }
      member_roles: {
        Row: {
          server_id: string
          user_id: string
          role_id: string
        }
        Insert: {
          server_id: string
          user_id: string
          role_id: string
        }
        Update: {
          server_id?: string
          user_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_server_id_user_id_fkey"
            columns: ["server_id", "user_id"]
            isOneToOne: false
            referencedRelation: "server_members"
            referencedColumns: ["server_id", "user_id"]
          }
        ]
      }
      channels: {
        Row: {
          id: string
          server_id: string
          name: string
          type: 'text' | 'voice' | 'category'
          position: number
          topic: string | null
          parent_id: string | null
          slowmode_delay: number
          nsfw: boolean
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          type?: 'text' | 'voice' | 'category'
          position?: number
          topic?: string | null
          parent_id?: string | null
          slowmode_delay?: number
          nsfw?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          name?: string
          type?: 'text' | 'voice' | 'category'
          position?: number
          topic?: string | null
          parent_id?: string | null
          slowmode_delay?: number
          nsfw?: boolean
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          author_id: string
          content: string | null
          edited_at: string | null
          deleted_at: string | null
          reply_to_id: string | null
          mentions: string[]
          mention_everyone: boolean
          pinned: boolean
          pinned_at: string | null
          pinned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          author_id: string
          content?: string | null
          edited_at?: string | null
          deleted_at?: string | null
          reply_to_id?: string | null
          mentions?: string[]
          mention_everyone?: boolean
          pinned?: boolean
          pinned_at?: string | null
          pinned_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          author_id?: string
          content?: string | null
          edited_at?: string | null
          deleted_at?: string | null
          reply_to_id?: string | null
          mentions?: string[]
          mention_everyone?: boolean
          pinned?: boolean
          pinned_at?: string | null
          pinned_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      attachments: {
        Row: {
          id: string
          message_id: string
          url: string
          filename: string
          size: number
          content_type: string
          width: number | null
          height: number | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          url: string
          filename: string
          size: number
          content_type: string
          width?: number | null
          height?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          url?: string
          filename?: string
          size?: number
          content_type?: string
          width?: number | null
          height?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          }
        ]
      }
      reactions: {
        Row: {
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          message_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          }
        ]
      }
      direct_messages: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string | null
          dm_channel_id: string | null
          content: string | null
          created_at: string
          read_at: string | null
          edited_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id?: string | null
          dm_channel_id?: string | null
          content?: string | null
          created_at?: string
          read_at?: string | null
          edited_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string | null
          dm_channel_id?: string | null
          content?: string | null
          created_at?: string
          read_at?: string | null
          edited_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      server_bans: {
        Row: {
          server_id: string
          user_id: string
          banned_by: string | null
          reason: string | null
          banned_at: string
        }
        Insert: {
          server_id: string
          user_id: string
          banned_by?: string | null
          reason?: string | null
          banned_at?: string
        }
        Update: {
          server_id?: string
          user_id?: string
          banned_by?: string | null
          reason?: string | null
          banned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      invites: {
        Row: {
          code: string
          server_id: string
          channel_id: string | null
          created_by: string | null
          max_uses: number | null
          uses: number
          expires_at: string | null
          temporary: boolean
          created_at: string
        }
        Insert: {
          code: string
          server_id: string
          channel_id?: string | null
          created_by?: string | null
          max_uses?: number | null
          uses?: number
          expires_at?: string | null
          temporary?: boolean
          created_at?: string
        }
        Update: {
          code?: string
          server_id?: string
          channel_id?: string | null
          created_by?: string | null
          max_uses?: number | null
          uses?: number
          expires_at?: string | null
          temporary?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      friendships: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: 'pending' | 'accepted' | 'blocked'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          addressee_id: string
          status?: 'pending' | 'accepted' | 'blocked'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requester_id?: string
          addressee_id?: string
          status?: 'pending' | 'accepted' | 'blocked'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      voice_states: {
        Row: {
          user_id: string
          channel_id: string
          server_id: string
          muted: boolean
          deafened: boolean
          speaking: boolean
          self_stream: boolean
          joined_at: string
        }
        Insert: {
          user_id: string
          channel_id: string
          server_id: string
          muted?: boolean
          deafened?: boolean
          speaking?: boolean
          self_stream?: boolean
          joined_at?: string
        }
        Update: {
          user_id?: string
          channel_id?: string
          server_id?: string
          muted?: boolean
          deafened?: boolean
          speaking?: boolean
          self_stream?: boolean
          joined_at?: string
        }
        Relationships: []
      }
      read_states: {
        Row: {
          user_id: string
          channel_id: string
          last_read_at: string
          mention_count: number
        }
        Insert: {
          user_id: string
          channel_id: string
          last_read_at?: string
          mention_count?: number
        }
        Update: {
          user_id?: string
          channel_id?: string
          last_read_at?: string
          mention_count?: number
        }
        Relationships: []
      }
      channel_permissions: {
        Row: {
          channel_id: string
          role_id: string
          allow_permissions: number
          deny_permissions: number
        }
        Insert: {
          channel_id: string
          role_id: string
          allow_permissions?: number
          deny_permissions?: number
        }
        Update: {
          channel_id?: string
          role_id?: string
          allow_permissions?: number
          deny_permissions?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          }
        ]
      }
      dm_channels: {
        Row: {
          id: string
          name: string | null
          icon_url: string | null
          owner_id: string | null
          is_group: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          icon_url?: string | null
          owner_id?: string | null
          is_group?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          icon_url?: string | null
          owner_id?: string | null
          is_group?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      dm_channel_members: {
        Row: {
          dm_channel_id: string
          user_id: string
          added_by: string | null
          added_at: string
        }
        Insert: {
          dm_channel_id: string
          user_id: string
          added_by?: string | null
          added_at?: string
        }
        Update: {
          dm_channel_id?: string
          user_id?: string
          added_by?: string | null
          added_at?: string
        }
        Relationships: []
      }
      dm_read_states: {
        Row: {
          user_id: string
          dm_channel_id: string
          last_read_at: string
        }
        Insert: {
          user_id: string
          dm_channel_id: string
          last_read_at?: string
        }
        Update: {
          user_id?: string
          dm_channel_id?: string
          last_read_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          id: string
          user_id: string
          server_id: string | null
          channel_id: string | null
          mode: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          server_id?: string | null
          channel_id?: string | null
          mode?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          server_id?: string | null
          channel_id?: string | null
          mode?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          server_id: string
          actor_id: string | null
          action: string
          target_id: string | null
          target_type: string | null
          changes: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          actor_id?: string | null
          action: string
          target_id?: string | null
          target_type?: string | null
          changes?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          actor_id?: string | null
          action?: string
          target_id?: string | null
          target_type?: string | null
          changes?: Json | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_server_member: {
        Args: { p_server_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_server_owner: {
        Args: { p_server_id: string; p_user_id?: string }
        Returns: boolean
      }
      get_member_permissions: {
        Args: { p_server_id: string; p_user_id?: string }
        Returns: number
      }
      has_permission: {
        Args: { p_server_id: string; p_permission: number; p_user_id?: string }
        Returns: boolean
      }
      mark_channel_read: {
        Args: { p_channel_id: string }
        Returns: void
      }
      mark_dm_read: {
        Args: { p_dm_channel_id: string }
        Returns: void
      }
      join_server_by_invite: {
        Args: { p_invite_code: string }
        Returns: Database['public']['Tables']['servers']['Row']
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Derived types for convenience
export type UserRow = Database['public']['Tables']['users']['Row']
export type ServerRow = Database['public']['Tables']['servers']['Row']
export type ServerMemberRow = Database['public']['Tables']['server_members']['Row']
export type RoleRow = Database['public']['Tables']['roles']['Row']
export type ChannelRow = Database['public']['Tables']['channels']['Row']
export type MessageRow = Database['public']['Tables']['messages']['Row']
export type AttachmentRow = Database['public']['Tables']['attachments']['Row']
export type ReactionRow = Database['public']['Tables']['reactions']['Row']
export type DirectMessageRow = Database['public']['Tables']['direct_messages']['Row']
export type VoiceStateRow = Database['public']['Tables']['voice_states']['Row']
export type FriendshipRow = Database['public']['Tables']['friendships']['Row']
export type ServerBanRow = Database['public']['Tables']['server_bans']['Row']
export type InviteRow = Database['public']['Tables']['invites']['Row']

// Extended types with relations
export interface MessageWithAuthor extends MessageRow {
  author: UserRow
  attachments: AttachmentRow[]
  reactions: ReactionRow[]
  reply_to: MessageWithAuthor | null
}

export interface ServerWithChannels extends ServerRow {
  channels: ChannelRow[]
  members_count: number
}

export interface MemberWithRoles extends ServerMemberRow {
  user: UserRow
  roles: RoleRow[]
}

export interface FriendWithUser extends FriendshipRow {
  friend: UserRow
}
