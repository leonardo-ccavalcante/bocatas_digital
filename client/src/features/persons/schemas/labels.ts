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
  calle: { label: "Sin hogar", icon: "⛺" },
  albergue: { label: "Albergue", icon: "🏕️" },
  piso_compartido_alquiler: { label: "Piso compartido (alquiler)", icon: "🏠" },
  piso_propio_alquiler: { label: "Piso propio (alquiler)", icon: "🏠" },
  piso_propio_propiedad: { label: "Piso propio (propiedad)", icon: "🏡" },
  ocupacion_sin_titulo: { label: "Ocupación sin título", icon: "🔑" },
  pension: { label: "Pensión", icon: "🏨" },
  asentamiento: { label: "Asentamiento", icon: "⛺" },
  centro_menores: { label: "Centro de menores", icon: "🏢" },
  piso_entidad_social: { label: "Piso de entidad social", icon: "🏠" },
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
};

// Lista de opciones del formulario. Los cuatro niveles desglosados antiguos
// (bachillerato, FP, universitario, postgrado) siguen siendo valores válidos en
// base y en el esquema, pero ya no se ofrecen: el equipo trabaja con estas cinco.
export const NIVEL_ESTUDIOS_LABELS: Record<string, string> = {
  sin_estudios: "Sin estudios",
  primaria: "Primaria",
  secundaria: "Secundaria",
  postsecundaria_no_superior: "Educación post secundaria no superior (bachillerato / FPGM)",
  superior: "Educación superior (universidad / FPGS)",
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

// FSE/IRPF "situación ante el empleo" categories (informe demográfico).
export const SITUACION_ANTE_EMPLEO_LABELS: Record<string, string> = {
  inactiva: "Persona inactiva",
  desempleo_subsidio_larga_duracion: "Desempleado/a con subsidio de larga duración (+12 meses)",
  agotada_prestacion_subsidio: "Ha agotado la prestación / subsidio de desempleo",
  precariedad_laboral: "En situación de precariedad laboral",
  no_aplica: "No aplica / otra situación",
};

// RGPD Art. 9/10 special-category — "otras características / colectivo".
/** EstabilidadHabitacionalSchema. No existía mapa de etiquetas: el alta nunca
 *  llegó a pintar este campo, aunque el esquema y el insert sí lo llevan. */
export const ESTABILIDAD_HABITACIONAL_LABELS: Record<string, string> = {
  sin_hogar: "Sin hogar",
  inestable: "Inestable",
  temporal: "Temporal",
  estable: "Estable",
};

export const COLECTIVO_LABELS: Record<string, string> = {
  gitanos: "Población gitana",
  lgtbi: "LGTBI",
  sin_hogar: "Sin hogar",
  reclusos_exreclusos: "Reclusos / exreclusos",
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

