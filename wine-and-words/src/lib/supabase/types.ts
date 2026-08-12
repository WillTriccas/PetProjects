/**
 * Minimal hand-written Database type surface for the Wine & Words schema.
 * Mirrors supabase/migrations/001_schema.sql. In a real project this would
 * be generated with `supabase gen types typescript`, but is hand-authored
 * here to keep the app self-contained without a live Supabase project.
 */

export type EventStatus = "upcoming" | "completed" | "cancelled" | "unscheduled";

export interface Database {
  public: {
    Tables: {
      clubs: {
        Row: {
          id: string;
          name: string;
          access_code_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          access_code_hash: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clubs"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          club_id: string;
          display_name: string;
          bio: string | null;
          avatar_path: string | null;
          favorite_genres: string[] | null;
          accent_color: string | null;
          joined_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          club_id: string;
          display_name: string;
          bio?: string | null;
          avatar_path?: string | null;
          favorite_genres?: string[] | null;
          accent_color?: string | null;
          joined_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      books: {
        Row: {
          id: string;
          club_id: string;
          open_library_key: string | null;
          title: string;
          author: string | null;
          cover_url: string | null;
          description: string | null;
          page_count: number | null;
          published_year: number | null;
          added_by: string | null;
          added_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          open_library_key?: string | null;
          title: string;
          author?: string | null;
          cover_url?: string | null;
          description?: string | null;
          page_count?: number | null;
          published_year?: number | null;
          added_by?: string | null;
          added_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["books"]["Insert"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          club_id: string;
          title: string;
          description: string | null;
          event_date: string | null;
          status: EventStatus;
          host_id: string | null;
          venue_name: string | null;
          locality: string | null;
          lat: number | null;
          lon: number | null;
          food_description: string | null;
          book_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          title: string;
          description?: string | null;
          event_date?: string | null;
          status?: EventStatus;
          host_id?: string | null;
          venue_name?: string | null;
          locality?: string | null;
          lat?: number | null;
          lon?: number | null;
          food_description?: string | null;
          book_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "events_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          id: string;
          event_id: string;
          member_id: string;
          status: "going" | "maybe" | "not_going";
          recorded_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          member_id: string;
          status: "going" | "maybe" | "not_going";
          recorded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attendance"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_questions: {
        Row: {
          id: string;
          event_id: string;
          club_id: string;
          author_id: string;
          parent_id: string | null;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          club_id: string;
          author_id: string;
          parent_id?: string | null;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_questions"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          event_id: string;
          club_id: string;
          member_id: string;
          rating: number;
          body: string | null;
          spoiler_flag: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          club_id: string;
          member_id: string;
          rating: number;
          body?: string | null;
          spoiler_flag?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      weather_snapshots: {
        Row: {
          id: string;
          event_id: string;
          fetched_at: string;
          temperature_c: number | null;
          weather_code: number | null;
          description: string | null;
          icon_url: string | null;
          raw: unknown;
        };
        Insert: {
          id?: string;
          event_id: string;
          fetched_at?: string;
          temperature_c?: number | null;
          weather_code?: number | null;
          description?: string | null;
          icon_url?: string | null;
          raw?: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["weather_snapshots"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          club_id: string;
          recipient_id: string;
          type: string;
          payload: unknown;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          club_id: string;
          recipient_id: string;
          type: string;
          payload?: unknown;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      join_club: {
        Args: {
          p_access_code: string;
          p_display_name: string;
          p_club_id: string;
        };
        Returns: void;
      };
      list_public_clubs: {
        Args: Record<string, never>;
        Returns: { id: string; name: string }[];
      };
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Club = Database["public"]["Tables"]["clubs"]["Row"];
export type Book = Database["public"]["Tables"]["books"]["Row"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type Attendance = Database["public"]["Tables"]["attendance"]["Row"];
export type EventQuestion = Database["public"]["Tables"]["event_questions"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type WeatherSnapshot = Database["public"]["Tables"]["weather_snapshots"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
