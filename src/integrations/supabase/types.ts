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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          alternate_phone: string | null
          city: string | null
          company_name: string | null
          contact_person: string
          country: string | null
          created_at: string | null
          credit_limit: number | null
          customer_code: string
          customer_type: string
          email: string
          id: string
          notes: string | null
          payment_terms: string | null
          phone: string
          postal_code: string | null
          state: string | null
          status: string | null
          tax_id: string | null
          updated_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          alternate_phone?: string | null
          city?: string | null
          company_name?: string | null
          contact_person: string
          country?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_code: string
          customer_type: string
          email: string
          id?: string
          notes?: string | null
          payment_terms?: string | null
          phone: string
          postal_code?: string | null
          state?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          alternate_phone?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string
          country?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_code?: string
          customer_type?: string
          email?: string
          id?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string
          postal_code?: string | null
          state?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          barcode: string | null
          category: string | null
          condition_on_arrival: string | null
          created_at: string | null
          current_condition: string | null
          customer_id: string
          declared_value: number | null
          description: string | null
          dimension_height: number | null
          dimension_length: number | null
          dimension_unit: string | null
          dimension_width: number | null
          id: string
          item_code: string
          item_name: string
          notes: string | null
          qr_code: string | null
          quantity: number
          received_date: string
          sku: string | null
          status: string | null
          storage_rate: number | null
          unit_of_measure: string | null
          updated_at: string | null
          warehouse_id: string
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          condition_on_arrival?: string | null
          created_at?: string | null
          current_condition?: string | null
          customer_id: string
          declared_value?: number | null
          description?: string | null
          dimension_height?: number | null
          dimension_length?: number | null
          dimension_unit?: string | null
          dimension_width?: number | null
          id?: string
          item_code: string
          item_name: string
          notes?: string | null
          qr_code?: string | null
          quantity?: number
          received_date: string
          sku?: string | null
          status?: string | null
          storage_rate?: number | null
          unit_of_measure?: string | null
          updated_at?: string | null
          warehouse_id: string
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          barcode?: string | null
          category?: string | null
          condition_on_arrival?: string | null
          created_at?: string | null
          current_condition?: string | null
          customer_id?: string
          declared_value?: number | null
          description?: string | null
          dimension_height?: number | null
          dimension_length?: number | null
          dimension_unit?: string | null
          dimension_width?: number | null
          id?: string
          item_code?: string
          item_name?: string
          notes?: string | null
          qr_code?: string | null
          quantity?: number
          received_date?: string
          sku?: string | null
          status?: string | null
          storage_rate?: number | null
          unit_of_measure?: string | null
          updated_at?: string | null
          warehouse_id?: string
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_order_items: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          notes: string | null
          outbound_order_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          notes?: string | null
          outbound_order_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          notes?: string | null
          outbound_order_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "outbound_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_order_items_outbound_order_id_fkey"
            columns: ["outbound_order_id"]
            isOneToOne: false
            referencedRelation: "outbound_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_orders: {
        Row: {
          completed_date: string | null
          created_at: string | null
          customer_id: string
          delivery_address_line1: string | null
          delivery_address_line2: string | null
          delivery_charges: number | null
          delivery_city: string | null
          delivery_contact_name: string | null
          delivery_contact_phone: string | null
          delivery_country: string | null
          delivery_postal_code: string | null
          delivery_state: string | null
          handling_charges: number | null
          id: string
          notes: string | null
          order_number: string
          order_type: string | null
          priority: string | null
          requested_date: string
          scheduled_date: string | null
          special_instructions: string | null
          status: string | null
          total_charges: number | null
          total_items: number | null
          total_quantity: number | null
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string | null
          customer_id: string
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_charges?: number | null
          delivery_city?: string | null
          delivery_contact_name?: string | null
          delivery_contact_phone?: string | null
          delivery_country?: string | null
          delivery_postal_code?: string | null
          delivery_state?: string | null
          handling_charges?: number | null
          id?: string
          notes?: string | null
          order_number: string
          order_type?: string | null
          priority?: string | null
          requested_date: string
          scheduled_date?: string | null
          special_instructions?: string | null
          status?: string | null
          total_charges?: number | null
          total_items?: number | null
          total_quantity?: number | null
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string | null
          customer_id?: string
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_charges?: number | null
          delivery_city?: string | null
          delivery_contact_name?: string | null
          delivery_contact_phone?: string | null
          delivery_country?: string | null
          delivery_postal_code?: string | null
          delivery_state?: string | null
          handling_charges?: number | null
          id?: string
          notes?: string | null
          order_number?: string
          order_type?: string | null
          priority?: string | null
          requested_date?: string
          scheduled_date?: string | null
          special_instructions?: string | null
          status?: string | null
          total_charges?: number | null
          total_items?: number | null
          total_quantity?: number | null
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          customer_id: string | null
          email: string
          first_name: string
          id: string
          last_login: string | null
          last_name: string
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          email: string
          first_name: string
          id: string
          last_login?: string | null
          last_name: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          email?: string
          first_name?: string
          id?: string
          last_login?: string | null
          last_name?: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          capacity_unit: string | null
          city: string | null
          country: string | null
          created_at: string | null
          id: string
          postal_code: string | null
          state: string | null
          status: string | null
          total_capacity: number | null
          updated_at: string | null
          warehouse_code: string
          warehouse_name: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          capacity_unit?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          postal_code?: string | null
          state?: string | null
          status?: string | null
          total_capacity?: number | null
          updated_at?: string | null
          warehouse_code: string
          warehouse_name: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          capacity_unit?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          postal_code?: string | null
          state?: string | null
          status?: string | null
          total_capacity?: number | null
          updated_at?: string | null
          warehouse_code?: string
          warehouse_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_customer_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "warehouse_manager"
        | "warehouse_staff"
        | "customer_admin"
        | "customer_user"
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
      app_role: [
        "super_admin",
        "warehouse_manager",
        "warehouse_staff",
        "customer_admin",
        "customer_user",
      ],
    },
  },
} as const
