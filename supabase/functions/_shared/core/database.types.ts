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
      ai_usage_daily: {
        Row: {
          action: string
          updated_at: string
          usage_count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          action: string
          updated_at?: string
          usage_count?: number
          usage_date: string
          user_id: string
        }
        Update: {
          action?: string
          updated_at?: string
          usage_count?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          action: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          extraction_source: string | null
          gemini_cost_usd: number
          guest_install_id: string | null
          id: string
          metadata: Json
          model: string | null
          output_tokens: number
          platform: string | null
          prompt_tokens: number
          scrapecreators_cost_usd: number
          scrapecreators_credits: number
          status: string
          thinking_tokens: number
          tokens_charged: number
          total_cost_usd: number
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          extraction_source?: string | null
          gemini_cost_usd?: number
          guest_install_id?: string | null
          id?: string
          metadata?: Json
          model?: string | null
          output_tokens?: number
          platform?: string | null
          prompt_tokens?: number
          scrapecreators_cost_usd?: number
          scrapecreators_credits?: number
          status: string
          thinking_tokens?: number
          tokens_charged?: number
          total_cost_usd?: number
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          extraction_source?: string | null
          gemini_cost_usd?: number
          guest_install_id?: string | null
          id?: string
          metadata?: Json
          model?: string | null
          output_tokens?: number
          platform?: string | null
          prompt_tokens?: number
          scrapecreators_cost_usd?: number
          scrapecreators_credits?: number
          status?: string
          thinking_tokens?: number
          tokens_charged?: number
          total_cost_usd?: number
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_recipes: {
        Row: {
          collection_id: string
          created_at: string
          recipe_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          recipe_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_recipes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_reservations: {
        Row: {
          amount: number
          compensation_attempts: number
          compensation_last_error: string | null
          compensation_reason: string | null
          compensation_requested_at: string | null
          created_at: string
          finalized_at: string | null
          id: string
          idempotency_key: string
          refunded_at: string | null
          source: string
          status: string
          user_id: string
          year_month: string
        }
        Insert: {
          amount?: number
          compensation_attempts?: number
          compensation_last_error?: string | null
          compensation_reason?: string | null
          compensation_requested_at?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key: string
          refunded_at?: string | null
          source: string
          status?: string
          user_id: string
          year_month: string
        }
        Update: {
          amount?: number
          compensation_attempts?: number
          compensation_last_error?: string | null
          compensation_reason?: string | null
          compensation_requested_at?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key?: string
          refunded_at?: string | null
          source?: string
          status?: string
          user_id?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          dedupe_key: string
          id: number
          kind: string
          resend_id: string | null
          sent_at: string
          user_id: string | null
        }
        Insert: {
          dedupe_key: string
          id?: never
          kind: string
          resend_id?: string | null
          sent_at?: string
          user_id?: string | null
        }
        Update: {
          dedupe_key?: string
          id?: never
          kind?: string
          resend_id?: string | null
          sent_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      extract_usage_monthly: {
        Row: {
          extract_count: number
          updated_at: string
          user_id: string
          year_month: string
        }
        Insert: {
          extract_count?: number
          updated_at?: string
          user_id: string
          year_month: string
        }
        Update: {
          extract_count?: number
          updated_at?: string
          user_id?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "extract_usage_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          app_version: string | null
          build_number: string | null
          contact_email: string | null
          created_at: string
          device_model: string | null
          id: string
          locale: string | null
          message: string
          os_version: string | null
          platform: string
          source: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          build_number?: string | null
          contact_email?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          locale?: string | null
          message: string
          os_version?: string | null
          platform: string
          source?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          build_number?: string | null
          contact_email?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          locale?: string | null
          message?: string
          os_version?: string | null
          platform?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_ai_usage_daily: {
        Row: {
          action: string
          install_id: string
          updated_at: string
          usage_count: number
          usage_date: string
        }
        Insert: {
          action: string
          install_id: string
          updated_at?: string
          usage_count?: number
          usage_date: string
        }
        Update: {
          action?: string
          install_id?: string
          updated_at?: string
          usage_count?: number
          usage_date?: string
        }
        Relationships: []
      }
      guest_extraction_reservations: {
        Row: {
          compensation_attempts: number
          compensation_last_error: string | null
          compensation_reason: string | null
          compensation_requested_at: string | null
          created_at: string
          finalized_at: string | null
          id: string
          idempotency_key: string
          install_id: string
          refund_reason: string | null
          refunded_at: string | null
          status: string
        }
        Insert: {
          compensation_attempts?: number
          compensation_last_error?: string | null
          compensation_reason?: string | null
          compensation_requested_at?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key: string
          install_id: string
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string
        }
        Update: {
          compensation_attempts?: number
          compensation_last_error?: string | null
          compensation_reason?: string | null
          compensation_requested_at?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key?: string
          install_id?: string
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      guest_usage: {
        Row: {
          created_at: string
          extract_count: number
          install_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extract_count?: number
          install_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extract_count?: number
          install_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_activity: {
        Row: {
          actor_id: string | null
          actor_name: string
          created_at: string
          household_id: string
          id: number
          item_count: number
          kind: string
          sent_at: string | null
          subject_id: string | null
          subject_name: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          household_id: string
          id?: never
          item_count?: number
          kind: string
          sent_at?: string | null
          subject_id?: string | null
          subject_name?: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          household_id?: string
          id?: never
          item_count?: number
          kind?: string
          sent_at?: string | null
          subject_id?: string | null
          subject_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_activity_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_activity_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          stopped_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          household_id: string
          id?: string
          stopped_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          stopped_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          display_name: string
          going_shopping_sent_at: string | null
          household_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          display_name?: string
          going_shopping_sent_at?: string | null
          household_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          going_shopping_sent_at?: string | null
          household_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          avatar: string | null
          created_at: string
          household_changed_at: string
          id: string
          list_changed_at: string
          name: string | null
          pantry_changed_at: string
          set_up_at: string | null
          staples: string[]
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          household_changed_at?: string
          id?: string
          list_changed_at?: string
          name?: string | null
          pantry_changed_at?: string
          set_up_at?: string | null
          staples?: string[]
        }
        Update: {
          avatar?: string | null
          created_at?: string
          household_changed_at?: string
          id?: string
          list_changed_at?: string
          name?: string | null
          pantry_changed_at?: string
          set_up_at?: string | null
          staples?: string[]
        }
        Relationships: []
      }
      in_app_message_receipts: {
        Row: {
          clicked_at: string | null
          clicked_button: string | null
          dismissed_at: string | null
          first_seen_at: string
          last_seen_at: string
          message_id: string
          seen_count: number
          user_id: string
        }
        Insert: {
          clicked_at?: string | null
          clicked_button?: string | null
          dismissed_at?: string | null
          first_seen_at?: string
          last_seen_at?: string
          message_id: string
          seen_count?: number
          user_id: string
        }
        Update: {
          clicked_at?: string | null
          clicked_button?: string | null
          dismissed_at?: string | null
          first_seen_at?: string
          last_seen_at?: string
          message_id?: string
          seen_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "in_app_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_message_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_messages: {
        Row: {
          banner_position: string | null
          content: Json
          created_at: string
          created_by: string | null
          delay_seconds: number | null
          dismissible: boolean
          ends_at: string | null
          frequency: Json
          icon: string | null
          id: string
          image_url: string | null
          link_url: string | null
          max_shows: number | null
          name: string
          presentation: string
          primary_action: Json | null
          priority: number
          required: boolean
          screens: string[]
          secondary_action: Json | null
          starts_at: string | null
          status: string
          targeting: Json
          tone: string
          updated_at: string
        }
        Insert: {
          banner_position?: string | null
          content: Json
          created_at?: string
          created_by?: string | null
          delay_seconds?: number | null
          dismissible?: boolean
          ends_at?: string | null
          frequency?: Json
          icon?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          max_shows?: number | null
          name: string
          presentation: string
          primary_action?: Json | null
          priority?: number
          required?: boolean
          screens?: string[]
          secondary_action?: Json | null
          starts_at?: string | null
          status?: string
          targeting?: Json
          tone?: string
          updated_at?: string
        }
        Update: {
          banner_position?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          delay_seconds?: number | null
          dismissible?: boolean
          ends_at?: string | null
          frequency?: Json
          icon?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          max_shows?: number | null
          name?: string
          presentation?: string
          primary_action?: Json | null
          priority?: number
          required?: boolean
          screens?: string[]
          secondary_action?: Json | null
          starts_at?: string | null
          status?: string
          targeting?: Json
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_events: {
        Row: {
          app_version: string | null
          created_at: string
          guest_install_id: string | null
          id: number
          kind: string
          name: string
          occurred_at: string
          platform: string
          properties: Json
          screen: string | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          guest_install_id?: string | null
          id?: never
          kind: string
          name: string
          occurred_at: string
          platform: string
          properties?: Json
          screen?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          guest_install_id?: string | null
          id?: never
          kind?: string
          name?: string
          occurred_at?: string
          platform?: string
          properties?: Json
          screen?: string | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interaction_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          cooked_at: string | null
          created_at: string
          id: string
          leftover_of: string | null
          locked: boolean
          meal: string
          plan_date: string
          recipe_id: string
          servings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cooked_at?: string | null
          created_at?: string
          id?: string
          leftover_of?: string | null
          locked?: boolean
          meal: string
          plan_date: string
          recipe_id: string
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          cooked_at?: string | null
          created_at?: string
          id?: string
          leftover_of?: string | null
          locked?: boolean
          meal?: string
          plan_date?: string
          recipe_id?: string
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_leftover_of_fkey"
            columns: ["leftover_of"]
            isOneToOne: false
            referencedRelation: "meal_plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nudge_sends: {
        Row: {
          channel: string
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          channel: string
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pantry_items: {
        Row: {
          added_at: string
          aisle: string
          brand: string
          household_id: string
          id: string
          last_seen_at: string
          name: string
          name_en: string
          name_key: string | null
          place: string
          source: string
          user_id: string | null
        }
        Insert: {
          added_at?: string
          aisle?: string
          brand?: string
          household_id?: string
          id?: string
          last_seen_at?: string
          name: string
          name_en?: string
          name_key?: string | null
          place: string
          source?: string
          user_id?: string | null
        }
        Update: {
          added_at?: string
          aisle?: string
          brand?: string
          household_id?: string
          id?: string
          last_seen_at?: string
          name?: string
          name_en?: string
          name_key?: string | null
          place?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_scan_photos: {
        Row: {
          created_at: string
          from_phone: boolean
          id: string
          items: Json
          photo_hash: string | null
          place: string
          quality: string
          scan_id: string
          truncated: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          from_phone?: boolean
          id?: string
          items?: Json
          photo_hash?: string | null
          place: string
          quality: string
          scan_id: string
          truncated?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          from_phone?: boolean
          id?: string
          items?: Json
          photo_hash?: string | null
          place?: string
          quality?: string
          scan_id?: string
          truncated?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_scan_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_handoffs: {
        Row: {
          closed_at: string | null
          connected_at: string | null
          created_at: string
          expires_at: string
          id: string
          language: string
          photo: string | null
          photo_at: string | null
          photo_mime: string | null
          place: string | null
          purpose: string
          scan_id: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          connected_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          language?: string
          photo?: string | null
          photo_at?: string | null
          photo_mime?: string | null
          place?: string | null
          purpose: string
          scan_id?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          connected_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          photo?: string | null
          photo_at?: string | null
          photo_mime?: string | null
          place?: string | null
          purpose?: string
          scan_id?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_handoffs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_remix_usage: {
        Row: {
          remix_count: number
          source_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          remix_count?: number
          source_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          remix_count?: number
          source_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_remix_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          country: string | null
          created_at: string
          guest_install_id: string | null
          id: string
          name: string
          properties: Json
          user_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          guest_install_id?: string | null
          id?: string
          name: string
          properties?: Json
          user_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          guest_install_id?: string | null
          id?: string
          name?: string
          properties?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          contribute_to_hub: boolean
          created_at: string
          email: string | null
          email_opt_out: boolean
          free_extracts_used: number
          id: string
          is_admin: boolean
          kitchen: Json
          meal_plan_prefs: Json
          nudges_opt_out: boolean
          push_opt_out: boolean
          subscription_expires_at: string | null
          subscription_status: string
          token_balance: number
          token_pack_notify_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          contribute_to_hub?: boolean
          created_at?: string
          email?: string | null
          email_opt_out?: boolean
          free_extracts_used?: number
          id: string
          is_admin?: boolean
          kitchen?: Json
          meal_plan_prefs?: Json
          nudges_opt_out?: boolean
          push_opt_out?: boolean
          subscription_expires_at?: string | null
          subscription_status?: string
          token_balance?: number
          token_pack_notify_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          contribute_to_hub?: boolean
          created_at?: string
          email?: string | null
          email_opt_out?: boolean
          free_extracts_used?: number
          id?: string
          is_admin?: boolean
          kitchen?: Json
          meal_plan_prefs?: Json
          nudges_opt_out?: boolean
          push_opt_out?: boolean
          subscription_expires_at?: string | null
          subscription_status?: string
          token_balance?: number
          token_pack_notify_at?: string | null
        }
        Relationships: []
      }
      purchase_credit_grants: {
        Row: {
          created_at: string
          credits: number
          event_id: string
          id: string
          metadata: Json
          product_id: string
          provider: string
          revoke_event_id: string | null
          revoked_at: string | null
          revoked_credits: number | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits: number
          event_id: string
          id?: string
          metadata?: Json
          product_id: string
          provider: string
          revoke_event_id?: string | null
          revoked_at?: string | null
          revoked_credits?: number | null
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          event_id?: string
          id?: string
          metadata?: Json
          product_id?: string
          provider?: string
          revoke_event_id?: string | null
          revoked_at?: string | null
          revoked_credits?: number | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_credit_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_refund_markers: {
        Row: {
          created_at: string
          event_id: string | null
          provider: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          provider: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          provider?: string
          transaction_id?: string
        }
        Relationships: []
      }
      purchase_webhook_failures: {
        Row: {
          app_user_id: string | null
          created_at: string
          environment: string | null
          error: string | null
          event_id: string | null
          id: string
          product_id: string | null
          reason: string
          store: string | null
          transaction_id: string | null
        }
        Insert: {
          app_user_id?: string | null
          created_at?: string
          environment?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          product_id?: string | null
          reason: string
          store?: string | null
          transaction_id?: string | null
        }
        Update: {
          app_user_id?: string | null
          created_at?: string
          environment?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          product_id?: string | null
          reason?: string
          store?: string | null
          transaction_id?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_cards: {
        Row: {
          appliances: Json | null
          calories: number | null
          canonical_key: string
          canonical_url: string
          contains: string[] | null
          cost_estimate: string | null
          created_at: string
          diets: string[] | null
          effort_level: string | null
          estimated_time_minutes: number | null
          extract_hit_count: number
          extraction_source: string | null
          extraction_status: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          image_generated: boolean
          image_url: string | null
          ingredients: Json
          instructions: Json
          nutrition: Json | null
          original_url: string
          platform: string
          public_slug: string
          save_count: number
          servings: number
          source_language: string | null
          source_video_url: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          appliances?: Json | null
          calories?: number | null
          canonical_key: string
          canonical_url: string
          contains?: string[] | null
          cost_estimate?: string | null
          created_at?: string
          diets?: string[] | null
          effort_level?: string | null
          estimated_time_minutes?: number | null
          extract_hit_count?: number
          extraction_source?: string | null
          extraction_status?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          image_generated?: boolean
          image_url?: string | null
          ingredients?: Json
          instructions?: Json
          nutrition?: Json | null
          original_url: string
          platform: string
          public_slug?: string
          save_count?: number
          servings?: number
          source_language?: string | null
          source_video_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          appliances?: Json | null
          calories?: number | null
          canonical_key?: string
          canonical_url?: string
          contains?: string[] | null
          cost_estimate?: string | null
          created_at?: string
          diets?: string[] | null
          effort_level?: string | null
          estimated_time_minutes?: number | null
          extract_hit_count?: number
          extraction_source?: string | null
          extraction_status?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          image_generated?: boolean
          image_url?: string | null
          ingredients?: Json
          instructions?: Json
          nutrition?: Json | null
          original_url?: string
          platform?: string
          public_slug?: string
          save_count?: number
          servings?: number
          source_language?: string | null
          source_video_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_diets_pending: {
        Row: {
          created_at: string
          diets: string[]
          ingredient_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          diets: string[]
          ingredient_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          diets?: string[]
          ingredient_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_diets_pending_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_remix_usage: {
        Row: {
          recipe_id: string
          remix_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          recipe_id: string
          remix_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          recipe_id?: string
          remix_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_remix_usage_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_remix_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_share_claims: {
        Row: {
          claimed_by: string
          created_at: string
          recipe_id: string
          token: string
        }
        Insert: {
          claimed_by: string
          created_at?: string
          recipe_id: string
          token: string
        }
        Update: {
          claimed_by?: string
          created_at?: string
          recipe_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_share_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_share_claims_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_share_claims_token_fkey"
            columns: ["token"]
            isOneToOne: false
            referencedRelation: "recipe_shares"
            referencedColumns: ["token"]
          },
        ]
      }
      recipe_shares: {
        Row: {
          claim_count: number
          created_at: string
          created_by: string
          revoked_at: string | null
          snapshot: Json
          source_recipe_id: string | null
          token: string
        }
        Insert: {
          claim_count?: number
          created_at?: string
          created_by: string
          revoked_at?: string | null
          snapshot: Json
          source_recipe_id?: string | null
          token: string
        }
        Update: {
          claim_count?: number
          created_at?: string
          created_by?: string
          revoked_at?: string | null
          snapshot?: Json
          source_recipe_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_shares_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_translations: {
        Row: {
          created_at: string
          ingredients: Json
          instructions: Json
          language_code: string
          recipe_id: string
          title: string
          translation_version: number | null
        }
        Insert: {
          created_at?: string
          ingredients?: Json
          instructions?: Json
          language_code: string
          recipe_id: string
          title: string
          translation_version?: number | null
        }
        Update: {
          created_at?: string
          ingredients?: Json
          instructions?: Json
          language_code?: string
          recipe_id?: string
          title?: string
          translation_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_translations_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          appliances: Json | null
          calories: number | null
          calories_reasoning: string | null
          cook_note: string | null
          cost_estimate: string | null
          created_at: string
          diets: string[] | null
          effort_level: string | null
          estimated_time_minutes: number | null
          extraction_source: string | null
          extraction_status: string
          id: string
          image_generated: boolean
          image_url: string | null
          ingredients: Json
          instructions: Json
          is_favorite: boolean
          kitchen_adapted_summary: string | null
          kitchen_original: Json | null
          last_cooked_at: string | null
          locked_fields: string[]
          migrated_from_guest: boolean
          missing_fields: string[] | null
          nutrition: Json | null
          original_url: string | null
          platform: string | null
          recalc_pending: string[]
          recalc_started_at: string | null
          servings: number
          source_language: string | null
          source_video_url: string | null
          tags: string[]
          time_reasoning: string | null
          title: string
          user_id: string
        }
        Insert: {
          appliances?: Json | null
          calories?: number | null
          calories_reasoning?: string | null
          cook_note?: string | null
          cost_estimate?: string | null
          created_at?: string
          diets?: string[] | null
          effort_level?: string | null
          estimated_time_minutes?: number | null
          extraction_source?: string | null
          extraction_status?: string
          id?: string
          image_generated?: boolean
          image_url?: string | null
          ingredients?: Json
          instructions?: Json
          is_favorite?: boolean
          kitchen_adapted_summary?: string | null
          kitchen_original?: Json | null
          last_cooked_at?: string | null
          locked_fields?: string[]
          migrated_from_guest?: boolean
          missing_fields?: string[] | null
          nutrition?: Json | null
          original_url?: string | null
          platform?: string | null
          recalc_pending?: string[]
          recalc_started_at?: string | null
          servings?: number
          source_language?: string | null
          source_video_url?: string | null
          tags?: string[]
          time_reasoning?: string | null
          title: string
          user_id: string
        }
        Update: {
          appliances?: Json | null
          calories?: number | null
          calories_reasoning?: string | null
          cook_note?: string | null
          cost_estimate?: string | null
          created_at?: string
          diets?: string[] | null
          effort_level?: string | null
          estimated_time_minutes?: number | null
          extraction_source?: string | null
          extraction_status?: string
          id?: string
          image_generated?: boolean
          image_url?: string | null
          ingredients?: Json
          instructions?: Json
          is_favorite?: boolean
          kitchen_adapted_summary?: string | null
          kitchen_original?: Json | null
          last_cooked_at?: string | null
          locked_fields?: string[]
          migrated_from_guest?: boolean
          missing_fields?: string[] | null
          nutrition?: Json | null
          original_url?: string | null
          platform?: string | null
          recalc_pending?: string[]
          recalc_started_at?: string | null
          servings?: number
          source_language?: string | null
          source_video_url?: string | null
          tags?: string[]
          time_reasoning?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      remix_usage_daily: {
        Row: {
          remix_count: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          remix_count?: number
          updated_at?: string
          usage_date: string
          user_id: string
        }
        Update: {
          remix_count?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remix_usage_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_rate_events: {
        Row: {
          bucket: string
          created_at: string
          id: number
          key: string
          units: number
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          key: string
          units?: number
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          key?: string
          units?: number
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          created_at: string
          household_id: string
          id: string
          name: string
          quantity: number | null
          source_recipe_ids: string[] | null
          unit: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          checked?: boolean
          created_at?: string
          household_id?: string
          id?: string
          name: string
          quantity?: number | null
          source_recipe_ids?: string[] | null
          unit?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          checked?: boolean
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          quantity?: number | null
          source_recipe_ids?: string[] | null
          unit?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          app_version: string | null
          build_number: string | null
          category: string
          created_at: string
          device_model: string | null
          email: string | null
          id: string
          locale: string | null
          message: string
          os_version: string | null
          platform: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          build_number?: string | null
          category?: string
          created_at?: string
          device_model?: string | null
          email?: string | null
          id?: string
          locale?: string | null
          message: string
          os_version?: string | null
          platform?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          build_number?: string | null
          category?: string
          created_at?: string
          device_model?: string | null
          email?: string | null
          id?: string
          locale?: string | null
          message?: string
          os_version?: string | null
          platform?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_household_invite: {
        Args: { p_display_name: string; p_token: string }
        Returns: Json
      }
      activate_subscription: { Args: { p_user_id?: string }; Returns: string }
      admin_credit_health: { Args: never; Returns: Json }
      admin_dashboard: {
        Args: { p_days?: number; p_include_admins?: boolean; p_tz?: string }
        Returns: Json
      }
      admin_dashboard_insights: {
        Args: { p_days?: number; p_include_admins?: boolean; p_tz?: string }
        Returns: Json
      }
      admin_delete_in_app_message: {
        Args: { p_id: string }
        Returns: undefined
      }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_grant_recipe_credits: {
        Args: { p_amount: number; p_reason?: string; p_user_id: string }
        Returns: number
      }
      admin_hidden_recipe_cards: {
        Args: { p_limit?: number }
        Returns: {
          hidden_at: string
          hidden_reason: string
          id: string
          original_url: string
          platform: string
          public_slug: string
          title: string
        }[]
      }
      admin_interaction_session_events: {
        Args: { p_session_id: string }
        Returns: {
          id: number
          kind: string
          name: string
          occurred_at: string
          properties: Json
          screen: string
        }[]
      }
      admin_interaction_sessions: {
        Args: { p_limit?: number; p_search?: string; p_since: string }
        Returns: {
          app_version: string
          auth_events: string[]
          email: string
          guest_install_id: string
          last_at: string
          platform: string
          screen_count: number
          session_id: string
          started_at: string
          tap_count: number
          user_id: string
        }[]
      }
      admin_interaction_top: {
        Args: { p_limit?: number; p_since: string }
        Returns: {
          event_count: number
          kind: string
          name: string
          people: number
        }[]
      }
      admin_list_in_app_messages: {
        Args: { p_id?: string }
        Returns: {
          banner_position: string
          clicked_count: number
          content: Json
          created_at: string
          delay_seconds: number
          dismissed_count: number
          dismissible: boolean
          ends_at: string
          frequency: Json
          icon: string
          id: string
          image_url: string
          link_url: string
          max_shows: number
          name: string
          presentation: string
          primary_action: Json
          priority: number
          required: boolean
          screens: string[]
          secondary_action: Json
          seen_count: number
          starts_at: string
          status: string
          targeting: Json
          tone: string
          updated_at: string
        }[]
      }
      admin_save_in_app_message: { Args: { p_message: Json }; Returns: string }
      admin_set_in_app_message_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_recipe_card_hidden: {
        Args: { p_card: string; p_hidden?: boolean; p_reason?: string }
        Returns: string
      }
      admin_user_detail: { Args: { p_user_id: string }; Returns: Json }
      app_version_parts: { Args: { v: string }; Returns: number[] }
      backfill_recipe_cards: { Args: never; Returns: number }
      can_moderate_recipe_cards: { Args: never; Returns: boolean }
      cancel_subscription: { Args: { p_user_id?: string }; Returns: string }
      claim_recipe_card: { Args: { p_card_id: string }; Returns: string }
      clean_household_staples: {
        Args: { p_staples: string[] }
        Returns: string[]
      }
      compare_app_versions: { Args: { a: string; b: string }; Returns: number }
      email_cron_secret_matches: {
        Args: { p_secret: string }
        Returns: boolean
      }
      email_set_opt_out: {
        Args: { p_opt_out: boolean; p_token: string; p_user_id: string }
        Returns: boolean
      }
      email_unsubscribe_token: { Args: { p_user_id: string }; Returns: string }
      ensure_user_profile: { Args: { p_user_id?: string }; Returns: string }
      erase_user_personal_data: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      finalize_guest_extraction: {
        Args: { p_install_id: string; p_reservation_id: string }
        Returns: boolean
      }
      finalize_recipe_credit: {
        Args: { p_reservation_id: string; p_user_id: string }
        Returns: boolean
      }
      find_library_recipe_id: {
        Args: { p_card_id: string; p_user_id: string }
        Returns: string
      }
      get_household_invite: { Args: never; Returns: Json }
      get_in_app_messages: {
        Args: { p_app_version: string; p_language: string; p_platform: string }
        Returns: {
          banner_position: string
          clicked_at: string
          clicked_button: string
          content: Json
          delay_seconds: number
          dismissed_at: string
          dismissible: boolean
          first_seen_at: string
          frequency: Json
          icon: string
          id: string
          image_url: string
          last_seen_at: string
          link_url: string
          max_shows: number
          presentation: string
          primary_action: Json
          priority: number
          required: boolean
          screens: string[]
          secondary_action: Json
          seen_count: number
          tone: string
        }[]
      }
      get_my_household: { Args: never; Returns: Json }
      grant_purchased_credits: {
        Args: {
          p_amount: number
          p_event_id: string
          p_metadata?: Json
          p_product_id: string
          p_provider: string
          p_transaction_id: string
          p_user_id: string
        }
        Returns: number
      }
      grant_tokens: {
        Args: {
          p_amount: number
          p_metadata?: Json
          p_reason: string
          p_ref_id?: string
          p_user_id: string
        }
        Returns: number
      }
      household_activity_claim: {
        Args: { p_limit?: number; p_now?: string }
        Returns: {
          actor_name: string
          household_name: string
          id: number
          item_count: number
          kind: string
          recipients: Json
          subject_name: string
        }[]
      }
      household_activity_pending: { Args: never; Returns: boolean }
      household_clean_text: {
        Args: { p_max: number; p_text: string }
        Returns: string
      }
      household_ensure: { Args: { p_user: string }; Returns: string }
      household_going_shopping: {
        Args: { p_cooldown_hours?: number; p_now?: string; p_user_id: string }
        Returns: Json
      }
      household_going_shopping_failed: {
        Args: { p_sent_at: string; p_user_id: string }
        Returns: boolean
      }
      household_json: {
        Args: { p_household_id: string; p_me: string }
        Returns: Json
      }
      household_lock_mine: { Args: { p_user: string }; Returns: string }
      household_new_invite: {
        Args: { p_household: string; p_user: string }
        Returns: Json
      }
      household_push_target: {
        Args: { p_role: string; p_user: string }
        Returns: Json
      }
      household_split_off: {
        Args: { p_household: string; p_user: string }
        Returns: string
      }
      household_staples_fit: { Args: { p_staples: string[] }; Returns: boolean }
      hub_avoid_words: { Args: { p_words: string[] }; Returns: string[] }
      hub_cards: {
        Args: {
          p_diets?: string[]
          p_limit?: number
          p_offset?: number
          p_platform?: string
          p_search?: string
          p_sort?: string
          p_tags?: string[]
        }
        Returns: {
          appliances: Json | null
          calories: number | null
          canonical_key: string
          canonical_url: string
          contains: string[] | null
          cost_estimate: string | null
          created_at: string
          diets: string[] | null
          effort_level: string | null
          estimated_time_minutes: number | null
          extract_hit_count: number
          extraction_source: string | null
          extraction_status: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          image_generated: boolean
          image_url: string | null
          ingredients: Json
          instructions: Json
          nutrition: Json | null
          original_url: string
          platform: string
          public_slug: string
          save_count: number
          servings: number
          source_language: string | null
          source_video_url: string | null
          tags: string[]
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "recipe_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hub_cards_for_cook: {
        Args: {
          p_allergens?: string[]
          p_allergy_words?: string[]
          p_diets?: string[]
          p_dislike_words?: string[]
          p_dislikes?: string[]
          p_limit?: number
          p_offset?: number
          p_platform?: string
          p_search?: string
          p_sort?: string
          p_tags?: string[]
        }
        Returns: {
          appliances: Json | null
          calories: number | null
          canonical_key: string
          canonical_url: string
          contains: string[] | null
          cost_estimate: string | null
          created_at: string
          diets: string[] | null
          effort_level: string | null
          estimated_time_minutes: number | null
          extract_hit_count: number
          extraction_source: string | null
          extraction_status: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          image_generated: boolean
          image_url: string | null
          ingredients: Json
          instructions: Json
          nutrition: Json | null
          original_url: string
          platform: string
          public_slug: string
          save_count: number
          servings: number
          source_language: string | null
          source_video_url: string | null
          tags: string[]
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "recipe_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hub_popular_tags: {
        Args: { p_limit?: number; p_platform?: string }
        Returns: {
          tag: string
        }[]
      }
      hub_words_found: {
        Args: { p_text: string; p_words: string[] }
        Returns: number
      }
      in_app_message_action_valid: { Args: { a: Json }; Returns: boolean }
      in_app_message_content_valid: { Args: { c: Json }; Returns: boolean }
      in_app_message_frequency_valid: { Args: { f: Json }; Returns: boolean }
      in_app_message_string_array_valid: {
        Args: { a: Json; p_max: number; p_pattern: string }
        Returns: boolean
      }
      in_app_message_targeting_valid: { Args: { t: Json }; Returns: boolean }
      in_app_message_targets: {
        Args: {
          p_language: string
          p_plan: string
          p_platform: string
          p_user: string
          p_version: string
          t: Json
        }
        Returns: boolean
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_subscription_active: { Args: { p_user_id: string }; Returns: boolean }
      leave_household: { Args: never; Returns: Json }
      library_recipe_for_card: { Args: { p_card_id: string }; Returns: string }
      library_recipe_for_url: {
        Args: { p_platform: string; p_url: string }
        Returns: string
      }
      log_interaction_events: {
        Args: {
          p_app_version: string
          p_events: Json
          p_guest_install_id: string
          p_platform: string
          p_session_id: string
        }
        Returns: undefined
      }
      mark_guest_extraction_compensation_pending: {
        Args: {
          p_error?: string
          p_install_id: string
          p_reason: string
          p_reservation_id: string
        }
        Returns: boolean
      }
      mark_recipe_credit_compensation_after_finalize_failure: {
        Args: { p_error?: string; p_reservation_id: string; p_user_id: string }
        Returns: boolean
      }
      mark_recipe_credit_compensation_pending: {
        Args: {
          p_error?: string
          p_reason: string
          p_reservation_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      migrate_guest_shopping_list: {
        Args: { p_items: Json; p_user_id: string }
        Returns: number
      }
      my_household_id: { Args: never; Returns: string }
      nudge_candidates: {
        Args: { p_kind: string; p_limit?: number; p_now?: string }
        Returns: {
          email: string
          email_sent: boolean
          locale: string
          push_sent: boolean
          push_tokens: string[]
          recipe_id: string
          recipe_title: string
          unsubscribe_token: string
          user_id: string
        }[]
      }
      nudge_unsubscribe: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      nudge_unsubscribe_token: { Args: { p_user_id: string }; Returns: string }
      pantry_rescan_candidates: {
        Args: { p_limit?: number; p_now?: string }
        Returns: {
          email: string
          email_sent: boolean
          locale: string
          push_sent: boolean
          push_tokens: string[]
          recipe_id: string
          recipe_title: string
          unsubscribe_token: string
          user_id: string
        }[]
      }
      preview_household_invite: { Args: { p_token: string }; Returns: Json }
      purge_expired_personal_data: { Args: never; Returns: undefined }
      purge_pantry_scratch: { Args: never; Returns: undefined }
      recipe_card_canonical_key: {
        Args: { p_platform: string; p_url: string }
        Returns: string
      }
      recipe_card_canonical_url: {
        Args: { p_platform: string; p_url: string }
        Returns: string
      }
      recipe_card_canonical_web_url: {
        Args: { p_url: string }
        Returns: string
      }
      recipe_card_public_slug: {
        Args: { p_id: string; p_title: string }
        Returns: string
      }
      recipe_ingredient_key: { Args: { p_ingredients: Json }; Returns: string }
      recipe_ingredients_within_limits: {
        Args: { p_items: Json; p_require_one: boolean }
        Returns: boolean
      }
      recipe_nutrition_valid: { Args: { p_nutrition: Json }; Returns: boolean }
      recipe_steps_within_limits: {
        Args: { p_items: Json; p_require_one: boolean }
        Returns: boolean
      }
      recipe_tags_within_limits: {
        Args: { p_tags: string[] }
        Returns: boolean
      }
      record_in_app_message_event: {
        Args: { p_button?: string; p_event: string; p_message_id: string }
        Returns: undefined
      }
      refund_daily_ai_usage: {
        Args: { p_action: string; p_usage_date: string; p_user_id: string }
        Returns: boolean
      }
      refund_daily_remix: {
        Args: { p_usage_date: string; p_user_id: string }
        Returns: boolean
      }
      refund_guest_daily_ai_usage: {
        Args: { p_action: string; p_install_id: string; p_usage_date: string }
        Returns: boolean
      }
      refund_guest_extraction: {
        Args: {
          p_install_id: string
          p_reason?: string
          p_reservation_id: string
        }
        Returns: boolean
      }
      refund_recipe_credit: {
        Args: { p_reason?: string; p_reservation_id: string; p_user_id: string }
        Returns: boolean
      }
      refund_recipe_credit_after_finalize_failure: {
        Args: { p_reservation_id: string; p_user_id: string }
        Returns: boolean
      }
      refund_recipe_remix: {
        Args: { p_recipe_id?: string; p_source_url?: string; p_user_id: string }
        Returns: boolean
      }
      refund_stale_extraction_reservations: {
        Args: { p_before?: string }
        Returns: Json
      }
      refund_stale_guest_extractions: {
        Args: { p_before?: string }
        Returns: number
      }
      refund_stale_recipe_credits: {
        Args: { p_before?: string }
        Returns: number
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      remember_recipe_diets: {
        Args: { p_diets: string[]; p_ingredients: Json; p_user_id: string }
        Returns: number
      }
      remove_household_member: { Args: { p_user_id: string }; Returns: Json }
      renew_household_invite: { Args: never; Returns: Json }
      reopen_refunded_recipe_credit: {
        Args: {
          p_free_limit?: number
          p_idempotency_key: string
          p_user_id: string
          p_year_month: string
        }
        Returns: Json
      }
      request_ip_key: { Args: never; Returns: string }
      reserve_daily_ai_usage: {
        Args: {
          p_action: string
          p_limit: number
          p_usage_date: string
          p_user_id: string
        }
        Returns: number
      }
      reserve_daily_remix: {
        Args: { p_limit?: number; p_usage_date: string; p_user_id: string }
        Returns: number
      }
      reserve_free_extract: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: number
      }
      reserve_guest_daily_ai_usage: {
        Args: {
          p_action: string
          p_install_id: string
          p_limit: number
          p_usage_date: string
        }
        Returns: number
      }
      reserve_guest_extraction: {
        Args: { p_install_id: string; p_limit?: number }
        Returns: number
      }
      reserve_guest_extraction_v2: {
        Args: {
          p_idempotency_key: string
          p_install_id: string
          p_limit?: number
        }
        Returns: Json
      }
      reserve_monthly_extract: {
        Args: { p_limit?: number; p_user_id: string; p_year_month: string }
        Returns: number
      }
      reserve_recipe_credit: {
        Args: {
          p_free_limit?: number
          p_idempotency_key: string
          p_user_id: string
          p_year_month: string
        }
        Returns: Json
      }
      reserve_recipe_remix: {
        Args: {
          p_limit?: number
          p_recipe_id?: string
          p_source_url?: string
          p_user_id: string
        }
        Returns: number
      }
      revoke_purchased_credits: {
        Args: {
          p_event_id: string
          p_metadata?: Json
          p_provider: string
          p_transaction_id: string
        }
        Returns: number
      }
      set_household_staples: {
        Args: { p_previous?: string[]; p_staples: string[] }
        Returns: string[]
      }
      set_my_household_display_name: {
        Args: { p_display_name: string }
        Returns: Json
      }
      set_up_household: {
        Args: { p_avatar: string; p_display_name: string; p_name: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spend_tokens: {
        Args: {
          p_amount: number
          p_metadata?: Json
          p_reason: string
          p_ref_id?: string
          p_user_id: string
        }
        Returns: number
      }
      stop_household_invite: { Args: never; Returns: undefined }
      submit_website_feedback: {
        Args: { p_email?: string; p_locale?: string; p_message: string }
        Returns: undefined
      }
      support_email_secret_matches: {
        Args: { p_secret: string }
        Returns: boolean
      }
      take_rate_limit: {
        Args: {
          p_bucket: string
          p_key: string
          p_max: number
          p_units?: number
          p_window: string
        }
        Returns: boolean
      }
      touch_recipe_card_hit: { Args: { p_card_id: string }; Returns: undefined }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      update_household: {
        Args: { p_avatar: string; p_name: string }
        Returns: Json
      }
      welcome_email_candidates: {
        Args: { p_limit?: number }
        Returns: {
          email: string
          locale: string
          unsubscribe_token: string
          user_id: string
        }[]
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

