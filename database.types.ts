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
      ai_conversations: {
        Row: {
          anchor: Json | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor?: Json | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor?: Json | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ai_eval_items: {
        Row: {
          created_at: string
          created_by: string | null
          difficulty: number
          eval_item_id: string
          law_codes: string[]
          notes: string | null
          question: string
          reference_answer: string
          reference_sources: Json
          source_message_id: string | null
          status: Database["public"]["Enums"]["ai_eval_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          difficulty?: number
          eval_item_id?: string
          law_codes?: string[]
          notes?: string | null
          question: string
          reference_answer: string
          reference_sources?: Json
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["ai_eval_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          difficulty?: number
          eval_item_id?: string
          law_codes?: string[]
          notes?: string | null
          question?: string
          reference_answer?: string
          reference_sources?: Json
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["ai_eval_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ai_eval_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ai_eval_items_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["message_id"]
          },
        ]
      }
      ai_eval_runs: {
        Row: {
          ai_answer: string
          ai_citations: Json
          answer_model: string
          created_at: string
          eval_item_id: string
          judge_model: string
          judge_rationale: string
          judge_score: number
          judge_verdict: Database["public"]["Enums"]["ai_eval_verdict"]
          run_id: string
          search_meta: Json | null
          token_usage: Json | null
          triggered_by: string | null
        }
        Insert: {
          ai_answer: string
          ai_citations?: Json
          answer_model: string
          created_at?: string
          eval_item_id: string
          judge_model: string
          judge_rationale: string
          judge_score: number
          judge_verdict: Database["public"]["Enums"]["ai_eval_verdict"]
          run_id?: string
          search_meta?: Json | null
          token_usage?: Json | null
          triggered_by?: string | null
        }
        Update: {
          ai_answer?: string
          ai_citations?: Json
          answer_model?: string
          created_at?: string
          eval_item_id?: string
          judge_model?: string
          judge_rationale?: string
          judge_score?: number
          judge_verdict?: Database["public"]["Enums"]["ai_eval_verdict"]
          run_id?: string
          search_meta?: Json | null
          token_usage?: Json | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_runs_eval_item_id_fkey"
            columns: ["eval_item_id"]
            isOneToOne: false
            referencedRelation: "ai_eval_items"
            referencedColumns: ["eval_item_id"]
          },
          {
            foreignKeyName: "ai_eval_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ai_eval_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          body_md: string
          citations: Json
          conversation_id: string
          created_at: string
          feedback: number | null
          feedback_at: string | null
          feedback_note: string | null
          message_id: string
          refusal_kind: Database["public"]["Enums"]["ai_refusal_kind"] | null
          retrieval_meta: Json | null
          review_status: Database["public"]["Enums"]["ai_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          role: Database["public"]["Enums"]["ai_message_role"]
          token_usage: Json | null
        }
        Insert: {
          body_md: string
          citations?: Json
          conversation_id: string
          created_at?: string
          feedback?: number | null
          feedback_at?: string | null
          feedback_note?: string | null
          message_id?: string
          refusal_kind?: Database["public"]["Enums"]["ai_refusal_kind"] | null
          retrieval_meta?: Json | null
          review_status?: Database["public"]["Enums"]["ai_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          role: Database["public"]["Enums"]["ai_message_role"]
          token_usage?: Json | null
        }
        Update: {
          body_md?: string
          citations?: Json
          conversation_id?: string
          created_at?: string
          feedback?: number | null
          feedback_at?: string | null
          feedback_note?: string | null
          message_id?: string
          refusal_kind?: Database["public"]["Enums"]["ai_refusal_kind"] | null
          retrieval_meta?: Json | null
          review_status?: Database["public"]["Enums"]["ai_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: Database["public"]["Enums"]["ai_message_role"]
          token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "ai_messages_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ai_messages_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ai_usage_daily: {
        Row: {
          date: string
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
          updated_at: string
        }
        Insert: {
          date: string
          total_cost_usd?: number
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
        }
        Update: {
          date?: string
          total_cost_usd?: number
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      announcement_audiences: {
        Row: {
          added_at: string
          added_by: string | null
          announcement_id: string
          audience_id: string
          audience_type: Database["public"]["Enums"]["announcement_audience_target"]
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          announcement_id: string
          audience_id: string
          audience_type: Database["public"]["Enums"]["announcement_audience_target"]
        }
        Update: {
          added_at?: string
          added_by?: string | null
          announcement_id?: string
          audience_id?: string
          audience_type?: Database["public"]["Enums"]["announcement_audience_target"]
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "announcement_audiences_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["announcement_id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          profile_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          profile_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["announcement_id"]
          },
          {
            foreignKeyName: "announcement_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "announcement_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      announcements: {
        Row: {
          announcement_id: string
          audience_kind: Database["public"]["Enums"]["announcement_audience_kind"]
          author_id: string
          body_md: string
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          announcement_id?: string
          audience_kind?: Database["public"]["Enums"]["announcement_audience_kind"]
          author_id: string
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string
          audience_kind?: Database["public"]["Enums"]["announcement_audience_kind"]
          author_id?: string
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      article_article_links: {
        Row: {
          article_a: string
          article_b: string
          created_at: string
          created_by: string | null
          link_id: string
          note: string | null
          relation_type: Database["public"]["Enums"]["aa_relation_type"]
        }
        Insert: {
          article_a: string
          article_b: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          relation_type: Database["public"]["Enums"]["aa_relation_type"]
        }
        Update: {
          article_a?: string
          article_b?: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          relation_type?: Database["public"]["Enums"]["aa_relation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "article_article_links_article_a_fkey"
            columns: ["article_a"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_article_links_article_b_fkey"
            columns: ["article_b"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_article_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "article_article_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      article_blank_sets: {
        Row: {
          article_id: string
          blanks: Json
          body_text: string
          created_at: string
          display_name: string | null
          importance: number | null
          owner_id: string
          set_id: string
          updated_at: string
          version: string
        }
        Insert: {
          article_id: string
          blanks?: Json
          body_text: string
          created_at?: string
          display_name?: string | null
          importance?: number | null
          owner_id: string
          set_id?: string
          updated_at?: string
          version?: string
        }
        Update: {
          article_id?: string
          blanks?: Json
          body_text?: string
          created_at?: string
          display_name?: string | null
          importance?: number | null
          owner_id?: string
          set_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_blank_sets_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_blank_sets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "article_blank_sets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      article_case_links: {
        Row: {
          article_id: string
          case_id: string
          created_at: string
          created_by: string | null
          link_id: string
          note: string | null
          relation_type: Database["public"]["Enums"]["ac_relation_type"]
        }
        Insert: {
          article_id: string
          case_id: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          relation_type: Database["public"]["Enums"]["ac_relation_type"]
        }
        Update: {
          article_id?: string
          case_id?: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          relation_type?: Database["public"]["Enums"]["ac_relation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "article_case_links_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_case_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "article_case_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "article_case_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      article_revisions: {
        Row: {
          article_id: string
          body_json: Json
          body_text: string | null
          change_kind: Database["public"]["Enums"]["law_change_kind"]
          created_at: string
          created_by: string | null
          effective_date: string | null
          expired_date: string | null
          law_revision_id: string
          revision_id: string
        }
        Insert: {
          article_id: string
          body_json: Json
          body_text?: string | null
          change_kind: Database["public"]["Enums"]["law_change_kind"]
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          expired_date?: string | null
          law_revision_id: string
          revision_id?: string
        }
        Update: {
          article_id?: string
          body_json?: Json
          body_text?: string | null
          change_kind?: Database["public"]["Enums"]["law_change_kind"]
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          expired_date?: string | null
          law_revision_id?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "article_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "article_revisions_law_revision_id_fkey"
            columns: ["law_revision_id"]
            isOneToOne: false
            referencedRelation: "law_revisions"
            referencedColumns: ["law_revision_id"]
          },
        ]
      }
      article_systematic_links: {
        Row: {
          article_id: string
          created_at: string
          node_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          node_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_systematic_links_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_systematic_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
        ]
      }
      articles: {
        Row: {
          article_id: string
          article_number: string | null
          created_at: string
          current_revision_id: string | null
          deleted_at: string | null
          display_label: string
          importance: number | null
          law_id: string
          level: Database["public"]["Enums"]["article_level"]
          parent_id: string | null
          path: unknown
          updated_at: string
        }
        Insert: {
          article_id?: string
          article_number?: string | null
          created_at?: string
          current_revision_id?: string | null
          deleted_at?: string | null
          display_label: string
          importance?: number | null
          law_id: string
          level: Database["public"]["Enums"]["article_level"]
          parent_id?: string | null
          path: unknown
          updated_at?: string
        }
        Update: {
          article_id?: string
          article_number?: string | null
          created_at?: string
          current_revision_id?: string | null
          deleted_at?: string | null
          display_label?: string
          importance?: number | null
          law_id?: string
          level?: Database["public"]["Enums"]["article_level"]
          parent_id?: string | null
          path?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "article_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "articles_law_id_fkey"
            columns: ["law_id"]
            isOneToOne: false
            referencedRelation: "laws"
            referencedColumns: ["law_id"]
          },
          {
            foreignKeyName: "articles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
        ]
      }
      assignment_items: {
        Row: {
          article_id: string | null
          assignment_id: string
          blank_set_id: string | null
          case_id: string | null
          item_id: string
          kind: Database["public"]["Enums"]["assignment_item_kind"]
          note: string | null
          ord: number
          problem_id: string | null
          target_quantity: number | null
        }
        Insert: {
          article_id?: string | null
          assignment_id: string
          blank_set_id?: string | null
          case_id?: string | null
          item_id?: string
          kind: Database["public"]["Enums"]["assignment_item_kind"]
          note?: string | null
          ord: number
          problem_id?: string | null
          target_quantity?: number | null
        }
        Update: {
          article_id?: string | null
          assignment_id?: string
          blank_set_id?: string | null
          case_id?: string | null
          item_id?: string
          kind?: Database["public"]["Enums"]["assignment_item_kind"]
          note?: string | null
          ord?: number
          problem_id?: string | null
          target_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "assignment_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "assignment_items_blank_set_id_fkey"
            columns: ["blank_set_id"]
            isOneToOne: false
            referencedRelation: "article_blank_sets"
            referencedColumns: ["set_id"]
          },
          {
            foreignKeyName: "assignment_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "assignment_items_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          completed_at: string | null
          completed_items: number
          created_at: string
          last_checked_at: string
          status: Database["public"]["Enums"]["assignment_status"]
          submission_id: string
          total_items: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          completed_items?: number
          created_at?: string
          last_checked_at?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          submission_id?: string
          total_items?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          completed_items?: number
          created_at?: string
          last_checked_at?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          submission_id?: string
          total_items?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      assignments: {
        Row: {
          assigned_at: string
          assignment_id: string
          cohort_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          description_md: string | null
          due_at: string
          source_curriculum_id: string | null
          source_week_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assignment_id?: string
          cohort_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description_md?: string | null
          due_at: string
          source_curriculum_id?: string | null
          source_week_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          cohort_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description_md?: string | null
          due_at?: string
          source_curriculum_id?: string | null
          source_week_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignments_source_curriculum_id_fkey"
            columns: ["source_curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["curriculum_id"]
          },
          {
            foreignKeyName: "assignments_source_week_id_fkey"
            columns: ["source_week_id"]
            isOneToOne: false
            referencedRelation: "curriculum_weeks"
            referencedColumns: ["week_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          entity_id: string
          entity_type: string
          log_id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          log_id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          log_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      book_updates: {
        Row: {
          book_title: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          edition: string | null
          importance: number
          kind: string
          pdf_url: string | null
          published_at: string | null
          publisher: string | null
          subject_laws: string[]
          tags: string[]
          title: string
          update_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          book_title: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          edition?: string | null
          importance?: number
          kind: string
          pdf_url?: string | null
          published_at?: string | null
          publisher?: string | null
          subject_laws?: string[]
          tags?: string[]
          title: string
          update_id?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          book_title?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          edition?: string | null
          importance?: number
          kind?: string
          pdf_url?: string | null
          published_at?: string | null
          publisher?: string | null
          subject_laws?: string[]
          tags?: string[]
          title?: string
          update_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          created_at: string
          message: string
          report_id: string
          reporter_id: string | null
          status: string
          url: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          message: string
          report_id?: string
          reporter_id?: string | null
          status?: string
          url: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          message?: string
          report_id?: string
          reporter_id?: string | null
          status?: string
          url?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      case_references: {
        Row: {
          authors: string | null
          case_id: string
          created_at: string
          created_by: string | null
          kind: string
          note: string | null
          ord: number
          pdf_url: string | null
          published_at: string | null
          reference_id: string
          source: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          authors?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          kind: string
          note?: string | null
          ord?: number
          pdf_url?: string | null
          published_at?: string | null
          reference_id?: string
          source?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          authors?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          kind?: string
          note?: string | null
          ord?: number
          pdf_url?: string | null
          published_at?: string | null
          reference_id?: string
          source?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_references_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_references_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "case_references_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cases: {
        Row: {
          case_id: string
          case_number: string
          case_title: string
          case_type: string | null
          comment_body_md: string | null
          comment_source: string | null
          court: Database["public"]["Enums"]["case_court"]
          created_at: string
          decided_at: string
          deleted_at: string | null
          exam_1st_years: number[]
          exam_2nd_years: number[]
          full_text_pdf: string | null
          images: Json
          importance: number | null
          is_en_banc: boolean
          law_api_serial_id: string | null
          nickname: string | null
          official_text_md: string | null
          official_text_pdf_path: string | null
          primary_article_id: string | null
          primary_node_id: string | null
          reasoning_md: string | null
          related_md: string | null
          search_tsv: unknown
          source_seq: number | null
          subject_laws: string[]
          summary_body_md: string | null
          summary_items: Json
          summary_title: string | null
          updated_at: string
        }
        Insert: {
          case_id?: string
          case_number: string
          case_title: string
          case_type?: string | null
          comment_body_md?: string | null
          comment_source?: string | null
          court: Database["public"]["Enums"]["case_court"]
          created_at?: string
          decided_at: string
          deleted_at?: string | null
          exam_1st_years?: number[]
          exam_2nd_years?: number[]
          full_text_pdf?: string | null
          images?: Json
          importance?: number | null
          is_en_banc?: boolean
          law_api_serial_id?: string | null
          nickname?: string | null
          official_text_md?: string | null
          official_text_pdf_path?: string | null
          primary_article_id?: string | null
          primary_node_id?: string | null
          reasoning_md?: string | null
          related_md?: string | null
          search_tsv?: unknown
          source_seq?: number | null
          subject_laws: string[]
          summary_body_md?: string | null
          summary_items?: Json
          summary_title?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          case_number?: string
          case_title?: string
          case_type?: string | null
          comment_body_md?: string | null
          comment_source?: string | null
          court?: Database["public"]["Enums"]["case_court"]
          created_at?: string
          decided_at?: string
          deleted_at?: string | null
          exam_1st_years?: number[]
          exam_2nd_years?: number[]
          full_text_pdf?: string | null
          images?: Json
          importance?: number | null
          is_en_banc?: boolean
          law_api_serial_id?: string | null
          nickname?: string | null
          official_text_md?: string | null
          official_text_pdf_path?: string | null
          primary_article_id?: string | null
          primary_node_id?: string | null
          reasoning_md?: string | null
          related_md?: string | null
          search_tsv?: unknown
          source_seq?: number | null
          subject_laws?: string[]
          summary_body_md?: string | null
          summary_items?: Json
          summary_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_primary_article_id_fkey"
            columns: ["primary_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "cases_primary_node_id_fkey"
            columns: ["primary_node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
        ]
      }
      cohort_curricula: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          cohort_id: string
          curriculum_id: string
          is_active: boolean
          start_date: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          cohort_id: string
          curriculum_id: string
          is_active?: boolean
          start_date: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          cohort_id?: string
          curriculum_id?: string
          is_active?: boolean
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_curricula_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_curricula_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_curricula_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "cohort_curricula_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["curriculum_id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          added_by: string | null
          cohort_id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          added_by?: string | null
          cohort_id: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          added_by?: string | null
          cohort_id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "cohort_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cohorts: {
        Row: {
          cohort_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_on: string | null
          is_archived: boolean
          name: string
          owner_id: string
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          cohort_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          is_archived?: boolean
          name: string
          owner_id: string
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          is_archived?: boolean
          name?: string
          owner_id?: string
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohorts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      community_post_attachments: {
        Row: {
          attachment_id: string
          created_at: string
          kind: Database["public"]["Enums"]["community_post_attachment_kind"]
          mime: string
          original_filename: string
          path: string
          post_id: string
          size_bytes: number
          sort_order: number
          uploaded_by: string | null
        }
        Insert: {
          attachment_id?: string
          created_at?: string
          kind: Database["public"]["Enums"]["community_post_attachment_kind"]
          mime: string
          original_filename: string
          path: string
          post_id: string
          size_bytes: number
          sort_order?: number
          uploaded_by?: string | null
        }
        Update: {
          attachment_id?: string
          created_at?: string
          kind?: Database["public"]["Enums"]["community_post_attachment_kind"]
          mime?: string
          original_filename?: string
          path?: string
          post_id?: string
          size_bytes?: number
          sort_order?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_post_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "community_post_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_post_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      community_post_comments: {
        Row: {
          author_id: string | null
          body_md: string
          comment_id: string
          created_at: string
          deleted_at: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md: string
          comment_id?: string
          created_at?: string
          deleted_at?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          comment_id?: string
          created_at?: string
          deleted_at?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      community_post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string | null
          board: Database["public"]["Enums"]["community_board"]
          body_md: string
          closed_at: string | null
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          max_members: number | null
          post_id: string
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          board: Database["public"]["Enums"]["community_board"]
          body_md: string
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          max_members?: number | null
          post_id?: string
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          board?: Database["public"]["Enums"]["community_board"]
          body_md?: string
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          max_members?: number | null
          post_id?: string
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      community_reports: {
        Row: {
          action_note: string | null
          created_at: string
          reason: string
          report_id: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["community_report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["community_report_target"]
        }
        Insert: {
          action_note?: string | null
          created_at?: string
          reason: string
          report_id?: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["community_report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["community_report_target"]
        }
        Update: {
          action_note?: string | null
          created_at?: string
          reason?: string
          report_id?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["community_report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["community_report_target"]
        }
        Relationships: []
      }
      community_study_members: {
        Row: {
          joined_at: string
          left_at: string | null
          post_id: string
          profile_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          post_id: string
          profile_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_study_members_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      content_chunks: {
        Row: {
          authority_tier: number
          body_text: string
          chunk_id: string
          chunk_index: number
          content_hash: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          heading_path: string | null
          law_code: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["chunk_source_type"]
          token_count: number
          updated_at: string
        }
        Insert: {
          authority_tier?: number
          body_text: string
          chunk_id?: string
          chunk_index: number
          content_hash: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          heading_path?: string | null
          law_code?: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["chunk_source_type"]
          token_count: number
          updated_at?: string
        }
        Update: {
          authority_tier?: number
          body_text?: string
          chunk_id?: string
          chunk_index?: number
          content_hash?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          heading_path?: string | null
          law_code?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["chunk_source_type"]
          token_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      content_comments: {
        Row: {
          author_id: string | null
          body_md: string
          comment_id: string
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          target_id: string
          target_type: Database["public"]["Enums"]["content_comment_target_type"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md: string
          comment_id?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          target_id: string
          target_type: Database["public"]["Enums"]["content_comment_target_type"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          comment_id?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          target_id?: string
          target_type?: Database["public"]["Enums"]["content_comment_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      curricula: {
        Row: {
          created_at: string
          curriculum_id: string
          deleted_at: string | null
          description: string | null
          duration_weeks: number
          is_published: boolean
          name: string
          owner_id: string
          subject_laws: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          curriculum_id?: string
          deleted_at?: string | null
          description?: string | null
          duration_weeks: number
          is_published?: boolean
          name: string
          owner_id: string
          subject_laws?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          curriculum_id?: string
          deleted_at?: string | null
          description?: string | null
          duration_weeks?: number
          is_published?: boolean
          name?: string
          owner_id?: string
          subject_laws?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curricula_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "curricula_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      curriculum_items: {
        Row: {
          article_id: string | null
          blank_set_id: string | null
          case_id: string | null
          created_at: string
          item_id: string
          kind: Database["public"]["Enums"]["curriculum_item_kind"]
          lecture_duration_min: number | null
          lecture_title: string | null
          lecture_url: string | null
          note: string | null
          ord: number
          problem_id: string | null
          target_quantity: number | null
          week_id: string
        }
        Insert: {
          article_id?: string | null
          blank_set_id?: string | null
          case_id?: string | null
          created_at?: string
          item_id?: string
          kind: Database["public"]["Enums"]["curriculum_item_kind"]
          lecture_duration_min?: number | null
          lecture_title?: string | null
          lecture_url?: string | null
          note?: string | null
          ord: number
          problem_id?: string | null
          target_quantity?: number | null
          week_id: string
        }
        Update: {
          article_id?: string | null
          blank_set_id?: string | null
          case_id?: string | null
          created_at?: string
          item_id?: string
          kind?: Database["public"]["Enums"]["curriculum_item_kind"]
          lecture_duration_min?: number | null
          lecture_title?: string | null
          lecture_url?: string | null
          note?: string | null
          ord?: number
          problem_id?: string | null
          target_quantity?: number | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "curriculum_items_blank_set_id_fkey"
            columns: ["blank_set_id"]
            isOneToOne: false
            referencedRelation: "article_blank_sets"
            referencedColumns: ["set_id"]
          },
          {
            foreignKeyName: "curriculum_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "curriculum_items_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "curriculum_items_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "curriculum_weeks"
            referencedColumns: ["week_id"]
          },
        ]
      }
      curriculum_weeks: {
        Row: {
          created_at: string
          curriculum_id: string
          goal_md: string | null
          title: string
          week_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          curriculum_id: string
          goal_md?: string | null
          title: string
          week_id?: string
          week_number: number
        }
        Update: {
          created_at?: string
          curriculum_id?: string
          goal_md?: string | null
          title?: string
          week_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_weeks_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["curriculum_id"]
          },
        ]
      }
      exam_results: {
        Row: {
          certificate_path: string | null
          certificate_url: string | null
          created_at: string
          exam_round: Database["public"]["Enums"]["exam_round"]
          exam_year: number
          rejection_reason: string | null
          result_id: string
          self_reported_subject_scores: Json | null
          self_reported_total_score: number | null
          status: Database["public"]["Enums"]["exam_result_status"]
          study_summary_md: string | null
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["exam_verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          certificate_path?: string | null
          certificate_url?: string | null
          created_at?: string
          exam_round: Database["public"]["Enums"]["exam_round"]
          exam_year: number
          rejection_reason?: string | null
          result_id?: string
          self_reported_subject_scores?: Json | null
          self_reported_total_score?: number | null
          status: Database["public"]["Enums"]["exam_result_status"]
          study_summary_md?: string | null
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["exam_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          certificate_path?: string | null
          certificate_url?: string | null
          created_at?: string
          exam_round?: Database["public"]["Enums"]["exam_round"]
          exam_year?: number
          rejection_reason?: string | null
          result_id?: string
          self_reported_subject_scores?: Json | null
          self_reported_total_score?: number | null
          status?: Database["public"]["Enums"]["exam_result_status"]
          study_summary_md?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["exam_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "exam_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "exam_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "exam_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      gs_ai_usage: {
        Row: {
          cost_usd: number
          date: string
          id: number
          input_tokens: number
          kind: string
          model: string | null
          occurred_at: string
          outcome: string
          output_tokens: number
          pages: number
          reason: string | null
          round_id: string | null
          submission_id: string | null
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          date: string
          id?: number
          input_tokens?: number
          kind: string
          model?: string | null
          occurred_at?: string
          outcome: string
          output_tokens?: number
          pages?: number
          reason?: string | null
          round_id?: string | null
          submission_id?: string | null
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          date?: string
          id?: number
          input_tokens?: number
          kind?: string
          model?: string | null
          occurred_at?: string
          outcome?: string
          output_tokens?: number
          pages?: number
          reason?: string | null
          round_id?: string | null
          submission_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gs_ai_usage_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "gs_rounds"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "gs_ai_usage_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "gs_submissions"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "gs_ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gs_ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      gs_answers: {
        Row: {
          ai_suggested_at: string | null
          ai_suggested_rubric_scores: Json | null
          ai_suggested_score: number | null
          ai_suggestion_feedback: string | null
          answer_id: string
          attachments: Json
          body_md: string
          feedback_md: string | null
          legibility_confirmed: boolean
          question_id: string
          rubric_scores: Json
          score: number | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          ai_suggested_at?: string | null
          ai_suggested_rubric_scores?: Json | null
          ai_suggested_score?: number | null
          ai_suggestion_feedback?: string | null
          answer_id?: string
          attachments?: Json
          body_md?: string
          feedback_md?: string | null
          legibility_confirmed?: boolean
          question_id: string
          rubric_scores?: Json
          score?: number | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          ai_suggested_at?: string | null
          ai_suggested_rubric_scores?: Json | null
          ai_suggested_score?: number | null
          ai_suggestion_feedback?: string | null
          answer_id?: string
          attachments?: Json
          body_md?: string
          feedback_md?: string | null
          legibility_confirmed?: boolean
          question_id?: string
          rubric_scores?: Json
          score?: number | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "gs_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "gs_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      gs_cap_alerts: {
        Row: {
          date: string
          notified_at: string
          reason: string
        }
        Insert: {
          date: string
          notified_at?: string
          reason: string
        }
        Update: {
          date?: string
          notified_at?: string
          reason?: string
        }
        Relationships: []
      }
      gs_distinguished_answers: {
        Row: {
          created_at: string
          created_by: string | null
          distinction_id: string
          is_anonymous: boolean
          is_published: boolean
          points_awarded: number
          question_id: string | null
          reason: string | null
          round_id: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distinction_id?: string
          is_anonymous?: boolean
          is_published?: boolean
          points_awarded?: number
          question_id?: string | null
          reason?: string | null
          round_id: string
          submission_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distinction_id?: string
          is_anonymous?: boolean
          is_published?: boolean
          points_awarded?: number
          question_id?: string | null
          reason?: string | null
          round_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_distinguished_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "gs_distinguished_answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "gs_rounds"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "gs_distinguished_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "gs_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      gs_peer_assignments: {
        Row: {
          assigned_at: string
          assignment_id: string
          reviewer_user_id: string
          round_id: string
          submission_id: string
          submitted_at: string | null
        }
        Insert: {
          assigned_at?: string
          assignment_id?: string
          reviewer_user_id: string
          round_id: string
          submission_id: string
          submitted_at?: string | null
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          reviewer_user_id?: string
          round_id?: string
          submission_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gs_peer_assignments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "gs_rounds"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "gs_peer_assignments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "gs_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      gs_peer_review_answers: {
        Row: {
          assignment_id: string
          feedback_md: string | null
          question_id: string
          review_answer_id: string
          rubric_scores: Json
          score: number | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          feedback_md?: string | null
          question_id: string
          review_answer_id?: string
          rubric_scores?: Json
          score?: number | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          feedback_md?: string | null
          question_id?: string
          review_answer_id?: string
          rubric_scores?: Json
          score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_peer_review_answers_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "gs_peer_assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "gs_peer_review_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
        ]
      }
      gs_points_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          ledger_id: string
          source: string
          source_ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ledger_id?: string
          source: string
          source_ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ledger_id?: string
          source?: string
          source_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gs_question_issues: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description_md: string | null
          generated_at: string
          generated_by: string
          gs_question_id: string | null
          importance: Database["public"]["Enums"]["gs_issue_importance"]
          issue_id: string
          label: string
          order_index: number
          problem_id: string | null
          ref_article_id: string | null
          ref_case_id: string | null
          ref_hint: string | null
          rejected_reason: string | null
          review_status: Database["public"]["Enums"]["problem_review_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_md?: string | null
          generated_at?: string
          generated_by: string
          gs_question_id?: string | null
          importance?: Database["public"]["Enums"]["gs_issue_importance"]
          issue_id?: string
          label: string
          order_index?: number
          problem_id?: string | null
          ref_article_id?: string | null
          ref_case_id?: string | null
          ref_hint?: string | null
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_md?: string | null
          generated_at?: string
          generated_by?: string
          gs_question_id?: string | null
          importance?: Database["public"]["Enums"]["gs_issue_importance"]
          issue_id?: string
          label?: string
          order_index?: number
          problem_id?: string | null
          ref_article_id?: string | null
          ref_case_id?: string | null
          ref_hint?: string | null
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_question_issues_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gs_question_issues_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gs_question_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gs_question_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gs_question_issues_gs_question_id_fkey"
            columns: ["gs_question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "gs_question_issues_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "gs_question_issues_ref_article_id_fkey"
            columns: ["ref_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "gs_question_issues_ref_case_id_fkey"
            columns: ["ref_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
        ]
      }
      gs_question_pages: {
        Row: {
          created_at: string
          order_index: number
          page_number: number
          question_id: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          order_index?: number
          page_number: number
          question_id: string
          submission_id: string
        }
        Update: {
          created_at?: string
          order_index?: number
          page_number?: number
          question_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_question_pages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "gs_question_pages_submission_id_page_number_fkey"
            columns: ["submission_id", "page_number"]
            isOneToOne: false
            referencedRelation: "gs_submission_pages"
            referencedColumns: ["submission_id", "page_number"]
          },
        ]
      }
      gs_questions: {
        Row: {
          body_md: string
          created_at: string
          max_score: number
          model_answer_md: string | null
          order_index: number
          question_id: string
          round_id: string
          rubric: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          body_md: string
          created_at?: string
          max_score?: number
          model_answer_md?: string | null
          order_index?: number
          question_id?: string
          round_id: string
          rubric?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string
          created_at?: string
          max_score?: number
          model_answer_md?: string | null
          order_index?: number
          question_id?: string
          round_id?: string
          rubric?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "gs_rounds"
            referencedColumns: ["round_id"]
          },
        ]
      }
      gs_rounds: {
        Row: {
          answer_key_pdf_path: string | null
          created_at: string
          created_by: string | null
          description_md: string | null
          duration_min: number
          end_at: string
          expected_pages: number
          paper_pdf_path: string | null
          round_id: string
          round_number: number | null
          series_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["gs_round_status"]
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          answer_key_pdf_path?: string | null
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          duration_min?: number
          end_at: string
          expected_pages?: number
          paper_pdf_path?: string | null
          round_id?: string
          round_number?: number | null
          series_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["gs_round_status"]
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          answer_key_pdf_path?: string | null
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          duration_min?: number
          end_at?: string
          expected_pages?: number
          paper_pdf_path?: string | null
          round_id?: string
          round_number?: number | null
          series_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["gs_round_status"]
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_rounds_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "gs_series"
            referencedColumns: ["series_id"]
          },
        ]
      }
      gs_series: {
        Row: {
          created_at: string
          created_by: string | null
          description_md: string | null
          expected_rounds: number
          series_id: string
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          expected_rounds?: number
          series_id?: string
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          expected_rounds?: number
          series_id?: string
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      gs_submission_pages: {
        Row: {
          attachment: Json
          created_at: string
          legibility_confirmed: boolean
          page_id: string
          page_number: number
          submission_id: string
          updated_at: string
        }
        Insert: {
          attachment: Json
          created_at?: string
          legibility_confirmed?: boolean
          page_id?: string
          page_number: number
          submission_id: string
          updated_at?: string
        }
        Update: {
          attachment?: Json
          created_at?: string
          legibility_confirmed?: boolean
          page_id?: string
          page_number?: number
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_submission_pages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "gs_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      gs_submissions: {
        Row: {
          graded_at: string | null
          graded_by: string | null
          round_id: string
          started_at: string
          submission_id: string
          submitted_at: string | null
          total_score: number | null
          user_id: string
        }
        Insert: {
          graded_at?: string | null
          graded_by?: string | null
          round_id: string
          started_at?: string
          submission_id?: string
          submitted_at?: string | null
          total_score?: number | null
          user_id: string
        }
        Update: {
          graded_at?: string | null
          graded_by?: string | null
          round_id?: string
          started_at?: string
          submission_id?: string
          submitted_at?: string | null
          total_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gs_submissions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "gs_rounds"
            referencedColumns: ["round_id"]
          },
        ]
      }
      law_revisions: {
        Row: {
          comparison_pdf: string | null
          created_at: string
          effective_date: string | null
          explanation_pdf: string | null
          law_id: string
          law_revision_id: string
          promulgated_at: string | null
          reason_md: string | null
          revision_kind: Database["public"]["Enums"]["law_revision_kind"]
          revision_number: string
          video_url: string | null
        }
        Insert: {
          comparison_pdf?: string | null
          created_at?: string
          effective_date?: string | null
          explanation_pdf?: string | null
          law_id: string
          law_revision_id?: string
          promulgated_at?: string | null
          reason_md?: string | null
          revision_kind?: Database["public"]["Enums"]["law_revision_kind"]
          revision_number: string
          video_url?: string | null
        }
        Update: {
          comparison_pdf?: string | null
          created_at?: string
          effective_date?: string | null
          explanation_pdf?: string | null
          law_id?: string
          law_revision_id?: string
          promulgated_at?: string | null
          reason_md?: string | null
          revision_kind?: Database["public"]["Enums"]["law_revision_kind"]
          revision_number?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "law_revisions_law_id_fkey"
            columns: ["law_id"]
            isOneToOne: false
            referencedRelation: "laws"
            referencedColumns: ["law_id"]
          },
        ]
      }
      laws: {
        Row: {
          created_at: string
          display_label: string
          law_code: string
          law_id: string
          ord: number
          short_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_label: string
          law_code: string
          law_id?: string
          ord?: number
          short_label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_label?: string
          law_code?: string
          law_id?: string
          ord?: number
          short_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      lecture_resources: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_sec: number | null
          kind: Database["public"]["Enums"]["resource_kind"]
          ord: number
          pdf_url: string | null
          resource_id: string
          source_page_end: number | null
          source_page_start: number | null
          source_pdf_id: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["resource_target_type"]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_sec?: number | null
          kind: Database["public"]["Enums"]["resource_kind"]
          ord?: number
          pdf_url?: string | null
          resource_id?: string
          source_page_end?: number | null
          source_page_start?: number | null
          source_pdf_id?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["resource_target_type"]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_sec?: number | null
          kind?: Database["public"]["Enums"]["resource_kind"]
          ord?: number
          pdf_url?: string | null
          resource_id?: string
          source_page_end?: number | null
          source_page_start?: number | null
          source_pdf_id?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["resource_target_type"]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecture_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lecture_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      lecture_slide_candidates: {
        Row: {
          auto_candidates: string[]
          body_preview: string | null
          book_slug: string
          candidate_id: string
          created_at: string
          pdf_url: string
          resolved_at: string | null
          slide_idx: number
          updated_at: string
        }
        Insert: {
          auto_candidates?: string[]
          body_preview?: string | null
          book_slug: string
          candidate_id?: string
          created_at?: string
          pdf_url: string
          resolved_at?: string | null
          slide_idx: number
          updated_at?: string
        }
        Update: {
          auto_candidates?: string[]
          body_preview?: string | null
          book_slug?: string
          candidate_id?: string
          created_at?: string
          pdf_url?: string
          resolved_at?: string | null
          slide_idx?: number
          updated_at?: string
        }
        Relationships: []
      }
      lecture_views: {
        Row: {
          completed_at: string | null
          item_id: string
          last_position_sec: number
          updated_at: string
          user_id: string
          view_id: string
          viewed_at: string
        }
        Insert: {
          completed_at?: string | null
          item_id: string
          last_position_sec?: number
          updated_at?: string
          user_id: string
          view_id?: string
          viewed_at?: string
        }
        Update: {
          completed_at?: string | null
          item_id?: string
          last_position_sec?: number
          updated_at?: string
          user_id?: string
          view_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_views_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "curriculum_items"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lecture_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lecture_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      mcq_exam_attempts: {
        Row: {
          attempt_id: string
          completed_at: string | null
          created_at: string
          exam_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          attempt_id?: string
          completed_at?: string | null
          created_at?: string
          exam_id: string
          started_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          completed_at?: string | null
          created_at?: string
          exam_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "mcq_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "mcq_exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mcq_exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      mcq_exam_papers: {
        Row: {
          exam_id: string
          fail_floor: number
          ord: number
          pack_id: string
        }
        Insert: {
          exam_id: string
          fail_floor?: number
          ord?: number
          pack_id: string
        }
        Update: {
          exam_id?: string
          fail_floor?: number
          ord?: number
          pack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_exam_papers_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "mcq_exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "mcq_exam_papers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "mcq_packs"
            referencedColumns: ["pack_id"]
          },
        ]
      }
      mcq_exams: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          exam_id: string
          exam_round_no: number | null
          is_published: boolean
          pass_average: number
          published_at: string | null
          title: string
          updated_at: string
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          exam_id?: string
          exam_round_no?: number | null
          is_published?: boolean
          pass_average?: number
          published_at?: string | null
          title: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          exam_id?: string
          exam_round_no?: number | null
          is_published?: boolean
          pass_average?: number
          published_at?: string | null
          title?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mcq_exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mcq_exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      mcq_pack_problems: {
        Row: {
          created_at: string
          ord: number
          pack_id: string
          problem_id: string
        }
        Insert: {
          created_at?: string
          ord?: number
          pack_id: string
          problem_id: string
        }
        Update: {
          created_at?: string
          ord?: number
          pack_id?: string
          problem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_pack_problems_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "mcq_packs"
            referencedColumns: ["pack_id"]
          },
          {
            foreignKeyName: "mcq_pack_problems_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
        ]
      }
      mcq_packs: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          duration_min: number | null
          exam_round_no: number | null
          is_published: boolean
          kind: string
          pack_id: string
          pass_score: number | null
          published_at: string | null
          result_doc_url: string | null
          subject_scope: string
          title: string
          updated_at: string
          video_url: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_min?: number | null
          exam_round_no?: number | null
          is_published?: boolean
          kind: string
          pack_id?: string
          pass_score?: number | null
          published_at?: string | null
          result_doc_url?: string | null
          subject_scope: string
          title: string
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_min?: number | null
          exam_round_no?: number | null
          is_published?: boolean
          kind?: string
          pack_id?: string
          pass_score?: number | null
          published_at?: string | null
          result_doc_url?: string | null
          subject_scope?: string
          title?: string
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mcq_packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mcq_packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      paper_article_links: {
        Row: {
          article_id: string
          created_at: string
          created_by: string | null
          link_id: string
          note: string | null
          paper_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          paper_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_article_links_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "paper_article_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "paper_article_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "paper_article_links_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["paper_id"]
          },
        ]
      }
      paper_case_links: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          link_id: string
          note: string | null
          paper_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          paper_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_case_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "paper_case_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "paper_case_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "paper_case_links_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["paper_id"]
          },
        ]
      }
      papers: {
        Row: {
          abstract: string | null
          authors: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          importance: number
          paper_id: string
          pdf_path: string | null
          pdf_url: string | null
          published_at: string | null
          source: string | null
          subject_laws: string[]
          tags: string[]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          abstract?: string | null
          authors?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          importance?: number
          paper_id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          published_at?: string | null
          source?: string | null
          subject_laws?: string[]
          tags?: string[]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          abstract?: string | null
          authors?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          importance?: number
          paper_id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          published_at?: string | null
          source?: string | null
          subject_laws?: string[]
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "papers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "papers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      pass_prediction_snapshots: {
        Row: {
          components: Json
          gs_average_pct: number | null
          rating: string
          score: number
          snapshot_at: string
          snapshot_date: string
          snapshot_id: string
          user_id: string
        }
        Insert: {
          components?: Json
          gs_average_pct?: number | null
          rating: string
          score: number
          snapshot_at?: string
          snapshot_date?: string
          snapshot_id?: string
          user_id: string
        }
        Update: {
          components?: Json
          gs_average_pct?: number | null
          rating?: string
          score?: number
          snapshot_at?: string
          snapshot_date?: string
          snapshot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_prediction_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pass_prediction_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_krw: number
          created_at: string
          failure_reason: string | null
          payment_id: string
          plan_id: string
          status: Database["public"]["Enums"]["payment_status"]
          toss_order_id: string
          toss_payment_key: string | null
          toss_response: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_krw: number
          created_at?: string
          failure_reason?: string | null
          payment_id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          toss_order_id: string
          toss_payment_key?: string | null
          toss_response?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_krw?: number
          created_at?: string
          failure_reason?: string | null
          payment_id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          toss_order_id?: string
          toss_payment_key?: string | null
          toss_response?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      problem_box_items: {
        Row: {
          body_md: string
          box_item_id: string
          choice_type: Database["public"]["Enums"]["problem_choice_type"] | null
          created_at: string
          explanation_md: string | null
          marker: string
          ox_ineligible: boolean
          ox_truth: Database["public"]["Enums"]["ox_truth"] | null
          position_index: number
          problem_id: string
          related_article_id: string | null
          related_article_number: string | null
          related_case_id: string | null
          related_case_number: string | null
          updated_at: string
        }
        Insert: {
          body_md: string
          box_item_id?: string
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          explanation_md?: string | null
          marker: string
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          position_index: number
          problem_id: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string
          box_item_id?: string
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          explanation_md?: string | null
          marker?: string
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          position_index?: number
          problem_id?: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_box_items_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "problem_box_items_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "problem_box_items_related_case_id_fkey"
            columns: ["related_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
        ]
      }
      problem_case_links: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          link_id: string
          note: string | null
          problem_id: string
          relation_type: Database["public"]["Enums"]["pc_relation_type"]
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          problem_id: string
          relation_type?: Database["public"]["Enums"]["pc_relation_type"]
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          link_id?: string
          note?: string | null
          problem_id?: string
          relation_type?: Database["public"]["Enums"]["pc_relation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "problem_case_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "problem_case_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_case_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_case_links_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
        ]
      }
      problem_choices: {
        Row: {
          body_md: string
          choice_id: string
          choice_index: number
          choice_type: Database["public"]["Enums"]["problem_choice_type"] | null
          created_at: string
          explanation_md: string | null
          is_correct: boolean
          ox_ineligible: boolean
          ox_truth: Database["public"]["Enums"]["ox_truth"] | null
          problem_id: string
          related_article_id: string | null
          related_article_number: string | null
          related_case_id: string | null
          related_case_number: string | null
        }
        Insert: {
          body_md: string
          choice_id?: string
          choice_index: number
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          explanation_md?: string | null
          is_correct?: boolean
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          problem_id: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
        }
        Update: {
          body_md?: string
          choice_id?: string
          choice_index?: number
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          explanation_md?: string | null
          is_correct?: boolean
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          problem_id?: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problem_choices_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "problem_choices_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "problem_choices_related_case_id_fkey"
            columns: ["related_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
        ]
      }
      problem_source_docs: {
        Row: {
          created_at: string
          edition: string | null
          file_name: string
          kind: Database["public"]["Enums"]["problem_source_doc_kind"]
          label: string
          metadata: Json
          paired_with_doc_id: string | null
          source_doc_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          edition?: string | null
          file_name: string
          kind: Database["public"]["Enums"]["problem_source_doc_kind"]
          label: string
          metadata?: Json
          paired_with_doc_id?: string | null
          source_doc_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          edition?: string | null
          file_name?: string
          kind?: Database["public"]["Enums"]["problem_source_doc_kind"]
          label?: string
          metadata?: Json
          paired_with_doc_id?: string | null
          source_doc_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_source_docs_paired_with_doc_id_fkey"
            columns: ["paired_with_doc_id"]
            isOneToOne: false
            referencedRelation: "problem_source_docs"
            referencedColumns: ["source_doc_id"]
          },
        ]
      }
      problems: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_md: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          exam_round: Database["public"]["Enums"]["problem_exam_round"]
          exam_round_no: number | null
          examined_at: string | null
          explanation_md: string | null
          format: Database["public"]["Enums"]["problem_format"]
          gen_range: Json | null
          generated_at: string | null
          generated_by: string | null
          grading_rubric_md: string | null
          importance: number | null
          law_id: string | null
          mismatch_flagged_at: string | null
          mismatch_flagged_by: string | null
          model_answer_md: string | null
          origin: Database["public"]["Enums"]["problem_origin"]
          polarity: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id: string | null
          problem_id: string
          problem_number: number | null
          rejected_reason: string | null
          released_at: string | null
          review_status: Database["public"]["Enums"]["problem_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          rubric_items: Json | null
          science_section_id: string | null
          science_subject: Database["public"]["Enums"]["science_subject"] | null
          scope: Database["public"]["Enums"]["problem_scope"] | null
          source_chunk_ids: string[] | null
          source_doc_id: string | null
          source_gs_question_id: string | null
          subject_type: Database["public"]["Enums"]["problem_subject_type"]
          subjective_keywords: string[] | null
          subjective_kind: Database["public"]["Enums"]["subjective_kind"] | null
          subjective_topic: string | null
          total_points: number | null
          updated_at: string
          video_url: string | null
          year: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_md: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exam_round: Database["public"]["Enums"]["problem_exam_round"]
          exam_round_no?: number | null
          examined_at?: string | null
          explanation_md?: string | null
          format: Database["public"]["Enums"]["problem_format"]
          gen_range?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          grading_rubric_md?: string | null
          importance?: number | null
          law_id?: string | null
          mismatch_flagged_at?: string | null
          mismatch_flagged_by?: string | null
          model_answer_md?: string | null
          origin: Database["public"]["Enums"]["problem_origin"]
          polarity?: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id?: string | null
          problem_id?: string
          problem_number?: number | null
          rejected_reason?: string | null
          released_at?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_items?: Json | null
          science_section_id?: string | null
          science_subject?:
            | Database["public"]["Enums"]["science_subject"]
            | null
          scope?: Database["public"]["Enums"]["problem_scope"] | null
          source_chunk_ids?: string[] | null
          source_doc_id?: string | null
          source_gs_question_id?: string | null
          subject_type: Database["public"]["Enums"]["problem_subject_type"]
          subjective_keywords?: string[] | null
          subjective_kind?:
            | Database["public"]["Enums"]["subjective_kind"]
            | null
          subjective_topic?: string | null
          total_points?: number | null
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exam_round?: Database["public"]["Enums"]["problem_exam_round"]
          exam_round_no?: number | null
          examined_at?: string | null
          explanation_md?: string | null
          format?: Database["public"]["Enums"]["problem_format"]
          gen_range?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          grading_rubric_md?: string | null
          importance?: number | null
          law_id?: string | null
          mismatch_flagged_at?: string | null
          mismatch_flagged_by?: string | null
          model_answer_md?: string | null
          origin?: Database["public"]["Enums"]["problem_origin"]
          polarity?: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id?: string | null
          problem_id?: string
          problem_number?: number | null
          rejected_reason?: string | null
          released_at?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_items?: Json | null
          science_section_id?: string | null
          science_subject?:
            | Database["public"]["Enums"]["science_subject"]
            | null
          scope?: Database["public"]["Enums"]["problem_scope"] | null
          source_chunk_ids?: string[] | null
          source_doc_id?: string | null
          source_gs_question_id?: string | null
          subject_type?: Database["public"]["Enums"]["problem_subject_type"]
          subjective_keywords?: string[] | null
          subjective_kind?:
            | Database["public"]["Enums"]["subjective_kind"]
            | null
          subjective_topic?: string | null
          total_points?: number | null
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "problems_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_law_id_fkey"
            columns: ["law_id"]
            isOneToOne: false
            referencedRelation: "laws"
            referencedColumns: ["law_id"]
          },
          {
            foreignKeyName: "problems_mismatch_flagged_by_fkey"
            columns: ["mismatch_flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_mismatch_flagged_by_fkey"
            columns: ["mismatch_flagged_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_primary_article_id_fkey"
            columns: ["primary_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "problems_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problems_science_section_id_fkey"
            columns: ["science_section_id"]
            isOneToOne: false
            referencedRelation: "science_sections"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "problems_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "problem_source_docs"
            referencedColumns: ["source_doc_id"]
          },
          {
            foreignKeyName: "problems_source_gs_question_id_fkey"
            columns: ["source_gs_question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
        ]
      }
      profiles: {
        Row: {
          analytics_consent_at: string | null
          avatar_url: string | null
          created_at: string
          highlight_color_aliases: Json
          is_synthetic: boolean
          marketing_consent: boolean
          name: string
          next_exam_round: Database["public"]["Enums"]["exam_round"] | null
          next_exam_year: number | null
          notify_channels: string[]
          onboarded_at: string | null
          phone_e164: string | null
          profile_id: string
          recommendation_prefs: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          analytics_consent_at?: string | null
          avatar_url?: string | null
          created_at?: string
          highlight_color_aliases?: Json
          is_synthetic?: boolean
          marketing_consent?: boolean
          name: string
          next_exam_round?: Database["public"]["Enums"]["exam_round"] | null
          next_exam_year?: number | null
          notify_channels?: string[]
          onboarded_at?: string | null
          phone_e164?: string | null
          profile_id: string
          recommendation_prefs?: Json
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          analytics_consent_at?: string | null
          avatar_url?: string | null
          created_at?: string
          highlight_color_aliases?: Json
          is_synthetic?: boolean
          marketing_consent?: boolean
          name?: string
          next_exam_round?: Database["public"]["Enums"]["exam_round"] | null
          next_exam_year?: number | null
          notify_channels?: string[]
          onboarded_at?: string | null
          phone_e164?: string | null
          profile_id?: string
          recommendation_prefs?: Json
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      qna_threads: {
        Row: {
          answer_md: string | null
          answered_at: string | null
          answerer_id: string | null
          asker_id: string
          created_at: string
          deleted_at: string | null
          quality_grade: Database["public"]["Enums"]["qna_quality_grade"] | null
          question_md: string
          status: Database["public"]["Enums"]["qna_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["qna_target_type"]
          thread_id: string
          title: string
          updated_at: string
        }
        Insert: {
          answer_md?: string | null
          answered_at?: string | null
          answerer_id?: string | null
          asker_id: string
          created_at?: string
          deleted_at?: string | null
          quality_grade?:
            | Database["public"]["Enums"]["qna_quality_grade"]
            | null
          question_md: string
          status?: Database["public"]["Enums"]["qna_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["qna_target_type"]
          thread_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          answer_md?: string | null
          answered_at?: string | null
          answerer_id?: string | null
          asker_id?: string
          created_at?: string
          deleted_at?: string | null
          quality_grade?:
            | Database["public"]["Enums"]["qna_quality_grade"]
            | null
          question_md?: string
          status?: Database["public"]["Enums"]["qna_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["qna_target_type"]
          thread_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qna_threads_answerer_id_fkey"
            columns: ["answerer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_threads_answerer_id_fkey"
            columns: ["answerer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_threads_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_threads_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          exam_attempt_id: string | null
          law_code: string | null
          mode: string
          pack_id: string | null
          problem_ids: string[]
          science_subject: Database["public"]["Enums"]["science_subject"] | null
          scope_payload: Json
          scope_type: string
          session_id: string
          started_at: string
          time_limit_sec: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exam_attempt_id?: string | null
          law_code?: string | null
          mode?: string
          pack_id?: string | null
          problem_ids: string[]
          science_subject?:
            | Database["public"]["Enums"]["science_subject"]
            | null
          scope_payload?: Json
          scope_type: string
          session_id?: string
          started_at?: string
          time_limit_sec?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exam_attempt_id?: string | null
          law_code?: string | null
          mode?: string
          pack_id?: string | null
          problem_ids?: string[]
          science_subject?:
            | Database["public"]["Enums"]["science_subject"]
            | null
          scope_payload?: Json
          scope_type?: string
          session_id?: string
          started_at?: string
          time_limit_sec?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_exam_attempt_id_fkey"
            columns: ["exam_attempt_id"]
            isOneToOne: false
            referencedRelation: "mcq_exam_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "quiz_sessions_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "mcq_packs"
            referencedColumns: ["pack_id"]
          },
          {
            foreignKeyName: "quiz_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "quiz_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      science_sections: {
        Row: {
          code: string | null
          created_at: string
          description_md: string | null
          label: string
          order_index: number
          parent_id: string | null
          science_subject: Database["public"]["Enums"]["science_subject"]
          section_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description_md?: string | null
          label: string
          order_index?: number
          parent_id?: string | null
          science_subject: Database["public"]["Enums"]["science_subject"]
          section_id?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description_md?: string | null
          label?: string
          order_index?: number
          parent_id?: string | null
          science_subject?: Database["public"]["Enums"]["science_subject"]
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "science_sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "science_sections"
            referencedColumns: ["section_id"]
          },
        ]
      }
      srs_items: {
        Row: {
          back: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          front: string
          item_id: string
          law_ref: string | null
          source: string | null
          source_id: string | null
          source_type: string | null
          subject: string
          topic: string | null
          type: Database["public"]["Enums"]["srs_item_type"]
        }
        Insert: {
          back: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          front: string
          item_id?: string
          law_ref?: string | null
          source?: string | null
          source_id?: string | null
          source_type?: string | null
          subject: string
          topic?: string | null
          type: Database["public"]["Enums"]["srs_item_type"]
        }
        Update: {
          back?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          front?: string
          item_id?: string
          law_ref?: string | null
          source?: string | null
          source_id?: string | null
          source_type?: string | null
          subject?: string
          topic?: string | null
          type?: Database["public"]["Enums"]["srs_item_type"]
        }
        Relationships: []
      }
      srs_review_logs: {
        Row: {
          cohort_id: string | null
          elapsed_ms: number | null
          grade: number
          item_id: string
          log_id: string
          new_ef: number
          new_interval: number
          new_state: Database["public"]["Enums"]["srs_state"]
          prev_ef: number
          prev_interval: number
          prev_state: Database["public"]["Enums"]["srs_state"]
          reviewed_at: string
          source_type: string | null
          user_id: string
        }
        Insert: {
          cohort_id?: string | null
          elapsed_ms?: number | null
          grade: number
          item_id: string
          log_id?: string
          new_ef: number
          new_interval: number
          new_state: Database["public"]["Enums"]["srs_state"]
          prev_ef: number
          prev_interval: number
          prev_state: Database["public"]["Enums"]["srs_state"]
          reviewed_at?: string
          source_type?: string | null
          user_id: string
        }
        Update: {
          cohort_id?: string | null
          elapsed_ms?: number | null
          grade?: number
          item_id?: string
          log_id?: string
          new_ef?: number
          new_interval?: number
          new_state?: Database["public"]["Enums"]["srs_state"]
          prev_ef?: number
          prev_interval?: number
          prev_state?: Database["public"]["Enums"]["srs_state"]
          reviewed_at?: string
          source_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_review_logs_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "srs_review_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "srs_items"
            referencedColumns: ["item_id"]
          },
        ]
      }
      srs_review_states: {
        Row: {
          cohort_id: string | null
          created_at: string
          due_date: string
          ease_factor: number
          interval_days: number
          item_id: string
          lapses: number
          last_reviewed_at: string | null
          repetitions: number
          state: Database["public"]["Enums"]["srs_state"]
          state_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          due_date?: string
          ease_factor?: number
          interval_days?: number
          item_id: string
          lapses?: number
          last_reviewed_at?: string | null
          repetitions?: number
          state?: Database["public"]["Enums"]["srs_state"]
          state_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          due_date?: string
          ease_factor?: number
          interval_days?: number
          item_id?: string
          lapses?: number
          last_reviewed_at?: string | null
          repetitions?: number
          state?: Database["public"]["Enums"]["srs_state"]
          state_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_review_states_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "srs_review_states_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "srs_items"
            referencedColumns: ["item_id"]
          },
        ]
      }
      srs_user_settings: {
        Row: {
          created_at: string
          max_reviews_per_day: number
          new_per_day: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          max_reviews_per_day?: number
          new_per_day?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          max_reviews_per_day?: number
          new_per_day?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_notes: {
        Row: {
          author_id: string
          body_md: string
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          note_id: string
          student_id: string
          updated_at: string
          visibility: Database["public"]["Enums"]["student_note_visibility"]
        }
        Insert: {
          author_id: string
          body_md: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          note_id?: string
          student_id: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["student_note_visibility"]
        }
        Update: {
          author_id?: string
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          note_id?: string
          student_id?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["student_note_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      study_books: {
        Row: {
          author: string | null
          book_id: string
          created_at: string
          edition: string | null
          file_path: string | null
          kind: Database["public"]["Enums"]["chunk_source_type"]
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          book_id?: string
          created_at?: string
          edition?: string | null
          file_path?: string | null
          kind: Database["public"]["Enums"]["chunk_source_type"]
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          book_id?: string
          created_at?: string
          edition?: string | null
          file_path?: string | null
          kind?: Database["public"]["Enums"]["chunk_source_type"]
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      study_goals: {
        Row: {
          exam_date: string | null
          exam_type: string
          notes: string | null
          target_score: number | null
          updated_at: string
          user_id: string
          weekly_goal_hours: number
        }
        Insert: {
          exam_date?: string | null
          exam_type?: string
          notes?: string | null
          target_score?: number | null
          updated_at?: string
          user_id: string
          weekly_goal_hours?: number
        }
        Update: {
          exam_date?: string | null
          exam_type?: string
          notes?: string | null
          target_score?: number | null
          updated_at?: string
          user_id?: string
          weekly_goal_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          duration_ms: number | null
          ended_at: string | null
          scope: Json
          session_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          duration_ms?: number | null
          ended_at?: string | null
          scope: Json
          session_id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          duration_ms?: number | null
          ended_at?: string | null
          scope?: Json
          session_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          display_order: number
          duration_days: number
          features: Json
          is_active: boolean
          name: string
          plan_id: string
          price_krw: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          duration_days: number
          features?: Json
          is_active?: boolean
          name: string
          plan_id?: string
          price_krw: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          duration_days?: number
          features?: Json
          is_active?: boolean
          name?: string
          plan_id?: string
          price_krw?: number
          updated_at?: string
        }
        Relationships: []
      }
      systematic_nodes: {
        Row: {
          case_display_label: string | null
          case_only: boolean
          created_at: string
          display_label: string
          law_code: string
          node_id: string
          ord: number
          parent_id: string | null
          path: unknown
          updated_at: string
        }
        Insert: {
          case_display_label?: string | null
          case_only?: boolean
          created_at?: string
          display_label: string
          law_code: string
          node_id?: string
          ord?: number
          parent_id?: string | null
          path: unknown
          updated_at?: string
        }
        Update: {
          case_display_label?: string | null
          case_only?: boolean
          created_at?: string
          display_label?: string
          law_code?: string
          node_id?: string
          ord?: number
          parent_id?: string | null
          path?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "systematic_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
        ]
      }
      user_auto_blank_attempts: {
        Row: {
          answer: string
          article_id: string
          attempt_id: string
          attempted_at: string
          blank_type: Database["public"]["Enums"]["auto_blank_type"]
          block_index: number
          cum_offset: number
          is_correct: boolean
          user_id: string
          user_input: string
        }
        Insert: {
          answer: string
          article_id: string
          attempt_id?: string
          attempted_at?: string
          blank_type: Database["public"]["Enums"]["auto_blank_type"]
          block_index: number
          cum_offset: number
          is_correct: boolean
          user_id: string
          user_input: string
        }
        Update: {
          answer?: string
          article_id?: string
          attempt_id?: string
          attempted_at?: string
          blank_type?: Database["public"]["Enums"]["auto_blank_type"]
          block_index?: number
          cum_offset?: number
          is_correct?: boolean
          user_id?: string
          user_input?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_auto_blank_attempts_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
        ]
      }
      user_blank_attempts: {
        Row: {
          attempt_id: string
          attempted_at: string
          blank_idx: number
          is_correct: boolean
          set_id: string
          user_id: string
          user_input: string | null
        }
        Insert: {
          attempt_id?: string
          attempted_at?: string
          blank_idx: number
          is_correct: boolean
          set_id: string
          user_id: string
          user_input?: string | null
        }
        Update: {
          attempt_id?: string
          attempted_at?: string
          blank_idx?: number
          is_correct?: boolean
          set_id?: string
          user_id?: string
          user_input?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_blank_attempts_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "article_blank_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      user_blank_srs: {
        Row: {
          blank_idx: number
          created_at: string
          ease: number
          interval_days: number
          lapses: number
          last_quality: number | null
          last_reviewed_at: string | null
          next_due_at: string
          reps: number
          set_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blank_idx: number
          created_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_due_at?: string
          reps?: number
          set_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blank_idx?: number
          created_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_due_at?: string
          reps?: number
          set_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blank_srs_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "article_blank_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      user_bookmarks: {
        Row: {
          bookmark_id: string
          created_at: string
          deleted_at: string | null
          note_md: string | null
          star_level: number
          step_notes: Json
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmark_id?: string
          created_at?: string
          deleted_at?: string | null
          note_md?: string | null
          star_level: number
          step_notes?: Json
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmark_id?: string
          created_at?: string
          deleted_at?: string | null
          note_md?: string | null
          star_level?: number
          step_notes?: Json
          target_id?: string
          target_type?: Database["public"]["Enums"]["annotation_target_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_daily_recommendations: {
        Row: {
          generated_at: string
          items: Json
          recommendation_date: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          generated_at?: string
          items?: Json
          recommendation_date: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          generated_at?: string
          items?: Json
          recommendation_date?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: []
      }
      user_highlights: {
        Row: {
          after_ctx: string | null
          before_ctx: string | null
          color: string
          content_hash: string
          created_at: string
          deleted_at: string | null
          end_offset: number
          field_path: string
          highlight_id: string
          label: string | null
          snippet: string | null
          start_offset: number
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          user_id: string
        }
        Insert: {
          after_ctx?: string | null
          before_ctx?: string | null
          color: string
          content_hash: string
          created_at?: string
          deleted_at?: string | null
          end_offset: number
          field_path: string
          highlight_id?: string
          label?: string | null
          snippet?: string | null
          start_offset: number
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          user_id: string
        }
        Update: {
          after_ctx?: string | null
          before_ctx?: string | null
          color?: string
          content_hash?: string
          created_at?: string
          deleted_at?: string | null
          end_offset?: number
          field_path?: string
          highlight_id?: string
          label?: string | null
          snippet?: string | null
          start_offset?: number
          target_id?: string
          target_type?: Database["public"]["Enums"]["annotation_target_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_issue_attempts: {
        Row: {
          ai_analysis: Json | null
          ai_analyzed_at: string | null
          attempt_id: string
          created_at: string
          deleted_at: string | null
          gs_question_id: string
          self_check: Json | null
          self_checked_at: string | null
          student_issues_md: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_analyzed_at?: string | null
          attempt_id?: string
          created_at?: string
          deleted_at?: string | null
          gs_question_id: string
          self_check?: Json | null
          self_checked_at?: string | null
          student_issues_md?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_analyzed_at?: string | null
          attempt_id?: string
          created_at?: string
          deleted_at?: string | null
          gs_question_id?: string
          self_check?: Json | null
          self_checked_at?: string | null
          student_issues_md?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_issue_attempts_gs_question_id_fkey"
            columns: ["gs_question_id"]
            isOneToOne: false
            referencedRelation: "gs_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "user_issue_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_issue_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_memos: {
        Row: {
          block_index: number | null
          body_md: string
          created_at: string
          cum_offset: number | null
          deleted_at: string | null
          memo_id: string
          snippet: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          block_index?: number | null
          body_md: string
          created_at?: string
          cum_offset?: number | null
          deleted_at?: string | null
          memo_id?: string
          snippet?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          block_index?: number | null
          body_md?: string
          created_at?: string
          cum_offset?: number | null
          deleted_at?: string | null
          memo_id?: string
          snippet?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["annotation_target_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_memos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string
          entity_type: string
          href: string
          kind: Database["public"]["Enums"]["staff_notification_kind"]
          notification_id: string
          payload: Json | null
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          href: string
          kind: Database["public"]["Enums"]["staff_notification_kind"]
          notification_id?: string
          payload?: Json | null
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          href?: string
          kind?: Database["public"]["Enums"]["staff_notification_kind"]
          notification_id?: string
          payload?: Json | null
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "staff_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_ox_ref_srs: {
        Row: {
          created_at: string
          ease: number
          interval_days: number
          lapses: number
          last_quality: number | null
          last_reviewed_at: string | null
          next_due_at: string
          ref_id: string
          ref_type: string
          reps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_due_at?: string
          ref_id: string
          ref_type: string
          reps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_due_at?: string
          ref_id?: string
          ref_type?: string
          reps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_problem_attempts: {
        Row: {
          attempt_id: string
          attempted_at: string
          is_correct: boolean
          mode: string
          ox_answer: Database["public"]["Enums"]["ox_truth"] | null
          problem_id: string
          selected_box_item_id: string | null
          selected_choice_id: string | null
          selected_choice_index: number | null
          session_id: string | null
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          attempt_id?: string
          attempted_at?: string
          is_correct: boolean
          mode?: string
          ox_answer?: Database["public"]["Enums"]["ox_truth"] | null
          problem_id: string
          selected_box_item_id?: string | null
          selected_choice_id?: string | null
          selected_choice_index?: number | null
          session_id?: string | null
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          attempt_id?: string
          attempted_at?: string
          is_correct?: boolean
          mode?: string
          ox_answer?: Database["public"]["Enums"]["ox_truth"] | null
          problem_id?: string
          selected_box_item_id?: string | null
          selected_choice_id?: string | null
          selected_choice_index?: number | null
          session_id?: string | null
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_problem_attempts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "user_problem_attempts_selected_box_item_id_fkey"
            columns: ["selected_box_item_id"]
            isOneToOne: false
            referencedRelation: "problem_box_items"
            referencedColumns: ["box_item_id"]
          },
          {
            foreignKeyName: "user_problem_attempts_selected_choice_id_fkey"
            columns: ["selected_choice_id"]
            isOneToOne: false
            referencedRelation: "problem_choices"
            referencedColumns: ["choice_id"]
          },
          {
            foreignKeyName: "user_problem_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "user_problem_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_problem_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_problem_srs: {
        Row: {
          created_at: string
          ease: number
          interval_days: number
          lapses: number
          last_quality: number | null
          last_reviewed_at: string | null
          next_due_at: string
          problem_id: string
          reps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_due_at?: string
          problem_id: string
          reps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_quality?: number | null
          last_reviewed_at?: string | null
          next_due_at?: string
          problem_id?: string
          reps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_problem_srs_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
        ]
      }
      user_quiz_flags: {
        Row: {
          flagged_at: string
          problem_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          flagged_at?: string
          problem_id: string
          session_id: string
          user_id: string
        }
        Update: {
          flagged_at?: string
          problem_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quiz_flags_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "user_quiz_flags_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "user_quiz_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_quiz_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_recitation_attempts: {
        Row: {
          article_id: string
          attempt_id: string
          attempted_at: string
          block_index: number | null
          expected_text: string
          is_complete: boolean
          similarity: number
          user_id: string
          user_input: string
        }
        Insert: {
          article_id: string
          attempt_id?: string
          attempted_at?: string
          block_index?: number | null
          expected_text: string
          is_complete: boolean
          similarity: number
          user_id: string
          user_input: string
        }
        Update: {
          article_id?: string
          attempt_id?: string
          attempted_at?: string
          block_index?: number | null
          expected_text?: string
          is_complete?: boolean
          similarity?: number
          user_id?: string
          user_input?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_recitation_attempts_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
        ]
      }
      user_search_history: {
        Row: {
          created_at: string
          history_id: string
          last_searched_at: string
          query: string
          search_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          history_id?: string
          last_searched_at?: string
          query: string
          search_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          history_id?: string
          last_searched_at?: string
          query?: string
          search_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_subjective_attempts: {
        Row: {
          answer_md: string
          attempt_id: string
          created_at: string
          deleted_at: string | null
          problem_id: string
          review_completed_at: string | null
          review_requested_at: string | null
          reviewer_comment_md: string | null
          reviewer_id: string | null
          reviewer_score: number | null
          rubric_self_check: Json | null
          self_score: number | null
          self_score_note: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_md?: string
          attempt_id?: string
          created_at?: string
          deleted_at?: string | null
          problem_id: string
          review_completed_at?: string | null
          review_requested_at?: string | null
          reviewer_comment_md?: string | null
          reviewer_id?: string | null
          reviewer_score?: number | null
          rubric_self_check?: Json | null
          self_score?: number | null
          self_score_note?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_md?: string
          attempt_id?: string
          created_at?: string
          deleted_at?: string | null
          problem_id?: string
          review_completed_at?: string | null
          review_requested_at?: string | null
          reviewer_comment_md?: string | null
          reviewer_id?: string | null
          reviewer_score?: number | null
          rubric_self_check?: Json | null
          self_score?: number | null
          self_score_note?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subjective_attempts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "user_subjective_attempts_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_subjective_attempts_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_subjective_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_subjective_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          payment_id: string | null
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          payment_id?: string | null
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          payment_id?: string | null
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      gs_points_balance_v: {
        Row: {
          balance: number | null
          tx_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          name: string | null
          profile_id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          avatar_url?: string | null
          name?: string | null
          profile_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          avatar_url?: string | null
          name?: string | null
          profile_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_audit_anomalies: {
        Args: { p_hours?: number }
        Returns: {
          actor_id: string
          actor_name: string
          anomaly_type: string
          bucket_start: string
          detail: Json
          entity_type: string
          event_count: number
          sample_log_id: string
          severity: string
        }[]
      }
      admin_law_completeness: {
        Args: { p_law_code: string }
        Returns: {
          articles_no_blanks: number
          articles_no_comments: number
          articles_no_problem: number
          articles_no_related_article: number
          articles_no_related_case: number
          articles_no_revision: number
          cases_no_article_link: number
          cases_no_summary: number
          mcq_no_explanation: number
          total_articles: number
          total_cases: number
          total_mcq: number
          total_subjective: number
        }[]
      }
      admin_law_health_matrix: {
        Args: never
        Returns: {
          articles_blank_ratio: number
          articles_body_ratio: number
          articles_comment_ratio: number
          articles_systematic_ratio: number
          cases_linked_ratio: number
          cases_summary_ratio: number
          display_label: string
          health_score: number
          law_code: string
          mcq_explanation_ratio: number
          ord: number
          problems_per_article_ratio: number
          total_articles: number
          total_cases: number
          total_mcq: number
        }[]
      }
      admin_mcq_problem_stats: {
        Args: { p_law_code: string; p_limit?: number; p_min_attempts?: number }
        Returns: {
          accuracy: number
          attempts: number
          body_md: string
          correct_count: number
          origin: string
          primary_article_label: string
          primary_article_number: string
          problem_id: string
          problem_number: number
          unique_users: number
          year: number
        }[]
      }
      admin_mcq_year_stats: {
        Args: { p_law_code: string }
        Returns: {
          accuracy: number
          attempts: number
          correct_count: number
          problem_count: number
          year: number
        }[]
      }
      admin_ox_ref_stats: {
        Args: { p_law_code: string; p_limit?: number; p_min_attempts?: number }
        Returns: {
          accuracy: number
          attempts: number
          body_md: string
          correct_count: number
          origin: string
          ox_truth: string
          problem_id: string
          problem_number: number
          ref_id: string
          ref_type: string
          related_article_label: string
          related_article_number: string
          unique_users: number
          year: number
        }[]
      }
      admin_problem_summary: {
        Args: { p_law_code: string }
        Returns: {
          mcq_attempt_count: number
          mcq_correct_count: number
          mcq_problem_count: number
          mcq_unique_users: number
          ox_attempt_count: number
          ox_correct_count: number
          ox_ref_active: number
          ox_ref_total: number
          ox_unique_users: number
        }[]
      }
      admin_subject_coverage: {
        Args: never
        Returns: {
          article_comments: number
          articles: number
          articles_with_body: number
          blank_sets: number
          cases: number
          display_label: string
          law_code: string
          ord: number
          problems_mc: number
          problems_subjective: number
          revisions_published: number
          systematic_nodes: number
        }[]
      }
      admin_work_queue_counts: {
        Args: never
        Returns: {
          ai_negative_pending: number
          audit_anomalies_today: number
          inactive_students_7d: number
          new_signups_today: number
          problems_review_pending: number
          relation_gaps_total: number
          subjective_pending: number
        }[]
      }
      ai_embedding_dirty_sample: {
        Args: { p_limit?: number }
        Returns: {
          chunk_id: string
          created_at: string
          heading_path: string
          law_code: string
          source_id: string
          source_type: Database["public"]["Enums"]["chunk_source_type"]
          token_count: number
        }[]
      }
      ai_embedding_status: {
        Args: never
        Returns: {
          dirty_articles: number
          dirty_cases: number
          dirty_chunks: number
          dirty_problems: number
          embedded_chunks: number
          embedded_last_24h: number
          latest_embedded_at: string
          oldest_dirty_at: string
          total_articles: number
          total_cases: number
          total_chunks: number
          total_problems: number
        }[]
      }
      ai_qna_daily_metrics: {
        Args: { p_days?: number }
        Returns: {
          day: string
          input_tokens: number
          negative_feedback: number
          output_tokens: number
          positive_feedback: number
          refusal_insufficient: number
          refusal_responses: number
          refusal_science: number
          responses: number
        }[]
      }
      ai_qna_monthly_usage: {
        Args: { p_months?: number }
        Returns: {
          input_tokens: number
          message_count: number
          month: string
          output_tokens: number
          user_id: string
        }[]
      }
      ai_qna_total_metrics: {
        Args: never
        Returns: {
          negative_feedback: number
          positive_feedback: number
          total_input_tokens: number
          total_output_tokens: number
          total_responses: number
          total_users: number
        }[]
      }
      ai_usage_daily_increment: {
        Args: {
          p_cost: number
          p_date: string
          p_input: number
          p_output: number
        }
        Returns: undefined
      }
      apply_law_revision: {
        Args: {
          p_effective_date: string
          p_law_revision_id: string
          p_promulgated_at: string
        }
        Returns: undefined
      }
      backfill_article_article_links_from_body: {
        Args: never
        Returns: {
          inserted_count: number
          total_existing_count: number
        }[]
      }
      backfill_article_case_links_from_body: {
        Args: never
        Returns: {
          inserted_count: number
          total_existing_count: number
        }[]
      }
      community_increment_view: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      community_popular_posts: {
        Args: { p_board?: string; p_days?: number; p_limit?: number }
        Returns: {
          author_id: string
          author_name: string
          board: string
          comment_count: number
          created_at: string
          like_count: number
          popularity: number
          post_id: string
          title: string
          view_count: number
        }[]
      }
      delete_test_user: { Args: { p_email: string }; Returns: boolean }
      email_already_registered: { Args: { p_email: string }; Returns: boolean }
      get_problem_stats: {
        Args: { p_ids: string[] }
        Returns: {
          attempts: number
          correct_attempts: number
          distinct_users: number
          problem_id: string
        }[]
      }
      gs_ai_usage_daily_summary: {
        Args: { p_date?: string }
        Returns: {
          calls: number
          cost_usd: number
          date: string
          failed: number
          input_tokens: number
          kind: string
          output_tokens: number
          pages: number
          skipped_cap: number
          skipped_no_key: number
          success: number
        }[]
      }
      gs_ai_usage_recent_days: {
        Args: { p_days?: number }
        Returns: {
          ai_calls: number
          ai_cost_usd: number
          ai_skipped_cap: number
          date: string
          ocr_calls: number
          ocr_cost_usd: number
          ocr_pages: number
          ocr_skipped_cap: number
        }[]
      }
      gs_ai_usage_round_summary: {
        Args: { p_round_id: string }
        Returns: {
          calls: number
          cost_usd: number
          input_tokens: number
          kind: string
          output_tokens: number
          pages: number
          skipped_cap: number
          success: number
        }[]
      }
      gs_ai_usage_today_totals: {
        Args: never
        Returns: {
          ai_calls: number
          ai_cost_usd: number
          ocr_calls: number
          ocr_cost_usd: number
          ocr_pages: number
        }[]
      }
      gs_ai_usage_top_rounds: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          ai_calls: number
          ai_cost_usd: number
          ocr_calls: number
          ocr_cost_usd: number
          round_id: string
          round_title: string
          total_cost_usd: number
        }[]
      }
      gs_my_points_balance: {
        Args: never
        Returns: {
          balance: number
          tx_count: number
        }[]
      }
      gs_my_series_list: {
        Args: never
        Returns: {
          expected_rounds: number
          rounds_taken: number
          series_id: string
          subject: string
          title: string
        }[]
      }
      gs_points_top_balances: {
        Args: { p_limit?: number }
        Returns: {
          balance: number
          tx_count: number
          user_id: string
          user_name: string
        }[]
      }
      gs_round_question_stats: {
        Args: { p_round_id: string }
        Returns: {
          avg_score: number
          max_actual: number
          max_score: number
          median_score: number
          min_score: number
          n: number
          order_index: number
          q1: number
          q3: number
          question_id: string
          stdev: number
          title: string
        }[]
      }
      gs_round_student_stats: {
        Args: { p_round_id: string }
        Returns: {
          graded_count: number
          percentile: number
          rank: number
          total_score: number
          user_id: string
          user_name: string
          z_score: number
        }[]
      }
      gs_series_matrix: {
        Args: { p_series_id: string }
        Returns: {
          round_id: string
          round_number: number
          total_score: number
          user_id: string
          user_name: string
          z_score: number
        }[]
      }
      gs_series_my_progress: {
        Args: { p_series_id: string }
        Returns: {
          cohort_avg: number
          cohort_n: number
          cohort_stdev: number
          my_percentile: number
          my_rank: number
          my_total: number
          my_z: number
          round_id: string
          round_number: number
          round_title: string
          start_at: string
        }[]
      }
      gs_series_my_summary: {
        Args: { p_series_id: string }
        Returns: {
          avg_total: number
          avg_z: number
          rounds_taken: number
          series_rank: number
          total_students: number
        }[]
      }
      gs_series_round_summary: {
        Args: { p_series_id: string }
        Returns: {
          avg_total: number
          max_total: number
          min_total: number
          n: number
          round_id: string
          round_number: number
          start_at: string
          stdev: number
          title: string
        }[]
      }
      gs_series_student_stats: {
        Args: { p_series_id: string }
        Returns: {
          avg_total: number
          avg_z_score: number
          rounds_taken: number
          series_rank: number
          user_id: string
          user_name: string
        }[]
      }
      gs_shift_pages_down: {
        Args: { p_from_page: number; p_submission_id: string }
        Returns: undefined
      }
      gs_swap_pages: {
        Args: { p_page_a: number; p_page_b: number; p_submission_id: string }
        Returns: undefined
      }
      is_announcement_author: {
        Args: { p_announcement_id: string; p_user_id: string }
        Returns: boolean
      }
      match_content_chunks: {
        Args: {
          doc_type_filter?: Database["public"]["Enums"]["chunk_source_type"][]
          law_filter?: string[]
          match_k?: number
          query_embedding: string
        }
        Returns: {
          authority_tier: number
          body_text: string
          chunk_id: string
          chunk_index: number
          heading_path: string
          law_code: string
          similarity: number
          source_id: string
          source_type: Database["public"]["Enums"]["chunk_source_type"]
          token_count: number
        }[]
      }
      mcq_exam_attempt_stats: {
        Args: { p_exam_id: string }
        Returns: {
          attempt_id: string
          average: number
          percentile: number
          rank: number
          total_takers: number
          z_score: number
        }[]
      }
      mcq_pack_attempt_stats: {
        Args: { p_pack_id: string }
        Returns: {
          correct: number
          percentile: number
          rank: number
          score: number
          total: number
          total_takers: number
          z_score: number
        }[]
      }
      promote_effective_revisions: { Args: never; Returns: string[] }
      scan_exam_case_links: { Args: never; Returns: number }
      search_articles_ranked: {
        Args: { lim?: number; q: string }
        Returns: {
          article_id: string
          score: number
        }[]
      }
      search_cases_ranked: {
        Args: { lim?: number; q: string }
        Returns: {
          case_id: string
          score: number
        }[]
      }
      search_problems_ranked: {
        Args: { lim?: number; q: string }
        Returns: {
          problem_id: string
          score: number
        }[]
      }
      srs_record_review: {
        Args: {
          p_elapsed_ms?: number
          p_grade: number
          p_item_id: string
          p_new_due: string
          p_new_ef: number
          p_new_interval: number
          p_new_lapses: number
          p_new_reps: number
          p_new_state: Database["public"]["Enums"]["srs_state"]
          p_prev_ef: number
          p_prev_interval: number
          p_prev_state: Database["public"]["Enums"]["srs_state"]
          p_source_type?: string
        }
        Returns: undefined
      }
      user_is_in_cohort: {
        Args: { p_cohort_id: string; p_user_id: string }
        Returns: boolean
      }
      user_owns_cohort: {
        Args: { p_cohort_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      aa_relation_type:
        | "cross_reference"
        | "parent_child"
        | "precondition"
        | "exception"
      ac_relation_type:
        | "directly_interprets"
        | "cites"
        | "similar_to"
        | "contrary_to"
      ai_eval_status: "active" | "archived"
      ai_eval_verdict: "pass" | "partial" | "fail"
      ai_message_role: "user" | "assistant"
      ai_refusal_kind: "unsupported_science" | "insufficient_grounds"
      ai_review_status: "pending" | "reviewed" | "escalated" | "dismissed"
      annotation_target_type:
        | "article"
        | "case"
        | "problem"
        | "problem_choice"
        | "problem_box_item"
      announcement_audience_kind: "all" | "cohort" | "user"
      announcement_audience_target: "cohort" | "user"
      article_level: "part" | "chapter" | "section" | "article"
      assignment_item_kind:
        | "article_read"
        | "case_read"
        | "problem"
        | "blank_set"
        | "recitation"
      assignment_status: "pending" | "partial" | "completed"
      auto_blank_type: "subject" | "period"
      case_court: "supreme" | "patent_court" | "high_court" | "district_court"
      chunk_source_type:
        | "article"
        | "case"
        | "problem"
        | "textbook"
        | "practice"
      community_board: "free" | "study" | "review"
      community_post_attachment_kind: "image" | "pdf" | "file"
      community_report_status: "pending" | "resolved" | "dismissed"
      community_report_target: "post" | "comment"
      content_comment_target_type: "article" | "case" | "problem"
      curriculum_item_kind:
        | "article"
        | "case"
        | "problem"
        | "blank_set"
        | "recitation"
        | "lecture"
      exam_result_status: "absent" | "pending" | "failed" | "passed"
      exam_round: "first" | "second"
      exam_verification_status:
        | "self_reported"
        | "document_submitted"
        | "verified"
        | "rejected"
      gs_issue_importance: "core" | "side"
      gs_round_status: "draft" | "published" | "closed"
      law_change_kind: "created" | "amended" | "deleted"
      law_revision_kind: "act" | "decree" | "rule"
      ox_truth: "O" | "X"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      pc_relation_type: "cited" | "illustrates" | "contrasts" | "similar"
      problem_choice_type: "statute" | "precedent" | "theory"
      problem_exam_round: "first" | "second"
      problem_format:
        | "mc_short"
        | "mc_box"
        | "mc_case"
        | "ox"
        | "blank"
        | "subjective"
      problem_origin:
        | "past_exam"
        | "past_exam_variant"
        | "expected"
        | "mock"
        | "ai_draft"
      problem_polarity: "positive" | "negative"
      problem_review_status: "draft" | "approved" | "rejected"
      problem_scope: "unit" | "comprehensive"
      problem_source_doc_kind: "problem" | "answer"
      problem_subject_type: "law" | "science"
      qna_quality_grade: "high" | "mid" | "low"
      qna_status: "open" | "answered" | "closed"
      qna_target_type: "article" | "case" | "problem"
      resource_kind:
        | "lecture_note"
        | "lecture_video"
        | "reference"
        | "answer_video"
      resource_target_type: "article" | "case" | "problem" | "science_section"
      science_subject: "physics" | "chemistry" | "biology" | "earth_science"
      srs_item_type: "qa" | "cloze" | "ox" | "mcq"
      srs_state: "new" | "learning" | "review" | "relearning"
      staff_notification_kind:
        | "subjective_review_request"
        | "qna_new_question"
        | "subjective_review_completed"
        | "qna_new_answer"
        | "announcement"
        | "cohort_inactive_alert"
        | "student_note_shared"
        | "exam_certificate_submitted"
        | "exam_result_reminder"
        | "community_post_comment"
        | "community_post_like"
        | "community_post_mention"
        | "gs_cap_reached"
      student_note_visibility: "staff_only" | "share_with_student"
      subjective_kind: "case_based" | "theory" | "mixed"
      subscription_status: "pending" | "active" | "expired" | "cancelled"
      user_role: "student" | "instructor" | "manager" | "admin"
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
      aa_relation_type: [
        "cross_reference",
        "parent_child",
        "precondition",
        "exception",
      ],
      ac_relation_type: [
        "directly_interprets",
        "cites",
        "similar_to",
        "contrary_to",
      ],
      ai_eval_status: ["active", "archived"],
      ai_eval_verdict: ["pass", "partial", "fail"],
      ai_message_role: ["user", "assistant"],
      ai_refusal_kind: ["unsupported_science", "insufficient_grounds"],
      ai_review_status: ["pending", "reviewed", "escalated", "dismissed"],
      annotation_target_type: [
        "article",
        "case",
        "problem",
        "problem_choice",
        "problem_box_item",
      ],
      announcement_audience_kind: ["all", "cohort", "user"],
      announcement_audience_target: ["cohort", "user"],
      article_level: ["part", "chapter", "section", "article"],
      assignment_item_kind: [
        "article_read",
        "case_read",
        "problem",
        "blank_set",
        "recitation",
      ],
      assignment_status: ["pending", "partial", "completed"],
      auto_blank_type: ["subject", "period"],
      case_court: ["supreme", "patent_court", "high_court", "district_court"],
      chunk_source_type: ["article", "case", "problem", "textbook", "practice"],
      community_board: ["free", "study", "review"],
      community_post_attachment_kind: ["image", "pdf", "file"],
      community_report_status: ["pending", "resolved", "dismissed"],
      community_report_target: ["post", "comment"],
      content_comment_target_type: ["article", "case", "problem"],
      curriculum_item_kind: [
        "article",
        "case",
        "problem",
        "blank_set",
        "recitation",
        "lecture",
      ],
      exam_result_status: ["absent", "pending", "failed", "passed"],
      exam_round: ["first", "second"],
      exam_verification_status: [
        "self_reported",
        "document_submitted",
        "verified",
        "rejected",
      ],
      gs_issue_importance: ["core", "side"],
      gs_round_status: ["draft", "published", "closed"],
      law_change_kind: ["created", "amended", "deleted"],
      law_revision_kind: ["act", "decree", "rule"],
      ox_truth: ["O", "X"],
      payment_status: ["pending", "completed", "failed", "refunded"],
      pc_relation_type: ["cited", "illustrates", "contrasts", "similar"],
      problem_choice_type: ["statute", "precedent", "theory"],
      problem_exam_round: ["first", "second"],
      problem_format: [
        "mc_short",
        "mc_box",
        "mc_case",
        "ox",
        "blank",
        "subjective",
      ],
      problem_origin: [
        "past_exam",
        "past_exam_variant",
        "expected",
        "mock",
        "ai_draft",
      ],
      problem_polarity: ["positive", "negative"],
      problem_review_status: ["draft", "approved", "rejected"],
      problem_scope: ["unit", "comprehensive"],
      problem_source_doc_kind: ["problem", "answer"],
      problem_subject_type: ["law", "science"],
      qna_quality_grade: ["high", "mid", "low"],
      qna_status: ["open", "answered", "closed"],
      qna_target_type: ["article", "case", "problem"],
      resource_kind: [
        "lecture_note",
        "lecture_video",
        "reference",
        "answer_video",
      ],
      resource_target_type: ["article", "case", "problem", "science_section"],
      science_subject: ["physics", "chemistry", "biology", "earth_science"],
      srs_item_type: ["qa", "cloze", "ox", "mcq"],
      srs_state: ["new", "learning", "review", "relearning"],
      staff_notification_kind: [
        "subjective_review_request",
        "qna_new_question",
        "subjective_review_completed",
        "qna_new_answer",
        "announcement",
        "cohort_inactive_alert",
        "student_note_shared",
        "exam_certificate_submitted",
        "exam_result_reminder",
        "community_post_comment",
        "community_post_like",
        "community_post_mention",
        "gs_cap_reached",
      ],
      student_note_visibility: ["staff_only", "share_with_student"],
      subjective_kind: ["case_based", "theory", "mixed"],
      subscription_status: ["pending", "active", "expired", "cancelled"],
      user_role: ["student", "instructor", "manager", "admin"],
    },
  },
} as const
