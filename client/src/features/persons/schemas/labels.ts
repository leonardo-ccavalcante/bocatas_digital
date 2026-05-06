import type { Program } from "./related";

// ─── Label maps for UI ────────────────────────────────────────────────────────

export const CANAL_LLEGADA_LABELS: Record<string, string> = {
  boca_a_boca: "Boca a boca",
  cruz_roja: "Cruz Roja",
  servicios_sociales: "Servicios Sociales",
  otra_ong: "Otra ONG",
  internet: "Internet",
  presencial_directo: "Llegada directa",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  email: "Email",
  instagram: "Instagram",
  retorno_bocatas: "Retorno Bocatas",
  otros: "Otros",
};

export const TIPO_VIVIENDA_LABELS: Record<string, { label: string; icon: string }> = {
  calle: { label: "Calle / Sin techo", icon: "⛺" },
  albergue: { label: "Albergue", icon: "🏕️" },
  piso_compartido_alquiler: { label: "Piso compartido (alquiler)", icon: "🏠" },
  piso_propio_alquiler: { label: "Piso propio (alquiler)", icon: "🏠" },
  piso_propio_propiedad: { label: "Piso propio (propiedad)", icon: "🏡" },
  ocupacion_sin_titulo: { label: "Ocupación sin título", icon: "🔑" },
  pension: { label: "Pensión", icon: "🏨" },
  asentamiento: { label: "Asentamiento", icon: "⛺" },
  centro_acogida: { label: "Centro de acogida", icon: "🏢" },
  otros: { label: "Otros", icon: "❓" },
};

export const GENERO_LABELS: Record<string, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
  no_binario: "No binario",
  prefiere_no_decir: "Prefiere no decir",
};

export const IDIOMA_LABELS: Record<string, string> = {
  es: "Español",
  ar: "Árabe",
  fr: "Francés",
  bm: "Bambara",
  en: "Inglés",
  ro: "Rumano",
  zh: "Chino",
  wo: "Wolof",
  other: "Otro",
};

export const TIPO_DOCUMENTO_LABELS: Record<string, string> = {
  DNI: "DNI",
  NIE: "NIE",
  Pasaporte: "Pasaporte",
  Documento_Extranjero: "Documento Extranjero",
  Sin_Documentacion: "Sin documentación",
};

export const SITUACION_LEGAL_LABELS: Record<string, string> = {
  regular: "Regular",
  irregular: "Irregular",
  solicitante_asilo: "Solicitante de asilo",
  en_tramite: "En trámite",
  sin_papeles: "Sin papeles",
};

export const NIVEL_ESTUDIOS_LABELS: Record<string, string> = {
  sin_estudios: "Sin estudios",
  primaria: "Primaria",
  secundaria: "Secundaria",
  bachillerato: "Bachillerato",
  formacion_profesional: "Formación Profesional",
  universitario: "Universitario",
  postgrado: "Postgrado",
};

export const SITUACION_LABORAL_LABELS: Record<string, string> = {
  desempleado: "Desempleado/a",
  economia_informal: "Economía informal",
  empleo_temporal: "Empleo temporal",
  empleo_indefinido: "Empleo indefinido",
  autonomo: "Autónomo/a",
  en_formacion: "En formación",
  jubilado: "Jubilado/a",
  incapacidad_permanente: "Incapacidad permanente",
  sin_permiso_trabajo: "Sin permiso de trabajo",
};

export const NIVEL_INGRESOS_LABELS: Record<string, string> = {
  sin_ingresos: "Sin ingresos",
  menos_500: "Menos de 500€",
  entre_500_1000: "500 – 1.000€",
  entre_1000_1500: "1.000 – 1.500€",
  mas_1500: "Más de 1.500€",
};

export const FASE_ITINERARIO_CONFIG: Record<string, { label: string; color: string }> = {
  acogida: { label: "Acogida", color: "bg-gray-200 text-gray-700" },
  estabilizacion: { label: "Estabilización", color: "bg-blue-100 text-blue-700" },
  formacion: { label: "Formación", color: "bg-yellow-100 text-yellow-700" },
  insercion_laboral: { label: "Inserción laboral", color: "bg-orange-100 text-orange-700" },
  autonomia: { label: "Autonomía", color: "bg-green-100 text-green-700" },
};

// Fallback programs if DB is unreachable
export const PROGRAMS_SEED_FALLBACK: Program[] = [
  { id: "00000000-0000-0000-0000-000000000001", slug: "comedor-social", name: "Comedor Social", icon: "🍽️", is_default: true, is_active: true, display_order: 1 },
  { id: "00000000-0000-0000-0000-000000000002", slug: "programa-familias", name: "Programa Familias", icon: "📦", is_default: false, is_active: true, display_order: 2 },
  { id: "00000000-0000-0000-0000-000000000003", slug: "formacion", name: "Formación", icon: "📚", is_default: false, is_active: true, display_order: 3 },
  { id: "00000000-0000-0000-0000-000000000004", slug: "atencion-juridica", name: "Atención Jurídica", icon: "⚖️", is_default: false, is_active: true, display_order: 4 },
  { id: "00000000-0000-0000-0000-000000000005", slug: "voluntariado", name: "Voluntariado", icon: "🤝", is_default: false, is_active: true, display_order: 5 },
  { id: "00000000-0000-0000-0000-000000000006", slug: "acompanamiento", name: "Acompañamiento", icon: "🫂", is_default: false, is_active: true, display_order: 6 },
];
