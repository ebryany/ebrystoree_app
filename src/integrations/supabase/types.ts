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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      academic_order_attachments: {
        Row: {
          attachment_type: string
          created_at: string
          deleted_at: string | null
          draft_key: string | null
          file_size: number
          id: string
          mime_type: string | null
          order_id: string | null
          original_name: string
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          attachment_type: string
          created_at?: string
          deleted_at?: string | null
          draft_key?: string | null
          file_size: number
          id?: string
          mime_type?: string | null
          order_id?: string | null
          original_name: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          attachment_type?: string
          created_at?: string
          deleted_at?: string | null
          draft_key?: string | null
          file_size?: number
          id?: string
          mime_type?: string | null
          order_id?: string | null
          original_name?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_order_attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          note: string | null
          priority: string
          source_id: string | null
          source_type: string
          status: string
          task_number: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          note?: string | null
          priority?: string
          source_id?: string | null
          source_type: string
          status?: string
          task_number?: string
          task_type: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          note?: string | null
          priority?: string
          source_id?: string | null
          source_type?: string
          status?: string
          task_number?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_daily: {
        Row: {
          day: string
          dimension: string
          metric: string
          updated_at: string
          value: number
        }
        Insert: {
          day: string
          dimension?: string
          metric: string
          updated_at?: string
          value?: number
        }
        Update: {
          day?: string
          dimension?: string
          metric?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          is_bot: boolean
          path: string
          referrer_host: string | null
          session_hash: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          is_bot?: boolean
          path: string
          referrer_host?: string | null
          session_hash: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          is_bot?: boolean
          path?: string
          referrer_host?: string | null
          session_hash?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      article_status_history: {
        Row: {
          actor_id: string | null
          article_id: string
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          article_id: string
          created_at?: string
          from_status?: string | null
          id?: number
          note?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          article_id?: string
          created_at?: string
          from_status?: string | null
          id?: number
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_status_history_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          author_name: string | null
          checklist: Json
          content: string
          cover_url: string | null
          created_at: string
          deleted_at: string | null
          excerpt: string | null
          id: string
          published_at: string | null
          reading_minutes: number
          scheduled_at: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          checklist?: Json
          content?: string
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          reading_minutes?: number
          scheduled_at?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          checklist?: Json
          content?: string
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          reading_minutes?: number
          scheduled_at?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          reason: string | null
          trace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          reason?: string | null
          trace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          reason?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          name: string
          note: string | null
          starts_at: string | null
          status: string
          updated_at: string
          utm_campaign: string
          utm_medium: string | null
          utm_source: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          name: string
          note?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          utm_campaign: string
          utm_medium?: string | null
          utm_source: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          note?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string
          utm_medium?: string | null
          utm_source?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          slug: string
          sort_order: number
          tone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: string
          name: string
          slug: string
          sort_order?: number
          tone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          slug?: string
          sort_order?: number
          tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          direction: string
          id: string
          idempotency_key: string
          note: string | null
          reference: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          idempotency_key: string
          note?: string | null
          reference?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          idempotency_key?: string
          note?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_topups: {
        Row: {
          amount: number
          created_at: string
          expires_at: string | null
          id: string
          paid_amount: number | null
          paid_at: string | null
          payment_url: string | null
          provider: string | null
          provider_payment_id: string | null
          qr_reference: string | null
          status: string
          topup_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          qr_reference?: string | null
          status?: string
          topup_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          qr_reference?: string | null
          status?: string
          topup_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_orders: {
        Row: {
          budget_estimate: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          category_id: string | null
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          delivered_at: string | null
          description: string
          dp_amount: number | null
          dp_percent: number
          id: string
          last_message_at: string
          quote_note: string | null
          quoted_at: string | null
          quoted_by: string | null
          quoted_total: number | null
          reference_url: string | null
          request_number: string
          result_note: string | null
          result_url: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_estimate?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          delivered_at?: string | null
          description: string
          dp_amount?: number | null
          dp_percent?: number
          id?: string
          last_message_at?: string
          quote_note?: string | null
          quoted_at?: string | null
          quoted_by?: string | null
          quoted_total?: number | null
          reference_url?: string | null
          request_number?: string
          result_note?: string | null
          result_url?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_estimate?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          category_id?: string | null
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          delivered_at?: string | null
          description?: string
          dp_amount?: number | null
          dp_percent?: number
          id?: string
          last_message_at?: string
          quote_note?: string | null
          quoted_at?: string | null
          quoted_by?: string | null
          quoted_total?: number | null
          reference_url?: string | null
          request_number?: string
          result_note?: string | null
          result_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_orders_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_entitlements: {
        Row: {
          created_at: string
          download_count: number
          download_limit: number
          file_version: string | null
          id: string
          order_id: string
          order_item_id: string
          product_id: string
          revoked_at: string | null
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          download_limit?: number
          file_version?: string | null
          id?: string
          order_id: string
          order_item_id: string
          product_id: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until: string
        }
        Update: {
          created_at?: string
          download_count?: number
          download_limit?: number
          file_version?: string | null
          id?: string
          order_id?: string
          order_item_id?: string
          product_id?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_entitlements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_entitlements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_order_receipts: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          order_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          order_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_order_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_product_files: {
        Row: {
          assigned_at: string | null
          assigned_entitlement_id: string | null
          created_at: string
          id: string
          is_active: boolean
          mime_type: string | null
          original_name: string
          product_id: string
          size_bytes: number | null
          storage_path: string
          version: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_entitlement_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          original_name: string
          product_id: string
          size_bytes?: number | null
          storage_path: string
          version?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_entitlement_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          original_name?: string
          product_id?: string
          size_bytes?: number | null
          storage_path?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_product_files_assigned_entitlement_id_fkey"
            columns: ["assigned_entitlement_id"]
            isOneToOne: false
            referencedRelation: "digital_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_product_files_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_products: {
        Row: {
          available_stock: number
          category_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          delivery_mode: string
          description: string | null
          discount_price: number | null
          download_limit: number
          id: string
          is_test_data: boolean
          moderation_note: string | null
          moderation_status: string
          name: string
          price: number
          reviewed_at: string | null
          reviewed_by: string | null
          search_vector: unknown
          short_description: string | null
          slug: string
          sold_count: number
          status: string
          store_id: string | null
          thumbnail_url: string | null
          updated_at: string
          usage_notes: string | null
          validity_days: number
          version: string | null
        }
        Insert: {
          available_stock?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          delivery_mode?: string
          description?: string | null
          discount_price?: number | null
          download_limit?: number
          id?: string
          is_test_data?: boolean
          moderation_note?: string | null
          moderation_status?: string
          name: string
          price: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_vector?: unknown
          short_description?: string | null
          slug: string
          sold_count?: number
          status?: string
          store_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          usage_notes?: string | null
          validity_days?: number
          version?: string | null
        }
        Update: {
          available_stock?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          delivery_mode?: string
          description?: string | null
          discount_price?: number | null
          download_limit?: number
          id?: string
          is_test_data?: boolean
          moderation_note?: string | null
          moderation_status?: string
          name?: string
          price?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_vector?: unknown
          short_description?: string | null
          slug?: string
          sold_count?: number
          status?: string
          store_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          usage_notes?: string | null
          validity_days?: number
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      download_logs: {
        Row: {
          downloaded_at: string
          entitlement_id: string
          file_id: string | null
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          downloaded_at?: string
          entitlement_id: string
          file_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          downloaded_at?: string
          entitlement_id?: string
          file_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_logs_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "digital_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "digital_product_files"
            referencedColumns: ["id"]
          },
        ]
      }
      email_dispatch_log: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          error: string | null
          event: string
          id: string
          provider_id: string | null
          recipient_email: string
          recipient_id: string
          sent_at: string | null
          status: string
          template: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          error?: string | null
          event: string
          id?: string
          provider_id?: string | null
          recipient_email: string
          recipient_id: string
          sent_at?: string | null
          status?: string
          template: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          error?: string | null
          event?: string
          id?: string
          provider_id?: string | null
          recipient_email?: string
          recipient_id?: string
          sent_at?: string | null
          status?: string
          template?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          admin_fee: number
          billing_info: Json
          created_at: string
          currency: string
          customer_snapshot: Json
          discount: number
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string
          order_id: string
          paid_at: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          admin_fee?: number
          billing_info?: Json
          created_at?: string
          currency?: string
          customer_snapshot?: Json
          discount?: number
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          admin_fee?: number
          billing_info?: Json
          created_at?: string
          currency?: string
          customer_snapshot?: Json
          discount?: number
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id?: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_progress: {
        Row: {
          assignment_id: string | null
          created_at: string
          id: string
          is_public: boolean
          note: string
          operator_id: string
          order_id: string
          percent: number
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          note: string
          operator_id: string
          order_id: string
          percent?: number
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          note?: string
          operator_id?: string
          order_id?: string
          percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operator_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_progress_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_results: {
        Row: {
          assignment_id: string | null
          attachments: Json
          created_at: string
          delivery_note: string | null
          id: string
          operator_id: string
          order_id: string
          result_url: string | null
          reviewed_at: string | null
          status: string
          submitted_at: string
          summary: string
          updated_at: string
          version: number
        }
        Insert: {
          assignment_id?: string | null
          attachments?: Json
          created_at?: string
          delivery_note?: string | null
          id?: string
          operator_id: string
          order_id: string
          result_url?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          summary: string
          updated_at?: string
          version?: number
        }
        Update: {
          assignment_id?: string | null
          attachments?: Json
          created_at?: string
          delivery_note?: string | null
          id?: string
          operator_id?: string
          order_id?: string
          result_url?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          summary?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_results_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operator_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_revisions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_chargeable: boolean
          order_id: string
          reason: string
          resolved_at: string | null
          result_id: string | null
          sequence: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_chargeable?: boolean
          order_id: string
          reason: string
          resolved_at?: string | null
          result_id?: string | null
          sequence?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_chargeable?: boolean
          order_id?: string
          reason?: string
          resolved_at?: string | null
          result_id?: string | null
          sequence?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_revisions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_revisions_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "job_results"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payment_proofs: {
        Row: {
          amount_claimed: number | null
          created_at: string
          customer_id: string
          customer_note: string | null
          file_path: string
          id: string
          mime_type: string | null
          original_filename: string
          payment_id: string
          sender_name: string | null
          size_bytes: number | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          amount_claimed?: number | null
          created_at?: string
          customer_id: string
          customer_note?: string | null
          file_path: string
          id?: string
          mime_type?: string | null
          original_filename: string
          payment_id: string
          sender_name?: string | null
          size_bytes?: number | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          amount_claimed?: number | null
          created_at?: string
          customer_id?: string
          customer_note?: string | null
          file_path?: string
          id?: string
          mime_type?: string | null
          original_filename?: string
          payment_id?: string
          sender_name?: string | null
          size_bytes?: number | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payment_proofs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_service_deliveries: {
        Row: {
          created_at: string
          created_by: string
          file_size: number | null
          id: string
          kind: string
          mime_type: string | null
          note: string | null
          order_id: string
          original_name: string | null
          storage_path: string | null
          summary: string
          url: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_size?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          note?: string | null
          order_id: string
          original_name?: string | null
          storage_path?: string | null
          summary: string
          url?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_size?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          note?: string | null
          order_id?: string
          original_name?: string | null
          storage_path?: string | null
          summary?: string
          url?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_service_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_service_events: {
        Row: {
          actor_id: string
          actor_role: string
          created_at: string
          delivery_id: string | null
          event_type: string
          id: number
          order_id: string
          payload: Json
        }
        Insert: {
          actor_id: string
          actor_role: string
          created_at?: string
          delivery_id?: string | null
          event_type: string
          id?: never
          order_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string
          actor_role?: string
          created_at?: string
          delivery_id?: string | null
          event_type?: string
          id?: never
          order_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_service_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "marketplace_service_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_service_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_service_orders: {
        Row: {
          accepted_at: string | null
          accepted_delivery_id: string | null
          agreement: Json
          agreement_version: number
          complaint_open: boolean
          created_at: string
          due_at: string | null
          latest_delivery_id: string | null
          order_id: string
          prior_order_status: string | null
          prior_work_state: string | null
          ready_at: string | null
          requirements: Json | null
          requirements_approved_at: string | null
          requirements_version: number
          revision_limit: number
          revision_used: number
          service_id: string
          store_id: string
          updated_at: string
          work_state: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_delivery_id?: string | null
          agreement: Json
          agreement_version: number
          complaint_open?: boolean
          created_at?: string
          due_at?: string | null
          latest_delivery_id?: string | null
          order_id: string
          prior_order_status?: string | null
          prior_work_state?: string | null
          ready_at?: string | null
          requirements?: Json | null
          requirements_approved_at?: string | null
          requirements_version?: number
          revision_limit: number
          revision_used?: number
          service_id: string
          store_id: string
          updated_at?: string
          work_state?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_delivery_id?: string | null
          agreement?: Json
          agreement_version?: number
          complaint_open?: boolean
          created_at?: string
          due_at?: string | null
          latest_delivery_id?: string | null
          order_id?: string
          prior_order_status?: string | null
          prior_work_state?: string | null
          ready_at?: string | null
          requirements?: Json | null
          requirements_approved_at?: string | null
          requirements_version?: number
          revision_limit?: number
          revision_used?: number
          service_id?: string
          store_id?: string
          updated_at?: string
          work_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_service_orders_accepted_delivery_fk"
            columns: ["accepted_delivery_id"]
            isOneToOne: false
            referencedRelation: "marketplace_service_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_service_orders_latest_delivery_fk"
            columns: ["latest_delivery_id"]
            isOneToOne: false
            referencedRelation: "marketplace_service_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_service_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_service_orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "marketplace_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_service_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_services: {
        Row: {
          agreement: Json
          category_id: string
          created_at: string
          id: string
          media: Json
          moderation_note: string | null
          name: string
          price: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string
          updated_at: string
          version: number
        }
        Insert: {
          agreement: Json
          category_id: string
          created_at?: string
          id?: string
          media?: Json
          moderation_note?: string | null
          name: string
          price: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          agreement?: Json
          category_id?: string
          created_at?: string
          id?: string
          media?: Json
          moderation_note?: string | null
          name?: string
          price?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_services_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          related_id: string | null
          related_type: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          related_id?: string | null
          related_type?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      operator_assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          id: string
          internal_note: string | null
          operator_id: string
          order_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          id?: string
          internal_note?: string | null
          operator_id: string
          order_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          id?: string
          internal_note?: string | null
          operator_id?: string
          order_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          addon_id: string | null
          created_at: string
          discount: number
          id: string
          item_type: string
          marketplace_service_id: string | null
          metadata: Json
          name_snapshot: string
          order_id: string
          package_id: string | null
          product_id: string | null
          quantity: number
          service_id: string | null
          sku_snapshot: string | null
          store_id: string | null
          store_name_snapshot: string | null
          total: number
          unit_price: number
        }
        Insert: {
          addon_id?: string | null
          created_at?: string
          discount?: number
          id?: string
          item_type: string
          marketplace_service_id?: string | null
          metadata?: Json
          name_snapshot: string
          order_id: string
          package_id?: string | null
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          sku_snapshot?: string | null
          store_id?: string | null
          store_name_snapshot?: string | null
          total: number
          unit_price: number
        }
        Update: {
          addon_id?: string | null
          created_at?: string
          discount?: number
          id?: string
          item_type?: string
          marketplace_service_id?: string | null
          metadata?: Json
          name_snapshot?: string
          order_id?: string
          package_id?: string | null
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          sku_snapshot?: string | null
          store_id?: string | null
          store_name_snapshot?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "service_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_marketplace_service_id_fkey"
            columns: ["marketplace_service_id"]
            isOneToOne: false
            referencedRelation: "marketplace_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_histories: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          internal_note: string | null
          metadata: Json
          new_status: string
          order_id: string
          previous_status: string | null
          public_note: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          internal_note?: string | null
          metadata?: Json
          new_status: string
          order_id: string
          previous_status?: string | null
          public_note?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          internal_note?: string | null
          metadata?: Json
          new_status?: string
          order_id?: string
          previous_status?: string | null
          public_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_histories_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_fee: number
          amount_due: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          credit_used: number
          currency: string
          customer_note: string | null
          discount_total: number
          expired_at: string | null
          id: string
          internal_note: string | null
          is_test_data: boolean
          order_number: string
          order_type: string
          paid_at: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_fee?: number
          amount_due?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          credit_used?: number
          currency?: string
          customer_note?: string | null
          discount_total?: number
          expired_at?: string | null
          id?: string
          internal_note?: string | null
          is_test_data?: boolean
          order_number?: string
          order_type: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_fee?: number
          amount_due?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          credit_used?: number
          currency?: string
          customer_note?: string | null
          discount_total?: number
          expired_at?: string | null
          id?: string
          internal_note?: string | null
          is_test_data?: boolean
          order_number?: string
          order_type?: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          external_event_id: string
          id: string
          payload_hash: string | null
          payment_id: string | null
          processed_at: string | null
          processing_status: string
          provider: string
          signature_valid: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          external_event_id: string
          id?: string
          payload_hash?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processing_status?: string
          provider: string
          signature_valid?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          payload_hash?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processing_status?: string
          provider?: string
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_verifications: {
        Row: {
          created_at: string
          decision: string
          id: string
          new_status: string
          payment_id: string
          previous_status: string
          proof_id: string | null
          reason: string | null
          verified_at: string
          verifier_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          new_status: string
          payment_id: string
          previous_status: string
          proof_id?: string | null
          reason?: string | null
          verified_at?: string
          verifier_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          new_status?: string
          payment_id?: string
          previous_status?: string
          proof_id?: string | null
          reason?: string | null
          verified_at?: string
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_verifications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_verifications_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "manual_payment_proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          created_at: string
          currency: string
          expected_amount: number
          expired_at: string | null
          external_transaction_id: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          method: string
          order_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_number: string
          payment_url: string | null
          provider: string
          qr_reference: string | null
          reupload_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          expected_amount: number
          expired_at?: string | null
          external_transaction_id?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key: string
          method?: string
          order_id: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_number?: string
          payment_url?: string | null
          provider?: string
          qr_reference?: string | null
          reupload_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          expected_amount?: number
          expired_at?: string | null
          external_transaction_id?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          method?: string
          order_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_number?: string
          payment_url?: string | null
          provider?: string
          qr_reference?: string | null
          reupload_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          group_name: string
          is_transactional: boolean
          key: string
        }
        Insert: {
          created_at?: string
          description: string
          group_name: string
          is_transactional?: boolean
          key: string
        }
        Update: {
          created_at?: string
          description?: string
          group_name?: string
          is_transactional?: boolean
          key?: string
        }
        Relationships: []
      }
      po_messages: {
        Row: {
          attachment_path: string | null
          body: string
          created_at: string
          id: string
          is_system: boolean
          request_id: string
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          attachment_path?: string | null
          body: string
          created_at?: string
          id?: string
          is_system?: boolean
          request_id: string
          sender_id?: string | null
          sender_role?: string
        }
        Update: {
          attachment_path?: string | null
          body?: string
          created_at?: string
          id?: string
          is_system?: boolean
          request_id?: string
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "custom_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          note: string | null
          proof_path: string | null
          reject_reason: string | null
          request_id: string
          sender_name: string | null
          stage: string
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          proof_path?: string | null
          reject_reason?: string | null
          request_id: string
          sender_name?: string | null
          stage: string
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          proof_path?: string | null
          reject_reason?: string | null
          request_id?: string
          sender_name?: string | null
          stage?: string
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_payments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "custom_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_inquiries: {
        Row: {
          created_at: string
          customer_read_at: string | null
          id: string
          last_message_at: string
          last_message_body: string | null
          last_message_role: string | null
          merchant_read_at: string | null
          product_id: string | null
          service_id: string | null
          status: string
          store_id: string | null
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_read_at?: string | null
          id?: string
          last_message_at?: string
          last_message_body?: string | null
          last_message_role?: string | null
          merchant_read_at?: string | null
          product_id?: string | null
          service_id?: string | null
          status?: string
          store_id?: string | null
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_read_at?: string | null
          id?: string
          last_message_at?: string
          last_message_body?: string | null
          last_message_role?: string | null
          merchant_read_at?: string | null
          product_id?: string | null
          service_id?: string | null
          status?: string
          store_id?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_inquiries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "marketplace_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_inquiries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_inquiry_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          inquiry_id: string
          is_system: boolean
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
          is_system?: boolean
          sender_id?: string | null
          sender_role?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          is_system?: boolean
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "product_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      product_likes: {
        Row: { created_at: string; product_id: string; user_id: string }
        Insert: { created_at?: string; product_id: string; user_id: string }
        Update: { created_at?: string; product_id?: string; user_id?: string }
        Relationships: [
          {
            foreignKeyName: "product_likes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_follows: {
        Row: { created_at: string; store_id: string; user_id: string }
        Insert: { created_at?: string; store_id: string; user_id: string }
        Update: { created_at?: string; store_id?: string; user_id?: string }
        Relationships: [
          {
            foreignKeyName: "store_follows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          discount_price: number | null
          id: string
          is_active: boolean
          name: string
          price: number
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_price?: number | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_price?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_visible: boolean
          order_id: string | null
          product_id: string
          rating: number
          reviewer_name: string | null
          store_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          order_id?: string | null
          product_id: string
          rating: number
          reviewer_name?: string | null
          store_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          order_id?: string | null
          product_id?: string
          rating?: number
          reviewer_name?: string | null
          store_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock_codes: {
        Row: {
          assigned_at: string | null
          assigned_entitlement_id: string | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          note: string | null
          product_id: string
          source: string
          source_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_entitlement_id?: string | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          product_id: string
          source?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_entitlement_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          product_id?: string
          source?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_codes_assigned_entitlement_id_fkey"
            columns: ["assigned_entitlement_id"]
            isOneToOne: false
            referencedRelation: "digital_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          email_notifications_enabled: boolean
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          email_notifications_enabled?: boolean
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          email_notifications_enabled?: boolean
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          subject: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          subject: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          subject?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          decision_note: string | null
          id: string
          order_id: string
          payment_id: string | null
          processed_at: string | null
          processing_reference: string | null
          reason: string
          refund_number: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          decision_note?: string | null
          id?: string
          order_id: string
          payment_id?: string | null
          processed_at?: string | null
          processing_reference?: string | null
          reason: string
          refund_number?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          decision_note?: string | null
          id?: string
          order_id?: string
          payment_id?: string | null
          processed_at?: string | null
          processing_reference?: string | null
          reason?: string
          refund_number?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      scheduled_job_runs: {
        Row: {
          affected_count: number
          detail: Json
          error_message: string | null
          finished_at: string
          id: string
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          affected_count?: number
          detail?: Json
          error_message?: string | null
          finished_at?: string
          id?: string
          job_name: string
          started_at?: string
          status?: string
        }
        Update: {
          affected_count?: number
          detail?: Json
          error_message?: string | null
          finished_at?: string
          id?: string
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      seller_bank_accounts: {
        Row: {
          account_holder_name: string
          account_number: string
          bank_name: string
          created_at: string
          id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_bank_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          direction: string
          gross_amount: number
          id: string
          idempotency_key: string
          note: string | null
          order_id: string | null
          platform_fee: number
          reference: string | null
          source_id: string | null
          source_type: string
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          direction: string
          gross_amount?: number
          id?: string
          idempotency_key: string
          note?: string | null
          order_id?: string | null
          platform_fee?: number
          reference?: string | null
          source_id?: string | null
          source_type: string
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          gross_amount?: number
          id?: string
          idempotency_key?: string
          note?: string | null
          order_id?: string | null
          platform_fee?: number
          reference?: string | null
          source_id?: string | null
          source_type?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audit_results: {
        Row: {
          checked_at: string
          detail: string | null
          id: string
          ignored_at: string | null
          ignored_by: string | null
          issue_code: string
          severity: string
          url_path: string
        }
        Insert: {
          checked_at?: string
          detail?: string | null
          id?: string
          ignored_at?: string | null
          ignored_by?: string | null
          issue_code: string
          severity: string
          url_path: string
        }
        Update: {
          checked_at?: string
          detail?: string | null
          id?: string
          ignored_at?: string | null
          ignored_by?: string | null
          issue_code?: string
          severity?: string
          url_path?: string
        }
        Relationships: []
      }
      service_addons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          service_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          service_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          service_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_addons_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_details: {
        Row: {
          academic_category_id: string | null
          addon_total_snapshot: number | null
          addons_snapshot: Json
          assignment_description: string | null
          assignment_title: string | null
          citation_style: string | null
          course_name: string | null
          created_at: string
          customer_deadline: string | null
          customer_timezone: string | null
          dataset_description: string | null
          discount_snapshot: number | null
          education_level: string | null
          estimated_days: number
          estimated_pages: number | null
          extra_fields: Json
          file_format: string | null
          id: string
          institution_name: string | null
          integrity_accepted_at: string | null
          integrity_policy_version: string | null
          internal_deadline: string | null
          language: string | null
          lecturer_instructions: string | null
          no_credential_accepted_at: string | null
          official_deadline_at: string | null
          order_id: string
          output_type: string | null
          package_price_snapshot: number | null
          package_snapshot: Json
          presentation_duration: number | null
          pricing_breakdown: Json
          pricing_version: string | null
          requirements: Json
          requirements_complete: boolean
          requirements_note: string | null
          reviewer_fee_snapshot: number | null
          revision_allowance: number
          revision_limit_snapshot: number | null
          scope_flags: string[]
          scope_review_note: string | null
          scope_review_status: string
          scope_reviewed_at: string | null
          scope_reviewed_by: string | null
          software_required: string | null
          special_notes: string | null
          study_program: string | null
          subtotal_snapshot: number | null
          total_snapshot: number | null
          updated_at: string
          urgency_fee_snapshot: number | null
          urgency_level: string | null
        }
        Insert: {
          academic_category_id?: string | null
          addon_total_snapshot?: number | null
          addons_snapshot?: Json
          assignment_description?: string | null
          assignment_title?: string | null
          citation_style?: string | null
          course_name?: string | null
          created_at?: string
          customer_deadline?: string | null
          customer_timezone?: string | null
          dataset_description?: string | null
          discount_snapshot?: number | null
          education_level?: string | null
          estimated_days?: number
          estimated_pages?: number | null
          extra_fields?: Json
          file_format?: string | null
          id?: string
          institution_name?: string | null
          integrity_accepted_at?: string | null
          integrity_policy_version?: string | null
          internal_deadline?: string | null
          language?: string | null
          lecturer_instructions?: string | null
          no_credential_accepted_at?: string | null
          official_deadline_at?: string | null
          order_id: string
          output_type?: string | null
          package_price_snapshot?: number | null
          package_snapshot?: Json
          presentation_duration?: number | null
          pricing_breakdown?: Json
          pricing_version?: string | null
          requirements?: Json
          requirements_complete?: boolean
          requirements_note?: string | null
          reviewer_fee_snapshot?: number | null
          revision_allowance?: number
          revision_limit_snapshot?: number | null
          scope_flags?: string[]
          scope_review_note?: string | null
          scope_review_status?: string
          scope_reviewed_at?: string | null
          scope_reviewed_by?: string | null
          software_required?: string | null
          special_notes?: string | null
          study_program?: string | null
          subtotal_snapshot?: number | null
          total_snapshot?: number | null
          updated_at?: string
          urgency_fee_snapshot?: number | null
          urgency_level?: string | null
        }
        Update: {
          academic_category_id?: string | null
          addon_total_snapshot?: number | null
          addons_snapshot?: Json
          assignment_description?: string | null
          assignment_title?: string | null
          citation_style?: string | null
          course_name?: string | null
          created_at?: string
          customer_deadline?: string | null
          customer_timezone?: string | null
          dataset_description?: string | null
          discount_snapshot?: number | null
          education_level?: string | null
          estimated_days?: number
          estimated_pages?: number | null
          extra_fields?: Json
          file_format?: string | null
          id?: string
          institution_name?: string | null
          integrity_accepted_at?: string | null
          integrity_policy_version?: string | null
          internal_deadline?: string | null
          language?: string | null
          lecturer_instructions?: string | null
          no_credential_accepted_at?: string | null
          official_deadline_at?: string | null
          order_id?: string
          output_type?: string | null
          package_price_snapshot?: number | null
          package_snapshot?: Json
          presentation_duration?: number | null
          pricing_breakdown?: Json
          pricing_version?: string | null
          requirements?: Json
          requirements_complete?: boolean
          requirements_note?: string | null
          reviewer_fee_snapshot?: number | null
          revision_allowance?: number
          revision_limit_snapshot?: number | null
          scope_flags?: string[]
          scope_review_note?: string | null
          scope_review_status?: string
          scope_reviewed_at?: string | null
          scope_reviewed_by?: string | null
          software_required?: string | null
          special_notes?: string | null
          study_program?: string | null
          subtotal_snapshot?: number | null
          total_snapshot?: number | null
          updated_at?: string
          urgency_fee_snapshot?: number | null
          urgency_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_details_academic_category_id_fkey"
            columns: ["academic_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          created_at: string
          description: string | null
          estimated_days: number
          free_revisions: number
          id: string
          included_outputs: string[]
          is_active: boolean
          is_test_data: boolean
          maximum_pages: number | null
          name: string
          price: number
          priority: string
          quality_review_included: boolean
          service_id: string
          sla_hours: number | null
          sort_order: number
          updated_at: string
          urgency_supported: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_days?: number
          free_revisions?: number
          id?: string
          included_outputs?: string[]
          is_active?: boolean
          is_test_data?: boolean
          maximum_pages?: number | null
          name: string
          price: number
          priority?: string
          quality_review_included?: boolean
          service_id: string
          sla_hours?: number | null
          sort_order?: number
          updated_at?: string
          urgency_supported?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_days?: number
          free_revisions?: number
          id?: string
          included_outputs?: string[]
          is_active?: boolean
          is_test_data?: boolean
          maximum_pages?: number | null
          name?: string
          price?: number
          priority?: string
          quality_review_included?: boolean
          service_id?: string
          sla_hours?: number | null
          sort_order?: number
          updated_at?: string
          urgency_supported?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          academic_category_id: string | null
          allows_attachments: boolean
          category_id: string | null
          created_at: string
          default_revision_limit: number
          default_sla_hours: number
          deleted_at: string | null
          description: string | null
          id: string
          integrity_policy_version: string
          is_test_data: boolean
          name: string
          order_capacity: number | null
          requirements_note: string | null
          requires_dataset: boolean
          requires_quality_review: boolean
          requires_rubric: boolean
          short_description: string | null
          slug: string
          status: string
          supported_citation_styles: string[]
          supported_education_levels: string[]
          supported_fields: string[]
          supported_outputs: string[]
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          academic_category_id?: string | null
          allows_attachments?: boolean
          category_id?: string | null
          created_at?: string
          default_revision_limit?: number
          default_sla_hours?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          integrity_policy_version?: string
          is_test_data?: boolean
          name: string
          order_capacity?: number | null
          requirements_note?: string | null
          requires_dataset?: boolean
          requires_quality_review?: boolean
          requires_rubric?: boolean
          short_description?: string | null
          slug: string
          status?: string
          supported_citation_styles?: string[]
          supported_education_levels?: string[]
          supported_fields?: string[]
          supported_outputs?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          academic_category_id?: string | null
          allows_attachments?: boolean
          category_id?: string | null
          created_at?: string
          default_revision_limit?: number
          default_sla_hours?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          integrity_policy_version?: string
          is_test_data?: boolean
          name?: string
          order_capacity?: number | null
          requirements_note?: string | null
          requires_dataset?: boolean
          requires_quality_review?: boolean
          requires_rubric?: boolean
          short_description?: string | null
          slug?: string
          status?: string
          supported_citation_styles?: string[]
          supported_education_levels?: string[]
          supported_fields?: string[]
          supported_outputs?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_academic_category_id_fkey"
            columns: ["academic_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          banner_position: number
          banner_url: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          is_platform: boolean
          logo_url: string | null
          name: string
          owner_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          status: string
          suspended_reason: string | null
          updated_at: string
          verification_note: string | null
        }
        Insert: {
          banner_position?: number
          banner_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_platform?: boolean
          logo_url?: string | null
          name: string
          owner_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          status?: string
          suspended_reason?: string | null
          updated_at?: string
          verification_note?: string | null
        }
        Update: {
          banner_position?: number
          banner_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_platform?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          status?: string
          suspended_reason?: string | null
          updated_at?: string
          verification_note?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      telegram_dispatch_log: {
        Row: {
          event: string
          id: string
          order_id: string
          sent_at: string
        }
        Insert: {
          event: string
          id?: string
          order_id: string
          sent_at?: string
        }
        Update: {
          event?: string
          id?: string
          order_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_dispatch_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          note: string | null
          withdrawal_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          withdrawal_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_events_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          bank_account_holder: string
          bank_account_number: string
          bank_name: string
          bank_reference: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          fee_amount: number
          fee_bps: number
          gross_amount: number
          id: string
          idempotency_key: string
          net_amount: number
          requested_by: string
          status: string
          store_id: string
          transfer_note: string | null
          transferred_at: string | null
          transferred_by: string | null
          updated_at: string
          withdrawal_number: string
        }
        Insert: {
          bank_account_holder: string
          bank_account_number: string
          bank_name: string
          bank_reference?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          fee_amount: number
          fee_bps: number
          gross_amount: number
          id?: string
          idempotency_key: string
          net_amount: number
          requested_by: string
          status?: string
          store_id: string
          transfer_note?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          updated_at?: string
          withdrawal_number?: string
        }
        Update: {
          bank_account_holder?: string
          bank_account_number?: string
          bank_name?: string
          bank_reference?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          fee_amount?: number
          fee_bps?: number
          gross_amount?: number
          id?: string
          idempotency_key?: string
          net_amount?: number
          requested_by?: string
          status?: string
          store_id?: string
          transfer_note?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          updated_at?: string
          withdrawal_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_service_delivery: {
        Args: { _delivery_id: string; _order_id: string }
        Returns: Json
      }
      activate_paid_marketplace_service: {
        Args: { _order_id: string }
        Returns: undefined
      }
      admin_broadcast_notification: {
        Args: {
          _audience?: string
          _link?: string
          _message: string
          _role?: string
          _title: string
          _type?: string
          _user_ids?: string[]
        }
        Returns: Json
      }
      admin_list_stores: {
        Args: { _search?: string; _status?: string }
        Returns: {
          balance: number
          contact_email: string
          contact_phone: string
          created_at: string
          description: string
          id: string
          is_platform: boolean
          logo_url: string
          name: string
          owner_id: string
          owner_name: string
          product_pending: number
          product_published: number
          product_total: number
          rating_average: number
          rating_total: number
          reviewed_at: string
          slug: string
          status: string
          suspended_reason: string
          verification_note: string
        }[]
      }
      admin_marketplace_overview: { Args: never; Returns: Json }
      admin_seller_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          orders_paid: number
          products_published: number
          rating_average: number
          sales_amount: number
          store_id: string
          store_name: string
          store_slug: string
          store_status: string
        }[]
      }
      admin_store_ledger: {
        Args: { _limit?: number; _store_id: string }
        Returns: {
          amount: number
          created_at: string
          direction: string
          gross_amount: number
          id: string
          note: string
          platform_fee: number
          reference: string
          source_type: string
        }[]
      }
      admin_store_orders: {
        Args: { _limit?: number; _store_id: string }
        Returns: {
          created_at: string
          item_id: string
          item_name: string
          order_id: string
          order_number: string
          order_status: string
          paid_at: string
          quantity: number
          total: number
          unit_price: number
        }[]
      }
      admin_store_summary: { Args: { _store_id: string }; Returns: Json }
      aggregate_analytics_daily: { Args: { _day?: string }; Returns: Json }
      apply_as_seller: {
        Args: {
          _contact_email?: string
          _contact_phone?: string
          _description?: string
          _name: string
          _slug: string
        }
        Returns: Json
      }
      apply_credit_to_order: {
        Args: { _max_credit: number; _order_id: string }
        Returns: Json
      }
      approve_service_requirements: {
        Args: { _order_id: string }
        Returns: Json
      }
      assign_operator: {
        Args: {
          _deadline?: string
          _note?: string
          _operator_id: string
          _order_id: string
        }
        Returns: Json
      }
      assign_stock_codes_for_order: {
        Args: { _order_id: string }
        Returns: number
      }
      assign_unique_file: { Args: { _entitlement_id: string }; Returns: string }
      assign_unique_files_for_order: {
        Args: { _order_id: string }
        Returns: number
      }
      attach_credit_topup_qris: {
        Args: {
          _payment_url: string
          _provider: string
          _provider_payment_id: string
          _qr_reference: string
          _topup_id: string
        }
        Returns: Json
      }
      build_product_search_vector: {
        Args: {
          _description: string
          _name: string
          _short_description: string
        }
        Returns: unknown
      }
      campaign_attribution: { Args: { _days?: number }; Returns: Json }
      can_access_store: { Args: { _store_id: string }; Returns: boolean }
      cancel_own_order: {
        Args: { _order_id: string; _reason: string }
        Returns: Json
      }
      cancel_own_withdrawal: { Args: { _withdrawal_id: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          _bucket: string
          _limit: number
          _subject: string
          _window_seconds: number
        }
        Returns: Json
      }
      claim_stock_code: { Args: { _entitlement_id: string }; Returns: string }
      complete_withdrawal: { Args: { _note?: string | null; _withdrawal_id: string }; Returns: Json }
      confirm_digital_receipt: { Args: { _order_id: string }; Returns: Json }
      consume_download: {
        Args: { _entitlement_id: string; _ip?: string; _ua?: string }
        Returns: Json
      }
      content_summary: { Args: never; Returns: Json }
      create_academic_order: {
        Args: {
          _academic: Json
          _addon_ids: string[]
          _customer_note?: string
          _draft_key: string
          _idempotency_key: string
          _integrity_accepted: boolean
          _no_credential_accepted: boolean
          _package_id: string
          _reviewer_requested: boolean
          _scope_flags: string[]
          _service_id: string
        }
        Returns: Json
      }
      create_credit_topup: { Args: { _amount: number }; Returns: Json }
      create_digital_order: {
        Args: {
          _customer_note?: string
          _idempotency_key: string
          _product_id: string
          _quantity: number
          _variant_id?: string
        }
        Returns: Json
      }
      create_marketplace_service_order:
        | {
            Args: { _idempotency_key: string; _service_id: string }
            Returns: Json
          }
        | {
            Args: {
              _agreement_accepted: boolean
              _expected_total: number
              _expected_version: number
              _idempotency_key: string
              _requirements: string
              _service_id: string
            }
            Returns: Json
          }
      create_service_order: {
        Args: {
          _addon_ids: string[]
          _customer_note?: string
          _idempotency_key: string
          _package_id: string
          _requirements: Json
          _requirements_note: string
          _service_id: string
        }
        Returns: Json
      }
      credit_refund_to_balance: { Args: { _refund_id: string }; Returns: Json }
      credit_seller_earnings: { Args: { _order_id: string }; Returns: Json }
      delete_campaign: { Args: { _id: string }; Returns: Json }
      digital_receipt_items: {
        Args: { _order_id: string }
        Returns: {
          delivery_mode: string
          item_id: string
          name: string
          ready: boolean
        }[]
      }
      fulfill_waiting_stock_orders: {
        Args: { _product_id?: string }
        Returns: number
      }
      get_credit_balance: { Args: { _user_id: string }; Returns: number }
      get_my_credit_balance: { Args: never; Returns: number }
      get_my_digital_receipt: { Args: { _order_id: string }; Returns: Json }
      get_my_inventory_summary: { Args: never; Returns: Json }
      get_my_low_stock_products: {
        Args: { _limit?: number }
        Returns: {
          available_stock: number
          delivery_mode: string
          moderation_status: string
          product_id: string
          product_name: string
          status: string
        }[]
      }
      get_my_permissions: {
        Args: never
        Returns: {
          permission_key: string
        }[]
      }
      get_my_service_order: { Args: { _order_id: string }; Returns: Json }
      get_my_stock_code: { Args: { _entitlement_id: string }; Returns: Json }
      get_my_store_balance: { Args: never; Returns: number }
      get_my_withdrawal_policy: { Args: never; Returns: Json }
      get_order_monitoring: {
        Args: { _order_id: string; _scope?: string }
        Returns: Json
      }
      get_store_balance: { Args: { _store_id: string }; Returns: number }
      get_store_finances: { Args: { _store_id: string }; Returns: Json }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store: { Args: { _user_id: string }; Returns: boolean }
      ignore_seo_issue: {
        Args: { _ignored?: boolean; _issue_code: string; _url_path: string }
        Returns: Json
      }
      ingest_stock_codes: {
        Args: {
          _codes: string[]
          _expires_at?: string
          _product_id: string
          _source?: string
          _source_ref?: string
        }
        Returns: Json
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_order_operator: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_order_owner: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_service_order_buyer: { Args: { _order_id: string }; Returns: boolean }
      is_service_order_seller: { Args: { _order_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_valid_service_media: { Args: { _media: Json }; Returns: boolean }
      job_aggregate_analytics: { Args: never; Returns: Json }
      job_check_sla_breach: { Args: never; Returns: Json }
      job_expire_orders: { Args: never; Returns: Json }
      job_expire_topups: { Args: never; Returns: Json }
      job_flag_overdue_tasks: { Args: never; Returns: Json }
      job_purge_analytics: { Args: never; Returns: Json }
      list_campaigns: { Args: never; Returns: Json }
      list_my_service_orders: {
        Args: never
        Returns: {
          accepted_at: string
          complaint_open: boolean
          due_at: string
          order_id: string
          order_number: string
          order_status: string
          paid_at: string
          requirements_approved_at: string
          revision_limit: number
          revision_used: number
          service_name: string
          total: number
          work_state: string
        }[]
      }
      list_my_store_orders: {
        Args: { _filter?: string }
        Returns: {
          created_at: string
          item_id: string
          item_name: string
          order_id: string
          order_number: string
          order_status: string
          paid_at: string
          quantity: number
          total: number
          unit_price: number
        }[]
      }
      list_order_monitoring: {
        Args: { _filter?: string; _page?: number; _scope?: string }
        Returns: Json
      }
      mark_inquiry_read: { Args: { _inquiry_id: string }; Returns: Json }
      mark_withdrawal_reconciliation: { Args: { _note: string; _withdrawal_id: string }; Returns: Json }
      my_store_id: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_order_number: { Args: never; Returns: string }
      next_payment_number: { Args: never; Returns: string }
      next_po_number: { Args: never; Returns: string }
      next_refund_number: { Args: never; Returns: string }
      next_task_number: { Args: never; Returns: string }
      next_topup_number: { Args: never; Returns: string }
      notify_payment_staff: {
        Args: {
          _msg: string
          _related_id: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      open_service_complaint: {
        Args: { _delivery_id?: string; _order_id: string; _reason: string }
        Returns: Json
      }
      operator_update_assignment: {
        Args: {
          _action: string
          _is_public?: boolean
          _note?: string
          _order_id: string
          _percent?: number
        }
        Returns: Json
      }
      order_monitoring_rows: {
        Args: { _order_id?: string; _store_id?: string }
        Returns: {
          accepted_at: string
          created_at: string
          funds: Json
          items: Json
          order_id: string
          order_number: string
          order_status: string
          paid_at: string
          queue: string
          receipt_status: string
          refunds: Json
          waiting_since: string
        }[]
      }
      po_cancel_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: Json
      }
      po_deliver: {
        Args: { _note?: string; _request_id: string; _result_url?: string }
        Returns: Json
      }
      po_respond_quote: {
        Args: { _accept: boolean; _note?: string; _request_id: string }
        Returns: Json
      }
      po_submit_payment_proof: {
        Args: {
          _file_path: string
          _note?: string
          _payment_id: string
          _sender_name?: string
        }
        Returns: Json
      }
      po_submit_quote: {
        Args: {
          _dp_percent: number
          _note?: string
          _request_id: string
          _total: number
        }
        Returns: Json
      }
      po_verify_payment: {
        Args: { _decision: string; _payment_id: string; _reason?: string }
        Returns: Json
      }
      process_refund: {
        Args: { _reference: string; _refund_id: string }
        Returns: Json
      }
      product_rating_summary: {
        Args: never
        Returns: {
          average_rating: number
          product_id: string
          review_count: number
        }[]
      }
      purge_analytics_events: { Args: { _keep_days?: number }; Returns: number }
      quote_academic_order: {
        Args: {
          _addon_ids: string[]
          _deadline: string
          _package_id: string
          _reviewer_requested: boolean
          _service_id: string
        }
        Returns: Json
      }
      quote_marketplace_service_order: {
        Args: { _service_id: string }
        Returns: Json
      }
      recalc_code_stock: { Args: { _product_id: string }; Returns: undefined }
      recalc_product_stock: {
        Args: { _product_id: string }
        Returns: undefined
      }
      record_article_view: { Args: { _slug: string }; Returns: number }
      record_seo_audit: {
        Args: { _issues: Json; _url_path: string }
        Returns: number
      }
      record_withdrawal_transfer: {
        Args: { _bank_reference: string; _note?: string | null; _withdrawal_id: string }
        Returns: Json
      }
      request_refund: {
        Args: { _order_id: string; _reason: string }
        Returns: Json
      }
      request_service_revision: {
        Args: { _delivery_id: string; _order_id: string; _reason: string }
        Returns: Json
      }
      request_withdrawal: {
        Args: { _gross_amount: number; _idempotency_key: string }
        Returns: Json
      }
      resolve_service_complaint: {
        Args: { _decision: string; _order_id: string; _reason: string }
        Returns: Json
      }
      resolve_withdrawal_reconciliation: {
        Args: { _note: string; _outcome: string; _withdrawal_id: string }
        Returns: Json
      }
      review_academic_scope: {
        Args: { _decision: string; _note?: string; _order_id: string }
        Returns: Json
      }
      review_job_result: {
        Args: { _decision: string; _order_id: string; _reason?: string }
        Returns: Json
      }
      review_product: {
        Args: { _decision: string; _product_id: string; _reason: string }
        Returns: Json
      }
      review_refund: {
        Args: { _decision: string; _reason: string; _refund_id: string }
        Returns: Json
      }
      review_seller: {
        Args: { _decision: string; _reason: string; _store_id: string }
        Returns: Json
      }
      review_withdrawal: {
        Args: { _decision: string; _reason?: string | null; _withdrawal_id: string }
        Returns: Json
      }
      save_article_checklist: {
        Args: { _article_id: string; _checklist: Json }
        Returns: Json
      }
      save_marketplace_service_draft: {
        Args: {
          _agreement: Json
          _category_id: string
          _expected_version: number
          _id: string
          _media?: Json
          _name: string
          _price: number
        }
        Returns: Json
      }
      search_products_fts: {
        Args: {
          _category_slug?: string
          _limit?: number
          _offset?: number
          _query?: string
          _store_slug?: string
        }
        Returns: {
          category_id: string
          discount_price: number
          id: string
          is_official: boolean
          name: string
          price: number
          rank: number
          short_description: string
          slug: string
          store_name: string
          store_slug: string
          thumbnail_url: string
        }[]
      }
      security_anon_functions: {
        Args: never
        Returns: {
          fn: string
        }[]
      }
      security_catalog_snapshot: { Args: never; Returns: Json }
      security_definer_missing_search_path: {
        Args: never
        Returns: {
          args: string
          fn: string
        }[]
      }
      seller_ingest_stock_codes: {
        Args: { _codes: string[]; _product_id: string }
        Returns: Json
      }
      seo_audit_summary: { Args: never; Returns: Json }
      set_article_status: {
        Args: { _article_id: string; _new_status: string; _note?: string }
        Returns: Json
      }
      save_seller_bank_account: {
        Args: { _account_holder_name: string; _account_number: string; _bank_name: string }
        Returns: Json
      }
      set_product_variants: {
        Args: { _product_id: string; _variants: Json }
        Returns: Json
      }
      set_seller_suspended: {
        Args: { _reason: string; _store_id: string; _suspend: boolean }
        Returns: Json
      }
      setting_int: { Args: { _default: number; _key: string }; Returns: number }
      settle_credit_topup: {
        Args: {
          _paid_amount: number
          _provider: string
          _provider_ref: string
          _topup_id: string
        }
        Returns: Json
      }
      settle_gateway_payment: {
        Args: {
          _method?: string
          _paid_amount: number
          _payment_id: string
          _provider: string
          _provider_ref: string
        }
        Returns: Json
      }
      stock_code_demand: { Args: never; Returns: Json }
      store_rating_summary: { Args: { _store_id: string }; Returns: Json }
      store_social_summary: { Args: { _store_id: string }; Returns: Json }
      toggle_store_follow: { Args: { _store_id: string }; Returns: Json }
      toggle_product_like: { Args: { _product_id: string }; Returns: Json }
      product_like_summary: { Args: { _product_id: string }; Returns: Json }
      submit_job_result: {
        Args: {
          _delivery_note?: string
          _order_id: string
          _result_url?: string
          _summary: string
        }
        Returns: Json
      }
      submit_payment_proof: {
        Args: {
          _amount_claimed: number
          _file_path: string
          _mime_type: string
          _note?: string
          _original_filename: string
          _payment_id: string
          _sender_name: string
          _size_bytes: number
        }
        Returns: Json
      }
      submit_product_for_review: {
        Args: { _product_id: string }
        Returns: Json
      }
      submit_product_review: {
        Args: {
          _body?: string
          _product_id: string
          _rating: number
          _title?: string
        }
        Returns: Json
      }
      submit_service_delivery: {
        Args: {
          _file_size?: number
          _kind: string
          _mime_type?: string
          _note: string
          _order_id: string
          _original_name?: string
          _storage_path?: string
          _summary: string
          _url: string
        }
        Returns: Json
      }
      sync_my_profile_email: { Args: never; Returns: undefined }
      sync_product_sold_counts: {
        Args: { _product_id: string }
        Returns: number
      }
      transition_marketplace_service: {
        Args: {
          _action: string
          _expected_version: number
          _id: string
          _reason?: string
        }
        Returns: Json
      }
      try_uuid: { Args: { _text: string }; Returns: string }
      unread_inquiry_counts: {
        Args: never
        Returns: {
          inquiry_id: string
          unread: number
        }[]
      }
      update_admin_task: {
        Args: {
          _action: string
          _assignee?: string
          _note?: string
          _task_id: string
        }
        Returns: Json
      }
      upsert_campaign: {
        Args: {
          _channel: string
          _ends_at?: string
          _id: string
          _name: string
          _note?: string
          _starts_at?: string
          _status?: string
          _utm_campaign: string
          _utm_medium: string
          _utm_source: string
        }
        Returns: Json
      }
      verify_manual_payment: {
        Args: { _decision: string; _payment_id: string; _reason?: string }
        Returns: Json
      }
      verify_seller_product_ownership: {
        Args: { _product_id: string }
        Returns: string
      }
      write_audit_log: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _entity_id?: string
          _entity_type: string
          _ip?: string
          _reason?: string
          _trace_id?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "customer"
        | "operator"
        | "support"
        | "finance"
        | "admin"
        | "super_admin"
        | "seller"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "customer",
        "operator",
        "support",
        "finance",
        "admin",
        "super_admin",
        "seller",
      ],
    },
  },
} as const
