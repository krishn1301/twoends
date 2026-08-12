export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          author_id: string
          body: string | null
          couple_id: string
          created_at: string
          id: string
          media_path: string | null
          prompt_day_id: string
        }
        Insert: {
          author_id: string
          body?: string | null
          couple_id: string
          created_at?: string
          id?: string
          media_path?: string | null
          prompt_day_id: string
        }
        Update: {
          author_id?: string
          body?: string | null
          couple_id?: string
          created_at?: string
          id?: string
          media_path?: string | null
          prompt_day_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_prompt_day_id_fkey"
            columns: ["prompt_day_id"]
            isOneToOne: false
            referencedRelation: "prompt_days"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          author_id: string
          couple_id: string
          created_at: string
          id: string
          strokes: Json
        }
        Insert: {
          author_id: string
          couple_id: string
          created_at?: string
          id?: string
          strokes: Json
        }
        Update: {
          author_id?: string
          couple_id?: string
          created_at?: string
          id?: string
          strokes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "canvases_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvases_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      capsules: {
        Row: {
          author_id: string
          body: string
          couple_id: string
          deliver_at: string
          delivered_at: string | null
          id: string
        }
        Insert: {
          author_id: string
          body: string
          couple_id: string
          deliver_at: string
          delivered_at?: string | null
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          couple_id?: string
          deliver_at?: string
          delivered_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsules_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capsules_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      countdowns: {
        Row: {
          couple_id: string
          cover_path: string | null
          created_at: string
          id: string
          target_at: string
          title: string
        }
        Insert: {
          couple_id: string
          cover_path?: string | null
          created_at?: string
          id?: string
          target_at: string
          title: string
        }
        Update: {
          couple_id?: string
          cover_path?: string | null
          created_at?: string
          id?: string
          target_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "countdowns_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          adult_packs_enabled: boolean
          created_at: string
          day_timezone: string
          id: string
          member_a: string
          member_b: string | null
          nurture_focus: string[]
          quiet_until: string | null
          relationship_type: string | null
          started_on: string | null
          unpair_requested_at: string | null
          unpair_requested_by: string | null
        }
        Insert: {
          adult_packs_enabled?: boolean
          created_at?: string
          day_timezone?: string
          id?: string
          member_a: string
          member_b?: string | null
          nurture_focus?: string[]
          quiet_until?: string | null
          relationship_type?: string | null
          started_on?: string | null
          unpair_requested_at?: string | null
          unpair_requested_by?: string | null
        }
        Update: {
          adult_packs_enabled?: boolean
          created_at?: string
          day_timezone?: string
          id?: string
          member_a?: string
          member_b?: string | null
          nurture_focus?: string[]
          quiet_until?: string | null
          relationship_type?: string | null
          started_on?: string | null
          unpair_requested_at?: string | null
          unpair_requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couples_member_a_fkey"
            columns: ["member_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couples_member_b_fkey"
            columns: ["member_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couples_unpair_requested_by_fkey"
            columns: ["unpair_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          couple_id: string
          created_by: string
          expires_at: string
          used_at: string | null
        }
        Insert: {
          code: string
          couple_id: string
          created_by: string
          expires_at: string
          used_at?: string | null
        }
        Update: {
          code?: string
          couple_id?: string
          created_by?: string
          expires_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          author_id: string
          body: string | null
          couple_id: string
          created_at: string
          happened_on: string | null
          id: string
          lat: number | null
          lng: number | null
          place_label: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          couple_id: string
          created_at?: string
          happened_on?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          place_label?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          couple_id?: string
          created_at?: string
          happened_on?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          place_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          couple_id: string
          created_at: string
          done_at: string | null
          id: string
          kind: string
          title: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          title: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          author_id: string
          caption: string | null
          couple_id: string
          created_at: string
          expires_at: string
          id: string
          kept: boolean
          storage_path: string
        }
        Insert: {
          author_id: string
          caption?: string | null
          couple_id: string
          created_at?: string
          expires_at?: string
          id?: string
          kept?: boolean
          storage_path: string
        }
        Update: {
          author_id?: string
          caption?: string | null
          couple_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          kept?: boolean
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      presence: {
        Row: {
          lat: number | null
          lng: number | null
          precision: string
          profile_id: string
          status_note: string | null
          updated_at: string
        }
        Insert: {
          lat?: number | null
          lng?: number | null
          precision?: string
          profile_id: string
          status_note?: string | null
          updated_at?: string
        }
        Update: {
          lat?: number | null
          lng?: number | null
          precision?: string
          profile_id?: string
          status_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_key: string | null
          avatar_path: string | null
          birthday: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
        }
        Insert: {
          accent_key?: string | null
          avatar_path?: string | null
          birthday?: string | null
          created_at?: string
          display_name: string
          id: string
          locale?: string
        }
        Update: {
          accent_key?: string | null
          avatar_path?: string | null
          birthday?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string
        }
        Relationships: []
      }
      prompt_days: {
        Row: {
          couple_id: string
          id: string
          local_date: string
          prompt_id: string
        }
        Insert: {
          couple_id: string
          id?: string
          local_date: string
          prompt_id: string
        }
        Update: {
          couple_id?: string
          id?: string
          local_date?: string
          prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_days_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_days_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          body: string
          id: string
          is_adult: boolean
          kind: string
          pack: string
          sort_order: number
        }
        Insert: {
          body: string
          id?: string
          is_adult?: boolean
          kind?: string
          pack?: string
          sort_order?: number
        }
        Update: {
          body?: string
          id?: string
          is_adult?: boolean
          kind?: string
          pack?: string
          sort_order?: number
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          id: string
          platform: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          id?: string
          platform: string
          profile_id: string
          token: string
          updated_at?: string
        }
        Update: {
          id?: string
          platform?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          couple_id: string
          current: number
          grace_month: string | null
          grace_used_this_month: number
          last_active_date: string | null
          longest: number
        }
        Insert: {
          couple_id: string
          current?: number
          grace_month?: string | null
          grace_used_this_month?: number
          last_active_date?: string | null
          longest?: number
        }
        Update: {
          couple_id?: string
          current?: number
          grace_month?: string | null
          grace_used_this_month?: number
          last_active_date?: string | null
          longest?: number
        }
        Relationships: [
          {
            foreignKeyName: "streaks_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: true
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_unpair: { Args: never; Returns: undefined }
      confirm_unpair: { Args: never; Returns: undefined }
      create_invite: { Args: { p_ttl?: string }; Returns: string }
      generate_invite_code: { Args: never; Returns: string }
      i_have_answered: { Args: { p_prompt_day_id: string }; Returns: boolean }
      is_member_of: { Args: { c: string }; Returns: boolean }
      partner_has_answered: {
        Args: { p_prompt_day_id: string }
        Returns: boolean
      }
      redeem_invite: { Args: { p_code: string }; Returns: string }
      request_unpair: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
