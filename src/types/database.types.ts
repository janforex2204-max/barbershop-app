// Ročno napisani tipi, ki ustrezajo supabase/schema.sql.
// Ko bo shema stabilna, jih lahko nadomestiš z generiranimi tipi:
//   npx supabase gen types typescript --project-id <tvoj-project-id> > src/types/database.types.ts

export type AppointmentStatus = "booked" | "cancelled" | "filled";
export type SmsReason = "waitlist" | "earlier_slot";
export type SmsStatus = "pending" | "sent" | "claimed" | "failed";

export type Database = {
  public: {
    Tables: {
      services: {
        Row: {
          id: string;
          name: string;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Insert"]>;
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          customer_name: string;
          customer_phone: string;
          service: string;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          barber_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          customer_phone: string;
          service: string;
          appointment_date: string;
          appointment_time: string;
          status?: AppointmentStatus;
          barber_name?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Insert"]>;
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          customer_name: string;
          customer_phone: string;
          preferred_date: string;
          service_preference: string;
          barber_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          customer_phone: string;
          preferred_date: string;
          service_preference?: string;
          barber_name?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["waitlist"]["Insert"]>;
        Relationships: [];
      };
      sms_notifications: {
        Row: {
          id: string;
          recipient_name: string;
          recipient_phone: string;
          message: string;
          reason: SmsReason;
          appointment_id: string | null;
          status: SmsStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_name: string;
          recipient_phone: string;
          message: string;
          reason: SmsReason;
          appointment_id?: string | null;
          status?: SmsStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sms_notifications"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      public_availability: {
        Row: {
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};
