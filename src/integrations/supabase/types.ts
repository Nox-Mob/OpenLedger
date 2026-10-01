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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          subtype: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          subtype?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          subtype?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          id: string
          kind: string
          ok: boolean
          org_id: string
          page_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          ok?: boolean
          org_id: string
          page_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          ok?: boolean
          org_id?: string
          page_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount_cents: number
          bank_date: string
          batch_id: string | null
          created_at: string
          description: string
          external_id: string | null
          fingerprint: string
          id: string
          needs_review: boolean
          org_id: string
          raw: Json | null
          row_seq: number | null
          transaction_id: string | null
        }
        Insert: {
          account_id: string
          amount_cents: number
          bank_date: string
          batch_id?: string | null
          created_at?: string
          description: string
          external_id?: string | null
          fingerprint: string
          id?: string
          needs_review?: boolean
          org_id: string
          raw?: Json | null
          row_seq?: number | null
          transaction_id?: string | null
        }
        Update: {
          account_id?: string
          amount_cents?: number
          bank_date?: string
          batch_id?: string | null
          created_at?: string
          description?: string
          external_id?: string | null
          fingerprint?: string
          id?: string
          needs_review?: boolean
          org_id?: string
          raw?: Json | null
          row_seq?: number | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          type?: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          account_id: string
          amount_cents: number
          category_id: string | null
          created_at: string
          fund_id: string | null
          id: string
          memo: string | null
          project_id: string | null
          reconciliation_id: string | null
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          category_id?: string | null
          created_at?: string
          fund_id?: string | null
          id?: string
          memo?: string | null
          project_id?: string | null
          reconciliation_id?: string | null
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          fund_id?: string | null
          id?: string
          memo?: string | null
          project_id?: string | null
          reconciliation_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          created_at: string
          id: string
          is_restricted: boolean
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_restricted?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_restricted?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          account_id: string
          balance_mismatch_cents: number | null
          beginning_balance_cents: number | null
          created_at: string
          created_by: string | null
          ending_balance_cents: number | null
          file_name: string
          format: Database["public"]["Enums"]["import_format"]
          id: string
          org_id: string
          rows_duplicate: number
          rows_error: number
          rows_imported: number
          rows_total: number
          statement_end: string | null
          statement_start: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          balance_mismatch_cents?: number | null
          beginning_balance_cents?: number | null
          created_at?: string
          created_by?: string | null
          ending_balance_cents?: number | null
          file_name: string
          format: Database["public"]["Enums"]["import_format"]
          id?: string
          org_id: string
          rows_duplicate?: number
          rows_error?: number
          rows_imported?: number
          rows_total?: number
          statement_end?: string | null
          statement_start?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          balance_mismatch_cents?: number | null
          beginning_balance_cents?: number | null
          created_at?: string
          created_by?: string | null
          ending_balance_cents?: number | null
          file_name?: string
          format?: Database["public"]["Enums"]["import_format"]
          id?: string
          org_id?: string
          rows_duplicate?: number
          rows_error?: number
          rows_imported?: number
          rows_total?: number
          statement_end?: string | null
          statement_start?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_profiles: {
        Row: {
          account_id: string
          created_at: string
          id: string
          mapping: Json
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          mapping?: Json
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          mapping?: Json
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          ai_pdf_enabled: boolean
          created_at: string
          created_by: string
          currency: string
          fiscal_year_start_month: number
          id: string
          name: string
          org_type: Database["public"]["Enums"]["org_type"]
          term_overrides: Json
          terminology: string
          timezone: string
        }
        Insert: {
          ai_pdf_enabled?: boolean
          created_at?: string
          created_by: string
          currency?: string
          fiscal_year_start_month?: number
          id?: string
          name: string
          org_type?: Database["public"]["Enums"]["org_type"]
          term_overrides?: Json
          terminology?: string
          timezone?: string
        }
        Update: {
          ai_pdf_enabled?: boolean
          created_at?: string
          created_by?: string
          currency?: string
          fiscal_year_start_month?: number
          id?: string
          name?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          term_overrides?: Json
          terminology?: string
          timezone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          term_overrides: Json
          terminology: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          term_overrides?: Json
          terminology?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          term_overrides?: Json
          terminology?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget_cents: number
          created_at: string
          id: string
          name: string
          org_id: string
          status: string
        }
        Insert: {
          budget_cents?: number
          created_at?: string
          id?: string
          name: string
          org_id: string
          status?: string
        }
        Update: {
          budget_cents?: number
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          account_id: string
          batch_id: string | null
          beginning_balance_cents: number
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          ending_balance_cents: number
          id: string
          mode: Database["public"]["Enums"]["reconcile_mode"]
          org_id: string
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["reconcile_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          batch_id?: string | null
          beginning_balance_cents?: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          ending_balance_cents?: number
          id?: string
          mode?: Database["public"]["Enums"]["reconcile_mode"]
          org_id: string
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["reconcile_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          batch_id?: string | null
          beginning_balance_cents?: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          ending_balance_cents?: number
          id?: string
          mode?: Database["public"]["Enums"]["reconcile_mode"]
          org_id?: string
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["reconcile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          idempotency_key: string | null
          org_id: string
          posted_date: string | null
          source: Database["public"]["Enums"]["transaction_source"]
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          idempotency_key?: string | null
          org_id: string
          posted_date?: string | null
          source?: Database["public"]["Enums"]["transaction_source"]
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          idempotency_key?: string | null
          org_id?: string
          posted_date?: string | null
          source?: Database["public"]["Enums"]["transaction_source"]
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      app_role: "admin" | "member" | "viewer"
      import_format: "csv" | "ofx" | "qfx" | "pdf"
      org_type: "nonprofit" | "business"
      reconcile_mode: "simple" | "full"
      reconcile_status: "in_progress" | "completed"
      transaction_source:
        | "manual"
        | "import"
        | "opening_balance"
        | "adjustment"
        | "transfer"
      transaction_status: "posted" | "void"
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
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      app_role: ["admin", "member", "viewer"],
      import_format: ["csv", "ofx", "qfx", "pdf"],
      org_type: ["nonprofit", "business"],
      reconcile_mode: ["simple", "full"],
      reconcile_status: ["in_progress", "completed"],
      transaction_source: [
        "manual",
        "import",
        "opening_balance",
        "adjustment",
        "transfer",
      ],
      transaction_status: ["posted", "void"],
    },
  },
} as const
