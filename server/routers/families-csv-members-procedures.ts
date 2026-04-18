// These procedures should be added to the familiesRouter in families.ts
// They provide CSV export/import with full family + member support and UUIDs

export const csvMembersProcedures = `
  // ─── Job 11: CSV Export with Members (NEW) ──────────────────────────────
  /** GET export families + members with UUIDs */
  exportFamiliesWithMembers: adminProcedure
    .input(z.object({ mode: z.enum(["update", "audit", "verify"]) }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      // Fetch all families with their members
      const { data: families, error: familiesError } = await db
        .from("families")
        .select(
          \`id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(nombre, apellidos, telefono)\`
        )
        .is("deleted_at", null)
        .order("familia_numero", { ascending: true });

      if (familiesError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: familiesError.message });

      // Fetch all family members
      const { data: members, error: membersError } = await db
        .from("familia_miembros")
        .select("id, familia_id, nombre, rol, relacion, fecha_nacimiento, estado")
        .is("deleted_at", null);

      if (membersError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: membersError.message });

      // Transform to CSV-friendly format with members
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familiesWithMembers = (families ?? []).map((f: any) => ({
        family: {
          id: f.id,
          familia_numero: f.familia_numero?.toString() ?? "",
          nombre_familia: f.persons?.nombre ?? "",
          contacto_principal: f.persona_recoge ?? "",
          telefono: f.persons?.telefono ?? "",
          direccion: "",
          estado: f.estado ?? "activo",
          fecha_creacion: f.created_at?.split("T")[0] ?? "",
          miembros_count: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
          docs_identidad: false,
          padron_recibido: false,
          justificante_recibido: false,
          consent_bocatas: false,
          consent_banco_alimentos: false,
          informe_social: f.informe_social ?? false,
          informe_social_fecha: f.informe_social_fecha ?? null,
          alta_en_guf: f.alta_en_guf ?? false,
          fecha_alta_guf: f.fecha_alta_guf ?? null,
          guf_verified_at: f.guf_verified_at ?? null,
        },
        members: (members ?? [])
          .filter((m: any) => m.familia_id === f.id)
          .map((m: any) => ({
            id: m.id,
            familia_id: m.familia_id,
            nombre: m.nombre,
            rol: m.rol,
            relacion: m.relacion,
            fecha_nacimiento: m.fecha_nacimiento,
            estado: m.estado,
          })),
      }));

      const csv = generateFamiliesCSVWithMembers(familiesWithMembers, input.mode);
      return {
        csv,
        recordCount: familiesWithMembers.length,
        memberCount: members?.length ?? 0,
        mode: input.mode,
      };
    }),

  // ─── Job 12: CSV Import Validation with Members (NEW) ───────────────────
  /** POST validate CSV with members before import */
  validateCSVImportWithMembers: adminProcedure
    .input(z.object({ csvContent: z.string() }))
    .query(async ({ input }) => {
      const result = validateFamiliesWithMembersCSV(input.csvContent);
      return result;
    }),

  // ─── Job 13: CSV Import with Members (NEW) ──────────────────────────────
  /** POST import families + members from CSV with UUID matching */
  importFamiliesWithMembers: adminProcedure
    .input(
      z.object({
        csvContent: z.string(),
        mergeStrategy: z.enum(["overwrite", "merge", "skip"]).default("merge"),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      // Validate CSV first
      const validation = validateFamiliesWithMembersCSV(input.csvContent);
      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: \`CSV validation failed: \${validation.errors.join(", ")}\`,
        });
      }

      // Parse CSV
      const parsedRows = parseFamiliesWithMembersCSV(input.csvContent);

      let familySuccessCount = 0;
      let memberSuccessCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Group rows by familia_id
      const familiesByUUID = new Map<string, any[]>();
      for (const row of parsedRows) {
        const familiaId = String(row.familia_id || "").trim();
        if (!familiesByUUID.has(familiaId)) {
          familiesByUUID.set(familiaId, []);
        }
        familiesByUUID.get(familiaId)!.push(row);
      }

      // Process each family and its members
      for (const [familiaId, rows] of familiesByUUID) {
        const familyRow = rows[0]; // First row has family data

        try {
          // Check if family exists (using UUID if provided)
          let query = db.from("families").select("id");
          if (familiaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familiaId)) {
            query = query.eq("id", familiaId);
          }
          const { data: existing } = await query.single();

          if (existing && input.mergeStrategy === "skip") {
            continue;
          }

          // Update or create family (simplified for now)
          if (!existing) {
            const newFamilyData: any = {
              familia_numero: familyRow.familia_numero,
              persona_recoge: familyRow.contacto_principal ?? "",
              estado: familyRow.estado ?? "activo",
            };
            if (familiaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familiaId)) {
              newFamilyData.id = familiaId;
            }
            const { error } = await db.from("families").insert(newFamilyData);
            if (error) throw error;
          }
          familySuccessCount++;

          // Process members for this family
          for (const row of rows) {
            const miembroId = String(row.miembro_id || "").trim();
            if (!miembroId) continue; // Skip rows without member data

            try {
              // Check if member exists
              const { data: existingMember } = await db
                .from("familia_miembros")
                .select("id")
                .eq("id", miembroId)
                .single();

              if (existingMember && input.mergeStrategy === "skip") {
                continue;
              }

              if (!existingMember) {
                // Create new member
                const { error } = await db.from("familia_miembros").insert({
                  id: miembroId,
                  familia_id: familiaId,
                  nombre: row.miembro_nombre,
                  rol: row.miembro_rol,
                  relacion: row.miembro_relacion ?? null,
                  fecha_nacimiento: row.miembro_fecha_nacimiento ?? null,
                  estado: row.miembro_estado ?? "activo",
                });
                if (error) throw error;
              }
              memberSuccessCount++;
            } catch (err) {
              errorCount++;
              errors.push(
                \`Miembro \${miembroId}: \${err instanceof Error ? err.message : "Unknown error"}\`
              );
            }
          }
        } catch (err) {
          errorCount++;
          errors.push(
            \`Familia \${familiaId}: \${err instanceof Error ? err.message : "Unknown error"}\`
          );
        }
      }

      return {
        success: true,
        familySuccessCount,
        memberSuccessCount,
        errorCount,
        totalRecords: parsedRows.length,
        errors: errors.slice(0, 10),
        mergeStrategy: input.mergeStrategy,
      };
    }),
`;
