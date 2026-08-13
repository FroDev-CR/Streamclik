/**
 * Tipos del esquema de base de datos.
 *
 * En un proyecto conectado, este archivo se regenera con:
 *   npm run db:types      (supabase gen types typescript --linked)
 *
 * Se versiona escrito a mano para que el repositorio compile sin una instancia
 * de Supabase activa. Debe mantenerse alineado con `supabase/migrations/`;
 * regenerarlo tras cada migración es la práctica recomendada.
 *
 * ⚠️ La forma de este tipo no es libre: `postgrest-js` sólo lo reconoce si cada
 * tabla declara `Row`, `Insert`, `Update` y `Relationships`, y cada vista al
 * menos `Row` y `Relationships`. Si falta cualquiera de esas claves, el tipo deja
 * de encajar en `GenericSchema` y **todas** las consultas se resuelven como
 * `never`, con errores del estilo «Property 'id' does not exist on type
 * 'never'». Es un fallo silencioso y desconcertante: el síntoma aparece en los
 * ficheros que consultan, no aquí, que es donde está la causa.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'admin' | 'client';
export type AccountStatus = 'active' | 'suspended' | 'expired';
export type AssignmentStatus = 'active' | 'expired' | 'revoked';
export type PinCodeTypeDb = 'household' | 'login' | 'signup' | 'password_reset' | 'unknown';
export type EmailParseStatusDb = 'parsed' | 'unmatched' | 'failed' | 'ignored';
export type NotificationChannelDb = 'realtime' | 'whatsapp' | 'telegram' | 'push' | 'email';
export type NotificationStatusDb = 'pending' | 'sent' | 'failed' | 'skipped';
export type OrderStatusDb =
  'esperando_comprobante' | 'esperando_revision' | 'entregado' | 'rechazado' | 'cancelado';
export type RewardSourceDb = 'referral' | 'admin';
export type RewardStatusDb = 'available' | 'claimed' | 'cancelled';
export type PinChangeStatusDb = 'pending' | 'done' | 'rejected';

/** Tablas sin columnas modificables por la API (sólo las escribe el webhook). */
type NoUpdates = Record<string, never>;

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          /** El `sub` del JWT de Clerk. Identidad externa; `id` es la interna. */
          clerk_user_id: string | null;
          email: string;
          full_name: string | null;
          phone: string | null;
          role: UserRole;
          referral_code: string;
          telegram_chat_id: string | null;
          notification_preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          // Desde la migración a Clerk la tabla genera el uuid por defecto, así
          // que `id` deja de ser obligatorio en el alta.
          id?: string;
          clerk_user_id?: string | null;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          role?: UserRole;
          referral_code?: string;
          telegram_chat_id?: string | null;
          notification_preferences?: Json;
        };
        Update: {
          full_name?: string | null;
          phone?: string | null;
          role?: UserRole;
          referral_code?: string;
          telegram_chat_id?: string | null;
          notification_preferences?: Json;
        };
        // Ya no hay clave ajena a `auth.users`: la identidad la custodia Clerk.
        Relationships: [];
      };

      streaming_services: {
        Row: {
          id: string;
          slug: string;
          name: string;
          brand_color: string;
          icon_key: string;
          sender_domains: string[];
          pin_regex_patterns: string[];
          pin_ttl_seconds: number;
          is_active: boolean;
          price_amount: number;
          price_currency: string;
          tagline: string | null;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          brand_color?: string;
          icon_key?: string;
          sender_domains?: string[];
          pin_regex_patterns?: string[];
          pin_ttl_seconds?: number;
          is_active?: boolean;
          price_amount?: number;
          price_currency?: string;
          tagline?: string | null;
        };
        Update: {
          name?: string;
          brand_color?: string;
          icon_key?: string;
          sender_domains?: string[];
          pin_regex_patterns?: string[];
          pin_ttl_seconds?: number;
          is_active?: boolean;
          price_amount?: number;
          price_currency?: string;
          tagline?: string | null;
        };
        Relationships: [];
      };

      streaming_combos: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tagline: string | null;
          price_amount: number;
          price_currency: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          tagline?: string | null;
          price_amount: number;
          price_currency?: string;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          tagline?: string | null;
          price_amount?: number;
          price_currency?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };

      streaming_combo_items: {
        Row: {
          combo_id: string;
          service_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          combo_id: string;
          service_id: string;
          quantity?: number;
        };
        Update: {
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'streaming_combo_items_combo_id_fkey';
            columns: ['combo_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_combos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'streaming_combo_items_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_services';
            referencedColumns: ['id'];
          },
        ];
      };

      streaming_accounts: {
        Row: {
          id: string;
          service_id: string;
          owner_id: string;
          label: string;
          inbox_email: string;
          login_email: string;
          login_password_enc: string;
          max_profiles: number;
          status: AccountStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          service_id: string;
          owner_id: string;
          label: string;
          inbox_email: string;
          login_email: string;
          login_password_enc: string;
          max_profiles?: number;
          status?: AccountStatus;
          notes?: string | null;
        };
        Update: {
          service_id?: string;
          label?: string;
          inbox_email?: string;
          login_email?: string;
          login_password_enc?: string;
          max_profiles?: number;
          status?: AccountStatus;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'streaming_accounts_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_services';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'streaming_accounts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      account_profiles: {
        Row: {
          id: string;
          account_id: string;
          label: string;
          profile_pin: string | null;
          slot_index: number;
          created_at: string;
        };
        Insert: {
          account_id: string;
          label: string;
          profile_pin?: string | null;
          slot_index: number;
        };
        Update: {
          label?: string;
          profile_pin?: string | null;
          slot_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'account_profiles_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_accounts';
            referencedColumns: ['id'];
          },
        ];
      };

      profile_assignments: {
        Row: {
          id: string;
          account_profile_id: string;
          user_id: string;
          assigned_by: string | null;
          status: AssignmentStatus;
          starts_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          account_profile_id: string;
          user_id: string;
          assigned_by?: string | null;
          status?: AssignmentStatus;
          starts_at?: string;
          expires_at?: string | null;
        };
        Update: {
          status?: AssignmentStatus;
          expires_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_assignments_account_profile_id_fkey';
            columns: ['account_profile_id'];
            isOneToOne: false;
            referencedRelation: 'account_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_assignments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_assignments_assigned_by_fkey';
            columns: ['assigned_by'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      inbound_emails: {
        Row: {
          id: string;
          account_id: string | null;
          message_id: string;
          to_address: string;
          from_address: string;
          subject: string | null;
          body_text: string | null;
          body_html: string | null;
          raw_payload: Json | null;
          parse_status: EmailParseStatusDb;
          parse_error: string | null;
          received_at: string;
          created_at: string;
        };
        Insert: {
          account_id?: string | null;
          message_id: string;
          to_address: string;
          from_address: string;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          raw_payload?: Json | null;
          parse_status?: EmailParseStatusDb;
          parse_error?: string | null;
          received_at: string;
        };
        Update: {
          parse_status?: EmailParseStatusDb;
          parse_error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inbound_emails_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_accounts';
            referencedColumns: ['id'];
          },
        ];
      };

      verification_pins: {
        Row: {
          id: string;
          account_id: string;
          inbound_email_id: string | null;
          code: string;
          code_type: PinCodeTypeDb;
          action_url: string | null;
          received_at: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          account_id: string;
          inbound_email_id?: string | null;
          code: string;
          code_type?: PinCodeTypeDb;
          action_url?: string | null;
          received_at: string;
          expires_at: string;
        };
        // Un PIN es inmutable: refleja un correo que ya llegó. Modificarlo
        // significaría reescribir un hecho.
        Update: NoUpdates;
        Relationships: [
          {
            foreignKeyName: 'verification_pins_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'verification_pins_inbound_email_id_fkey';
            columns: ['inbound_email_id'];
            isOneToOne: false;
            referencedRelation: 'inbound_emails';
            referencedColumns: ['id'];
          },
        ];
      };

      notification_outbox: {
        Row: {
          id: string;
          pin_id: string | null;
          user_id: string;
          channel: NotificationChannelDb;
          payload: Json;
          status: NotificationStatusDb;
          attempts: number;
          last_error: string | null;
          next_attempt_at: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          pin_id?: string | null;
          user_id: string;
          channel: NotificationChannelDb;
          payload: Json;
        };
        Update: {
          status?: NotificationStatusDb;
          attempts?: number;
          last_error?: string | null;
          next_attempt_at?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_outbox_pin_id_fkey';
            columns: ['pin_id'];
            isOneToOne: false;
            referencedRelation: 'verification_pins';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_outbox_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      orders: {
        Row: {
          id: string;
          user_id: string;
          service_id: string | null;
          combo_id: string | null;
          is_cart: boolean;
          referrer_user_id: string | null;
          referral_code_used: string | null;
          price_amount: number;
          price_currency: string;
          status: OrderStatusDb;
          receipt_path: string | null;
          receipt_note: string | null;
          submitted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          review_note: string | null;
          assignment_id: string | null;
          /** Si viene informado, el pedido renueva esa asignación. */
          renewal_assignment_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          service_id?: string | null;
          combo_id?: string | null;
          is_cart?: boolean;
          referrer_user_id?: string | null;
          referral_code_used?: string | null;
          price_amount: number;
          price_currency?: string;
          status?: OrderStatusDb;
          receipt_path?: string | null;
          receipt_note?: string | null;
          submitted_at?: string | null;
        };
        Update: {
          status?: OrderStatusDb;
          receipt_path?: string | null;
          receipt_note?: string | null;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
          assignment_id?: string | null;
          service_id?: string | null;
          combo_id?: string | null;
          is_cart?: boolean;
          referrer_user_id?: string | null;
          referral_code_used?: string | null;
          renewal_assignment_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_services';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_combo_id_fkey';
            columns: ['combo_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_combos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_referrer_user_id_fkey';
            columns: ['referrer_user_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      order_items: {
        Row: {
          id: string;
          order_id: string;
          service_id: string | null;
          combo_id: string | null;
          quantity: number;
          unit_price_amount: number;
          unit_price_currency: string;
          created_at: string;
        };
        Insert: {
          order_id: string;
          service_id?: string | null;
          combo_id?: string | null;
          quantity?: number;
          unit_price_amount: number;
          unit_price_currency?: string;
        };
        Update: NoUpdates;
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_services';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_combo_id_fkey';
            columns: ['combo_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_combos';
            referencedColumns: ['id'];
          },
        ];
      };

      order_assignments: {
        Row: {
          order_id: string;
          assignment_id: string;
          created_at: string;
        };
        Insert: {
          order_id: string;
          assignment_id: string;
        };
        Update: NoUpdates;
        Relationships: [
          {
            foreignKeyName: 'order_assignments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_assignments_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: true;
            referencedRelation: 'profile_assignments';
            referencedColumns: ['id'];
          },
        ];
      };

      payment_settings: {
        Row: {
          id: boolean;
          sinpe_number: string;
          sinpe_name: string;
          instructions: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          sinpe_number?: string;
          sinpe_name?: string;
          instructions?: string;
        };
        Update: {
          sinpe_number?: string;
          sinpe_name?: string;
          instructions?: string;
        };
        Relationships: [];
      };

      profile_rewards: {
        Row: {
          id: string;
          user_id: string;
          source: RewardSourceDb;
          status: RewardStatusDb;
          duration_days: number;
          note: string | null;
          referral_order_id: string | null;
          created_by: string | null;
          claimed_service_id: string | null;
          claimed_assignment_id: string | null;
          claimed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: RewardSourceDb;
          status?: RewardStatusDb;
          duration_days?: number;
          note?: string | null;
          referral_order_id?: string | null;
          created_by?: string | null;
          claimed_service_id?: string | null;
          claimed_assignment_id?: string | null;
          claimed_at?: string | null;
        };
        Update: {
          status?: RewardStatusDb;
          duration_days?: number;
          note?: string | null;
          claimed_service_id?: string | null;
          claimed_assignment_id?: string | null;
          claimed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_rewards_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_rewards_referral_order_id_fkey';
            columns: ['referral_order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_rewards_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_rewards_claimed_service_id_fkey';
            columns: ['claimed_service_id'];
            isOneToOne: false;
            referencedRelation: 'streaming_services';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_rewards_claimed_assignment_id_fkey';
            columns: ['claimed_assignment_id'];
            isOneToOne: true;
            referencedRelation: 'profile_assignments';
            referencedColumns: ['id'];
          },
        ];
      };

      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_sent_at: string | null;
        };
        Insert: {
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
        };
        Update: {
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          last_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      pin_change_requests: {
        Row: {
          id: string;
          account_profile_id: string;
          requested_by: string;
          requested_pin: string;
          status: PinChangeStatusDb;
          note: string | null;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          account_profile_id: string;
          requested_by: string;
          requested_pin: string;
          note?: string | null;
        };
        // `status` es lo único que cambia desde la aplicación: el trigger
        // `aplicar_cambio_pin()` rellena `resolved_at`/`resolved_by` solo al
        // marcar 'done'. El rechazo los fija a mano (ver rechazarCambioPinAction).
        Update: {
          status?: PinChangeStatusDb;
          note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pin_change_requests_account_profile_id_fkey';
            columns: ['account_profile_id'];
            isOneToOne: false;
            referencedRelation: 'account_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pin_change_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pin_change_requests_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };

      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
        };
        // Un registro de auditoría que se puede editar no es un registro de
        // auditoría. No hay políticas de UPDATE/DELETE en la migración.
        Update: NoUpdates;
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };

    Views: {
      v_my_accounts: {
        Row: {
          account_id: string;
          account_label: string;
          login_email: string;
          login_password_enc: string;
          account_status: AccountStatus;
          service_slug: string;
          service_name: string;
          brand_color: string;
          account_profile_id: string;
          profile_label: string;
          profile_pin: string | null;
          slot_index: number;
          assignment_id: string;
          user_id: string;
          starts_at: string;
          expires_at: string | null;
          assignment_status: AssignmentStatus;
        };
        Relationships: [];
      };

      v_latest_pins: {
        Row: {
          id: string;
          account_id: string;
          code: string;
          code_type: PinCodeTypeDb;
          action_url: string | null;
          received_at: string;
          expires_at: string;
        };
        Relationships: [];
      };
    };

    Functions: {
      crear_renovacion: {
        Args: { p_assignment_id: string; p_note?: string | null };
        Returns: Json;
      };
      aprobar_renovacion: {
        Args: { p_order_id: string; p_dias?: number };
        Returns: Json;
      };
      is_admin: {
        Args: { p_user_id?: string };
        Returns: boolean;
      };
      has_account_access: {
        Args: { p_account_id: string; p_user_id?: string };
        Returns: boolean;
      };
      can_view_pin: {
        Args: {
          p_account_id: string;
          p_received_at: string;
          p_user_id?: string;
        };
        Returns: boolean;
      };
      ingest_inbound_email: {
        Args: {
          p_message_id: string;
          p_to_address: string;
          p_from_address: string;
          p_subject: string | null;
          p_body_text: string | null;
          p_body_html: string | null;
          p_raw_payload: Json | null;
          p_received_at: string;
          p_code?: string | null;
          p_code_type?: PinCodeTypeDb;
          p_action_url?: string | null;
          p_parse_status?: EmailParseStatusDb;
          p_parse_error?: string | null;
        };
        Returns: Json;
      };
      catalogo_publico: {
        Args: Record<string, never>;
        Returns: {
          slug: string;
          nombre: string;
          color: string;
          icono: string;
          lema: string | null;
          precio: number;
          moneda: string;
          disponibles: number;
          total: number;
        }[];
      };
      crear_pedido_carrito: {
        Args: { p_items: Json; p_note?: string | null; p_referral_code?: string | null };
        Returns: Json;
      };
      combos_publicos: {
        Args: Record<string, never>;
        Returns: {
          slug: string;
          nombre: string;
          lema: string | null;
          precio: number;
          moneda: string;
          disponibles: number;
          servicios: Json;
        }[];
      };
      soltar_cuenta: {
        Args: { p_order_id: string; p_expires_at?: string | null };
        Returns: Json;
      };
      resolve_referral_code: {
        Args: { p_code: string };
        Returns: Json;
      };
      reclamar_recompensa: {
        Args: { p_reward_id: string; p_service_id: string };
        Returns: Json;
      };
      expire_due_assignments: {
        Args: Record<string, never>;
        Returns: number;
      };
      /** Identidad interna resuelta desde el `sub` del JWT de Clerk. */
      current_user_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      /**
       * Alta o actualización del perfil del usuario autenticado.
       *
       * El `sub` se lee del JWT dentro de la función, nunca de estos parámetros:
       * aceptarlo por parámetro permitiría apropiarse del perfil ajeno.
       */
      sync_current_user: {
        Args: { p_email?: string | null; p_full_name?: string | null };
        Returns: string;
      };
    };

    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      assignment_status: AssignmentStatus;
      pin_code_type: PinCodeTypeDb;
      email_parse_status: EmailParseStatusDb;
      notification_channel: NotificationChannelDb;
      notification_status: NotificationStatusDb;
    };

    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
