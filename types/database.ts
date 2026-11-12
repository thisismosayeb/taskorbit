// TaskOrbit database types — the shape `supabase gen types typescript` produces.
//
// PROVENANCE — READ BEFORE EDITING BY HAND:
// This file was derived by hand from supabase/migrations/0001_init.sql,
// 0002_rpc.sql, 0003_invites_fix.sql and 0007_ai.sql because `supabase gen
// types` needs a running database and this machine has no Docker, no local
// Supabase stack and no remote project yet:
//   $ npx supabase gen types typescript --local
//   -> "docker: command not found (podman also not found)"
// Every table, column, nullability, enum value and function signature below
// was copied from the migration DDL and cross-checked against it — do not
// edit this file to match application code; edit the migration instead and
// regenerate.
//
// REGENERATE (run after `supabase start`, from the repo root; overwrites this file):
//   supabase gen types typescript --local > types/database.ts
// Against a hosted project instead:
//   supabase gen types typescript --project-id <your-project-ref> > types/database.ts
//   # or: supabase gen types typescript --db-url "$DATABASE_URL" > types/database.ts
// After regenerating, run `npm run typecheck` — types/index.ts derives all
// row types from this file, so a drifted table/column/enum fails the build.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          preferred_locale: string;
          theme_preference: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          preferred_locale?: string;
          theme_preference?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          preferred_locale?: string;
          theme_preference?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["workspace_role"];
          joined_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          joined_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_invitations: {
        Row: {
          id: string;
          workspace_id: string;
          invited_email: string;
          intended_role: Database["public"]["Enums"]["workspace_role"];
          token_hash: string;
          expires_at: string;
          created_by: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          invited_email: string;
          intended_role?: Database["public"]["Enums"]["workspace_role"];
          token_hash: string;
          expires_at: string;
          created_by: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          invited_email?: string;
          intended_role?: Database["public"]["Enums"]["workspace_role"];
          token_hash?: string;
          expires_at?: string;
          created_by?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          status: Database["public"]["Enums"]["project_status"];
          priority: Database["public"]["Enums"]["priority"];
          start_date: string | null;
          due_date: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          priority?: Database["public"]["Enums"]["priority"];
          start_date?: string | null;
          due_date?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          priority?: Database["public"]["Enums"]["priority"];
          start_date?: string | null;
          due_date?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          parent_task_id: string | null;
          title: string;
          description: string | null;
          assigned_to: string | null;
          created_by: string;
          status: Database["public"]["Enums"]["task_status"];
          priority: Database["public"]["Enums"]["priority"];
          start_date: string | null;
          due_date: string | null;
          completed_at: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          parent_task_id?: string | null;
          title: string;
          description?: string | null;
          assigned_to?: string | null;
          created_by: string;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["priority"];
          start_date?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          parent_task_id?: string | null;
          title?: string;
          description?: string | null;
          assigned_to?: string | null;
          created_by?: string;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["priority"];
          start_date?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey";
            columns: ["parent_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          task_id: string;
          author_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          author_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          author_id?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_logs: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          task_id: string | null;
          actor_id: string;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          project_id?: string | null;
          task_id?: string | null;
          actor_id: string;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          task_id?: string | null;
          actor_id?: string;
          action?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          workspace_id: string;
          recipient_id: string;
          actor_id: string | null;
          type: string;
          title: string;
          body: string;
          entity_type: string | null;
          entity_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          recipient_id: string;
          actor_id?: string | null;
          type: string;
          title: string;
          body?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          recipient_id?: string;
          actor_id?: string | null;
          type?: string;
          title?: string;
          body?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      // Part 3, migration 0007 (ai_summaries / ai_usage / daily_job_runs).
      // Hand-derived from 0007_ai.sql — regenerate with
      // `supabase gen types` once 0007 is applied (see the file header).
      ai_summaries: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          user_id: string | null;
          summary_type: string;
          locale: string;
          summary_date: string;
          content: Json;
          model: string;
          input_digest: string;
          generated_by: string | null;
          generated_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          project_id?: string | null;
          user_id?: string | null;
          summary_type: string;
          locale?: string;
          summary_date: string;
          content: Json;
          model?: string;
          input_digest: string;
          generated_by?: string | null;
          generated_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          user_id?: string | null;
          summary_type?: string;
          locale?: string;
          summary_date?: string;
          content?: Json;
          model?: string;
          input_digest?: string;
          generated_by?: string | null;
          generated_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_summaries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_summaries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          id: string;
          workspace_id: string;
          actor_id: string | null;
          feature: string;
          request_date: string;
          status: string;
          estimated_tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          actor_id?: string | null;
          feature: string;
          request_date: string;
          status: string;
          estimated_tokens?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          actor_id?: string | null;
          feature?: string;
          request_date?: string;
          status?: string;
          estimated_tokens?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_job_runs: {
        Row: {
          id: string;
          workspace_id: string;
          job: string;
          local_date: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          job: string;
          local_date: string;
          result?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          job?: string;
          local_date?: string;
          result?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_job_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_workspace: {
        Args: { p_name: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      remove_workspace_member: {
        Args: { p_workspace_id: string; p_user_id: string };
        Returns: number;
      };
      is_workspace_member: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      member_role: {
        Args: { p_workspace_id: string };
        Returns: Database["public"]["Enums"]["workspace_role"];
      };
      project_workspace_id: {
        Args: { p_project_id: string };
        Returns: string;
      };
      task_workspace_id: {
        Args: { p_task_id: string };
        Returns: string;
      };
      is_task_assignee: {
        Args: { p_task_id: string; p_user_id: string };
        Returns: boolean;
      };
      shares_workspace_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      sha256_hex: {
        Args: { p_input: string };
        Returns: string;
      };
      run_daily_reminders: {
        Args: { p_workspace_id: string; p_local_date: string };
        Returns: Json;
      };
      run_daily_reminders_all: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_daily_brief_input: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      cron_write_allowed: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      save_ai_summary: {
        Args: {
          p_workspace_id: string;
          p_project_id: string | null;
          p_user_id: string | null;
          p_summary_type: string;
          p_locale: string;
          p_summary_date: string;
          p_content: Json;
          p_model: string;
          p_input_digest: string;
          p_generated_by: string | null;
        };
        Returns: string;
      };
      log_ai_usage: {
        Args: {
          p_workspace_id: string;
          p_actor_id: string | null;
          p_feature: string;
          p_request_date: string;
          p_status: string;
          p_estimated_tokens: number;
        };
        Returns: string;
      };
    };
    Enums: {
      workspace_role: "manager" | "developer";
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "archived";
      priority: "low" | "medium" | "high" | "urgent";
      task_status: "todo" | "in_progress" | "in_review" | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;
