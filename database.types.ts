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
        ]
      }
      article_comments: {
        Row: {
          article_id: string
          author_id: string | null
          body_md: string
          comment_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          article_id: string
          author_id?: string | null
          body_md: string
          comment_id?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          author_id?: string | null
          body_md?: string
          comment_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_comments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: true
            referencedRelation: "articles"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "article_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      article_revisions: {
        Row: {
          article_id: string
          body_json: Json
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
          importance: number | null
          is_en_banc: boolean
          reasoning_md: string | null
          search_tsv: unknown
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
          importance?: number | null
          is_en_banc?: boolean
          reasoning_md?: string | null
          search_tsv?: unknown
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
          importance?: number | null
          is_en_banc?: boolean
          reasoning_md?: string | null
          search_tsv?: unknown
          subject_laws?: string[]
          summary_body_md?: string | null
          summary_items?: Json
          summary_title?: string | null
          updated_at?: string
        }
        Relationships: []
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
          explanation_md: string | null
          law_id: string
          law_revision_id: string
          promulgated_at: string | null
          published_at: string | null
          published_by: string | null
          reason_md: string | null
          revision_number: string
          status: string
          video_url: string | null
        }
        Insert: {
          comparison_pdf?: string | null
          created_at?: string
          effective_date?: string | null
          explanation_md?: string | null
          law_id: string
          law_revision_id?: string
          promulgated_at?: string | null
          published_at?: string | null
          published_by?: string | null
          reason_md?: string | null
          revision_number: string
          status?: string
          video_url?: string | null
        }
        Update: {
          comparison_pdf?: string | null
          created_at?: string
          effective_date?: string | null
          explanation_md?: string | null
          law_id?: string
          law_revision_id?: string
          promulgated_at?: string | null
          published_at?: string | null
          published_by?: string | null
          reason_md?: string | null
          revision_number?: string
          status?: string
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
          {
            foreignKeyName: "law_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
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
          body_md: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          exam_round: Database["public"]["Enums"]["problem_exam_round"]
          exam_round_no: number | null
          examined_at: string | null
          explanation_md: string | null
          format: Database["public"]["Enums"]["problem_format"]
          grading_rubric_md: string | null
          law_id: string | null
          mismatch_flagged_at: string | null
          mismatch_flagged_by: string | null
          model_answer_md: string | null
          origin: Database["public"]["Enums"]["problem_origin"]
          polarity: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id: string | null
          problem_id: string
          problem_number: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          science_section_id: string | null
          science_subject: Database["public"]["Enums"]["science_subject"] | null
          scope: Database["public"]["Enums"]["problem_scope"] | null
          source_doc_id: string | null
          subject_type: Database["public"]["Enums"]["problem_subject_type"]
          total_points: number | null
          updated_at: string
          video_url: string | null
          year: number | null
        }
        Insert: {
          body_md: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exam_round: Database["public"]["Enums"]["problem_exam_round"]
          exam_round_no?: number | null
          examined_at?: string | null
          explanation_md?: string | null
          format: Database["public"]["Enums"]["problem_format"]
          grading_rubric_md?: string | null
          law_id?: string | null
          mismatch_flagged_at?: string | null
          mismatch_flagged_by?: string | null
          model_answer_md?: string | null
          origin: Database["public"]["Enums"]["problem_origin"]
          polarity?: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id?: string | null
          problem_id?: string
          problem_number?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          science_section_id?: string | null
          science_subject?:
            | Database["public"]["Enums"]["science_subject"]
            | null
          scope?: Database["public"]["Enums"]["problem_scope"] | null
          source_doc_id?: string | null
          subject_type: Database["public"]["Enums"]["problem_subject_type"]
          total_points?: number | null
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Update: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          exam_round?: Database["public"]["Enums"]["problem_exam_round"]
          exam_round_no?: number | null
          examined_at?: string | null
          explanation_md?: string | null
          format?: Database["public"]["Enums"]["problem_format"]
          grading_rubric_md?: string | null
          law_id?: string | null
          mismatch_flagged_at?: string | null
          mismatch_flagged_by?: string | null
          model_answer_md?: string | null
          origin?: Database["public"]["Enums"]["problem_origin"]
          polarity?: Database["public"]["Enums"]["problem_polarity"] | null
          primary_article_id?: string | null
          problem_id?: string
          problem_number?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          science_section_id?: string | null
          science_subject?:
            | Database["public"]["Enums"]["science_subject"]
            | null
          scope?: Database["public"]["Enums"]["problem_scope"] | null
          source_doc_id?: string | null
          subject_type?: Database["public"]["Enums"]["problem_subject_type"]
          total_points?: number | null
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "problems_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          marketing_consent: boolean
          name: string
          notify_channels: string[]
          phone_e164: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          marketing_consent?: boolean
          name: string
          notify_channels?: string[]
          phone_e164?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          marketing_consent?: boolean
          name?: string
          notify_channels?: string[]
          phone_e164?: string | null
          profile_id?: string
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
            foreignKeyName: "qna_threads_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
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
        ]
      }
      systematic_nodes: {
        Row: {
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
        ]
      }
      user_highlights: {
        Row: {
          color: string
          content_hash: string
          created_at: string
          deleted_at: string | null
          end_offset: number
          field_path: string
          highlight_id: string
          label: string | null
          start_offset: number
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          user_id: string
        }
        Insert: {
          color: string
          content_hash: string
          created_at?: string
          deleted_at?: string | null
          end_offset: number
          field_path: string
          highlight_id?: string
          label?: string | null
          start_offset: number
          target_id: string
          target_type: Database["public"]["Enums"]["annotation_target_type"]
          user_id: string
        }
        Update: {
          color?: string
          content_hash?: string
          created_at?: string
          deleted_at?: string | null
          end_offset?: number
          field_path?: string
          highlight_id?: string
          label?: string | null
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
        ]
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
    }
    Functions: {
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
      publish_law_revision: {
        Args: {
          p_effective_date: string
          p_law_revision_id: string
          p_promulgated_at: string
          p_published_by: string
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
      annotation_target_type:
        | "article"
        | "case"
        | "problem"
        | "problem_choice"
        | "problem_box_item"
      announcement_audience_kind: "all" | "cohort" | "user"
      announcement_audience_target: "cohort" | "user"
      article_level: "part" | "chapter" | "section" | "article"
      auto_blank_type: "subject" | "period"
      case_court: "supreme" | "patent_court" | "high_court" | "district_court"
      gs_round_status: "draft" | "published" | "closed"
      law_change_kind: "created" | "amended" | "deleted"
      ox_truth: "O" | "X"
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
      problem_origin: "past_exam" | "past_exam_variant" | "expected" | "mock"
      problem_polarity: "positive" | "negative"
      problem_scope: "unit" | "comprehensive"
      problem_source_doc_kind: "problem" | "answer"
      problem_subject_type: "law" | "science"
      qna_quality_grade: "high" | "mid" | "low"
      qna_status: "open" | "answered" | "closed"
      qna_target_type: "article" | "case" | "problem"
      science_subject: "physics" | "chemistry" | "biology" | "earth_science"
      user_role: "student" | "instructor" | "admin"
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
      auto_blank_type: ["subject", "period"],
      case_court: ["supreme", "patent_court", "high_court", "district_court"],
      gs_round_status: ["draft", "published", "closed"],
      law_change_kind: ["created", "amended", "deleted"],
      ox_truth: ["O", "X"],
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
      problem_origin: ["past_exam", "past_exam_variant", "expected", "mock"],
      problem_polarity: ["positive", "negative"],
      problem_scope: ["unit", "comprehensive"],
      problem_source_doc_kind: ["problem", "answer"],
      problem_subject_type: ["law", "science"],
      qna_quality_grade: ["high", "mid", "low"],
      qna_status: ["open", "answered", "closed"],
      qna_target_type: ["article", "case", "problem"],
      science_subject: ["physics", "chemistry", "biology", "earth_science"],
      user_role: ["student", "instructor", "admin"],
    },
  },
} as const
