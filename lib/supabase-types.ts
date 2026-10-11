export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type ComplaintRow = {
  tracking_id: string
  title: string
  category_id: string
  category: string
  details: string
  location: string
  area: string
  zone_id: string
  zone_name: string
  city: string
  pincode: string
  latitude: number | null
  longitude: number | null
  citizen_name: string
  citizen_mobile: string
  status: string
  source_status: string
  contractor_id: string
  contractor_name: string
  report_photos: Json
  completion_photos: Json
  completion_description: string
  review_reason: string
  imported_from: string
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      complaints: Table<ComplaintRow, Omit<ComplaintRow, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }>
      complaint_updates: Table<{
        id: number
        tracking_id: string
        type: string
        message: string
        actor_role: string
        actor_name: string
        created_at: string
      }, {
        tracking_id: string
        type: string
        message: string
        actor_role: string
        actor_name: string
        created_at?: string
      }>
      contractors: Table<{
        contractor_id: string
        name: string
        firm_name: string
        category_id: string
        category: string
        zone_id: string
        zone_name: string
        service_areas: string
        phone: string
        phone_normalized: string
        email: string
        address: string
        pincode: string
        experience_years: number | null
        rating: number | null
        active: boolean
      }, {
        contractor_id: string
        name: string
        firm_name: string
        category_id: string
        category: string
        zone_id: string
        zone_name: string
        service_areas: string
        phone: string
        phone_normalized: string
        email: string
        address: string
        pincode: string
        experience_years: number | null
        rating: number | null
        active: boolean
      }>
      admins: Table<{
        officer_id: string
        email: string
        email_normalized: string
        name: string
        category_id: string
        category: string
        username: string
        phone: string
        phone_normalized: string
      }, {
        officer_id: string
        email: string
        email_normalized: string
        name: string
        category_id: string
        category: string
        username: string
        phone: string
        phone_normalized: string
      }>
      categories: Table<{ category_id: string; label: string }, { category_id: string; label: string }>
      dataset_imports: Table<{
        import_id: string
        imported_at: string
        complaint_count: number
        new_complaint_count: number
        contractor_count: number
        admin_count: number
        category_count: number
      }, {
        import_id: string
        complaint_count: number
        new_complaint_count: number
        contractor_count: number
        admin_count: number
        category_count: number
      }>
    }
    Views: Record<string, never>
    Functions: {
      create_complaint_with_update: {
        Args: { p_complaint: Json; p_actor_name: string }
        Returns: undefined
      }
      transition_complaint: {
        Args: {
          p_tracking_id: string
          p_expected_statuses: string[]
          p_new_status: string
          p_patch: Json
          p_event_type: string
          p_message: string
          p_actor_role: string
          p_actor_name: string
          p_required_contractor_id?: string | null
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
