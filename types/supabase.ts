export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      blocked_users: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string | null;
          id: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string | null;
          id?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      connections: {
        Row: {
          connection_type: string | null;
          created_at: string | null;
          how_met: string;
          id: string;
          met_through_id: string | null;
          recipient_id: string;
          requester_id: string;
          status: string | null;
          updated_at: string | null;
          upgrade_requested_type: string | null;
          upgrade_requested_by: string | null;
        };
        Insert: {
          connection_type?: string | null;
          created_at?: string | null;
          how_met: string;
          id?: string;
          met_through_id?: string | null;
          recipient_id: string;
          requester_id: string;
          status?: string | null;
          updated_at?: string | null;
          upgrade_requested_type?: string | null;
          upgrade_requested_by?: string | null;
        };
        Update: {
          connection_type?: string | null;
          created_at?: string | null;
          how_met?: string;
          id?: string;
          met_through_id?: string | null;
          recipient_id?: string;
          requester_id?: string;
          status?: string | null;
          updated_at?: string | null;
          upgrade_requested_type?: string | null;
          upgrade_requested_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "connections_met_through_id_fkey";
            columns: ["met_through_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      itineraries: {
        Row: {
          cover_image_url: string | null;
          created_at: string | null;
          description: string | null;
          end_date: string | null;
          id: string;
          owner_id: string;
          start_date: string | null;
          status: string | null;
          summary: string | null;
          timezone: string | null;
          title: string;
          updated_at: string | null;
          visibility: string | null;
        };
        Insert: {
          cover_image_url?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          owner_id: string;
          start_date?: string | null;
          status?: string | null;
          summary?: string | null;
          timezone?: string | null;
          title: string;
          updated_at?: string | null;
          visibility?: string | null;
        };
        Update: {
          cover_image_url?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          owner_id?: string;
          start_date?: string | null;
          status?: string | null;
          summary?: string | null;
          timezone?: string | null;
          title?: string;
          updated_at?: string | null;
          visibility?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itineraries_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      itinerary_checklists: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          id: string;
          itinerary_id: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          itinerary_id: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          itinerary_id?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_checklists_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_checklists_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          }
        ];
      };
      itinerary_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string | null;
          id: string;
          is_deleted: boolean | null;
          is_private: boolean | null;
          itinerary_id: string;
          parent_comment_id: string | null;
          segment_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          is_private?: boolean | null;
          itinerary_id: string;
          parent_comment_id?: string | null;
          segment_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          is_private?: boolean | null;
          itinerary_id?: string;
          parent_comment_id?: string | null;
          segment_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_comments_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_comments_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_segments";
            referencedColumns: ["id"];
          }
        ];
      };
      itinerary_segments: {
        Row: {
          confirmation_code: string | null;
          cost_amount: number | null;
          cost_currency: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          end_time: string | null;
          id: string;
          is_all_day: boolean | null;
          itinerary_id: string;
          location_address: string | null;
          location_lat: number | null;
          location_lng: number | null;
          location_name: string | null;
          metadata: Json | null;
          provider_name: string | null;
          reminder_offset_minutes: number | null;
          seat_info: string | null;
          start_time: string | null;
          title: string;
          transport_number: string | null;
          type: string;
          updated_at: string | null;
        };
        Insert: {
          confirmation_code?: string | null;
          cost_amount?: number | null;
          cost_currency?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          end_time?: string | null;
          id?: string;
          is_all_day?: boolean | null;
          itinerary_id: string;
          location_address?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_name?: string | null;
          metadata?: Json | null;
          provider_name?: string | null;
          reminder_offset_minutes?: number | null;
          seat_info?: string | null;
          start_time?: string | null;
          title: string;
          transport_number?: string | null;
          type: string;
          updated_at?: string | null;
        };
        Update: {
          confirmation_code?: string | null;
          cost_amount?: number | null;
          cost_currency?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          end_time?: string | null;
          id?: string;
          is_all_day?: boolean | null;
          itinerary_id?: string;
          location_address?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_name?: string | null;
          metadata?: Json | null;
          provider_name?: string | null;
          reminder_offset_minutes?: number | null;
          seat_info?: string | null;
          start_time?: string | null;
          title?: string;
          transport_number?: string | null;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_segments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_segments_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          }
        ];
      };
      itinerary_tasks: {
        Row: {
          assignee_id: string | null;
          checklist_id: string | null;
          completed_at: string | null;
          created_at: string | null;
          created_by: string | null;
          due_at: string | null;
          id: string;
          itinerary_id: string;
          notes: string | null;
          priority: string | null;
          status: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          assignee_id?: string | null;
          checklist_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          itinerary_id: string;
          notes?: string | null;
          priority?: string | null;
          status?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          assignee_id?: string | null;
          checklist_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          itinerary_id?: string;
          notes?: string | null;
          priority?: string | null;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_tasks_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_tasks_checklist_id_fkey";
            columns: ["checklist_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_checklists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_tasks_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          }
        ];
      };
      itinerary_travelers: {
        Row: {
          color_hex: string | null;
          created_at: string | null;
          email: string | null;
          id: string;
          invitation_status: string | null;
          itinerary_id: string;
          is_favorite: boolean | null;
          notifications_enabled: boolean | null;
          role: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          color_hex?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          invitation_status?: string | null;
          itinerary_id: string;
          is_favorite?: boolean | null;
          notifications_enabled?: boolean | null;
          role?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          color_hex?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          invitation_status?: string | null;
          itinerary_id?: string;
          is_favorite?: boolean | null;
          notifications_enabled?: boolean | null;
          role?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_travelers_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_travelers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      social_links: {
        Row: {
          created_at: string | null;
          id: string;
          platform: string;
          url: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          platform: string;
          url: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          platform?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "social_links_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      users: {
        Row: {
          bio: string | null;
          created_at: string | null;
          email: string;
          gender: string | null;
          id: string;
          name: string;
          preferred_name: string | null;
          profile_image_url: string | null;
          show_full_name: boolean | null;
          show_gender: boolean | null;
          show_profile_image: boolean | null;
          show_social_links: boolean | null;
          updated_at: string | null;
          username: string;
          visibility_level: number | null;
        };
        Insert: {
          bio?: string | null;
          created_at?: string | null;
          email: string;
          gender?: string | null;
          id: string;
          name: string;
          preferred_name?: string | null;
          profile_image_url?: string | null;
          show_full_name?: boolean | null;
          show_gender?: boolean | null;
          show_profile_image?: boolean | null;
          show_social_links?: boolean | null;
          updated_at?: string | null;
          username: string;
          visibility_level?: number | null;
        };
        Update: {
          bio?: string | null;
          created_at?: string | null;
          email?: string;
          gender?: string | null;
          id?: string;
          name?: string;
          preferred_name?: string | null;
          profile_image_url?: string | null;
          show_full_name?: boolean | null;
          show_gender?: boolean | null;
          show_profile_image?: boolean | null;
          show_social_links?: boolean | null;
          updated_at?: string | null;
          username?: string;
          visibility_level?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      calculate_connection_distance: {
        Args: { from_user_id: string; to_user_id: string };
        Returns: number;
      };
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

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
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
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
