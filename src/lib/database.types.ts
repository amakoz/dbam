export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      appointment_reminders: {
        Row: {
          appointment_date: string;
          created_at: string;
          id: number;
          plan_id: number;
          sent_at: string | null;
          user_id: string;
        };
        Insert: {
          appointment_date: string;
          created_at?: string;
          id?: never;
          plan_id: number;
          sent_at?: string | null;
          user_id: string;
        };
        Update: {
          appointment_date?: string;
          created_at?: string;
          id?: never;
          plan_id?: number;
          sent_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "screening_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      health_data_consents: {
        Row: {
          consent_version: string;
          granted_at: string;
          id: number;
          locale: string;
          user_id: string;
          withdrawn_at: string | null;
        };
        Insert: {
          consent_version: string;
          granted_at?: string;
          id?: never;
          locale: string;
          user_id?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          consent_version?: string;
          granted_at?: string;
          id?: never;
          locale?: string;
          user_id?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          birth_year: number;
          created_at: string;
          pack_years: number | null;
          packs_per_day: number | null;
          reminders_enabled: boolean;
          reminders_enabled_at: string | null;
          reminders_locale: string | null;
          sex: string;
          smoking_status: string;
          smoking_years: number | null;
          updated_at: string;
          user_id: string;
          years_since_quitting: number | null;
        };
        Insert: {
          birth_year: number;
          created_at?: string;
          pack_years?: number | null;
          packs_per_day?: number | null;
          reminders_enabled?: boolean;
          reminders_enabled_at?: string | null;
          reminders_locale?: string | null;
          sex: string;
          smoking_status: string;
          smoking_years?: number | null;
          updated_at?: string;
          user_id?: string;
          years_since_quitting?: number | null;
        };
        Update: {
          birth_year?: number;
          created_at?: string;
          pack_years?: number | null;
          packs_per_day?: number | null;
          reminders_enabled?: boolean;
          reminders_enabled_at?: string | null;
          reminders_locale?: string | null;
          sex?: string;
          smoking_status?: string;
          smoking_years?: number | null;
          updated_at?: string;
          user_id?: string;
          years_since_quitting?: number | null;
        };
        Relationships: [];
      };
      screening_catalog: {
        Row: {
          burden_weight: number;
          created_at: string;
          eligibility: Json;
          evidence_level: number;
          evidence_source: string;
          how_to_access_en: string;
          how_to_access_pl: string;
          interval_kind: string;
          interval_months: number | null;
          interval_overrides: Json;
          last_reviewed: string | null;
          name_en: string;
          name_pl: string;
          next_review_due: string | null;
          nfz_funded: boolean;
          referral_required: boolean;
          reviewed_by: string | null;
          slug: string;
          sources: Json;
          status: string;
          summary_en: string;
          summary_pl: string;
          updated_at: string;
        };
        Insert: {
          burden_weight?: number;
          created_at?: string;
          eligibility: Json;
          evidence_level: number;
          evidence_source: string;
          how_to_access_en: string;
          how_to_access_pl: string;
          interval_kind: string;
          interval_months?: number | null;
          interval_overrides?: Json;
          last_reviewed?: string | null;
          name_en: string;
          name_pl: string;
          next_review_due?: string | null;
          nfz_funded: boolean;
          referral_required: boolean;
          reviewed_by?: string | null;
          slug: string;
          sources: Json;
          status?: string;
          summary_en: string;
          summary_pl: string;
          updated_at?: string;
        };
        Update: {
          burden_weight?: number;
          created_at?: string;
          eligibility?: Json;
          evidence_level?: number;
          evidence_source?: string;
          how_to_access_en?: string;
          how_to_access_pl?: string;
          interval_kind?: string;
          interval_months?: number | null;
          interval_overrides?: Json;
          last_reviewed?: string | null;
          name_en?: string;
          name_pl?: string;
          next_review_due?: string | null;
          nfz_funded?: boolean;
          referral_required?: boolean;
          reviewed_by?: string | null;
          slug?: string;
          sources?: Json;
          status?: string;
          summary_en?: string;
          summary_pl?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      screening_completions: {
        Row: {
          catalog_slug: string;
          created_at: string;
          id: number;
          last_done_month: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          catalog_slug: string;
          created_at?: string;
          id?: never;
          last_done_month?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          catalog_slug?: string;
          created_at?: string;
          id?: never;
          last_done_month?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screening_completions_catalog_slug_fkey";
            columns: ["catalog_slug"];
            isOneToOne: false;
            referencedRelation: "screening_catalog";
            referencedColumns: ["slug"];
          },
        ];
      };
      screening_plans: {
        Row: {
          appointment_date: string | null;
          catalog_slug: string;
          created_at: string;
          id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          appointment_date?: string | null;
          catalog_slug: string;
          created_at?: string;
          id?: never;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          appointment_date?: string | null;
          catalog_slug?: string;
          created_at?: string;
          id?: never;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screening_plans_catalog_slug_fkey";
            columns: ["catalog_slug"];
            isOneToOne: false;
            referencedRelation: "screening_catalog";
            referencedColumns: ["slug"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_due_appointment_reminders: {
        Args: { p_lead_days: number; p_limit: number; p_today: string };
        Returns: {
          appointment_dates: string[];
          email: string;
          locale: string;
          reminder_ids: number[];
          user_id: string;
        }[];
      };
      mark_appointment_reminders_sent: {
        Args: { p_ids: number[] };
        Returns: number;
      };
      withdraw_health_data_consent: { Args: never; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
