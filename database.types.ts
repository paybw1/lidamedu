export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      entities: {
        Row: {
          address_en: string | null
          address_kr: string | null
          client_code: string | null
          country: string | null
          created_at: string
          entity_type: string | null
          has_poa: boolean | null
          id: string
          name_en: string | null
          name_kr: string | null
          representative_name: string | null
          signature_image_url: string | null
          signer_name: string | null
          signer_position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_en?: string | null
          address_kr?: string | null
          client_code?: string | null
          country?: string | null
          created_at?: string
          entity_type?: string | null
          has_poa?: boolean | null
          id?: string
          name_en?: string | null
          name_kr?: string | null
          representative_name?: string | null
          signature_image_url?: string | null
          signer_name?: string | null
          signer_position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_en?: string | null
          address_kr?: string | null
          client_code?: string | null
          country?: string | null
          created_at?: string
          entity_type?: string | null
          has_poa?: boolean | null
          id?: string
          name_en?: string | null
          name_kr?: string | null
          representative_name?: string | null
          signature_image_url?: string | null
          signer_name?: string | null
          signer_position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inventors: {
        Row: {
          address_en: string | null
          address_kr: string | null
          created_at: string
          id: string
          id_number: string | null
          name_en: string | null
          name_kr: string | null
          nationality: string | null
          residence_country: string | null
          updated_at: string
          user_id: string
          zipcode: string | null
        }
        Insert: {
          address_en?: string | null
          address_kr?: string | null
          created_at?: string
          id?: string
          id_number?: string | null
          name_en?: string | null
          name_kr?: string | null
          nationality?: string | null
          residence_country?: string | null
          updated_at?: string
          user_id: string
          zipcode?: string | null
        }
        Update: {
          address_en?: string | null
          address_kr?: string | null
          created_at?: string
          id?: string
          id_number?: string | null
          name_en?: string | null
          name_kr?: string | null
          nationality?: string | null
          residence_country?: string | null
          updated_at?: string
          user_id?: string
          zipcode?: string | null
        }
        Relationships: []
      }
      patents: {
        Row: {
          abandonment_date: string | null
          abandonment_reason: string | null
          annuity_due_date: string | null
          applicant: Json | null
          applicant_reference: string | null
          application_number: string | null
          application_type: string
          assignee: Json | null
          attorney_name: string | null
          claims_due_date: string | null
          claims_submitted_at: string | null
          country_code: string | null
          created_at: string
          decision_to_register_date: string | null
          earliest_priority_date: string | null
          electronic_certificate_selected: boolean | null
          examination_request_due: string | null
          examination_requested: Database["public"]["Enums"]["yes_no"] | null
          examination_requested_at: string | null
          expedited_examination_date: string | null
          expedited_examination_requested: boolean | null
          filing_date: string | null
          filing_deadline: string | null
          final_claim_count: number | null
          id: string
          inventor: Json | null
          is_annuity_managed: boolean | null
          late_registration_penalty_due: string | null
          metadata: Json | null
          our_ref: string | null
          pct_application_date: string | null
          pct_application_number: string | null
          prior_disclosure_documents: Json | null
          prior_disclosure_exception_claimed: boolean | null
          priority_claimed: Database["public"]["Enums"]["yes_no"] | null
          priority_date: string | null
          priority_rights: Json | null
          protection_term: string | null
          publication_date: string | null
          publication_number: string | null
          registration_date: string | null
          registration_deadline: string | null
          registration_number: string | null
          request_date: string | null
          status: string
          title_en: string | null
          title_kr: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          abandonment_date?: string | null
          abandonment_reason?: string | null
          annuity_due_date?: string | null
          applicant?: Json | null
          applicant_reference?: string | null
          application_number?: string | null
          application_type: string
          assignee?: Json | null
          attorney_name?: string | null
          claims_due_date?: string | null
          claims_submitted_at?: string | null
          country_code?: string | null
          created_at?: string
          decision_to_register_date?: string | null
          earliest_priority_date?: string | null
          electronic_certificate_selected?: boolean | null
          examination_request_due?: string | null
          examination_requested?: Database["public"]["Enums"]["yes_no"] | null
          examination_requested_at?: string | null
          expedited_examination_date?: string | null
          expedited_examination_requested?: boolean | null
          filing_date?: string | null
          filing_deadline?: string | null
          final_claim_count?: number | null
          id?: string
          inventor?: Json | null
          is_annuity_managed?: boolean | null
          late_registration_penalty_due?: string | null
          metadata?: Json | null
          our_ref?: string | null
          pct_application_date?: string | null
          pct_application_number?: string | null
          prior_disclosure_documents?: Json | null
          prior_disclosure_exception_claimed?: boolean | null
          priority_claimed?: Database["public"]["Enums"]["yes_no"] | null
          priority_date?: string | null
          priority_rights?: Json | null
          protection_term?: string | null
          publication_date?: string | null
          publication_number?: string | null
          registration_date?: string | null
          registration_deadline?: string | null
          registration_number?: string | null
          request_date?: string | null
          status: string
          title_en?: string | null
          title_kr?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          abandonment_date?: string | null
          abandonment_reason?: string | null
          annuity_due_date?: string | null
          applicant?: Json | null
          applicant_reference?: string | null
          application_number?: string | null
          application_type?: string
          assignee?: Json | null
          attorney_name?: string | null
          claims_due_date?: string | null
          claims_submitted_at?: string | null
          country_code?: string | null
          created_at?: string
          decision_to_register_date?: string | null
          earliest_priority_date?: string | null
          electronic_certificate_selected?: boolean | null
          examination_request_due?: string | null
          examination_requested?: Database["public"]["Enums"]["yes_no"] | null
          examination_requested_at?: string | null
          expedited_examination_date?: string | null
          expedited_examination_requested?: boolean | null
          filing_date?: string | null
          filing_deadline?: string | null
          final_claim_count?: number | null
          id?: string
          inventor?: Json | null
          is_annuity_managed?: boolean | null
          late_registration_penalty_due?: string | null
          metadata?: Json | null
          our_ref?: string | null
          pct_application_date?: string | null
          pct_application_number?: string | null
          prior_disclosure_documents?: Json | null
          prior_disclosure_exception_claimed?: boolean | null
          priority_claimed?: Database["public"]["Enums"]["yes_no"] | null
          priority_date?: string | null
          priority_rights?: Json | null
          protection_term?: string | null
          publication_date?: string | null
          publication_number?: string | null
          registration_date?: string | null
          registration_deadline?: string | null
          registration_number?: string | null
          request_date?: string | null
          status?: string
          title_en?: string | null
          title_kr?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          approved_at: string
          created_at: string
          metadata: Json
          order_id: string
          order_name: string
          payment_id: number
          payment_key: string
          raw_data: Json
          receipt_url: string
          requested_at: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at: string
          created_at?: string
          metadata: Json
          order_id: string
          order_name: string
          payment_id?: never
          payment_key: string
          raw_data: Json
          receipt_url: string
          requested_at: string
          status: string
          total_amount: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string
          created_at?: string
          metadata?: Json
          order_id?: string
          order_name?: string
          payment_id?: never
          payment_key?: string
          raw_data?: Json
          receipt_url?: string
          requested_at?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payments_patents: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string | null
          patent_id: string
          payment_method: string | null
          payment_ref: string | null
          process_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string | null
          patent_id: string
          payment_method?: string | null
          payment_ref?: string | null
          process_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          patent_id?: string
          payment_method?: string | null
          payment_ref?: string | null
          process_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_patents_patent_id_patents_id_fk"
            columns: ["patent_id"]
            isOneToOne: false
            referencedRelation: "patents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patents_process_id_processes_patents_id_fk"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes_patents"
            referencedColumns: ["id"]
          },
        ]
      }
      processes_patent_alarms: {
        Row: {
          created_at: string
          id: number
          is_sent: boolean | null
          process_patent_id: string
          scheduled_at: string
          sent_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_sent?: boolean | null
          process_patent_id: string
          scheduled_at: string
          sent_at?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_sent?: boolean | null
          process_patent_id?: string
          scheduled_at?: string
          sent_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_patent_alarms_process_patent_id_processes_patents_id_"
            columns: ["process_patent_id"]
            isOneToOne: false
            referencedRelation: "processes_patents"
            referencedColumns: ["id"]
          },
        ]
      }
      processes_patents: {
        Row: {
          attached_files: Json | null
          case_id: string
          client_request: string | null
          created_at: string
          id: string
          is_paid: boolean | null
          is_urgent: boolean | null
          our_ref: string | null
          paid_at: string | null
          payment_amount: number | null
          payment_method: string | null
          payment_ref: string | null
          staff_note: string | null
          status: string | null
          step_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attached_files?: Json | null
          case_id: string
          client_request?: string | null
          created_at?: string
          id?: string
          is_paid?: boolean | null
          is_urgent?: boolean | null
          our_ref?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_ref?: string | null
          staff_note?: string | null
          status?: string | null
          step_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attached_files?: Json | null
          case_id?: string
          client_request?: string | null
          created_at?: string
          id?: string
          is_paid?: boolean | null
          is_urgent?: boolean | null
          our_ref?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_method?: string | null
          payment_ref?: string | null
          staff_note?: string | null
          status?: string | null
          step_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_patents_case_id_patents_id_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "patents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          marketing_consent: boolean
          name: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          marketing_consent?: boolean
          name: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          marketing_consent?: boolean
          name?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_or_update_provisional_application: {
        Args:
          | {
              p_patent_id: string
              p_user_id: string
              p_title_en: string
              p_applicant: Json
              p_inventor: Json
              p_attached_files: Json
              p_status: string
            }
          | {
              p_patent_id: string
              p_user_id: string
              p_title_en: string
              p_applicant: Json
              p_inventor: Json
              p_attached_files: Json
              p_status: string
              p_process_id?: string
            }
        Returns: {
          patent_id: string
          our_ref: string
        }[]
      }
      create_provisional_application: {
        Args: {
          p_user_id: string
          p_title_en: string
          p_applicant: Json
          p_inventor: Json
          p_attached_files: Json
          p_client_request: string
          p_is_urgent: boolean
        }
        Returns: {
          patent_id: string
          our_ref: string
          process_id: string
        }[]
      }
      pop: {
        Args: { queue_name: string }
        Returns: {
          msg_id: number
          read_ct: number
          enqueued_at: string
          vt: string
          message: Json
        }[]
      }
      submit_patent_payment: {
        Args: {
          _user_id: string
          _patent_id: string
          _process_id: string
          _amount: number
          _payment_method: string
          _payment_ref: string
        }
        Returns: undefined
      }
      update_provisional_application: {
        Args:
          | {
              p_patent_id: string
              p_user_id: string
              p_title_en: string
              p_applicant: Json
              p_inventor: Json
              p_attached_files: Json
            }
          | {
              p_patent_id: string
              p_user_id: string
              p_title_en: string
              p_applicant: Json
              p_inventor: Json
              p_attached_files: Json
              p_client_request: string
              p_is_urgent: boolean
            }
        Returns: {
          patent_id: string
          our_ref: string
          process_id: string
        }[]
      }
    }
    Enums: {
      yes_no: "예" | "아니오"
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
      yes_no: ["예", "아니오"],
    },
  },
} as const
