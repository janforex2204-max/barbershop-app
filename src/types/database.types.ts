// Ročno napisani tipi, ki ustrezajo supabase/schema.sql.
// Ko bo shema stabilna, jih lahko nadomestiš z generiranimi tipi:
//   npx supabase gen types typescript --project-id <tvoj-project-id> > src/types/database.types.ts

export type AppointmentStatus = "booked" | "cancelled" | "filled";
export type SmsReason = "waitlist" | "earlier_slot";
export type SmsStatus = "pending" | "sent" | "claimed" | "failed";
export type OwnerStatus = "pending" | "approved" | "rejected";
export type OwnerPlan = "free" | "pro";
export type NotificationPreference = "off" | "daily" | "per_booking";

// salon_owners.hours (jsonb) - po-dnevni urnik, zbran na registracijskem
// wizardu (glej src/app/owner/register/page.tsx). "day" je slovensko ime dne
// (Ponedeljek..Nedelja), "from"/"to" sta "HH:MM" in se ignorirata, ko je
// closed = true.
export type SalonDayHours = {
  day: string;
  closed: boolean;
  from: string;
  to: string;
};

export type Database = {
  public: {
    Tables: {
      services: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          active: boolean;
          sort_order: number;
          // V EUR, 2 decimalki - null, dokler lastnik cene ni sam nastavil
          // (glej supabase/schema.sql in src/lib/constants.ts formatPrice).
          price: number | null;
          // V minutah - null, dokler lastnik trajanja ni sam nastavil (glej
          // src/lib/constants.ts formatDuration). Trenutno samo shranjeno/
          // prikazano, ne vpliva na dolžino prostih terminov na /[slug].
          duration_minutes: number | null;
          // Prosto-besedilna skupina (npr. "Nohti") - null = brez skupine,
          // prikaže se v "Ostalo" na /[slug] (glej booking-page.tsx).
          category: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          active?: boolean;
          sort_order?: number;
          price?: number | null;
          duration_minutes?: number | null;
          category?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Insert"]>;
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          salon_id: string;
          customer_name: string;
          customer_phone: string;
          service: string;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          barber_name: string;
          created_at: string;
          // Samo za rate limiting (glej src/lib/rate-limit.ts), null pri
          // rezervacijah, ki jih vnese lastnik (owner/actions.ts).
          ip_address: string | null;
          // POSNETEK trajanja izbrane storitve ob rezervaciji (ne živa FK na
          // services.duration_minutes) - glej src/lib/availability.ts.
          duration_minutes: number | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_name: string;
          customer_phone: string;
          service: string;
          appointment_date: string;
          appointment_time: string;
          status?: AppointmentStatus;
          barber_name?: string;
          created_at?: string;
          ip_address?: string | null;
          duration_minutes?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Insert"]>;
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          salon_id: string;
          customer_name: string;
          customer_phone: string;
          preferred_date: string;
          service_preference: string;
          barber_name: string;
          created_at: string;
          // Samo za rate limiting (glej src/lib/rate-limit.ts).
          ip_address: string | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_name: string;
          customer_phone: string;
          preferred_date: string;
          service_preference?: string;
          barber_name?: string;
          created_at?: string;
          ip_address?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["waitlist"]["Insert"]>;
        Relationships: [];
      };
      sms_notifications: {
        Row: {
          id: string;
          salon_id: string;
          recipient_name: string;
          recipient_phone: string;
          message: string;
          reason: SmsReason;
          appointment_id: string | null;
          appointment_date: string | null;
          status: SmsStatus;
          auto_sent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          recipient_name: string;
          recipient_phone: string;
          message: string;
          reason: SmsReason;
          appointment_id?: string | null;
          appointment_date?: string | null;
          status?: SmsStatus;
          auto_sent?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sms_notifications"]["Insert"]>;
        Relationships: [];
      };
      salon_owners: {
        Row: {
          id: string;
          user_id: string;
          salon_name: string;
          slug: string;
          phone: string | null;
          whatsapp_consent: boolean;
          plan: OwnerPlan;
          notification_preference: NotificationPreference;
          status: OwnerStatus;
          approval_token: string | null;
          approval_token_created_at: string;
          approved_at: string | null;
          created_at: string;
          category: string | null;
          subtype: string | null;
          address: string | null;
          hours: SalonDayHours[] | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          salon_name: string;
          slug: string;
          phone?: string | null;
          whatsapp_consent?: boolean;
          plan?: OwnerPlan;
          notification_preference?: NotificationPreference;
          status?: OwnerStatus;
          approval_token?: string | null;
          approval_token_created_at?: string;
          approved_at?: string | null;
          created_at?: string;
          category?: string | null;
          subtype?: string | null;
          address?: string | null;
          hours?: SalonDayHours[] | null;
        };
        Update: Partial<Database["public"]["Tables"]["salon_owners"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      public_availability: {
        Row: {
          salon_id: string;
          appointment_date: string;
          appointment_time: string;
          duration_minutes: number | null;
          status: AppointmentStatus;
        };
        Relationships: [];
      };
      public_salons: {
        Row: {
          id: string;
          salon_name: string;
          slug: string;
          hours: SalonDayHours[] | null;
          category: string | null;
          address: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      my_salon_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
  };
};
