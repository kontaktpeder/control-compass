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
  public: {
    Tables: {
      assessments: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          missing_evidence: string[] | null
          obligation_id: string
          org_id: string
          reasoning: string | null
          status: Database["public"]["Enums"]["assessment_status"]
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          missing_evidence?: string[] | null
          obligation_id: string
          org_id: string
          reasoning?: string | null
          status: Database["public"]["Enums"]["assessment_status"]
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          missing_evidence?: string[] | null
          obligation_id?: string
          org_id?: string
          reasoning?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "assessments_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          ai_alternatives: Json
          ai_confidence: number | null
          ai_reasoning: string | null
          ai_summary: string | null
          classification_status: string
          created_at: string
          document_type: string | null
          document_type_candidates: Json
          document_type_confidence: number | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          org_id: string
          primary_document_type: string | null
          primary_document_type_confidence: number | null
          primary_purpose: string | null
          primary_purpose_confidence: number | null
          purpose: string | null
          purpose_candidates: Json
          review_status: string
          size_bytes: number | null
          uploaded_by: string
        }
        Insert: {
          ai_alternatives?: Json
          ai_confidence?: number | null
          ai_reasoning?: string | null
          ai_summary?: string | null
          classification_status?: string
          created_at?: string
          document_type?: string | null
          document_type_candidates?: Json
          document_type_confidence?: number | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          org_id: string
          primary_document_type?: string | null
          primary_document_type_confidence?: number | null
          primary_purpose?: string | null
          primary_purpose_confidence?: number | null
          purpose?: string | null
          purpose_candidates?: Json
          review_status?: string
          size_bytes?: number | null
          uploaded_by: string
        }
        Update: {
          ai_alternatives?: Json
          ai_confidence?: number | null
          ai_reasoning?: string | null
          ai_summary?: string | null
          classification_status?: string
          created_at?: string
          document_type?: string | null
          document_type_candidates?: Json
          document_type_confidence?: number | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          org_id?: string
          primary_document_type?: string | null
          primary_document_type_confidence?: number | null
          primary_purpose?: string | null
          primary_purpose_confidence?: number | null
          purpose?: string | null
          purpose_candidates?: Json
          review_status?: string
          size_bytes?: number | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_links: {
        Row: {
          ai_reasoning: string | null
          created_at: string
          evidence_id: string
          id: string
          obligation_id: string
          org_id: string
          relevance: number | null
        }
        Insert: {
          ai_reasoning?: string | null
          created_at?: string
          evidence_id: string
          id?: string
          obligation_id: string
          org_id: string
          relevance?: number | null
        }
        Update: {
          ai_reasoning?: string | null
          created_at?: string
          evidence_id?: string
          id?: string
          obligation_id?: string
          org_id?: string
          relevance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_links_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_links_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      frameworks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frameworks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      obligations: {
        Row: {
          created_at: string
          due_at: string | null
          evidence_requirements: string[] | null
          framework_id: string | null
          id: string
          is_required: boolean
          org_id: string
          playbook_step_id: string | null
          responsible: string | null
          source_id: string | null
          title: string
          updated_at: string
          why: string | null
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          evidence_requirements?: string[] | null
          framework_id?: string | null
          id?: string
          is_required?: boolean
          org_id: string
          playbook_step_id?: string | null
          responsible?: string | null
          source_id?: string | null
          title: string
          updated_at?: string
          why?: string | null
        }
        Update: {
          created_at?: string
          due_at?: string | null
          evidence_requirements?: string[] | null
          framework_id?: string | null
          id?: string
          is_required?: boolean
          org_id?: string
          playbook_step_id?: string | null
          responsible?: string | null
          source_id?: string | null
          title?: string
          updated_at?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obligations_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_playbook_step_id_fkey"
            columns: ["playbook_step_id"]
            isOneToOne: false
            referencedRelation: "playbook_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          org_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name: string
          org_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name?: string
          org_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      playbook_steps: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number
          org_id: string
          playbook_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index: number
          org_id: string
          playbook_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          org_id?: string
          playbook_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_steps_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          authority: string
          created_at: string
          effective_date: string | null
          framework_id: string | null
          id: string
          org_id: string
          reference: string | null
        }
        Insert: {
          authority: string
          created_at?: string
          effective_date?: string | null
          framework_id?: string | null
          id?: string
          org_id: string
          reference?: string | null
        }
        Update: {
          authority?: string
          created_at?: string
          effective_date?: string | null
          framework_id?: string | null
          id?: string
          org_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          generated_by: string
          id: string
          obligation_id: string | null
          org_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          generated_by?: string
          id?: string
          obligation_id?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          generated_by?: string
          id?: string
          obligation_id?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_org_owner: { Args: { _org: string; _user: string }; Returns: boolean }
      seed_incorporate_playbook: { Args: { _org: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      assessment_status:
        | "satisfied"
        | "partially_satisfied"
        | "missing"
        | "needs_review"
        | "unknown"
      member_role: "owner" | "member"
      org_kind: "holding" | "operating" | "sole_prop" | "other"
      task_status: "open" | "done" | "dismissed"
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
    Enums: {
      app_role: ["admin", "user"],
      assessment_status: [
        "satisfied",
        "partially_satisfied",
        "missing",
        "needs_review",
        "unknown",
      ],
      member_role: ["owner", "member"],
      org_kind: ["holding", "operating", "sole_prop", "other"],
      task_status: ["open", "done", "dismissed"],
    },
  },
} as const
