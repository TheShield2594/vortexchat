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
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          icon_url?: string | null
          owner_id: string
          invite_code?: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          icon_url?: string | null
          owner_id?: string
          invite_code?: string
          description?: string | null
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
        Relationships: []
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
        Relationships: []
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
          created_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      direct_messages: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          content: string | null
          created_at: string
          read_at: string | null
          edited_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string
          content?: string | null
          created_at?: string
          read_at?: string | null
          edited_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string
          content?: string | null
          created_at?: string
          read_at?: string | null
          edited_at?: string | null
          deleted_at?: string | null
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
