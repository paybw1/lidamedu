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
          body_html: string | null
          body_md: string
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          platform_scope: Database["public"]["Enums"]["announcement_platform_scope"]
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          announcement_id?: string
          audience_kind?: Database["public"]["Enums"]["announcement_audience_kind"]
          author_id: string
          body_html?: string | null
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          platform_scope?: Database["public"]["Enums"]["announcement_platform_scope"]
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string
          audience_kind?: Database["public"]["Enums"]["announcement_audience_kind"]
          author_id?: string
          body_html?: string | null
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          platform_scope?: Database["public"]["Enums"]["announcement_platform_scope"]
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
      article_blank_candidates: {
        Row: {
          after_context: string | null
          answer: string
          approved_blank_idx: number | null
          approved_set_id: string | null
          article_id: string
          before_context: string | null
          candidate_id: string
          created_at: string
          false_statement: string | null
          law_code: string
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_display_no: number | null
          source_problem_id: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string
        }
        Insert: {
          after_context?: string | null
          answer: string
          approved_blank_idx?: number | null
          approved_set_id?: string | null
          article_id: string
          before_context?: string | null
          candidate_id?: string
          created_at?: string
          false_statement?: string | null
          law_code: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_display_no?: number | null
          source_problem_id?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
        }
        Update: {
          after_context?: string | null
          answer?: string
          approved_blank_idx?: number | null
          approved_set_id?: string | null
          article_id?: string
          before_context?: string | null
          candidate_id?: string
          created_at?: string
          false_statement?: string | null
          law_code?: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_display_no?: number | null
          source_problem_id?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_blank_candidates_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_blank_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "article_blank_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
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
          law_revision_id: string | null
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
          law_revision_id?: string | null
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
          law_revision_id?: string | null
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
          deadline_policy: Database["public"]["Enums"]["deadline_policy"]
          deleted_at: string | null
          description_md: string | null
          due_at: string
          source_curriculum_id: string | null
          source_week_id: string | null
          target_profile_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assignment_id?: string
          cohort_id: string
          created_at?: string
          created_by: string
          deadline_policy?: Database["public"]["Enums"]["deadline_policy"]
          deleted_at?: string | null
          description_md?: string | null
          due_at: string
          source_curriculum_id?: string | null
          source_week_id?: string | null
          target_profile_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          cohort_id?: string
          created_at?: string
          created_by?: string
          deadline_policy?: Database["public"]["Enums"]["deadline_policy"]
          deleted_at?: string | null
          description_md?: string | null
          due_at?: string
          source_curriculum_id?: string | null
          source_week_id?: string | null
          target_profile_id?: string | null
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
          {
            foreignKeyName: "assignments_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignments_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
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
      bank_transfers: {
        Row: {
          confirmed_by: string | null
          created_at: string
          deposited_at: string | null
          depositor_name: string
          expected_amount_krw: number
          expires_at: string
          memo: string | null
          order_id: string
          transfer_id: string
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          deposited_at?: string | null
          depositor_name: string
          expected_amount_krw: number
          expires_at: string
          memo?: string | null
          order_id: string
          transfer_id?: string
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          deposited_at?: string | null
          depositor_name?: string
          expected_amount_krw?: number
          expires_at?: string
          memo?: string | null
          order_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfers_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bank_transfers_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bank_transfers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["order_id"]
          },
        ]
      }
      billing_keys: {
        Row: {
          billing_key: string
          billing_key_id: string
          card_company: string | null
          card_number_masked: string | null
          created_at: string
          customer_key: string
          deleted_at: string | null
          user_id: string
        }
        Insert: {
          billing_key: string
          billing_key_id?: string
          card_company?: string | null
          card_number_masked?: string | null
          created_at?: string
          customer_key: string
          deleted_at?: string | null
          user_id: string
        }
        Update: {
          billing_key?: string
          billing_key_id?: string
          card_company?: string | null
          card_number_masked?: string | null
          created_at?: string
          customer_key?: string
          deleted_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blank_tier_completions: {
        Row: {
          completed_at: string
          completion_id: string
          set_id: string
          tier: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          completion_id?: string
          set_id: string
          tier: number
          user_id: string
        }
        Update: {
          completed_at?: string
          completion_id?: string
          set_id?: string
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blank_tier_completions_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "article_blank_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      book_bundle_items: {
        Row: {
          book_id: string
          bundle_id: string
        }
        Insert: {
          book_id: string
          bundle_id: string
        }
        Update: {
          book_id?: string
          bundle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_bundle_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_bundle_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_bundle_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "book_bundles"
            referencedColumns: ["bundle_id"]
          },
        ]
      }
      book_bundles: {
        Row: {
          bundle_id: string
          cover_path: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          display_order: number
          price_krw: number
          sale_status: string
          title: string
          updated_at: string
        }
        Insert: {
          bundle_id?: string
          cover_path?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          price_krw: number
          sale_status?: string
          title: string
          updated_at?: string
        }
        Update: {
          bundle_id?: string
          cover_path?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          price_krw?: number
          sale_status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      book_categories: {
        Row: {
          category_id: string
          created_at: string
          name: string
          sort_order: number
        }
        Insert: {
          category_id?: string
          created_at?: string
          name: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      book_downloads: {
        Row: {
          book_id: string
          created_at: string
          download_id: string
          order_item_id: string | null
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          download_id?: string
          order_item_id?: string | null
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          download_id?: string
          order_item_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_downloads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_downloads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_downloads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_downloads_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
          },
        ]
      }
      book_preview_pages: {
        Row: {
          book_id: string
          created_at: string
          image_url: string
          preview_id: string
          sort_order: number
        }
        Insert: {
          book_id: string
          created_at?: string
          image_url: string
          preview_id?: string
          sort_order?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          image_url?: string
          preview_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_preview_pages_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_preview_pages_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_preview_pages_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
        ]
      }
      book_restock_alerts: {
        Row: {
          alert_id: string
          book_id: string
          created_at: string
          notified_at: string | null
          user_id: string
        }
        Insert: {
          alert_id?: string
          book_id: string
          created_at?: string
          notified_at?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string
          book_id?: string
          created_at?: string
          notified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_restock_alerts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_restock_alerts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_restock_alerts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
        ]
      }
      book_settlement_items: {
        Row: {
          base_amount_krw: number
          created_at: string
          item_id: string
          kind: string
          note: string | null
          order_item_id: string
          rule_id: string | null
          settlement_id: string
          share_amount_krw: number
          share_kind: string
          share_value: number
        }
        Insert: {
          base_amount_krw: number
          created_at?: string
          item_id?: string
          kind: string
          note?: string | null
          order_item_id: string
          rule_id?: string | null
          settlement_id: string
          share_amount_krw: number
          share_kind: string
          share_value: number
        }
        Update: {
          base_amount_krw?: number
          created_at?: string
          item_id?: string
          kind?: string
          note?: string | null
          order_item_id?: string
          rule_id?: string | null
          settlement_id?: string
          share_amount_krw?: number
          share_kind?: string
          share_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_settlement_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "book_settlement_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "book_settlement_rules"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "book_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "book_settlements"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      book_settlement_rules: {
        Row: {
          book_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          is_active: boolean
          memo: string | null
          payee_name: string
          rule_id: string
          share_kind: string
          share_value: number
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          is_active?: boolean
          memo?: string | null
          payee_name: string
          rule_id?: string
          share_kind: string
          share_value: number
        }
        Update: {
          book_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          is_active?: boolean
          memo?: string | null
          payee_name?: string
          rule_id?: string
          share_kind?: string
          share_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_settlement_rules_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_settlement_rules_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_settlement_rules_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_settlement_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_settlement_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      book_settlements: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          paid_at: string | null
          payee_name: string
          period_end: string
          period_start: string
          settlement_id: string
          status: string
          total_share_krw: number
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          paid_at?: string | null
          payee_name: string
          period_end: string
          period_start: string
          settlement_id?: string
          status?: string
          total_share_krw?: number
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          paid_at?: string | null
          payee_name?: string
          period_end?: string
          period_start?: string
          settlement_id?: string
          status?: string
          total_share_krw?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      book_stock_moves: {
        Row: {
          actor_id: string | null
          book_id: string
          created_at: string
          delta: number
          move_id: number
          note: string | null
          order_item_id: string | null
          reason: string
        }
        Insert: {
          actor_id?: string | null
          book_id: string
          created_at?: string
          delta: number
          move_id?: never
          note?: string | null
          order_item_id?: string | null
          reason: string
        }
        Update: {
          actor_id?: string | null
          book_id?: string
          created_at?: string
          delta?: number
          move_id?: never
          note?: string | null
          order_item_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_stock_moves_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_stock_moves_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "book_stock_moves_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_stock_moves_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_stock_moves_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_stock_moves_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
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
      book_wishlists: {
        Row: {
          book_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_wishlists_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_wishlists_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_wishlists_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          author_bio: string | null
          book_id: string
          book_type: string
          category_id: string | null
          course_only: boolean
          cover_file_path: string | null
          cover_path: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          download_limit: number
          event_phrase: string | null
          extra1: string | null
          extra2: string | null
          group_discount_ok: boolean
          is_recommended: boolean
          isbn: string | null
          label_color: string | null
          label_text: string | null
          list_price_krw: number | null
          listed: boolean
          pdf_path: string | null
          per_person_limit: number | null
          preview_url: string | null
          price_krw: number
          published_on: string | null
          publisher: string | null
          sale_status: string
          shipping_fee_krw: number
          shipping_fee_type: string
          short_info: string | null
          short_intro: string | null
          sort_order: number
          tax_free: boolean
          title: string
          toc: string | null
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          author?: string | null
          author_bio?: string | null
          book_id?: string
          book_type?: string
          category_id?: string | null
          course_only?: boolean
          cover_file_path?: string | null
          cover_path?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          download_limit?: number
          event_phrase?: string | null
          extra1?: string | null
          extra2?: string | null
          group_discount_ok?: boolean
          is_recommended?: boolean
          isbn?: string | null
          label_color?: string | null
          label_text?: string | null
          list_price_krw?: number | null
          listed?: boolean
          pdf_path?: string | null
          per_person_limit?: number | null
          preview_url?: string | null
          price_krw: number
          published_on?: string | null
          publisher?: string | null
          sale_status?: string
          shipping_fee_krw?: number
          shipping_fee_type?: string
          short_info?: string | null
          short_intro?: string | null
          sort_order?: number
          tax_free?: boolean
          title: string
          toc?: string | null
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          author?: string | null
          author_bio?: string | null
          book_id?: string
          book_type?: string
          category_id?: string | null
          course_only?: boolean
          cover_file_path?: string | null
          cover_path?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          download_limit?: number
          event_phrase?: string | null
          extra1?: string | null
          extra2?: string | null
          group_discount_ok?: boolean
          is_recommended?: boolean
          isbn?: string | null
          label_color?: string | null
          label_text?: string | null
          list_price_krw?: number | null
          listed?: boolean
          pdf_path?: string | null
          per_person_limit?: number | null
          preview_url?: string | null
          price_krw?: number
          published_on?: string | null
          publisher?: string | null
          sale_status?: string
          shipping_fee_krw?: number
          shipping_fee_type?: string
          short_info?: string | null
          short_intro?: string | null
          sort_order?: number
          tax_free?: boolean
          title?: string
          toc?: string | null
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "book_categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body_md: string
          broadcast_id: string
          channels: string[]
          created_at: string
          email_sent: number
          recipient_count: number
          segment_key: string
          segment_label: string
          sender_id: string | null
          title: string
        }
        Insert: {
          body_md?: string
          broadcast_id?: string
          channels?: string[]
          created_at?: string
          email_sent?: number
          recipient_count?: number
          segment_key: string
          segment_label: string
          sender_id?: string | null
          title: string
        }
        Update: {
          body_md?: string
          broadcast_id?: string
          channels?: string[]
          created_at?: string
          email_sent?: number
          recipient_count?: number
          segment_key?: string
          segment_label?: string
          sender_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "broadcasts_sender_id_fkey"
            columns: ["sender_id"]
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
          resolution_note: string | null
          resolved_at: string | null
          status: string
          url: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          message: string
          report_id?: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          url: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          message?: string
          report_id?: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          url?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      case_blank_candidates: {
        Row: {
          after_context: string | null
          answer: string
          before_context: string | null
          candidate_id: string
          case_id: string
          created_at: string
          cum_offset: number | null
          false_statement: string | null
          item_index: number | null
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_display_no: number | null
          source_problem_id: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string
          target: string
        }
        Insert: {
          after_context?: string | null
          answer: string
          before_context?: string | null
          candidate_id?: string
          case_id: string
          created_at?: string
          cum_offset?: number | null
          false_statement?: string | null
          item_index?: number | null
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_display_no?: number | null
          source_problem_id?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
          target: string
        }
        Update: {
          after_context?: string | null
          answer?: string
          before_context?: string | null
          candidate_id?: string
          case_id?: string
          created_at?: string
          cum_offset?: number | null
          false_statement?: string | null
          item_index?: number | null
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_display_no?: number | null
          source_problem_id?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_blank_candidates_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_blank_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "case_blank_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      case_blank_sets: {
        Row: {
          blanks: Json
          case_id: string
          created_at: string
          display_name: string | null
          importance: number
          owner_id: string | null
          set_id: string
          updated_at: string
          version: string
        }
        Insert: {
          blanks?: Json
          case_id: string
          created_at?: string
          display_name?: string | null
          importance?: number
          owner_id?: string | null
          set_id?: string
          updated_at?: string
          version?: string
        }
        Update: {
          blanks?: Json
          case_id?: string
          created_at?: string
          display_name?: string | null
          importance?: number
          owner_id?: string | null
          set_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_blank_sets_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_blank_sets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "case_blank_sets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      case_conclusion_attempts: {
        Row: {
          ai_analysis: Json | null
          ai_analyzed_at: string | null
          attempt_id: string
          conclusions: Json | null
          created_at: string
          deleted_at: string | null
          done_at: string | null
          emphasis_map: Json | null
          item_id: string
          outline_md: string
          self_check: Json | null
          self_checked_at: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_analyzed_at?: string | null
          attempt_id?: string
          conclusions?: Json | null
          created_at?: string
          deleted_at?: string | null
          done_at?: string | null
          emphasis_map?: Json | null
          item_id: string
          outline_md?: string
          self_check?: Json | null
          self_checked_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_analyzed_at?: string | null
          attempt_id?: string
          conclusions?: Json | null
          created_at?: string
          deleted_at?: string | null
          done_at?: string | null
          emphasis_map?: Json | null
          item_id?: string
          outline_md?: string
          self_check?: Json | null
          self_checked_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_conclusion_attempts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "case_training_items"
            referencedColumns: ["item_id"]
          },
        ]
      }
      case_diagrams: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          blocks: Json
          case_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          diagram_id: string
          facts_md: string
          facts_source_kind: string
          facts_source_meta: Json
          facts_source_ref: string | null
          generated_by: string
          rejected_reason: string | null
          review_status: Database["public"]["Enums"]["problem_review_status"]
          timeline: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          blocks?: Json
          case_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diagram_id?: string
          facts_md?: string
          facts_source_kind?: string
          facts_source_meta?: Json
          facts_source_ref?: string | null
          generated_by?: string
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          timeline?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          blocks?: Json
          case_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diagram_id?: string
          facts_md?: string
          facts_source_kind?: string
          facts_source_meta?: Json
          facts_source_ref?: string | null
          generated_by?: string
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          timeline?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_diagrams_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "case_diagrams_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "case_diagrams_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_diagrams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "case_diagrams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      case_issue_attempts: {
        Row: {
          ai_analysis: Json | null
          ai_analyzed_at: string | null
          attempt_id: string
          created_at: string
          deleted_at: string | null
          done_at: string | null
          item_id: string
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
          done_at?: string | null
          item_id: string
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
          done_at?: string | null
          item_id?: string
          self_check?: Json | null
          self_checked_at?: string | null
          student_issues_md?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_issue_attempts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "case_training_items"
            referencedColumns: ["item_id"]
          },
        ]
      }
      case_lower_courts: {
        Row: {
          body_text: string
          case_id: string
          char_count: number
          created_at: string
          deleted_at: string | null
          fetched_at: string | null
          files: Json
          law_serial_id: string | null
          lower_case_number: string | null
          lower_court: string | null
          lower_decided_at: string | null
          lower_id: string
          source_kind: string | null
          source_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          body_text?: string
          case_id: string
          char_count?: number
          created_at?: string
          deleted_at?: string | null
          fetched_at?: string | null
          files?: Json
          law_serial_id?: string | null
          lower_case_number?: string | null
          lower_court?: string | null
          lower_decided_at?: string | null
          lower_id?: string
          source_kind?: string | null
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          case_id?: string
          char_count?: number
          created_at?: string
          deleted_at?: string | null
          fetched_at?: string | null
          files?: Json
          law_serial_id?: string | null
          lower_case_number?: string | null
          lower_court?: string | null
          lower_decided_at?: string | null
          lower_id?: string
          source_kind?: string | null
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
        ]
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
      case_training_issues: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description_md: string | null
          generated_at: string
          generated_by: string
          importance: Database["public"]["Enums"]["gs_issue_importance"]
          issue_id: string
          item_id: string
          label: string
          model_conclusion_direction: string | null
          model_conclusion_md: string | null
          order_index: number
          ref_article_id: string | null
          ref_case_id: string | null
          ref_hint: string | null
          rejected_reason: string | null
          review_status: Database["public"]["Enums"]["problem_review_status"]
          updated_at: string
          weight: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_md?: string | null
          generated_at?: string
          generated_by?: string
          importance?: Database["public"]["Enums"]["gs_issue_importance"]
          issue_id?: string
          item_id: string
          label: string
          model_conclusion_direction?: string | null
          model_conclusion_md?: string | null
          order_index?: number
          ref_article_id?: string | null
          ref_case_id?: string | null
          ref_hint?: string | null
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          updated_at?: string
          weight?: number | null
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
          importance?: Database["public"]["Enums"]["gs_issue_importance"]
          issue_id?: string
          item_id?: string
          label?: string
          model_conclusion_direction?: string | null
          model_conclusion_md?: string | null
          order_index?: number
          ref_article_id?: string | null
          ref_case_id?: string | null
          ref_hint?: string | null
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "case_training_issues_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "case_training_items"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "case_training_issues_ref_article_id_fkey"
            columns: ["ref_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "case_training_issues_ref_case_id_fkey"
            columns: ["ref_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
        ]
      }
      case_training_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          facts_generated_by: string
          facts_summary_md: string
          item_id: string
          linked_gs_round_id: string | null
          problem_id: string | null
          rejected_reason: string | null
          review_status: Database["public"]["Enums"]["problem_review_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          facts_generated_by?: string
          facts_summary_md?: string
          item_id?: string
          linked_gs_round_id?: string | null
          problem_id?: string | null
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          facts_generated_by?: string
          facts_summary_md?: string
          item_id?: string
          linked_gs_round_id?: string | null
          problem_id?: string | null
          rejected_reason?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_training_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_training_items_linked_gs_round_id_fkey"
            columns: ["linked_gs_round_id"]
            isOneToOne: false
            referencedRelation: "gs_rounds"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "case_training_items_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
        ]
      }
      cases: {
        Row: {
          book_sections: Json | null
          case_id: string
          case_number: string
          case_title: string
          case_type: string | null
          comment_body_md: string | null
          comment_label: string
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
          list_visible: boolean
          list_visible_pinned: boolean
          nickname: string | null
          official_text_check_count: number
          official_text_checked_at: string | null
          official_text_md: string | null
          official_text_pdf_path: string | null
          official_text_unavailable: boolean
          pending_primary_node_id: string | null
          primary_article_id: string | null
          primary_node_id: string | null
          reasoning_md: string | null
          related_cases: Json
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
          book_sections?: Json | null
          case_id?: string
          case_number: string
          case_title: string
          case_type?: string | null
          comment_body_md?: string | null
          comment_label?: string
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
          list_visible?: boolean
          list_visible_pinned?: boolean
          nickname?: string | null
          official_text_check_count?: number
          official_text_checked_at?: string | null
          official_text_md?: string | null
          official_text_pdf_path?: string | null
          official_text_unavailable?: boolean
          pending_primary_node_id?: string | null
          primary_article_id?: string | null
          primary_node_id?: string | null
          reasoning_md?: string | null
          related_cases?: Json
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
          book_sections?: Json | null
          case_id?: string
          case_number?: string
          case_title?: string
          case_type?: string | null
          comment_body_md?: string | null
          comment_label?: string
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
          list_visible?: boolean
          list_visible_pinned?: boolean
          nickname?: string | null
          official_text_check_count?: number
          official_text_checked_at?: string | null
          official_text_md?: string | null
          official_text_pdf_path?: string | null
          official_text_unavailable?: boolean
          pending_primary_node_id?: string | null
          primary_article_id?: string | null
          primary_node_id?: string | null
          reasoning_md?: string | null
          related_cases?: Json
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
            foreignKeyName: "cases_pending_primary_node_id_fkey"
            columns: ["pending_primary_node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
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
      cohort_attendance: {
        Row: {
          attendance_id: string
          class_session_id: string
          note: string | null
          profile_id: string
          recorded_at: string
          recorded_by: string | null
          status: string
        }
        Insert: {
          attendance_id?: string
          class_session_id: string
          note?: string | null
          profile_id: string
          recorded_at?: string
          recorded_by?: string | null
          status: string
        }
        Update: {
          attendance_id?: string
          class_session_id?: string
          note?: string | null
          profile_id?: string
          recorded_at?: string
          recorded_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_attendance_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "cohort_class_sessions"
            referencedColumns: ["class_session_id"]
          },
          {
            foreignKeyName: "cohort_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cohort_board_cohorts: {
        Row: {
          added_at: string
          added_by: string | null
          board_id: string
          cohort_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          board_id: string
          cohort_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          board_id?: string
          cohort_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_board_cohorts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_cohorts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_cohorts_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "cohort_boards"
            referencedColumns: ["board_id"]
          },
          {
            foreignKeyName: "cohort_board_cohorts_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
        ]
      }
      cohort_board_comments: {
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
            foreignKeyName: "cohort_board_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "cohort_board_posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      cohort_board_post_attachments: {
        Row: {
          attachment_id: string
          created_at: string
          kind: Database["public"]["Enums"]["cohort_board_attachment_kind"]
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
          kind: Database["public"]["Enums"]["cohort_board_attachment_kind"]
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
          kind?: Database["public"]["Enums"]["cohort_board_attachment_kind"]
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
            foreignKeyName: "cohort_board_post_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "cohort_board_posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "cohort_board_post_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_post_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cohort_board_posts: {
        Row: {
          author_id: string | null
          board_id: string
          body_md: string
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          post_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          board_id: string
          body_md: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          post_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          board_id?: string
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          is_pinned?: boolean
          post_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_board_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_board_posts_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "cohort_boards"
            referencedColumns: ["board_id"]
          },
        ]
      }
      cohort_boards: {
        Row: {
          board_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          title: string
          updated_at: string
          write_scope: Database["public"]["Enums"]["cohort_board_write_scope"]
        }
        Insert: {
          board_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          title: string
          updated_at?: string
          write_scope?: Database["public"]["Enums"]["cohort_board_write_scope"]
        }
        Update: {
          board_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          title?: string
          updated_at?: string
          write_scope?: Database["public"]["Enums"]["cohort_board_write_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "cohort_boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cohort_class_sessions: {
        Row: {
          class_session_id: string
          cohort_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          held_on: string
          note: string | null
          session_no: number
          title: string | null
        }
        Insert: {
          class_session_id?: string
          cohort_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          held_on: string
          note?: string | null
          session_no: number
          title?: string | null
        }
        Update: {
          class_session_id?: string
          cohort_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          held_on?: string
          note?: string | null
          session_no?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_class_sessions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "cohort_class_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_class_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
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
      cohort_upgrade_requests: {
        Row: {
          admin_note: string | null
          cohort_id: string | null
          created_at: string
          message: string | null
          processed_at: string | null
          processed_by: string | null
          request_id: string
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          cohort_id?: string | null
          created_at?: string
          message?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_id?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          cohort_id?: string | null
          created_at?: string
          message?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_upgrade_requests_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "cohort_upgrade_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_upgrade_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_upgrade_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cohort_upgrade_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cohorts: {
        Row: {
          access_scope: string
          cohort_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_on: string | null
          exam_round: string
          is_archived: boolean
          name: string
          owner_id: string
          starts_on: string | null
          updated_at: string
          weak_assignment_auto: boolean
        }
        Insert: {
          access_scope?: string
          cohort_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          exam_round?: string
          is_archived?: boolean
          name: string
          owner_id: string
          starts_on?: string | null
          updated_at?: string
          weak_assignment_auto?: boolean
        }
        Update: {
          access_scope?: string
          cohort_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          exam_round?: string
          is_archived?: boolean
          name?: string
          owner_id?: string
          starts_on?: string | null
          updated_at?: string
          weak_assignment_auto?: boolean
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
          published: boolean
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
          published?: boolean
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
          published?: boolean
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
      content_group_items: {
        Row: {
          content_id: string
          created_at: string
          group_id: string
          is_preview: boolean
          is_public: boolean
          item_id: string
          lesson_no: number | null
          seq: number
          title: string | null
        }
        Insert: {
          content_id: string
          created_at?: string
          group_id: string
          is_preview?: boolean
          is_public?: boolean
          item_id?: string
          lesson_no?: number | null
          seq?: number
          title?: string | null
        }
        Update: {
          content_id?: string
          created_at?: string
          group_id?: string
          is_preview?: boolean
          is_public?: boolean
          item_id?: string
          lesson_no?: number | null
          seq?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_group_items_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "video_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "content_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      content_groups: {
        Row: {
          book_title: string | null
          course_type: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          exam_track: string | null
          group_id: string
          instructor_id: string | null
          is_active: boolean
          linked_course_id: string | null
          name: string
          staff_memo: string | null
          subject_code: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          book_title?: string | null
          course_type?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exam_track?: string | null
          group_id?: string
          instructor_id?: string | null
          is_active?: boolean
          linked_course_id?: string | null
          name: string
          staff_memo?: string | null
          subject_code?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          book_title?: string | null
          course_type?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exam_track?: string | null
          group_id?: string
          instructor_id?: string | null
          is_active?: boolean
          linked_course_id?: string | null
          name?: string
          staff_memo?: string | null
          subject_code?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_groups_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_groups_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_groups_linked_course_id_fkey"
            columns: ["linked_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          after_snapshot: Json | null
          app_name: string | null
          applied_at: string | null
          applies_from_exam_round: number | null
          apply_status: string
          before_snapshot: Json | null
          changed_fields: string[]
          content_id: string
          content_type: string
          created_at: string
          created_by: string | null
          created_by_label: string | null
          effective_date: string | null
          errata_kind: string | null
          errata_payload: Json | null
          errata_reason: string | null
          errata_severity: string | null
          errata_title: string | null
          legal_basis: Json | null
          merge_status: string
          merged_at: string | null
          merged_into_edition_id: string | null
          node_id: string | null
          notice_status: string
          op: string
          pending_payload: Json | null
          published_at: string | null
          requires_regrade: boolean
          revision_id: string
          scheduled_for: string | null
          source_edition_id: string | null
          source_ref: Json | null
          subject_code: string | null
          subject_ref: Json | null
          withdrawn_at: string | null
          withdraws_revision_id: string | null
        }
        Insert: {
          after_snapshot?: Json | null
          app_name?: string | null
          applied_at?: string | null
          applies_from_exam_round?: number | null
          apply_status?: string
          before_snapshot?: Json | null
          changed_fields?: string[]
          content_id: string
          content_type: string
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          effective_date?: string | null
          errata_kind?: string | null
          errata_payload?: Json | null
          errata_reason?: string | null
          errata_severity?: string | null
          errata_title?: string | null
          legal_basis?: Json | null
          merge_status?: string
          merged_at?: string | null
          merged_into_edition_id?: string | null
          node_id?: string | null
          notice_status?: string
          op: string
          pending_payload?: Json | null
          published_at?: string | null
          requires_regrade?: boolean
          revision_id?: string
          scheduled_for?: string | null
          source_edition_id?: string | null
          source_ref?: Json | null
          subject_code?: string | null
          subject_ref?: Json | null
          withdrawn_at?: string | null
          withdraws_revision_id?: string | null
        }
        Update: {
          after_snapshot?: Json | null
          app_name?: string | null
          applied_at?: string | null
          applies_from_exam_round?: number | null
          apply_status?: string
          before_snapshot?: Json | null
          changed_fields?: string[]
          content_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          effective_date?: string | null
          errata_kind?: string | null
          errata_payload?: Json | null
          errata_reason?: string | null
          errata_severity?: string | null
          errata_title?: string | null
          legal_basis?: Json | null
          merge_status?: string
          merged_at?: string | null
          merged_into_edition_id?: string | null
          node_id?: string | null
          notice_status?: string
          op?: string
          pending_payload?: Json | null
          published_at?: string | null
          requires_regrade?: boolean
          revision_id?: string
          scheduled_for?: string | null
          source_edition_id?: string | null
          source_ref?: Json | null
          subject_code?: string | null
          subject_ref?: Json | null
          withdrawn_at?: string | null
          withdraws_revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_withdraws_revision_id_fkey"
            columns: ["withdraws_revision_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "content_revisions_withdraws_revision_id_fkey"
            columns: ["withdraws_revision_id"]
            isOneToOne: false
            referencedRelation: "v_errata_sheet"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "content_revisions_withdraws_revision_id_fkey"
            columns: ["withdraws_revision_id"]
            isOneToOne: false
            referencedRelation: "v_revision_recent"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      content_sync_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_count: number
          errors: Json
          fetched: number
          inserted: number
          log_id: string
          skipped: number
          source: string
          status: string
          triggered_by: string | null
          updated: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_count?: number
          errors?: Json
          fetched?: number
          inserted?: number
          log_id?: string
          skipped?: number
          source?: string
          status?: string
          triggered_by?: string | null
          updated?: number
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_count?: number
          errors?: Json
          fetched?: number
          inserted?: number
          log_id?: string
          skipped?: number
          source?: string
          status?: string
          triggered_by?: string | null
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_sync_logs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_sync_logs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      coupon_grants: {
        Row: {
          coupon_id: string
          expires_at: string | null
          grant_id: string
          granted_at: string
          granted_by: string | null
          note: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          expires_at?: string | null
          grant_id?: string
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          expires_at?: string | null
          grant_id?: string
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_grants_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "coupon_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "coupon_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "coupon_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "coupon_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_krw: number
          order_id: string | null
          redeemed_at: string
          redemption_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          discount_krw?: number
          order_id?: string | null
          redeemed_at?: string
          redemption_id?: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          discount_krw?: number
          order_id?: string | null
          redeemed_at?: string
          redemption_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          coupon_id: string
          created_at: string
          deleted_at: string | null
          discount_type: string
          discount_value: number
          is_shared: boolean
          issue_count: number
          max_discount: number | null
          min_amount: number
          name: string
          note: string | null
          scope: string
          status: string
          updated_at: string
          usable_days: number | null
          valid_from: string
          valid_to: string
        }
        Insert: {
          code: string
          coupon_id?: string
          created_at?: string
          deleted_at?: string | null
          discount_type: string
          discount_value: number
          is_shared?: boolean
          issue_count?: number
          max_discount?: number | null
          min_amount?: number
          name: string
          note?: string | null
          scope?: string
          status?: string
          updated_at?: string
          usable_days?: number | null
          valid_from: string
          valid_to: string
        }
        Update: {
          code?: string
          coupon_id?: string
          created_at?: string
          deleted_at?: string | null
          discount_type?: string
          discount_value?: number
          is_shared?: boolean
          issue_count?: number
          max_discount?: number | null
          min_amount?: number
          name?: string
          note?: string | null
          scope?: string
          status?: string
          updated_at?: string
          usable_days?: number | null
          valid_from?: string
          valid_to?: string
        }
        Relationships: []
      }
      course_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          course_id: string
          created_at: string
          detail: Json | null
          log_id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          course_id: string
          created_at?: string
          detail?: Json | null
          log_id?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          course_id?: string
          created_at?: string
          detail?: Json | null
          log_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_audit_logs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
        ]
      }
      course_categories: {
        Row: {
          category_id: string
          created_at: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string
          created_at?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      course_instructors: {
        Row: {
          course_id: string
          created_at: string
          instructor_id: string
          role: string | null
          sort_order: number
        }
        Insert: {
          course_id: string
          created_at?: string
          instructor_id: string
          role?: string | null
          sort_order?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          instructor_id?: string
          role?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_instructors_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          course_id: string
          created_at: string
          deleted_at: string | null
          instructor_id: string | null
          is_preview: boolean
          is_published: boolean
          lesson_id: string
          lesson_no: number
          max_plays: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          deleted_at?: string | null
          instructor_id?: string | null
          is_preview?: boolean
          is_published?: boolean
          lesson_id?: string
          lesson_no: number
          max_plays?: number
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          deleted_at?: string | null
          instructor_id?: string | null
          is_preview?: boolean
          is_published?: boolean
          lesson_id?: string
          lesson_no?: number
          max_plays?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_lessons_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_lessons_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      course_review_reports: {
        Row: {
          created_at: string
          reason: string | null
          report_id: string
          reporter_id: string
          review_id: string
        }
        Insert: {
          created_at?: string
          reason?: string | null
          report_id?: string
          reporter_id: string
          review_id: string
        }
        Update: {
          created_at?: string
          reason?: string | null
          report_id?: string
          reporter_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_review_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_review_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "course_reviews"
            referencedColumns: ["review_id"]
          },
        ]
      }
      course_reviews: {
        Row: {
          admin_reply: string | null
          admin_reply_at: string | null
          author_id: string
          blind_reason: string | null
          body: string
          created_at: string
          deleted_at: string | null
          featured_at: string | null
          is_best: boolean
          is_blinded: boolean
          is_featured: boolean
          is_public: boolean
          points_awarded_at: string | null
          rating: number
          report_count: number
          review_id: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          admin_reply?: string | null
          admin_reply_at?: string | null
          author_id: string
          blind_reason?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          featured_at?: string | null
          is_best?: boolean
          is_blinded?: boolean
          is_featured?: boolean
          is_public?: boolean
          points_awarded_at?: string | null
          rating: number
          report_count?: number
          review_id?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          admin_reply?: string | null
          admin_reply_at?: string | null
          author_id?: string
          blind_reason?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          featured_at?: string | null
          is_best?: boolean
          is_blinded?: boolean
          is_featured?: boolean
          is_public?: boolean
          points_awarded_at?: string | null
          rating?: number
          report_count?: number
          review_id?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      course_series: {
        Row: {
          created_at: string
          deleted_at: string | null
          instructor_id: string | null
          series_id: string
          subject_code: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          instructor_id?: string | null
          series_id?: string
          subject_code: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          instructor_id?: string | null
          series_id?: string
          subject_code?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_series_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_series_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      courses: {
        Row: {
          admin_memo: string | null
          category_id: string | null
          course_id: string
          course_type: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          edition_label: string
          edition_year: number
          is_current: boolean
          is_visible: boolean
          max_plays: number | null
          public_no: number | null
          series_id: string
          status: string
          thumbnail_path: string | null
          updated_at: string
        }
        Insert: {
          admin_memo?: string | null
          category_id?: string | null
          course_id?: string
          course_type?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          edition_label: string
          edition_year: number
          is_current?: boolean
          is_visible?: boolean
          max_plays?: number | null
          public_no?: number | null
          series_id: string
          status?: string
          thumbnail_path?: string | null
          updated_at?: string
        }
        Update: {
          admin_memo?: string | null
          category_id?: string | null
          course_id?: string
          course_type?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          edition_label?: string
          edition_year?: number
          is_current?: boolean
          is_visible?: boolean
          max_plays?: number | null
          public_no?: number | null
          series_id?: string
          status?: string
          thumbnail_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "courses_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "course_series"
            referencedColumns: ["series_id"]
          },
        ]
      }
      cs_actions: {
        Row: {
          action_id: string
          actor_id: string | null
          created_at: string
          kind: string
          note: string
          ref_id: string | null
          ref_table: string | null
          user_id: string
        }
        Insert: {
          action_id?: string
          actor_id?: string | null
          created_at?: string
          kind: string
          note: string
          ref_id?: string | null
          ref_table?: string | null
          user_id: string
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          created_at?: string
          kind?: string
          note?: string
          ref_id?: string | null
          ref_table?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cs_inquiries: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          author_id: string | null
          body_md: string
          category: Database["public"]["Enums"]["cs_inquiry_category"]
          created_at: string
          deleted_at: string | null
          display_no: number
          inquiry_id: string
          is_private: boolean
          status: Database["public"]["Enums"]["cs_inquiry_status"]
          title: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          author_id?: string | null
          body_md: string
          category?: Database["public"]["Enums"]["cs_inquiry_category"]
          created_at?: string
          deleted_at?: string | null
          display_no?: number
          inquiry_id?: string
          is_private?: boolean
          status?: Database["public"]["Enums"]["cs_inquiry_status"]
          title: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          author_id?: string | null
          body_md?: string
          category?: Database["public"]["Enums"]["cs_inquiry_category"]
          created_at?: string
          deleted_at?: string | null
          display_no?: number
          inquiry_id?: string
          is_private?: boolean
          status?: Database["public"]["Enums"]["cs_inquiry_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_inquiries_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_inquiries_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_inquiries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_inquiries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cs_inquiry_replies: {
        Row: {
          author_id: string | null
          body_md: string
          created_at: string
          deleted_at: string | null
          inquiry_id: string
          reply_id: string
          role: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md: string
          created_at?: string
          deleted_at?: string | null
          inquiry_id: string
          reply_id?: string
          role: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          created_at?: string
          deleted_at?: string | null
          inquiry_id?: string
          reply_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_inquiry_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_inquiry_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "cs_inquiry_replies_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "cs_inquiries"
            referencedColumns: ["inquiry_id"]
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
          phase: Database["public"]["Enums"]["curriculum_item_phase"] | null
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
          phase?: Database["public"]["Enums"]["curriculum_item_phase"] | null
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
          phase?: Database["public"]["Enums"]["curriculum_item_phase"] | null
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
      custom_page_revisions: {
        Row: {
          body_html: string
          edited_at: string
          edited_by: string | null
          page_id: string
          revision_id: string
          status: string
          title: string
        }
        Insert: {
          body_html: string
          edited_at?: string
          edited_by?: string | null
          page_id: string
          revision_id?: string
          status: string
          title: string
        }
        Update: {
          body_html?: string
          edited_at?: string
          edited_by?: string | null
          page_id?: string
          revision_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "custom_pages"
            referencedColumns: ["page_id"]
          },
        ]
      }
      custom_pages: {
        Row: {
          admin_memo: string | null
          body_html: string
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          page_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_memo?: string | null
          body_html?: string
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          page_id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_memo?: string | null
          body_html?: string
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          page_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "custom_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      device_reset_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          device_id: string | null
          log_id: string
          reason: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          device_id?: string | null
          log_id?: string
          reason: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          device_id?: string | null
          log_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_reset_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "device_reset_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "device_reset_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_reset_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "device_reset_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      discounts: {
        Row: {
          auto_issue: string | null
          code: string | null
          created_at: string
          discount_id: string
          ends_at: string | null
          is_active: boolean
          kind: string
          max_uses: number | null
          min_amount_krw: number | null
          name: string
          per_user_limit: number | null
          renewal_until: string | null
          starts_at: string | null
          target_kind: string
          target_plan_codes: Json
          updated_at: string
          used_count: number
          value: number
        }
        Insert: {
          auto_issue?: string | null
          code?: string | null
          created_at?: string
          discount_id?: string
          ends_at?: string | null
          is_active?: boolean
          kind: string
          max_uses?: number | null
          min_amount_krw?: number | null
          name: string
          per_user_limit?: number | null
          renewal_until?: string | null
          starts_at?: string | null
          target_kind?: string
          target_plan_codes?: Json
          updated_at?: string
          used_count?: number
          value: number
        }
        Update: {
          auto_issue?: string | null
          code?: string | null
          created_at?: string
          discount_id?: string
          ends_at?: string | null
          is_active?: boolean
          kind?: string
          max_uses?: number | null
          min_amount_krw?: number | null
          name?: string
          per_user_limit?: number | null
          renewal_until?: string | null
          starts_at?: string | null
          target_kind?: string
          target_plan_codes?: Json
          updated_at?: string
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      dohae_unit_articles: {
        Row: {
          article_id: string
          unit_id: string
        }
        Insert: {
          article_id: string
          unit_id: string
        }
        Update: {
          article_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dohae_unit_articles_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "dohae_unit_articles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "dohae_units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      dohae_unit_nodes: {
        Row: {
          node_id: string
          unit_id: string
        }
        Insert: {
          node_id: string
          unit_id: string
        }
        Update: {
          node_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dohae_unit_nodes_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "dohae_unit_nodes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "dohae_units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      dohae_unit_views: {
        Row: {
          profile_id: string
          unit_id: string
          view_id: string
          viewed_at: string
        }
        Insert: {
          profile_id: string
          unit_id: string
          view_id?: string
          viewed_at?: string
        }
        Update: {
          profile_id?: string
          unit_id?: string
          view_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dohae_unit_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dohae_unit_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dohae_unit_views_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "dohae_units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      dohae_units: {
        Row: {
          blocks: Json
          book_code: string
          chapter_no: number
          chapter_title: string
          created_at: string
          kind: string
          law_refs: Json
          pdf_page: number | null
          ref_no: string | null
          title: string
          unit_id: string
          unit_key: string
          unit_no: number | null
          updated_at: string
        }
        Insert: {
          blocks: Json
          book_code?: string
          chapter_no: number
          chapter_title?: string
          created_at?: string
          kind: string
          law_refs?: Json
          pdf_page?: number | null
          ref_no?: string | null
          title: string
          unit_id?: string
          unit_key: string
          unit_no?: number | null
          updated_at?: string
        }
        Update: {
          blocks?: Json
          book_code?: string
          chapter_no?: number
          chapter_title?: string
          created_at?: string
          kind?: string
          law_refs?: Json
          pdf_page?: number | null
          ref_no?: string | null
          title?: string
          unit_id?: string
          unit_key?: string
          unit_no?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      enrollment_admin_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          enrollment_id: string
          log_id: string
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          enrollment_id: string
          log_id?: string
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          enrollment_id?: string
          log_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_admin_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollment_admin_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollment_admin_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "enrollment_admin_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_enrollment_watch_balance"
            referencedColumns: ["enrollment_id"]
          },
        ]
      }
      enrollment_pauses: {
        Row: {
          created_at: string
          days: number
          ends_on: string
          enrollment_id: string
          is_admin_exception: boolean
          note: string | null
          pause_id: string
          requested_by: string
          resumed_at: string | null
          starts_on: string
        }
        Insert: {
          created_at?: string
          days: number
          ends_on: string
          enrollment_id: string
          is_admin_exception?: boolean
          note?: string | null
          pause_id?: string
          requested_by: string
          resumed_at?: string | null
          starts_on: string
        }
        Update: {
          created_at?: string
          days?: number
          ends_on?: string
          enrollment_id?: string
          is_admin_exception?: boolean
          note?: string | null
          pause_id?: string
          requested_by?: string
          resumed_at?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_pauses_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "enrollment_pauses_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_enrollment_watch_balance"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "enrollment_pauses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollment_pauses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          admin_note: string | null
          base_duration_snapshot_seconds: number
          blocked_lesson_ids: string[]
          course_id: string
          created_at: string
          enrollment_id: string
          expires_at: string
          granted_by: string | null
          multiplier_snapshot: number | null
          order_item_id: string | null
          plan_id: string | null
          revoke_reason: string | null
          revoked_at: string | null
          source: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          base_duration_snapshot_seconds?: number
          blocked_lesson_ids?: string[]
          course_id: string
          created_at?: string
          enrollment_id?: string
          expires_at: string
          granted_by?: string | null
          multiplier_snapshot?: number | null
          order_item_id?: string | null
          plan_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          source: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          base_duration_snapshot_seconds?: number
          blocked_lesson_ids?: string[]
          course_id?: string
          created_at?: string
          enrollment_id?: string
          expires_at?: string
          granted_by?: string | null
          multiplier_snapshot?: number | null
          order_item_id?: string | null
          plan_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "enrollments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollments_order_item_fk"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      exam_info: {
        Row: {
          created_at: string
          data: Json
          id: string
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      exam_notices: {
        Row: {
          attachments: Json
          body_md: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          is_pinned: boolean
          notice_id: string
          published: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          is_pinned?: boolean
          notice_id?: string
          published?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          is_pinned?: boolean
          notice_id?: string
          published?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
          summary_name_visibility: string
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
          summary_name_visibility?: string
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
          summary_name_visibility?: string
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
      exam_schedules: {
        Row: {
          exam_date: string
          exam_round: string
          exam_year: number
          memo: string | null
          updated_at: string
        }
        Insert: {
          exam_date: string
          exam_round: string
          exam_year: number
          memo?: string | null
          updated_at?: string
        }
        Update: {
          exam_date?: string
          exam_round?: string
          exam_year?: number
          memo?: string | null
          updated_at?: string
        }
        Relationships: []
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
      guide_articles: {
        Row: {
          audience: string
          body_md: string
          category: string
          created_at: string
          created_by: string | null
          display_order: number
          guide_id: string
          is_published: boolean
          screen_key: string | null
          title: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          audience?: string
          body_md?: string
          category?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          guide_id?: string
          is_published?: boolean
          screen_key?: string | null
          title: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          audience?: string
          body_md?: string
          category?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          guide_id?: string
          is_published?: boolean
          screen_key?: string | null
          title?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "guide_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      instructor_qna_credits: {
        Row: {
          amount_krw: number
          created_at: string
          credit_id: string
          instructor_id: string
          payout_id: string | null
          thread_id: string
        }
        Insert: {
          amount_krw: number
          created_at?: string
          credit_id?: string
          instructor_id: string
          payout_id?: string | null
          thread_id: string
        }
        Update: {
          amount_krw?: number
          created_at?: string
          credit_id?: string
          instructor_id?: string
          payout_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_qna_credits_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_qna_credits_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_qna_credits_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "qna_reward_payouts"
            referencedColumns: ["payout_id"]
          },
          {
            foreignKeyName: "instructor_qna_credits_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "qna_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      instructor_settlement_items: {
        Row: {
          base_amount_krw: number
          created_at: string
          item_id: string
          kind: string
          note: string | null
          payment_id: string
          rule_id: string | null
          settlement_id: string
          share_amount_krw: number
          share_kind: string
          share_value: number
        }
        Insert: {
          base_amount_krw: number
          created_at?: string
          item_id?: string
          kind?: string
          note?: string | null
          payment_id: string
          rule_id?: string | null
          settlement_id: string
          share_amount_krw: number
          share_kind: string
          share_value: number
        }
        Update: {
          base_amount_krw?: number
          created_at?: string
          item_id?: string
          kind?: string
          note?: string | null
          payment_id?: string
          rule_id?: string | null
          settlement_id?: string
          share_amount_krw?: number
          share_kind?: string
          share_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "instructor_settlement_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "instructor_settlement_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "instructor_share_rules"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "instructor_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "instructor_settlements"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      instructor_settlements: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          instructor_id: string
          memo: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          settlement_id: string
          status: string
          total_share_krw: number
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          instructor_id: string
          memo?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          settlement_id?: string
          status?: string
          total_share_krw?: number
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          instructor_id?: string
          memo?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          settlement_id?: string
          status?: string
          total_share_krw?: number
        }
        Relationships: [
          {
            foreignKeyName: "instructor_settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_settlements_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_settlements_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      instructor_share_rules: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          instructor_id: string
          is_active: boolean
          memo: string | null
          rule_id: string
          share_kind: string
          share_value: number
          target_kind: string
          target_plan_id: string | null
          target_subject_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          instructor_id: string
          is_active?: boolean
          memo?: string | null
          rule_id?: string
          share_kind: string
          share_value: number
          target_kind: string
          target_plan_id?: string | null
          target_subject_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          instructor_id?: string
          is_active?: boolean
          memo?: string | null
          rule_id?: string
          share_kind?: string
          share_value?: number
          target_kind?: string
          target_plan_id?: string | null
          target_subject_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_share_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_share_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_share_rules_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_share_rules_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_share_rules_target_plan_id_fkey"
            columns: ["target_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      instructor_subjects: {
        Row: {
          created_at: string
          granted_by: string | null
          instructor_id: string
          subject_code: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          instructor_id: string
          subject_code: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          instructor_id?: string
          subject_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_subjects_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_subjects_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_subjects_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructor_subjects_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      instructors: {
        Row: {
          bio_md: string | null
          books: Json
          career: Json
          category: string
          created_at: string
          deleted_at: string | null
          display_order: number
          education: Json
          headline: string | null
          instructor_id: string
          links: Json
          metrics: Json
          monogram: string | null
          name: string
          philosophy_md: string | null
          photo_path: string | null
          profile_id: string | null
          published: boolean
          role_label: string | null
          slug: string
          subject_codes: string[]
          subject_label: string
          title: string | null
          updated_at: string
        }
        Insert: {
          bio_md?: string | null
          books?: Json
          career?: Json
          category?: string
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          education?: Json
          headline?: string | null
          instructor_id?: string
          links?: Json
          metrics?: Json
          monogram?: string | null
          name: string
          philosophy_md?: string | null
          photo_path?: string | null
          profile_id?: string | null
          published?: boolean
          role_label?: string | null
          slug: string
          subject_codes?: string[]
          subject_label: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          bio_md?: string | null
          books?: Json
          career?: Json
          category?: string
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          education?: Json
          headline?: string | null
          instructor_id?: string
          links?: Json
          metrics?: Json
          monogram?: string | null
          name?: string
          philosophy_md?: string | null
          photo_path?: string | null
          profile_id?: string | null
          published?: boolean
          role_label?: string | null
          slug?: string
          subject_codes?: string[]
          subject_label?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "instructors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      landing_banners: {
        Row: {
          accent: string
          badges: string[]
          banner_id: string
          big_unit: string | null
          big_value: string | null
          body_html: string | null
          created_at: string
          cta_href: string | null
          cta_label: string | null
          deleted_at: string | null
          display_order: number
          eyebrow: string | null
          headline: string
          highlight: string | null
          image_max_width: number | null
          image_url: string | null
          kind: string
          published: boolean
          secondary_href: string | null
          secondary_label: string | null
          sub: string | null
          tier: number
          updated_at: string
        }
        Insert: {
          accent?: string
          badges?: string[]
          banner_id?: string
          big_unit?: string | null
          big_value?: string | null
          body_html?: string | null
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          deleted_at?: string | null
          display_order?: number
          eyebrow?: string | null
          headline: string
          highlight?: string | null
          image_max_width?: number | null
          image_url?: string | null
          kind?: string
          published?: boolean
          secondary_href?: string | null
          secondary_label?: string | null
          sub?: string | null
          tier?: number
          updated_at?: string
        }
        Update: {
          accent?: string
          badges?: string[]
          banner_id?: string
          big_unit?: string | null
          big_value?: string | null
          body_html?: string | null
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          deleted_at?: string | null
          display_order?: number
          eyebrow?: string | null
          headline?: string
          highlight?: string | null
          image_max_width?: number | null
          image_url?: string | null
          kind?: string
          published?: boolean
          secondary_href?: string | null
          secondary_label?: string | null
          sub?: string | null
          tier?: number
          updated_at?: string
        }
        Relationships: []
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
      lecture_news: {
        Row: {
          body_md: string | null
          created_at: string
          deleted_at: string | null
          kind: string
          news_id: string
          pinned: boolean
          published: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          created_at?: string
          deleted_at?: string | null
          kind?: string
          news_id?: string
          pinned?: boolean
          published?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          created_at?: string
          deleted_at?: string | null
          kind?: string
          news_id?: string
          pinned?: boolean
          published?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lecture_note_views: {
        Row: {
          from_page: number
          kind: string
          profile_id: string
          target_id: string
          to_page: number
          view_id: string
          viewed_at: string
        }
        Insert: {
          from_page: number
          kind: string
          profile_id: string
          target_id: string
          to_page: number
          view_id?: string
          viewed_at?: string
        }
        Update: {
          from_page?: number
          kind?: string
          profile_id?: string
          target_id?: string
          to_page?: number
          view_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_note_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lecture_note_views_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      lecture_pdf_locations: {
        Row: {
          created_at: string
          label: string | null
          location_id: string
          needs_recheck_at: string | null
          page: number
          source_pdf_id: string
          target_id: string
          target_type: Database["public"]["Enums"]["resource_target_type"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          label?: string | null
          location_id?: string
          needs_recheck_at?: string | null
          page: number
          source_pdf_id: string
          target_id: string
          target_type: Database["public"]["Enums"]["resource_target_type"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          label?: string | null
          location_id?: string
          needs_recheck_at?: string | null
          page?: number
          source_pdf_id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["resource_target_type"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecture_pdf_locations_source_pdf_id_fkey"
            columns: ["source_pdf_id"]
            isOneToOne: false
            referencedRelation: "lecture_source_pdfs"
            referencedColumns: ["source_pdf_id"]
          },
        ]
      }
      lecture_resources: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_sec: number | null
          kind: Database["public"]["Enums"]["resource_kind"]
          ord: number
          page_count: number | null
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
          page_count?: number | null
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
          page_count?: number | null
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
      lecture_schedules: {
        Row: {
          capacity: number
          created_at: string
          curriculum_md: string | null
          day_label: string | null
          deleted_at: string | null
          display_order: number
          enrolled: number
          format: string
          instructor_name: string
          intro_md: string | null
          note: string | null
          plan_code: string | null
          published: boolean
          schedule_id: string
          start_date: string | null
          status: string
          subject_code: string | null
          subject_label: string
          time_label: string | null
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          curriculum_md?: string | null
          day_label?: string | null
          deleted_at?: string | null
          display_order?: number
          enrolled?: number
          format?: string
          instructor_name: string
          intro_md?: string | null
          note?: string | null
          plan_code?: string | null
          published?: boolean
          schedule_id?: string
          start_date?: string | null
          status?: string
          subject_code?: string | null
          subject_label: string
          time_label?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          curriculum_md?: string | null
          day_label?: string | null
          deleted_at?: string | null
          display_order?: number
          enrolled?: number
          format?: string
          instructor_name?: string
          intro_md?: string | null
          note?: string | null
          plan_code?: string | null
          published?: boolean
          schedule_id?: string
          start_date?: string | null
          status?: string
          subject_code?: string | null
          subject_label?: string
          time_label?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      lecture_source_pdfs: {
        Row: {
          created_at: string
          edition: string | null
          slide_count: number | null
          source_filename: string | null
          source_pdf_id: string
          storage_bucket: string
          storage_path: string
          subject_law: string
          title: string
          total_pages: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          edition?: string | null
          slide_count?: number | null
          source_filename?: string | null
          source_pdf_id: string
          storage_bucket?: string
          storage_path: string
          subject_law: string
          title: string
          total_pages: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          edition?: string | null
          slide_count?: number | null
          source_filename?: string | null
          source_pdf_id?: string
          storage_bucket?: string
          storage_path?: string
          subject_law?: string
          title?: string
          total_pages?: number
          updated_at?: string
        }
        Relationships: []
      }
      lecture_videos: {
        Row: {
          category: string
          content_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_order: number
          duration_label: string | null
          linked_plan_id: string | null
          provider: string
          published: boolean
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_id: string
          youtube_url: string | null
        }
        Insert: {
          category?: string
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          duration_label?: string | null
          linked_plan_id?: string | null
          provider?: string
          published?: boolean
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_id?: string
          youtube_url?: string | null
        }
        Update: {
          category?: string
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          duration_label?: string | null
          linked_plan_id?: string | null
          provider?: string
          published?: boolean
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_id?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecture_videos_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "video_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "lecture_videos_linked_plan_id_fkey"
            columns: ["linked_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
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
      lesson_completions: {
        Row: {
          completed_at: string
          completed_by: string | null
          lesson_id: string
          note: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          completed_by?: string | null
          lesson_id: string
          note?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string | null
          lesson_id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_completions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "lesson_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      lesson_materials: {
        Row: {
          created_at: string
          is_published: boolean
          lesson_id: string
          material_id: string
          sort_order: number
          storage_path: string
          title: string
        }
        Insert: {
          created_at?: string
          is_published?: boolean
          lesson_id: string
          material_id?: string
          sort_order?: number
          storage_path: string
          title: string
        }
        Update: {
          created_at?: string
          is_published?: boolean
          lesson_id?: string
          material_id?: string
          sort_order?: number
          storage_path?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
        ]
      }
      lesson_node_links: {
        Row: {
          created_at: string
          created_by: string | null
          lesson_id: string
          node_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          lesson_id: string
          node_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          lesson_id?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_node_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_node_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_node_links_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "lesson_node_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
        ]
      }
      lesson_staff_memos: {
        Row: {
          lesson_id: string
          memo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          lesson_id: string
          memo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          lesson_id?: string
          memo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_staff_memos_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "lesson_staff_memos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_staff_memos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      lesson_videos: {
        Row: {
          content_id: string | null
          created_at: string
          created_by: string | null
          drm_provider: string
          drm_video_id: string
          duration_seconds: number
          is_active: boolean
          lesson_id: string
          replaced_reason: string | null
          video_id: string
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          drm_provider: string
          drm_video_id: string
          duration_seconds: number
          is_active?: boolean
          lesson_id: string
          replaced_reason?: string | null
          video_id?: string
        }
        Update: {
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          drm_provider?: string
          drm_video_id?: string
          duration_seconds?: number
          is_active?: boolean
          lesson_id?: string
          replaced_reason?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_videos_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "video_contents"
            referencedColumns: ["content_id"]
          },
          {
            foreignKeyName: "lesson_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_videos_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
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
      message_send_logs: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          kind: string | null
          log_id: string
          meta: Json | null
          provider: string
          recipient_id: string | null
          status: string
          subject: string | null
          to_address: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          kind?: string | null
          log_id?: string
          meta?: Json | null
          provider: string
          recipient_id?: string | null
          status: string
          subject?: string | null
          to_address?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          kind?: string | null
          log_id?: string
          meta?: Json | null
          provider?: string
          recipient_id?: string | null
          status?: string
          subject?: string | null
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_send_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_send_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      offline_test_answers: {
        Row: {
          is_correct: boolean
          question_id: string
          result_id: string
        }
        Insert: {
          is_correct: boolean
          question_id: string
          result_id: string
        }
        Update: {
          is_correct?: boolean
          question_id?: string
          result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_test_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "offline_test_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "offline_test_answers_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "offline_test_results"
            referencedColumns: ["result_id"]
          },
        ]
      }
      offline_test_questions: {
        Row: {
          blank_set_id: string | null
          created_at: string
          ord: number
          ox_problem_id: string | null
          ox_ref_id: string | null
          ox_ref_type: string | null
          points: number
          problem_id: string | null
          question_id: string
          question_type: string
          test_id: string
        }
        Insert: {
          blank_set_id?: string | null
          created_at?: string
          ord: number
          ox_problem_id?: string | null
          ox_ref_id?: string | null
          ox_ref_type?: string | null
          points?: number
          problem_id?: string | null
          question_id?: string
          question_type: string
          test_id: string
        }
        Update: {
          blank_set_id?: string | null
          created_at?: string
          ord?: number
          ox_problem_id?: string | null
          ox_ref_id?: string | null
          ox_ref_type?: string | null
          points?: number
          problem_id?: string | null
          question_id?: string
          question_type?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_test_questions_blank_set_id_fkey"
            columns: ["blank_set_id"]
            isOneToOne: false
            referencedRelation: "article_blank_sets"
            referencedColumns: ["set_id"]
          },
          {
            foreignKeyName: "offline_test_questions_ox_problem_id_fkey"
            columns: ["ox_problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "offline_test_questions_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "offline_test_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "offline_tests"
            referencedColumns: ["test_id"]
          },
        ]
      }
      offline_test_results: {
        Row: {
          entered_at: string
          entered_by: string | null
          max_score: number | null
          note: string | null
          result_id: string
          score: number | null
          session_id: string | null
          srs_ox_applied_at: string | null
          srs_problem_applied_at: string | null
          status: string
          taken_at: string | null
          test_id: string
          user_id: string
          wrong_ords: number[]
        }
        Insert: {
          entered_at?: string
          entered_by?: string | null
          max_score?: number | null
          note?: string | null
          result_id?: string
          score?: number | null
          session_id?: string | null
          srs_ox_applied_at?: string | null
          srs_problem_applied_at?: string | null
          status?: string
          taken_at?: string | null
          test_id: string
          user_id: string
          wrong_ords?: number[]
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          max_score?: number | null
          note?: string | null
          result_id?: string
          score?: number | null
          session_id?: string | null
          srs_ox_applied_at?: string | null
          srs_problem_applied_at?: string | null
          status?: string
          taken_at?: string | null
          test_id?: string
          user_id?: string
          wrong_ords?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "offline_test_results_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offline_test_results_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offline_test_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "offline_test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "offline_tests"
            referencedColumns: ["test_id"]
          },
          {
            foreignKeyName: "offline_test_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offline_test_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      offline_test_series: {
        Row: {
          cohort_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          series_id: string
          title: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          series_id?: string
          title: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          series_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_test_series_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "offline_test_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offline_test_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      offline_tests: {
        Row: {
          assignment_id: string
          closed_at: string | null
          cohort_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_min: number | null
          instructions_md: string | null
          is_diagnostic: boolean
          law_code: string | null
          published_at: string | null
          science_subject: string | null
          series_id: string | null
          series_round_no: number | null
          status: string
          test_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          closed_at?: string | null
          cohort_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_min?: number | null
          instructions_md?: string | null
          is_diagnostic?: boolean
          law_code?: string | null
          published_at?: string | null
          science_subject?: string | null
          series_id?: string | null
          series_round_no?: number | null
          status?: string
          test_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          closed_at?: string | null
          cohort_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_min?: number | null
          instructions_md?: string | null
          is_diagnostic?: boolean
          law_code?: string | null
          published_at?: string | null
          science_subject?: string | null
          series_id?: string | null
          series_round_no?: number | null
          status?: string
          test_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_tests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "offline_tests_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "offline_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offline_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offline_tests_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "offline_test_series"
            referencedColumns: ["series_id"]
          },
        ]
      }
      order_items: {
        Row: {
          book_id: string | null
          created_at: string
          item_type: string
          order_id: string
          order_item_id: string
          plan_id: string | null
          quantity: number
          refund_amount_krw: number | null
          refund_reason: string | null
          refunded_at: string | null
          subject_code: string | null
          unit_price_krw: number
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          item_type: string
          order_id: string
          order_item_id?: string
          plan_id?: string | null
          quantity?: number
          refund_amount_krw?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          subject_code?: string | null
          unit_price_krw: number
        }
        Update: {
          book_id?: string | null
          created_at?: string
          item_type?: string
          order_id?: string
          order_item_id?: string
          plan_id?: string | null
          quantity?: number
          refund_amount_krw?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          subject_code?: string | null
          unit_price_krw?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_book_fk"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "order_items_book_fk"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "order_items_book_fk"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_discount_krw: number
          coupon_id: string | null
          created_at: string
          discount_id: string | null
          order_id: string
          payment_method: string
          shipping_fee_krw: number
          status: string
          total_krw: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coupon_discount_krw?: number
          coupon_id?: string | null
          created_at?: string
          discount_id?: string | null
          order_id?: string
          payment_method?: string
          shipping_fee_krw?: number
          status?: string
          total_krw: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coupon_discount_krw?: number
          coupon_id?: string | null
          created_at?: string
          discount_id?: string | null
          order_id?: string
          payment_method?: string
          shipping_fee_krw?: number
          status?: string
          total_krw?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "orders_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["discount_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ox_article_suggestions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          law_code: string
          problem_id: string
          rationale: string | null
          ref_id: string
          ref_type: string
          status: string
          suggested_article_number: string | null
          suggestion_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          law_code: string
          problem_id: string
          rationale?: string | null
          ref_id: string
          ref_type: string
          status?: string
          suggested_article_number?: string | null
          suggestion_id?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          law_code?: string
          problem_id?: string
          rationale?: string | null
          ref_id?: string
          ref_type?: string
          status?: string
          suggested_article_number?: string | null
          suggestion_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ox_article_suggestions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ox_article_suggestions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ox_article_suggestions_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
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
      payment_webhook_events: {
        Row: {
          detail: string | null
          event_id: string
          event_type: string | null
          outcome: string
          payment_id: string | null
          raw: Json | null
          received_at: string
          toss_order_id: string | null
        }
        Insert: {
          detail?: string | null
          event_id?: string
          event_type?: string | null
          outcome: string
          payment_id?: string | null
          raw?: Json | null
          received_at?: string
          toss_order_id?: string | null
        }
        Update: {
          detail?: string | null
          event_id?: string
          event_type?: string | null
          outcome?: string
          payment_id?: string | null
          raw?: Json | null
          received_at?: string
          toss_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_krw: number
          created_at: string
          discount_id: string | null
          failure_reason: string | null
          order_id: string | null
          payment_id: string
          plan_id: string | null
          refund_amount_krw: number | null
          refund_reason: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subject_code: string | null
          toss_order_id: string
          toss_payment_key: string | null
          toss_response: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_krw: number
          created_at?: string
          discount_id?: string | null
          failure_reason?: string | null
          order_id?: string | null
          payment_id?: string
          plan_id?: string | null
          refund_amount_krw?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subject_code?: string | null
          toss_order_id: string
          toss_payment_key?: string | null
          toss_response?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_krw?: number
          created_at?: string
          discount_id?: string | null
          failure_reason?: string | null
          order_id?: string | null
          payment_id?: string
          plan_id?: string | null
          refund_amount_krw?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subject_code?: string | null
          toss_order_id?: string
          toss_payment_key?: string | null
          toss_response?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["discount_id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["order_id"]
          },
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
      plan_book_links: {
        Row: {
          book_id: string
          book_role: string
          plan_id: string
          requirement: string
          sort_order: number
        }
        Insert: {
          book_id: string
          book_role?: string
          plan_id: string
          requirement?: string
          sort_order?: number
        }
        Update: {
          book_id?: string
          book_role?: string
          plan_id?: string
          requirement?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_book_links_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "plan_book_links_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "plan_book_links_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "plan_book_links_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      plan_books: {
        Row: {
          book_id: string
          created_at: string
          plan_id: string
          relation_kind: string
          sort_order: number
        }
        Insert: {
          book_id: string
          created_at?: string
          plan_id: string
          relation_kind?: string
          sort_order?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          plan_id?: string
          relation_kind?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "plan_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_book_stock"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "plan_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_sales_books"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "plan_books_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      plan_courses: {
        Row: {
          course_id: string
          plan_id: string
        }
        Insert: {
          course_id: string
          plan_id: string
        }
        Update: {
          course_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "plan_courses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      plan_policies: {
        Row: {
          allow_download: boolean
          allow_mobile: boolean
          allow_pc: boolean
          created_at: string
          duration_days: number | null
          extension_allowed: boolean
          extension_plan_ids: string[]
          fixed_end_date: string | null
          max_devices_mobile: number
          max_devices_pc: number
          multiplier: number | null
          pause_allowed: boolean
          pause_max_count: number
          pause_max_days: number
          pause_min_days: number
          pause_total_days: number
          plan_id: string
          updated_at: string
        }
        Insert: {
          allow_download?: boolean
          allow_mobile?: boolean
          allow_pc?: boolean
          created_at?: string
          duration_days?: number | null
          extension_allowed?: boolean
          extension_plan_ids?: string[]
          fixed_end_date?: string | null
          max_devices_mobile?: number
          max_devices_pc?: number
          multiplier?: number | null
          pause_allowed?: boolean
          pause_max_count?: number
          pause_max_days?: number
          pause_min_days?: number
          pause_total_days?: number
          plan_id: string
          updated_at?: string
        }
        Update: {
          allow_download?: boolean
          allow_mobile?: boolean
          allow_pc?: boolean
          created_at?: string
          duration_days?: number | null
          extension_allowed?: boolean
          extension_plan_ids?: string[]
          fixed_end_date?: string | null
          max_devices_mobile?: number
          max_devices_pc?: number
          multiplier?: number | null
          pause_allowed?: boolean
          pause_max_count?: number
          pause_max_days?: number
          pause_min_days?: number
          pause_total_days?: number
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_policies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "subscription_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      playback_grants: {
        Row: {
          client_ip: unknown
          counts_as_play: boolean
          device_id: string | null
          enrollment_id: string | null
          expires_at: string
          grant_id: string
          granted_at: string
          lesson_id: string
          user_agent: string | null
          user_id: string | null
          video_id: string
        }
        Insert: {
          client_ip?: unknown
          counts_as_play?: boolean
          device_id?: string | null
          enrollment_id?: string | null
          expires_at: string
          grant_id?: string
          granted_at?: string
          lesson_id: string
          user_agent?: string | null
          user_id?: string | null
          video_id: string
        }
        Update: {
          client_ip?: unknown
          counts_as_play?: boolean
          device_id?: string | null
          enrollment_id?: string | null
          expires_at?: string
          grant_id?: string
          granted_at?: string
          lesson_id?: string
          user_agent?: string | null
          user_id?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playback_grants_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "playback_grants_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_enrollment_watch_balance"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "playback_grants_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "playback_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "playback_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "playback_grants_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "lesson_videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      playback_issues: {
        Row: {
          client_env: Json | null
          created_at: string
          error_code: string | null
          grant_id: string | null
          issue_id: string
          lesson_id: string | null
          message: string | null
          user_id: string | null
          video_id: string | null
        }
        Insert: {
          client_env?: Json | null
          created_at?: string
          error_code?: string | null
          grant_id?: string | null
          issue_id?: string
          lesson_id?: string | null
          message?: string | null
          user_id?: string | null
          video_id?: string | null
        }
        Update: {
          client_env?: Json | null
          created_at?: string
          error_code?: string | null
          grant_id?: string | null
          issue_id?: string
          lesson_id?: string | null
          message?: string | null
          user_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playback_issues_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "playback_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "playback_issues_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "playback_issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "playback_issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "playback_issues_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "lesson_videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          balance_after: number | null
          created_at: string
          delta: number
          reason: string | null
          txn_id: string
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          delta: number
          reason?: string | null
          txn_id?: string
          user_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          delta?: number
          reason?: string | null
          txn_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      popup_notices: {
        Row: {
          body_html: string | null
          body_md: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          image_url: string | null
          is_active: boolean
          link_label: string | null
          link_url: string | null
          notice_id: string
          starts_at: string | null
          title: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          body_html?: string | null
          body_md?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          image_url?: string | null
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          notice_id?: string
          starts_at?: string | null
          title: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          body_html?: string | null
          body_md?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          image_url?: string | null
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          notice_id?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "popup_notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "popup_notices_created_by_fkey"
            columns: ["created_by"]
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
          cross_unit: boolean
          explanation_md: string | null
          marker: string
          ox_hidden_at: string | null
          ox_hidden_by: string | null
          ox_ineligible: boolean
          ox_truth: Database["public"]["Enums"]["ox_truth"] | null
          position_index: number
          problem_id: string
          related_article_id: string | null
          related_article_number: string | null
          related_case_id: string | null
          related_case_number: string | null
          related_node_id: string | null
          updated_at: string
        }
        Insert: {
          body_md: string
          box_item_id?: string
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          cross_unit?: boolean
          explanation_md?: string | null
          marker: string
          ox_hidden_at?: string | null
          ox_hidden_by?: string | null
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          position_index: number
          problem_id: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
          related_node_id?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string
          box_item_id?: string
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          cross_unit?: boolean
          explanation_md?: string | null
          marker?: string
          ox_hidden_at?: string | null
          ox_hidden_by?: string | null
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          position_index?: number
          problem_id?: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
          related_node_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_box_items_ox_hidden_by_fkey"
            columns: ["ox_hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_box_items_ox_hidden_by_fkey"
            columns: ["ox_hidden_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
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
          {
            foreignKeyName: "problem_box_items_related_node_id_fkey"
            columns: ["related_node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
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
          cross_unit: boolean
          explanation_md: string | null
          is_correct: boolean
          ox_body_md: string | null
          ox_hidden_at: string | null
          ox_hidden_by: string | null
          ox_ineligible: boolean
          ox_truth: Database["public"]["Enums"]["ox_truth"] | null
          problem_id: string
          related_article_id: string | null
          related_article_number: string | null
          related_case_id: string | null
          related_case_number: string | null
          related_node_id: string | null
        }
        Insert: {
          body_md: string
          choice_id?: string
          choice_index: number
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          cross_unit?: boolean
          explanation_md?: string | null
          is_correct?: boolean
          ox_body_md?: string | null
          ox_hidden_at?: string | null
          ox_hidden_by?: string | null
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          problem_id: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
          related_node_id?: string | null
        }
        Update: {
          body_md?: string
          choice_id?: string
          choice_index?: number
          choice_type?:
            | Database["public"]["Enums"]["problem_choice_type"]
            | null
          created_at?: string
          cross_unit?: boolean
          explanation_md?: string | null
          is_correct?: boolean
          ox_body_md?: string | null
          ox_hidden_at?: string | null
          ox_hidden_by?: string | null
          ox_ineligible?: boolean
          ox_truth?: Database["public"]["Enums"]["ox_truth"] | null
          problem_id?: string
          related_article_id?: string | null
          related_article_number?: string | null
          related_case_id?: string | null
          related_case_number?: string | null
          related_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problem_choices_ox_hidden_by_fkey"
            columns: ["ox_hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_choices_ox_hidden_by_fkey"
            columns: ["ox_hidden_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
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
          {
            foreignKeyName: "problem_choices_related_node_id_fkey"
            columns: ["related_node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
        ]
      }
      problem_explanation_drafts: {
        Row: {
          ai_answer: string | null
          answer_match: boolean | null
          content_md: string
          created_at: string
          draft_id: string
          model: string | null
          note: string | null
          problem_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["explanation_draft_status"]
        }
        Insert: {
          ai_answer?: string | null
          answer_match?: boolean | null
          content_md: string
          created_at?: string
          draft_id?: string
          model?: string | null
          note?: string | null
          problem_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["explanation_draft_status"]
        }
        Update: {
          ai_answer?: string | null
          answer_match?: boolean | null
          content_md?: string
          created_at?: string
          draft_id?: string
          model?: string | null
          note?: string | null
          problem_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["explanation_draft_status"]
        }
        Relationships: [
          {
            foreignKeyName: "problem_explanation_drafts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: true
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "problem_explanation_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_explanation_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      problem_grading_notes: {
        Row: {
          author: string | null
          body_md: string
          created_at: string
          created_by: string | null
          display_order: number
          example_answer_md: string | null
          form: string | null
          note_id: string
          problem_id: string
          source: string
          source_year: number | null
          updated_at: string
        }
        Insert: {
          author?: string | null
          body_md: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          example_answer_md?: string | null
          form?: string | null
          note_id?: string
          problem_id: string
          source?: string
          source_year?: number | null
          updated_at?: string
        }
        Update: {
          author?: string | null
          body_md?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          example_answer_md?: string | null
          form?: string | null
          note_id?: string
          problem_id?: string
          source?: string
          source_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_grading_notes_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
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
      problem_systematic_links: {
        Row: {
          created_at: string
          created_by: string | null
          link_id: string
          node_id: string
          note: string | null
          problem_id: string
          seq: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          link_id?: string
          node_id: string
          note?: string | null
          problem_id: string
          seq?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          link_id?: string
          node_id?: string
          note?: string | null
          problem_id?: string
          seq?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "problem_systematic_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_systematic_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_systematic_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "problem_systematic_links_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
        ]
      }
      problem_text_drafts: {
        Row: {
          choice_top_frac: number | null
          choices: Json
          created_at: string
          draft_id: string
          has_figure: boolean
          model: string | null
          note: string | null
          problem_id: string
          recrop_path: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["explanation_draft_status"]
          stem_md: string
        }
        Insert: {
          choice_top_frac?: number | null
          choices: Json
          created_at?: string
          draft_id?: string
          has_figure?: boolean
          model?: string | null
          note?: string | null
          problem_id: string
          recrop_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["explanation_draft_status"]
          stem_md: string
        }
        Update: {
          choice_top_frac?: number | null
          choices?: Json
          created_at?: string
          draft_id?: string
          has_figure?: boolean
          model?: string | null
          note?: string | null
          problem_id?: string
          recrop_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["explanation_draft_status"]
          stem_md?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_text_drafts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: true
            referencedRelation: "problems"
            referencedColumns: ["problem_id"]
          },
          {
            foreignKeyName: "problem_text_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "problem_text_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
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
          display_no: number
          exam_number: number | null
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
          main_case_number: string | null
          mismatch_flagged_at: string | null
          mismatch_flagged_by: string | null
          model_answer_md: string | null
          origin: Database["public"]["Enums"]["problem_origin"]
          polarity: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id: string | null
          primary_node_id: string | null
          problem_id: string
          problem_number: number | null
          rejected_reason: string | null
          released_at: string | null
          review_status: Database["public"]["Enums"]["problem_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          rubric_ai_generated_at: string | null
          rubric_items: Json | null
          rubric_reviewed_at: string | null
          rubric_reviewed_by: string | null
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
          display_no?: number
          exam_number?: number | null
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
          main_case_number?: string | null
          mismatch_flagged_at?: string | null
          mismatch_flagged_by?: string | null
          model_answer_md?: string | null
          origin: Database["public"]["Enums"]["problem_origin"]
          polarity?: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id?: string | null
          primary_node_id?: string | null
          problem_id?: string
          problem_number?: number | null
          rejected_reason?: string | null
          released_at?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_ai_generated_at?: string | null
          rubric_items?: Json | null
          rubric_reviewed_at?: string | null
          rubric_reviewed_by?: string | null
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
          display_no?: number
          exam_number?: number | null
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
          main_case_number?: string | null
          mismatch_flagged_at?: string | null
          mismatch_flagged_by?: string | null
          model_answer_md?: string | null
          origin?: Database["public"]["Enums"]["problem_origin"]
          polarity?: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id?: string | null
          primary_node_id?: string | null
          problem_id?: string
          problem_number?: number | null
          rejected_reason?: string | null
          released_at?: string | null
          review_status?: Database["public"]["Enums"]["problem_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_ai_generated_at?: string | null
          rubric_items?: Json | null
          rubric_reviewed_at?: string | null
          rubric_reviewed_by?: string | null
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
            foreignKeyName: "problems_primary_node_id_fkey"
            columns: ["primary_node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
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
          access_approved_at: string | null
          active_session_at: string | null
          active_session_device: string | null
          active_session_id: string | null
          address: string | null
          analytics_consent_at: string | null
          avatar_url: string | null
          created_at: string
          highlight_color_aliases: Json
          is_synthetic: boolean
          marketing_consent: boolean
          member_no: number | null
          membership_test_grade: string | null
          my_analysis_consent_at: string | null
          name: string
          next_exam_round: Database["public"]["Enums"]["exam_round"] | null
          next_exam_year: number | null
          nickname: string | null
          notify_channels: string[]
          onboarded_at: string | null
          phone_e164: string | null
          pool_consent_at: string | null
          profile_completed_at: string | null
          profile_id: string
          recommendation_prefs: Json
          role: Database["public"]["Enums"]["user_role"]
          service_data_consent_at: string | null
          trial_ended_notified_at: string | null
          trial_ends_at: string | null
          trial_expiry_notified_at: string | null
          trial_regranted_at: string | null
          updated_at: string
        }
        Insert: {
          access_approved_at?: string | null
          active_session_at?: string | null
          active_session_device?: string | null
          active_session_id?: string | null
          address?: string | null
          analytics_consent_at?: string | null
          avatar_url?: string | null
          created_at?: string
          highlight_color_aliases?: Json
          is_synthetic?: boolean
          marketing_consent?: boolean
          member_no?: number | null
          membership_test_grade?: string | null
          my_analysis_consent_at?: string | null
          name: string
          next_exam_round?: Database["public"]["Enums"]["exam_round"] | null
          next_exam_year?: number | null
          nickname?: string | null
          notify_channels?: string[]
          onboarded_at?: string | null
          phone_e164?: string | null
          pool_consent_at?: string | null
          profile_completed_at?: string | null
          profile_id: string
          recommendation_prefs?: Json
          role?: Database["public"]["Enums"]["user_role"]
          service_data_consent_at?: string | null
          trial_ended_notified_at?: string | null
          trial_ends_at?: string | null
          trial_expiry_notified_at?: string | null
          trial_regranted_at?: string | null
          updated_at?: string
        }
        Update: {
          access_approved_at?: string | null
          active_session_at?: string | null
          active_session_device?: string | null
          active_session_id?: string | null
          address?: string | null
          analytics_consent_at?: string | null
          avatar_url?: string | null
          created_at?: string
          highlight_color_aliases?: Json
          is_synthetic?: boolean
          marketing_consent?: boolean
          member_no?: number | null
          membership_test_grade?: string | null
          my_analysis_consent_at?: string | null
          name?: string
          next_exam_round?: Database["public"]["Enums"]["exam_round"] | null
          next_exam_year?: number | null
          nickname?: string | null
          notify_channels?: string[]
          onboarded_at?: string | null
          phone_e164?: string | null
          pool_consent_at?: string | null
          profile_completed_at?: string | null
          profile_id?: string
          recommendation_prefs?: Json
          role?: Database["public"]["Enums"]["user_role"]
          service_data_consent_at?: string | null
          trial_ended_notified_at?: string | null
          trial_ends_at?: string | null
          trial_expiry_notified_at?: string | null
          trial_regranted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      publication_content_map: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          edition_id: string
          line_hint: string | null
          map_id: string
          node_id: string | null
          page_no: number | null
          page_no_end: number | null
          sort_key: number | null
          source_discrepancy: Json | null
          toc_path: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          edition_id: string
          line_hint?: string | null
          map_id?: string
          node_id?: string | null
          page_no?: number | null
          page_no_end?: number | null
          sort_key?: number | null
          source_discrepancy?: Json | null
          toc_path?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          edition_id?: string
          line_hint?: string | null
          map_id?: string
          node_id?: string | null
          page_no?: number | null
          page_no_end?: number | null
          sort_key?: number | null
          source_discrepancy?: Json | null
          toc_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_content_map_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "publication_editions"
            referencedColumns: ["edition_id"]
          },
          {
            foreignKeyName: "publication_content_map_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "v_current_editions"
            referencedColumns: ["edition_id"]
          },
        ]
      }
      publication_editions: {
        Row: {
          created_at: string
          edition_id: string
          edition_label: string
          edition_seq: number
          errata_sheet_item_count: number
          errata_sheet_updated_at: string | null
          errata_sheet_url: string | null
          frozen_at: string | null
          isbn: string | null
          print_date: string | null
          publication_id: string
          status: string
          target_exam_date: string | null
          target_exam_date_estimate: string | null
          target_exam_year: number | null
        }
        Insert: {
          created_at?: string
          edition_id?: string
          edition_label: string
          edition_seq: number
          errata_sheet_item_count?: number
          errata_sheet_updated_at?: string | null
          errata_sheet_url?: string | null
          frozen_at?: string | null
          isbn?: string | null
          print_date?: string | null
          publication_id: string
          status?: string
          target_exam_date?: string | null
          target_exam_date_estimate?: string | null
          target_exam_year?: number | null
        }
        Update: {
          created_at?: string
          edition_id?: string
          edition_label?: string
          edition_seq?: number
          errata_sheet_item_count?: number
          errata_sheet_updated_at?: string | null
          errata_sheet_url?: string | null
          frozen_at?: string | null
          isbn?: string | null
          print_date?: string | null
          publication_id?: string
          status?: string
          target_exam_date?: string | null
          target_exam_date_estimate?: string | null
          target_exam_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_editions_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["publication_id"]
          },
        ]
      }
      publications: {
        Row: {
          created_at: string
          deleted_at: string | null
          publication_id: string
          subject_code: string
          title: string
          track: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          publication_id?: string
          subject_code: string
          title: string
          track?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          publication_id?: string
          subject_code?: string
          title?: string
          track?: string | null
        }
        Relationships: []
      }
      qna_answerer_assignments: {
        Row: {
          answerer_id: string
          assignment_id: string
          category: string
          created_at: string
          created_by: string | null
        }
        Insert: {
          answerer_id: string
          assignment_id?: string
          category: string
          created_at?: string
          created_by?: string | null
        }
        Update: {
          answerer_id?: string
          assignment_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qna_answerer_assignments_answerer_id_fkey"
            columns: ["answerer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_answerer_assignments_answerer_id_fkey"
            columns: ["answerer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_answerer_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_answerer_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      qna_messages: {
        Row: {
          author_id: string | null
          body_md: string
          citations: Json | null
          created_at: string
          deleted_at: string | null
          feedback: number | null
          message_id: string
          refusal_kind: string | null
          retrieval_meta: Json | null
          role: Database["public"]["Enums"]["qna_message_role"]
          thread_id: string
          token_usage: Json | null
          updated_at: string
          verdict: string | null
          verified_at: string | null
          verified_by: string | null
          verifies_message_id: string | null
        }
        Insert: {
          author_id?: string | null
          body_md: string
          citations?: Json | null
          created_at?: string
          deleted_at?: string | null
          feedback?: number | null
          message_id?: string
          refusal_kind?: string | null
          retrieval_meta?: Json | null
          role: Database["public"]["Enums"]["qna_message_role"]
          thread_id: string
          token_usage?: Json | null
          updated_at?: string
          verdict?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verifies_message_id?: string | null
        }
        Update: {
          author_id?: string | null
          body_md?: string
          citations?: Json | null
          created_at?: string
          deleted_at?: string | null
          feedback?: number | null
          message_id?: string
          refusal_kind?: string | null
          retrieval_meta?: Json | null
          role?: Database["public"]["Enums"]["qna_message_role"]
          thread_id?: string
          token_usage?: Json | null
          updated_at?: string
          verdict?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verifies_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qna_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "qna_threads"
            referencedColumns: ["thread_id"]
          },
          {
            foreignKeyName: "qna_messages_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_messages_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_messages_verifies_message_id_fkey"
            columns: ["verifies_message_id"]
            isOneToOne: false
            referencedRelation: "qna_messages"
            referencedColumns: ["message_id"]
          },
        ]
      }
      qna_reward_payouts: {
        Row: {
          amount_krw: number
          credit_count: number
          instructor_id: string
          memo: string | null
          paid_at: string
          paid_by: string | null
          payout_id: string
        }
        Insert: {
          amount_krw: number
          credit_count?: number
          instructor_id: string
          memo?: string | null
          paid_at?: string
          paid_by?: string | null
          payout_id?: string
        }
        Update: {
          amount_krw?: number
          credit_count?: number
          instructor_id?: string
          memo?: string | null
          paid_at?: string
          paid_by?: string | null
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qna_reward_payouts_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_reward_payouts_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_reward_payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_reward_payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      qna_reward_settings: {
        Row: {
          id: boolean
          is_active: boolean
          payout_threshold_krw: number
          unit_krw: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          is_active?: boolean
          payout_threshold_krw?: number
          unit_krw?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          is_active?: boolean
          payout_threshold_krw?: number
          unit_krw?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qna_reward_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "qna_reward_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      qna_threads: {
        Row: {
          answer_md: string | null
          answered_at: string | null
          answerer_id: string | null
          archive_key: string | null
          archive_source: string | null
          asker_id: string
          created_at: string
          deleted_at: string | null
          display_no: number
          node_id: string | null
          quality_grade: Database["public"]["Enums"]["qna_quality_grade"] | null
          question_md: string
          science_section_id: string | null
          status: Database["public"]["Enums"]["qna_status"]
          subject: string | null
          target_id: string | null
          target_type: Database["public"]["Enums"]["qna_target_type"]
          thread_id: string
          title: string
          updated_at: string
        }
        Insert: {
          answer_md?: string | null
          answered_at?: string | null
          answerer_id?: string | null
          archive_key?: string | null
          archive_source?: string | null
          asker_id: string
          created_at?: string
          deleted_at?: string | null
          display_no?: number
          node_id?: string | null
          quality_grade?:
            | Database["public"]["Enums"]["qna_quality_grade"]
            | null
          question_md: string
          science_section_id?: string | null
          status?: Database["public"]["Enums"]["qna_status"]
          subject?: string | null
          target_id?: string | null
          target_type: Database["public"]["Enums"]["qna_target_type"]
          thread_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          answer_md?: string | null
          answered_at?: string | null
          answerer_id?: string | null
          archive_key?: string | null
          archive_source?: string | null
          asker_id?: string
          created_at?: string
          deleted_at?: string | null
          display_no?: number
          node_id?: string | null
          quality_grade?:
            | Database["public"]["Enums"]["qna_quality_grade"]
            | null
          question_md?: string
          science_section_id?: string | null
          status?: Database["public"]["Enums"]["qna_status"]
          subject?: string | null
          target_id?: string | null
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
          {
            foreignKeyName: "qna_threads_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "qna_threads_science_section_id_fkey"
            columns: ["science_section_id"]
            isOneToOne: false
            referencedRelation: "science_sections"
            referencedColumns: ["section_id"]
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
          score_correct: number | null
          score_total: number | null
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
          score_correct?: number | null
          score_total?: number | null
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
          score_correct?: number | null
          score_total?: number | null
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
      reference_articles: {
        Row: {
          article_number: string
          content_md: string
          created_at: string
          ord: number
          ref_article_id: string
          ref_law_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          article_number: string
          content_md: string
          created_at?: string
          ord?: number
          ref_article_id?: string
          ref_law_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          article_number?: string
          content_md?: string
          created_at?: string
          ord?: number
          ref_article_id?: string
          ref_law_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_articles_ref_law_id_fkey"
            columns: ["ref_law_id"]
            isOneToOne: false
            referencedRelation: "reference_laws"
            referencedColumns: ["ref_law_id"]
          },
        ]
      }
      reference_laws: {
        Row: {
          aliases: string[]
          created_at: string
          enforced_at: string | null
          law_mst: string | null
          law_name: string
          ref_law_id: string
          source_fetched_at: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          enforced_at?: string | null
          law_mst?: string | null
          law_name: string
          ref_law_id?: string
          source_fetched_at?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          enforced_at?: string | null
          law_mst?: string | null
          law_name?: string
          ref_law_id?: string
          source_fetched_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          created_at: string
          order_item_id: string
          reason: string
          refund_request_id: string
          refunded_krw: number | null
          resolve_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          order_item_id: string
          reason: string
          refund_request_id?: string
          refunded_krw?: number | null
          resolve_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          order_item_id?: string
          reason?: string
          refund_request_id?: string
          refunded_krw?: number | null
          resolve_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "refund_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "refund_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "refund_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "refund_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      revision_suppress_windows: {
        Row: {
          closed_at: string | null
          created_by: string | null
          expires_at: string
          reason: string
          scope: string[] | null
          started_at: string
          window_id: string
        }
        Insert: {
          closed_at?: string | null
          created_by?: string | null
          expires_at: string
          reason: string
          scope?: string[] | null
          started_at?: string
          window_id?: string
        }
        Update: {
          closed_at?: string | null
          created_by?: string | null
          expires_at?: string
          reason?: string
          scope?: string[] | null
          started_at?: string
          window_id?: string
        }
        Relationships: []
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
      shipments: {
        Row: {
          address: Json | null
          courier: string | null
          created_at: string
          delivered_at: string | null
          order_item_id: string
          shipment_id: string
          shipped_at: string | null
          status: string
          tracking_no: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          courier?: string | null
          created_at?: string
          delivered_at?: string | null
          order_item_id: string
          shipment_id?: string
          shipped_at?: string | null
          status?: string
          tracking_no?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          courier?: string | null
          created_at?: string
          delivered_at?: string | null
          order_item_id?: string
          shipment_id?: string
          shipped_at?: string | null
          status?: string
          tracking_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
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
          importance: number
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
          importance?: number
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
          importance?: number
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
          bookmark_min: number
          created_at: string
          importance_min: number
          max_reviews_per_day: number
          new_per_day: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmark_min?: number
          created_at?: string
          importance_min?: number
          max_reviews_per_day?: number
          new_per_day?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmark_min?: number
          created_at?: string
          importance_min?: number
          max_reviews_per_day?: number
          new_per_day?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_duty_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          duty: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duty: string
          profile_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duty?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_duty_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "staff_duty_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "staff_duty_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "staff_duty_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_diagnostics: {
        Row: {
          attempt_type: string
          cohort_id: string
          created_at: string
          entry_month: number | null
          entry_year: number | null
          note: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          weekday_minutes: number
          weekend_minutes: number
        }
        Insert: {
          attempt_type: string
          cohort_id: string
          created_at?: string
          entry_month?: number | null
          entry_year?: number | null
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          weekday_minutes: number
          weekend_minutes: number
        }
        Update: {
          attempt_type?: string
          cohort_id?: string
          created_at?: string
          entry_month?: number | null
          entry_year?: number | null
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          weekday_minutes?: number
          weekend_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_diagnostics_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "student_diagnostics_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_diagnostics_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_diagnostics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_diagnostics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_notes: {
        Row: {
          author_id: string
          body_md: string
          created_at: string
          deleted_at: string | null
          is_pinned: boolean
          note_id: string
          read_at: string | null
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
          read_at?: string | null
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
          read_at?: string | null
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
      student_study_prefs: {
        Row: {
          record_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          record_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          record_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_study_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_study_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_subject_colors: {
        Row: {
          color_key: string
          subject_code: string
          subject_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_key: string
          subject_code: string
          subject_kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_key?: string
          subject_code?: string
          subject_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subject_colors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_subject_colors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_subject_status: {
        Row: {
          basic_course_status: string | null
          completed_lectures: string | null
          diagnostic_test_id: string | null
          direction: string | null
          lecture_stage: string | null
          science_score: number | null
          science_tier: string | null
          science_total: number | null
          study_direction: string | null
          subject_code: string
          subject_kind: string
          tier_source: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          basic_course_status?: string | null
          completed_lectures?: string | null
          diagnostic_test_id?: string | null
          direction?: string | null
          lecture_stage?: string | null
          science_score?: number | null
          science_tier?: string | null
          science_total?: number | null
          study_direction?: string | null
          subject_code: string
          subject_kind: string
          tier_source?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          basic_course_status?: string | null
          completed_lectures?: string | null
          diagnostic_test_id?: string | null
          direction?: string | null
          lecture_stage?: string | null
          science_score?: number | null
          science_tier?: string | null
          science_total?: number | null
          study_direction?: string | null
          subject_code?: string
          subject_kind?: string
          tier_source?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subject_status_diagnostic_test_id_fkey"
            columns: ["diagnostic_test_id"]
            isOneToOne: false
            referencedRelation: "offline_tests"
            referencedColumns: ["test_id"]
          },
          {
            foreignKeyName: "student_subject_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_subject_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_subject_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "student_subject_status_user_id_fkey"
            columns: ["user_id"]
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
          notes: string | null
          target_score: number | null
          updated_at: string
          user_id: string
          weekly_goal_hours: number
        }
        Insert: {
          exam_date?: string | null
          notes?: string | null
          target_score?: number | null
          updated_at?: string
          user_id: string
          weekly_goal_hours?: number
        }
        Update: {
          exam_date?: string | null
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
      study_logs: {
        Row: {
          activity_type: string
          completion: string
          created_at: string
          ended_at: string | null
          lesson_id: string | null
          log_date: string
          log_id: string
          minutes: number
          node_id: string | null
          node_resolved_from: string | null
          plan_item_id: string | null
          reverses_log_id: string | null
          self_difficulty: number | null
          source: string
          started_at: string | null
          subject_code: string | null
          subject_kind: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          completion?: string
          created_at?: string
          ended_at?: string | null
          lesson_id?: string | null
          log_date: string
          log_id?: string
          minutes: number
          node_id?: string | null
          node_resolved_from?: string | null
          plan_item_id?: string | null
          reverses_log_id?: string | null
          self_difficulty?: number | null
          source: string
          started_at?: string | null
          subject_code?: string | null
          subject_kind?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          completion?: string
          created_at?: string
          ended_at?: string | null
          lesson_id?: string | null
          log_date?: string
          log_id?: string
          minutes?: number
          node_id?: string | null
          node_resolved_from?: string | null
          plan_item_id?: string | null
          reverses_log_id?: string | null
          self_difficulty?: number | null
          source?: string
          started_at?: string | null
          subject_code?: string | null
          subject_kind?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_logs_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "study_logs_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "study_logs_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "study_plan_items"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "study_logs_reverses_log_id_fkey"
            columns: ["reverses_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["log_id"]
          },
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      study_plan_checkpoints: {
        Row: {
          actual_minutes_to_date: number
          checkpoint_date: string
          checkpoint_id: string
          created_at: string
          created_by: string | null
          item_breakdown: Json
          note: string | null
          plan_id: string
          planned_minutes_to_date: number
        }
        Insert: {
          actual_minutes_to_date: number
          checkpoint_date: string
          checkpoint_id?: string
          created_at?: string
          created_by?: string | null
          item_breakdown?: Json
          note?: string | null
          plan_id: string
          planned_minutes_to_date: number
        }
        Update: {
          actual_minutes_to_date?: number
          checkpoint_date?: string
          checkpoint_id?: string
          created_at?: string
          created_by?: string | null
          item_breakdown?: Json
          note?: string | null
          plan_id?: string
          planned_minutes_to_date?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_checkpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plan_checkpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plan_checkpoints_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      study_plan_items: {
        Row: {
          activity_type: string
          created_at: string
          daily_minutes: number
          day_scope: string
          end_date: string
          is_locked: boolean
          item_id: string
          lesson_id: string | null
          node_id: string | null
          plan_id: string
          priority: number | null
          start_date: string
          subject_code: string | null
          subject_kind: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          daily_minutes: number
          day_scope: string
          end_date: string
          is_locked?: boolean
          item_id?: string
          lesson_id?: string | null
          node_id?: string | null
          plan_id: string
          priority?: number | null
          start_date: string
          subject_code?: string | null
          subject_kind?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          daily_minutes?: number
          day_scope?: string
          end_date?: string
          is_locked?: boolean
          item_id?: string
          lesson_id?: string | null
          node_id?: string | null
          plan_id?: string
          priority?: number | null
          start_date?: string
          subject_code?: string | null
          subject_kind?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_items_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "study_plan_items_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "study_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "study_plan_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plan_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      study_plans: {
        Row: {
          authored_by: string | null
          baseline_locked_at: string | null
          cohort_id: string
          created_at: string
          period_end: string
          period_start: string
          plan_id: string
          planned_weekday_minutes: number | null
          planned_weekend_minutes: number | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          root_plan_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          authored_by?: string | null
          baseline_locked_at?: string | null
          cohort_id: string
          created_at?: string
          period_end: string
          period_start: string
          plan_id?: string
          planned_weekday_minutes?: number | null
          planned_weekend_minutes?: number | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          root_plan_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          authored_by?: string | null
          baseline_locked_at?: string | null
          cohort_id?: string
          created_at?: string
          period_end?: string
          period_start?: string
          plan_id?: string
          planned_weekday_minutes?: number | null
          planned_weekend_minutes?: number | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          root_plan_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_authored_by_fkey"
            columns: ["authored_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plans_authored_by_fkey"
            columns: ["authored_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plans_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["cohort_id"]
          },
          {
            foreignKeyName: "study_plans_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plans_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plans_root_plan_id_fkey"
            columns: ["root_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "study_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      study_timer_sessions: {
        Row: {
          activity_type: string
          created_at: string
          ended_at: string | null
          log_id: string | null
          node_id: string | null
          paused_at: string | null
          paused_ms: number
          plan_item_id: string | null
          session_id: string
          started_at: string
          subject_code: string | null
          subject_kind: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          ended_at?: string | null
          log_id?: string | null
          node_id?: string | null
          paused_at?: string | null
          paused_ms?: number
          plan_item_id?: string | null
          session_id?: string
          started_at: string
          subject_code?: string | null
          subject_kind?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          ended_at?: string | null
          log_id?: string | null
          node_id?: string | null
          paused_at?: string | null
          paused_ms?: number
          plan_item_id?: string | null
          session_id?: string
          started_at?: string
          subject_code?: string | null
          subject_kind?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_timer_sessions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["log_id"]
          },
          {
            foreignKeyName: "study_timer_sessions_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "systematic_nodes"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "study_timer_sessions_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "study_plan_items"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "study_timer_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "study_timer_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      subscription_admin_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json | null
          log_id: string
          note: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          log_id?: string
          note?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          log_id?: string
          note?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_admin_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "subscription_admin_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "subscription_admin_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_admin_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "subscription_admin_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          available_from: string | null
          category_id: string | null
          code: string
          created_at: string
          description: string | null
          detail_html: string | null
          detail_image_url: string | null
          detail_sections: Json
          display_order: number
          duration_days: number
          features: Json
          is_active: boolean
          lecture_category: string | null
          list_price_krw: number | null
          name: string
          plan_id: string
          price_krw: number
          product_kind: string
          sale_status: string
          subject_codes: Json
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          category_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          detail_html?: string | null
          detail_image_url?: string | null
          detail_sections?: Json
          display_order?: number
          duration_days: number
          features?: Json
          is_active?: boolean
          lecture_category?: string | null
          list_price_krw?: number | null
          name: string
          plan_id?: string
          price_krw: number
          product_kind?: string
          sale_status?: string
          subject_codes?: Json
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          category_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          detail_html?: string | null
          detail_image_url?: string | null
          detail_sections?: Json
          display_order?: number
          duration_days?: number
          features?: Json
          is_active?: boolean
          lecture_category?: string | null
          list_price_krw?: number | null
          name?: string
          plan_id?: string
          price_krw?: number
          product_kind?: string
          sale_status?: string
          subject_codes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      support_faqs: {
        Row: {
          answer: string
          category: string
          created_at: string
          deleted_at: string | null
          faq_id: string
          published: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer?: string
          category?: string
          created_at?: string
          deleted_at?: string | null
          faq_id?: string
          published?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          deleted_at?: string | null
          faq_id?: string
          published?: boolean
          question?: string
          sort_order?: number
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
      user_access_logs: {
        Row: {
          browser: string | null
          client: string | null
          created_at: string
          device: string | null
          ip: string | null
          kind: string
          log_id: string
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          client?: string | null
          created_at?: string
          device?: string | null
          ip?: string | null
          kind?: string
          log_id?: string
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          client?: string | null
          created_at?: string
          device?: string | null
          ip?: string | null
          kind?: string
          log_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
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
      user_coupons: {
        Row: {
          discount_id: string
          expires_at: string | null
          issued_at: string
          issued_reason: string
          order_id: string | null
          used_at: string | null
          user_coupon_id: string
          user_id: string
        }
        Insert: {
          discount_id: string
          expires_at?: string | null
          issued_at?: string
          issued_reason: string
          order_id?: string | null
          used_at?: string | null
          user_coupon_id?: string
          user_id: string
        }
        Update: {
          discount_id?: string
          expires_at?: string | null
          issued_at?: string
          issued_reason?: string
          order_id?: string | null
          used_at?: string | null
          user_coupon_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_coupons_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["discount_id"]
          },
          {
            foreignKeyName: "user_coupons_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "user_coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_coupons_user_id_fkey"
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
      user_devices: {
        Row: {
          device_fingerprint: string | null
          device_id: string
          device_name: string | null
          kind: string
          last_seen_at: string
          registered_at: string
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          device_fingerprint?: string | null
          device_id?: string
          device_name?: string | null
          kind: string
          last_seen_at?: string
          registered_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          device_fingerprint?: string | null
          device_id?: string
          device_name?: string | null
          kind?: string
          last_seen_at?: string
          registered_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_gamification: {
        Row: {
          created_at: string
          last_active_date: string | null
          level_seen: number
          longest_streak_days: number
          streak_freezes_remaining: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_active_date?: string | null
          level_seen?: number
          longest_streak_days?: number
          streak_freezes_remaining?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_active_date?: string | null
          level_seen?: number
          longest_streak_days?: number
          streak_freezes_remaining?: number
          updated_at?: string
          user_id?: string
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
      user_ox_hidden: {
        Row: {
          created_at: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
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
          ai_axis_scores: Json | null
          ai_feedback_md: string | null
          ai_graded_at: string | null
          ai_overall_score: number | null
          analysis_md: string
          answer_md: string
          attempt_id: string
          created_at: string
          deleted_at: string | null
          issues_md: string
          outline_md: string
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
          timed_elapsed_sec: number | null
          timed_limit_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_axis_scores?: Json | null
          ai_feedback_md?: string | null
          ai_graded_at?: string | null
          ai_overall_score?: number | null
          analysis_md?: string
          answer_md?: string
          attempt_id?: string
          created_at?: string
          deleted_at?: string | null
          issues_md?: string
          outline_md?: string
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
          timed_elapsed_sec?: number | null
          timed_limit_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_axis_scores?: Json | null
          ai_feedback_md?: string | null
          ai_graded_at?: string | null
          ai_overall_score?: number | null
          analysis_md?: string
          answer_md?: string
          attempt_id?: string
          created_at?: string
          deleted_at?: string | null
          issues_md?: string
          outline_md?: string
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
          timed_elapsed_sec?: number | null
          timed_limit_min?: number | null
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
          admin_note: string | null
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          expires_at: string
          failure_count: number
          grace_until: string | null
          granted_by: string | null
          last_failure_at: string | null
          last_failure_reason: string | null
          next_retry_at: string | null
          payment_id: string | null
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          subject_code: string | null
          subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          failure_count?: number
          grace_until?: string | null
          granted_by?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          next_retry_at?: string | null
          payment_id?: string | null
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subject_code?: string | null
          subscription_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          failure_count?: number
          grace_until?: string | null
          granted_by?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          next_retry_at?: string | null
          payment_id?: string | null
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subject_code?: string | null
          subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_subscriptions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
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
      user_withdrawals: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          member_no: number | null
          reason: string | null
          status: string
          user_id: string | null
          user_login_id: string | null
          user_name: string | null
          withdrawal_id: string
          withdrawn_at: string
          withdrawn_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          member_no?: number | null
          reason?: string | null
          status?: string
          user_id?: string | null
          user_login_id?: string | null
          user_name?: string | null
          withdrawal_id?: string
          withdrawn_at?: string
          withdrawn_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          member_no?: number | null
          reason?: string | null
          status?: string
          user_id?: string | null
          user_login_id?: string | null
          user_name?: string | null
          withdrawal_id?: string
          withdrawn_at?: string
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_withdrawals_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_withdrawals_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_withdrawals_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_withdrawals_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      video_contents: {
        Row: {
          admin_memo: string | null
          completion_threshold: number
          content_id: string
          content_key: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          drm_provider: string
          duration_seconds: number | null
          encoding_status: string
          group_id: string | null
          is_active: boolean
          original_filename: string | null
          synced_at: string | null
          title: string
          updated_at: string
          upload_file_key: string | null
          use_status: string
        }
        Insert: {
          admin_memo?: string | null
          completion_threshold?: number
          content_id?: string
          content_key: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drm_provider?: string
          duration_seconds?: number | null
          encoding_status?: string
          group_id?: string | null
          is_active?: boolean
          original_filename?: string | null
          synced_at?: string | null
          title: string
          updated_at?: string
          upload_file_key?: string | null
          use_status?: string
        }
        Update: {
          admin_memo?: string | null
          completion_threshold?: number
          content_id?: string
          content_key?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drm_provider?: string
          duration_seconds?: number | null
          encoding_status?: string
          group_id?: string | null
          is_active?: boolean
          original_filename?: string | null
          synced_at?: string | null
          title?: string
          updated_at?: string
          upload_file_key?: string | null
          use_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_contents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "video_contents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "video_contents_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      watch_events: {
        Row: {
          client_seq: number
          enrollment_id: string | null
          event_id: number
          from_seconds: number
          grant_id: string
          lesson_id: string
          reported_at: string
          to_seconds: number
          user_id: string | null
          video_id: string
        }
        Insert: {
          client_seq: number
          enrollment_id?: string | null
          event_id?: never
          from_seconds: number
          grant_id: string
          lesson_id: string
          reported_at?: string
          to_seconds: number
          user_id?: string | null
          video_id: string
        }
        Update: {
          client_seq?: number
          enrollment_id?: string | null
          event_id?: never
          from_seconds?: number
          grant_id?: string
          lesson_id?: string
          reported_at?: string
          to_seconds?: number
          user_id?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "watch_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_enrollment_watch_balance"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "watch_events_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "playback_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "watch_events_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "watch_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "watch_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "watch_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "lesson_videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      watch_ledger: {
        Row: {
          actor_id: string | null
          created_at: string
          enrollment_id: string
          kind: string
          ledger_id: number
          lesson_id: string | null
          reason: string | null
          seconds: number
          source_event_id: number | null
          video_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          enrollment_id: string
          kind: string
          ledger_id?: never
          lesson_id?: string | null
          reason?: string | null
          seconds: number
          source_event_id?: number | null
          video_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          enrollment_id?: string
          kind?: string
          ledger_id?: never
          lesson_id?: string | null
          reason?: string | null
          seconds?: number
          source_event_id?: number | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watch_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "watch_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "watch_ledger_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "watch_ledger_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_enrollment_watch_balance"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "watch_ledger_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "watch_ledger_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "watch_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "watch_ledger_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "lesson_videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      watch_positions: {
        Row: {
          lesson_id: string
          position_seconds: number
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          lesson_id: string
          position_seconds?: number
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          lesson_id?: string
          position_seconds?: number
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_positions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "watch_positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "watch_positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "watch_positions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "lesson_videos"
            referencedColumns: ["video_id"]
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
      v_book_stock: {
        Row: {
          book_id: string | null
          stock: number | null
        }
        Insert: {
          book_id?: string | null
          stock?: never
        }
        Update: {
          book_id?: string | null
          stock?: never
        }
        Relationships: []
      }
      v_current_editions: {
        Row: {
          created_at: string | null
          edition_id: string | null
          edition_label: string | null
          edition_seq: number | null
          frozen_at: string | null
          isbn: string | null
          print_date: string | null
          publication_id: string | null
          status: string | null
          target_exam_date: string | null
          target_exam_date_estimate: string | null
          target_exam_year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_editions_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["publication_id"]
          },
        ]
      }
      v_enrollment_watch_balance: {
        Row: {
          allowed_seconds: number | null
          base_duration_snapshot_seconds: number | null
          course_id: string | null
          enrollment_id: string | null
          multiplier_snapshot: number | null
          remaining_seconds: number | null
          used_seconds: number | null
          user_id: string | null
        }
        Insert: {
          allowed_seconds?: never
          base_duration_snapshot_seconds?: number | null
          course_id?: string | null
          enrollment_id?: string | null
          multiplier_snapshot?: number | null
          remaining_seconds?: never
          used_seconds?: never
          user_id?: string | null
        }
        Update: {
          allowed_seconds?: never
          base_duration_snapshot_seconds?: number | null
          course_id?: string | null
          enrollment_id?: string | null
          multiplier_snapshot?: number | null
          remaining_seconds?: never
          used_seconds?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      v_errata_sheet: {
        Row: {
          content_id: string | null
          content_type: string | null
          edition_id: string | null
          edition_label: string | null
          effective_date: string | null
          errata_kind: string | null
          errata_payload: Json | null
          errata_reason: string | null
          errata_severity: string | null
          errata_title: string | null
          exam_scope: string | null
          line_hint: string | null
          notice_status: string | null
          page_no: number | null
          page_no_end: number | null
          publication_title: string | null
          published_at: string | null
          revision_id: string | null
          sort_key: number | null
          source_ref: Json | null
          target_exam_date: string | null
          toc_path: string | null
          withdrawn_at: string | null
          withdraws_revision_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_withdraws_revision_id_fkey"
            columns: ["withdraws_revision_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "content_revisions_withdraws_revision_id_fkey"
            columns: ["withdraws_revision_id"]
            isOneToOne: false
            referencedRelation: "v_errata_sheet"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "content_revisions_withdraws_revision_id_fkey"
            columns: ["withdraws_revision_id"]
            isOneToOne: false
            referencedRelation: "v_revision_recent"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "publication_content_map_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "publication_editions"
            referencedColumns: ["edition_id"]
          },
          {
            foreignKeyName: "publication_content_map_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "v_current_editions"
            referencedColumns: ["edition_id"]
          },
        ]
      }
      v_revision_merge_pending: {
        Row: {
          cnt: number | null
          content_type: string | null
          latest: string | null
          oldest: string | null
          subject_code: string | null
        }
        Relationships: []
      }
      v_revision_recent: {
        Row: {
          apply_status: string | null
          changed_fields: string[] | null
          content_id: string | null
          content_type: string | null
          created_at: string | null
          created_by_label: string | null
          merge_status: string | null
          node_id: string | null
          notice_status: string | null
          op: string | null
          revision_id: string | null
          subject_code: string | null
        }
        Insert: {
          apply_status?: string | null
          changed_fields?: string[] | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string | null
          created_by_label?: string | null
          merge_status?: string | null
          node_id?: string | null
          notice_status?: string | null
          op?: string | null
          revision_id?: string | null
          subject_code?: string | null
        }
        Update: {
          apply_status?: string | null
          changed_fields?: string[] | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string | null
          created_by_label?: string | null
          merge_status?: string | null
          node_id?: string | null
          notice_status?: string | null
          op?: string | null
          revision_id?: string | null
          subject_code?: string | null
        }
        Relationships: []
      }
      v_sales_books: {
        Row: {
          book_id: string | null
          gross_krw: number | null
          sold_count: number | null
          title: string | null
        }
        Relationships: []
      }
      v_sales_daily: {
        Row: {
          gross_krw: number | null
          orders_count: number | null
          refund_krw: number | null
          sale_date: string | null
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
      approve_explanation_draft: {
        Args: { p_draft_id: string }
        Returns: undefined
      }
      approve_study_plan: {
        Args: { p_comment?: string; p_plan_id: string }
        Returns: Json
      }
      approve_text_draft: { Args: { p_draft_id: string }; Returns: undefined }
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
      claim_session: {
        Args: { p_device: string; p_sid: string }
        Returns: undefined
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
      fn_close_suppress_window: {
        Args: { p_window_id: string }
        Returns: undefined
      }
      fn_open_suppress_window: {
        Args: { p_minutes?: number; p_reason: string; p_scope?: string[] }
        Returns: string
      }
      fn_problem_content_type: { Args: { p_format: string }; Returns: string }
      fn_publish_errata: {
        Args: {
          p_errata_kind: string
          p_errata_payload: Json
          p_errata_reason: string
          p_errata_severity: string
          p_errata_title: string
          p_revision_ids: string[]
          p_source_edition_id?: string
        }
        Returns: string[]
      }
      fn_revision_suppressed: {
        Args: { p_content_type: string }
        Returns: boolean
      }
      fn_withdraw_errata: {
        Args: { p_notify?: boolean; p_reason: string; p_revision_id: string }
        Returns: string
      }
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
      lms_lesson_usage_seconds: {
        Args: { p_enrollment_id: string; p_lesson_ids: string[] }
        Returns: {
          lesson_id: string
          seconds: number
        }[]
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
      release_session: { Args: never; Returns: undefined }
      scan_exam_case_links: { Args: never; Returns: number }
      search_articles_ranked: {
        Args: { lim?: number; q: string; search_scope?: string }
        Returns: {
          article_id: string
          score: number
        }[]
      }
      search_cases_ranked: {
        Args: { lim?: number; q: string; search_scope?: string }
        Returns: {
          case_id: string
          score: number
        }[]
      }
      search_problems_ranked: {
        Args: { lim?: number; q: string; search_scope?: string }
        Returns: {
          problem_id: string
          score: number
        }[]
      }
      set_cohort_board_post_pinned: {
        Args: { p_pinned: boolean; p_post_id: string }
        Returns: undefined
      }
      set_qna_ai_feedback: {
        Args: { p_feedback: number; p_message_id: string }
        Returns: undefined
      }
      soft_delete_book_update: { Args: { p_id: string }; Returns: undefined }
      soft_delete_cohort_board: {
        Args: { p_board_id: string }
        Returns: undefined
      }
      soft_delete_cohort_board_comment: {
        Args: { p_comment_id: string }
        Returns: undefined
      }
      soft_delete_cohort_board_post: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      soft_delete_community_comment: {
        Args: { p_id: string }
        Returns: undefined
      }
      soft_delete_community_post: { Args: { p_id: string }; Returns: undefined }
      soft_delete_cs_inquiry: {
        Args: { p_inquiry_id: string }
        Returns: undefined
      }
      soft_delete_cs_inquiry_reply: {
        Args: { p_reply_id: string }
        Returns: undefined
      }
      soft_delete_lecture_resource: {
        Args: { p_resource_id: string }
        Returns: undefined
      }
      soft_delete_mcq_exam: { Args: { p_id: string }; Returns: undefined }
      soft_delete_mcq_pack: { Args: { p_id: string }; Returns: undefined }
      soft_delete_paper: { Args: { p_id: string }; Returns: undefined }
      soft_delete_qna_message: { Args: { p_id: string }; Returns: undefined }
      soft_delete_qna_thread: { Args: { p_id: string }; Returns: undefined }
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
      user_can_attach_cohort_post: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_read_cohort_board: {
        Args: { p_board_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_read_cohort_post: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_read_cs_inquiry: {
        Args: { p_inquiry_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_reply_cs_inquiry: {
        Args: { p_inquiry_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_write_cohort_board: {
        Args: { p_board_id: string; p_user_id: string }
        Returns: boolean
      }
      user_can_write_cohort_post: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      user_is_in_cohort: {
        Args: { p_cohort_id: string; p_user_id: string }
        Returns: boolean
      }
      user_manages_cohort_board: {
        Args: { p_board_id: string; p_user_id: string }
        Returns: boolean
      }
      user_manages_cohort_post: {
        Args: { p_post_id: string; p_user_id: string }
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
        | "dohae_unit"
      announcement_audience_kind: "all" | "cohort" | "user" | "staff"
      announcement_audience_target: "cohort" | "user"
      announcement_platform_scope: "study" | "lecture" | "both"
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
        | "qna"
      cohort_board_attachment_kind: "image" | "pdf" | "file"
      cohort_board_write_scope: "staff" | "members"
      community_board: "free" | "study" | "review"
      community_post_attachment_kind: "image" | "pdf" | "file"
      community_report_status: "pending" | "resolved" | "dismissed"
      community_report_target: "post" | "comment"
      content_comment_target_type:
        | "article"
        | "case"
        | "problem"
        | "problem_choice"
        | "problem_box_item"
      cs_inquiry_category:
        | "payment"
        | "course"
        | "book"
        | "account"
        | "site"
        | "etc"
      cs_inquiry_status: "open" | "answered" | "closed"
      curriculum_item_kind:
        | "article"
        | "case"
        | "problem"
        | "blank_set"
        | "recitation"
        | "lecture"
      curriculum_item_phase: "pre" | "post"
      deadline_policy: "recommended" | "late_allowed" | "strict"
      exam_result_status: "absent" | "pending" | "failed" | "passed"
      exam_round: "first" | "second"
      exam_verification_status:
        | "self_reported"
        | "document_submitted"
        | "verified"
        | "rejected"
      explanation_draft_status: "pending" | "approved" | "rejected"
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
      qna_message_role: "student" | "ai" | "instructor"
      qna_quality_grade: "very_high" | "high" | "mid" | "low" | "very_low"
      qna_status: "open" | "answered" | "closed" | "ai_answered" | "verified"
      qna_target_type:
        | "article"
        | "case"
        | "problem"
        | "study_method"
        | "general"
        | "node"
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
        | "bug_report_created"
        | "trial_expiry_warning"
        | "cohort_upgrade_requested"
        | "cohort_upgrade_processed"
        | "trial_ended"
        | "lecture_note_abuse"
        | "bug_report_resolved"
        | "staff_message"
        | "book_restock"
        | "cs_inquiry_created"
        | "cs_inquiry_answered"
        | "payment_failed"
        | "subscription_lapsed"
        | "security_alert"
        | "broadcast_message"
        | "coupon_granted"
        | "study_plan_updated_by_staff"
        | "dohae_abuse"
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
        "dohae_unit",
      ],
      announcement_audience_kind: ["all", "cohort", "user", "staff"],
      announcement_audience_target: ["cohort", "user"],
      announcement_platform_scope: ["study", "lecture", "both"],
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
      chunk_source_type: [
        "article",
        "case",
        "problem",
        "textbook",
        "practice",
        "qna",
      ],
      cohort_board_attachment_kind: ["image", "pdf", "file"],
      cohort_board_write_scope: ["staff", "members"],
      community_board: ["free", "study", "review"],
      community_post_attachment_kind: ["image", "pdf", "file"],
      community_report_status: ["pending", "resolved", "dismissed"],
      community_report_target: ["post", "comment"],
      content_comment_target_type: [
        "article",
        "case",
        "problem",
        "problem_choice",
        "problem_box_item",
      ],
      cs_inquiry_category: [
        "payment",
        "course",
        "book",
        "account",
        "site",
        "etc",
      ],
      cs_inquiry_status: ["open", "answered", "closed"],
      curriculum_item_kind: [
        "article",
        "case",
        "problem",
        "blank_set",
        "recitation",
        "lecture",
      ],
      curriculum_item_phase: ["pre", "post"],
      deadline_policy: ["recommended", "late_allowed", "strict"],
      exam_result_status: ["absent", "pending", "failed", "passed"],
      exam_round: ["first", "second"],
      exam_verification_status: [
        "self_reported",
        "document_submitted",
        "verified",
        "rejected",
      ],
      explanation_draft_status: ["pending", "approved", "rejected"],
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
      qna_message_role: ["student", "ai", "instructor"],
      qna_quality_grade: ["very_high", "high", "mid", "low", "very_low"],
      qna_status: ["open", "answered", "closed", "ai_answered", "verified"],
      qna_target_type: [
        "article",
        "case",
        "problem",
        "study_method",
        "general",
        "node",
      ],
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
        "bug_report_created",
        "trial_expiry_warning",
        "cohort_upgrade_requested",
        "cohort_upgrade_processed",
        "trial_ended",
        "lecture_note_abuse",
        "bug_report_resolved",
        "staff_message",
        "book_restock",
        "cs_inquiry_created",
        "cs_inquiry_answered",
        "payment_failed",
        "subscription_lapsed",
        "security_alert",
        "broadcast_message",
        "coupon_granted",
        "study_plan_updated_by_staff",
        "dohae_abuse",
      ],
      student_note_visibility: ["staff_only", "share_with_student"],
      subjective_kind: ["case_based", "theory", "mixed"],
      subscription_status: ["pending", "active", "expired", "cancelled"],
      user_role: ["student", "instructor", "manager", "admin"],
    },
  },
} as const
