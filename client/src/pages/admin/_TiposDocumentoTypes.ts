export type DocType = {
  id: string;
  programa_id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  scope: "familia" | "miembro";
  is_required: boolean;
  is_active: boolean;
  display_order: number;
  template_url: string | null;
  template_filename: string | null;
  template_version: string | null;
  guide_url: string | null;
  guide_filename: string | null;
  guide_version: string | null;
  created_at: string;
  updated_at: string;
};
