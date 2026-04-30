# OCR Country Detection & Document Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automatic country code suggestion from international document images and add validation warnings for incomplete document records.

**Architecture:** 
- New LLM-powered country detection service extracts country from document image + OCR text + user context
- Backend validation ensures `pais_documento` is provided for `Documento_Extranjero` records
- Frontend form shows confirmation UI for LLM suggestions and inline warnings for validation failures
- All changes follow TDD with unit + integration tests

**Tech Stack:** 
- Backend: tRPC procedures, Zod validation, LLM integration (existing `invokeLLM` helper)
- Frontend: React form state, shadcn/ui components, Tailwind CSS
- Testing: Vitest for unit tests, React Testing Library for form tests

---

## File Structure

### New Files
- `server/_core/ocr-country-detection.ts` - LLM prompt + country suggestion logic
- `server/routers/__tests__/ocr-country-detection.test.ts` - Unit tests for country detection
- `client/src/features/persons/__tests__/document-validation.test.ts` - Form validation tests

### Modified Files
- `server/routers/persons.ts` - Add validation rules, update Zod schema
- `client/src/pages/PersonForm.tsx` - Add confirmation UI, validation warnings
- `client/src/lib/database.types.ts` - Already has `pais_documento`, no changes needed

---

## Task 1: Create OCR Country Detection Service

**Files:**
- Create: `server/_core/ocr-country-detection.ts`
- Test: `server/routers/__tests__/ocr-country-detection.test.ts`

### Step 1: Write failing test for country suggestion

```bash
cd /home/ubuntu/bocatas-digital
```

Create `server/routers/__tests__/ocr-country-detection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { suggestCountryFromDocument } from "../../_core/ocr-country-detection";

describe("OCR Country Detection", () => {
  it("should return a country suggestion with confidence score", async () => {
    // Mock data: document image + extracted text
    const mockImage = Buffer.from("fake-image-data");
    const mockText = "République Française\nDocument d'identité";
    const paisOrigen = "FR";

    const result = await suggestCountryFromDocument(
      mockImage,
      mockText,
      paisOrigen
    );

    expect(result).toHaveProperty("suggested_country_code");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("alternative_suggestions");
    expect(result.suggested_country_code).toMatch(/^[A-Z]{2}$/); // ISO 3166-1 alpha-2
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should handle missing image gracefully", async () => {
    const result = await suggestCountryFromDocument(
      Buffer.from(""),
      "Some text",
      undefined
    );

    // Should return null or empty suggestion, not throw
    expect(result.suggested_country_code).toBe("");
  });

  it("should prioritize pais_origen as context hint", async () => {
    const mockImage = Buffer.from("fake-image-data");
    const mockText = "Documento de identidad"; // Ambiguous text
    const paisOrigen = "ES"; // Spain hint

    const result = await suggestCountryFromDocument(
      mockImage,
      mockText,
      paisOrigen
    );

    // Should consider Spain as more likely
    expect(
      result.suggested_country_code === "ES" ||
        result.alternative_suggestions.includes("ES")
    ).toBe(true);
  });
});
```

Run: `pnpm test server/routers/__tests__/ocr-country-detection.test.ts`

Expected: FAIL - `suggestCountryFromDocument is not defined`

### Step 2: Create OCR country detection service

Create `server/_core/ocr-country-detection.ts`:

```typescript
import { invokeLLM } from "./llm";

export interface CountrySuggestion {
  suggested_country_code: string;
  confidence: number;
  reasoning: string;
  alternative_suggestions: string[];
}

/**
 * Suggest country code from international document image
 * Analyzes: document image + extracted OCR text + user context
 * Returns: ISO 3166-1 alpha-2 country code with confidence score
 */
export async function suggestCountryFromDocument(
  documentImage: Buffer | string,
  extractedText: string,
  paisOrigen?: string
): Promise<CountrySuggestion> {
  // Handle empty/missing image
  if (!documentImage || (typeof documentImage === "string" && !documentImage)) {
    return {
      suggested_country_code: "",
      confidence: 0,
      reasoning: "No document image provided",
      alternative_suggestions: [],
    };
  }

  // Convert buffer to base64 if needed
  const imageBase64 =
    typeof documentImage === "string"
      ? documentImage
      : documentImage.toString("base64");

  const systemPrompt = `You are an expert at identifying countries from official documents (passports, national IDs, visas, etc.).

Analyze the provided document image and extracted text to identify the country of origin.

Return a JSON response with:
- suggested_country_code: ISO 3166-1 alpha-2 code (e.g., "FR", "ES", "DE")
- confidence: number 0-1 indicating certainty
- reasoning: brief explanation of how you identified the country
- alternative_suggestions: array of up to 3 other possible country codes

Be conservative with confidence - only high confidence if visual/text evidence is clear.`;

  const userPrompt = `Identify the country from this document.

${extractedText ? `Extracted text from document:\n${extractedText}\n` : ""}

${paisOrigen ? `User's country of origin (context hint): ${paisOrigen}\n` : ""}

Return ONLY valid JSON, no other text.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content;
    if (typeof content !== "string") {
      throw new Error("Unexpected response format");
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    // Validate and normalize response
    return {
      suggested_country_code: (
        parsed.suggested_country_code || ""
      ).toUpperCase(),
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || "Unable to determine country",
      alternative_suggestions: (parsed.alternative_suggestions || [])
        .slice(0, 3)
        .map((code: string) => code.toUpperCase()),
    };
  } catch (error) {
    console.error("Error suggesting country from document:", error);
    return {
      suggested_country_code: "",
      confidence: 0,
      reasoning: "Error analyzing document",
      alternative_suggestions: [],
    };
  }
}
```

### Step 3: Run test to verify it passes

Run: `pnpm test server/routers/__tests__/ocr-country-detection.test.ts`

Expected: PASS (all 3 tests)

### Step 4: Commit

```bash
git add server/_core/ocr-country-detection.ts server/routers/__tests__/ocr-country-detection.test.ts
git commit -m "feat: add OCR country detection service with LLM integration"
```

---

## Task 2: Add Validation Rules to Backend

**Files:**
- Modify: `server/routers/persons.ts`

### Step 1: Write failing test for validation

Add to `server/persons.test.ts`:

```typescript
it("should warn when Documento_Extranjero lacks pais_documento", async () => {
  const caller = createCaller(createContext());

  const result = await caller.persons.createPerson({
    nombre: "Juan",
    apellidos: "García",
    fecha_nacimiento: "1990-01-01",
    idioma_principal: "es",
    canal_llegada: "boca_a_boca",
    tipo_documento: "Documento_Extranjero",
    numero_documento: "A12345678",
    pais_documento: null, // Missing!
  });

  // Should succeed but include warning
  expect(result).toHaveProperty("id");
  expect(result).toHaveProperty("validation_warnings");
  expect(result.validation_warnings).toContain(
    "pais_documento required for Documento_Extranjero"
  );
});

it("should not warn when Documento_Extranjero has pais_documento", async () => {
  const caller = createCaller(createContext());

  const result = await caller.persons.createPerson({
    nombre: "Juan",
    apellidos: "García",
    fecha_nacimiento: "1990-01-01",
    idioma_principal: "es",
    canal_llegada: "boca_a_boca",
    tipo_documento: "Documento_Extranjero",
    numero_documento: "A12345678",
    pais_documento: "FR",
  });

  expect(result).toHaveProperty("id");
  expect(result.validation_warnings || []).not.toContain(
    "pais_documento required for Documento_Extranjero"
  );
});

it("should not warn for DNI without pais_documento", async () => {
  const caller = createCaller(createContext());

  const result = await caller.persons.createPerson({
    nombre: "Juan",
    apellidos: "García",
    fecha_nacimiento: "1990-01-01",
    idioma_principal: "es",
    canal_llegada: "boca_a_boca",
    tipo_documento: "DNI",
    numero_documento: "12345678A",
    pais_documento: null,
  });

  expect(result).toHaveProperty("id");
  expect(result.validation_warnings || []).not.toContain(
    "pais_documento required"
  );
});
```

Run: `pnpm test server/persons.test.ts -t "warn when Documento_Extranjero"`

Expected: FAIL - `validation_warnings` property doesn't exist

### Step 2: Update Zod schema in persons.ts

Find the `createPersonSchema` in `server/routers/persons.ts` and update it:

```typescript
const createPersonSchema = z.object({
  // ... existing fields ...
  tipo_documento: z
    .enum([
      "DNI",
      "NIE",
      "Pasaporte",
      "Sin_Documentacion",
      "Documento_Extranjero",
    ])
    .nullable(),
  pais_documento: z.string().nullable().optional(),
  // ... rest of schema ...
});
```

### Step 3: Add validation logic to createPerson procedure

Find the `createPerson` procedure in `server/routers/persons.ts` and add validation:

```typescript
createPerson: protectedProcedure
  .input(createPersonSchema)
  .mutation(async ({ ctx, input }) => {
    const validationWarnings: string[] = [];

    // Validate pais_documento requirement for Documento_Extranjero
    if (
      input.tipo_documento === "Documento_Extranjero" &&
      !input.pais_documento
    ) {
      validationWarnings.push(
        "pais_documento required for Documento_Extranjero"
      );
    }

    // Insert into database
    const { data, error } = await ctx.supabase
      .from("persons")
      .insert([
        {
          ...input,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    return {
      ...data,
      validation_warnings: validationWarnings,
    };
  }),
```

### Step 4: Run tests to verify they pass

Run: `pnpm test server/persons.test.ts -t "warn when Documento_Extranjero"`

Expected: PASS (all 3 validation tests)

### Step 5: Commit

```bash
git add server/routers/persons.ts
git commit -m "feat: add validation warnings for missing pais_documento on Documento_Extranjero"
```

---

## Task 3: Update Frontend Form with Validation UI

**Files:**
- Modify: `client/src/pages/PersonForm.tsx`
- Test: `client/src/features/persons/__tests__/document-validation.test.ts`

### Step 1: Write test for validation warning display

Create `client/src/features/persons/__tests__/document-validation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonForm } from "../PersonForm";

describe("Document Validation UI", () => {
  it("should show warning for Documento_Extranjero without pais_documento", async () => {
    render(<PersonForm />);

    // Select Documento_Extranjero
    const tipoDocSelect = screen.getByLabelText(/tipo de documento/i);
    await userEvent.selectOption(tipoDocSelect, "Documento_Extranjero");

    // Leave pais_documento empty
    const paisDocField = screen.getByLabelText(/país del documento/i);
    expect(paisDocField).toHaveValue("");

    // Should show warning
    const warning = screen.getByText(
      /país de origen del documento requerido/i
    );
    expect(warning).toBeInTheDocument();
    expect(paisDocField).toHaveClass("border-red-500");
  });

  it("should hide warning when pais_documento is filled", async () => {
    render(<PersonForm />);

    const tipoDocSelect = screen.getByLabelText(/tipo de documento/i);
    await userEvent.selectOption(tipoDocSelect, "Documento_Extranjero");

    const paisDocField = screen.getByLabelText(/país del documento/i);
    await userEvent.selectOption(paisDocField, "FR");

    const warning = screen.queryByText(/país de origen del documento/i);
    expect(warning).not.toBeInTheDocument();
    expect(paisDocField).not.toHaveClass("border-red-500");
  });

  it("should not show warning for DNI without pais_documento", async () => {
    render(<PersonForm />);

    const tipoDocSelect = screen.getByLabelText(/tipo de documento/i);
    await userEvent.selectOption(tipoDocSelect, "DNI");

    const paisDocField = screen.getByLabelText(/país del documento/i);
    expect(paisDocField).toHaveValue("");

    const warning = screen.queryByText(/país de origen del documento/i);
    expect(warning).not.toBeInTheDocument();
  });
});
```

Run: `pnpm test client/src/features/persons/__tests__/document-validation.test.ts`

Expected: FAIL - validation UI doesn't exist yet

### Step 2: Add validation state to PersonForm

Find `client/src/pages/PersonForm.tsx` and add validation logic:

```typescript
import { useEffect, useState } from "react";

export function PersonForm() {
  const [formData, setFormData] = useState({
    // ... existing fields ...
    tipo_documento: null,
    pais_documento: null,
  });

  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  // Validate whenever tipo_documento or pais_documento changes
  useEffect(() => {
    const warnings: string[] = [];

    if (
      formData.tipo_documento === "Documento_Extranjero" &&
      !formData.pais_documento
    ) {
      warnings.push("País de origen del documento requerido para Documento Extranjero");
    }

    setValidationWarnings(warnings);
  }, [formData.tipo_documento, formData.pais_documento]);

  // ... rest of component ...
}
```

### Step 3: Add warning UI to pais_documento field

Find the `pais_documento` field in PersonForm and update it:

```typescript
const paisDocWarning = validationWarnings.find(
  (w) => w.includes("País de origen")
);

return (
  <div>
    {/* ... other form fields ... */}

    <div className="mb-4">
      <label htmlFor="pais_documento" className="block text-sm font-medium mb-2">
        País del Documento
      </label>
      <select
        id="pais_documento"
        value={formData.pais_documento || ""}
        onChange={(e) =>
          setFormData({ ...formData, pais_documento: e.target.value || null })
        }
        className={`w-full px-3 py-2 border rounded-md ${
          paisDocWarning ? "border-red-500" : "border-gray-300"
        }`}
      >
        <option value="">Seleccionar país...</option>
        <option value="FR">Francia</option>
        <option value="ES">España</option>
        <option value="DE">Alemania</option>
        {/* ... more countries ... */}
      </select>
      {paisDocWarning && (
        <p className="text-red-500 text-sm mt-1">{paisDocWarning}</p>
      )}
    </div>

    {/* ... rest of form ... */}
  </div>
);
```

### Step 4: Run tests to verify they pass

Run: `pnpm test client/src/features/persons/__tests__/document-validation.test.ts`

Expected: PASS (all 3 validation UI tests)

### Step 5: Commit

```bash
git add client/src/pages/PersonForm.tsx client/src/features/persons/__tests__/document-validation.test.ts
git commit -m "feat: add inline validation warning UI for missing pais_documento"
```

---

## Task 4: Integrate OCR Suggestion into Form

**Files:**
- Modify: `client/src/pages/PersonForm.tsx`
- Modify: `server/routers/persons.ts` (add new procedure)

### Step 1: Write test for country suggestion display

Add to `client/src/features/persons/__tests__/document-validation.test.ts`:

```typescript
it("should show confirmation checkbox when country suggestion exists", async () => {
  const mockSuggestion = {
    suggested_country_code: "FR",
    confidence: 0.95,
    reasoning: "Document shows French flag",
    alternative_suggestions: ["ES"],
  };

  render(
    <PersonForm initialCountrySuggestion={mockSuggestion} />
  );

  const checkbox = screen.getByRole("checkbox", {
    name: /confirmar país/i,
  });
  expect(checkbox).toBeInTheDocument();
  expect(screen.getByText(/FR/)).toBeInTheDocument();
});

it("should pre-fill pais_documento with suggestion", async () => {
  const mockSuggestion = {
    suggested_country_code: "FR",
    confidence: 0.95,
    reasoning: "Document shows French flag",
    alternative_suggestions: ["ES"],
  };

  render(
    <PersonForm initialCountrySuggestion={mockSuggestion} />
  );

  const paisDocField = screen.getByLabelText(/país del documento/i);
  expect(paisDocField).toHaveValue("FR");
});
```

Run: `pnpm test client/src/features/persons/__tests__/document-validation.test.ts -t "suggestion"`

Expected: FAIL - suggestion UI doesn't exist

### Step 2: Add suggestion state to PersonForm

Update `client/src/pages/PersonForm.tsx`:

```typescript
interface CountrySuggestion {
  suggested_country_code: string;
  confidence: number;
  reasoning: string;
  alternative_suggestions: string[];
}

export function PersonForm({
  initialCountrySuggestion,
}: {
  initialCountrySuggestion?: CountrySuggestion;
}) {
  const [formData, setFormData] = useState({
    // ... existing fields ...
    pais_documento: initialCountrySuggestion?.suggested_country_code || null,
  });

  const [countrySuggestion, setCountrySuggestion] = useState(
    initialCountrySuggestion
  );
  const [suggestionConfirmed, setSuggestionConfirmed] = useState(false);

  // ... rest of component ...
}
```

### Step 3: Add confirmation UI

Update the pais_documento field section:

```typescript
return (
  <div>
    {/* ... other fields ... */}

    {countrySuggestion && !suggestionConfirmed && (
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={suggestionConfirmed}
            onChange={(e) => setSuggestionConfirmed(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">
            Confirmar país: <strong>{countrySuggestion.suggested_country_code}</strong>
            {countrySuggestion.confidence && (
              <span className="text-xs text-gray-600 ml-2">
                (confianza: {Math.round(countrySuggestion.confidence * 100)}%)
              </span>
            )}
          </span>
        </label>
        <p className="text-xs text-gray-600 mt-1">
          {countrySuggestion.reasoning}
        </p>
      </div>
    )}

    <div className="mb-4">
      <label htmlFor="pais_documento" className="block text-sm font-medium mb-2">
        País del Documento
      </label>
      <select
        id="pais_documento"
        value={formData.pais_documento || ""}
        onChange={(e) => {
          setFormData({ ...formData, pais_documento: e.target.value || null });
          setSuggestionConfirmed(!!e.target.value); // Auto-confirm on change
        }}
        className={`w-full px-3 py-2 border rounded-md ${
          paisDocWarning ? "border-red-500" : "border-gray-300"
        }`}
      >
        <option value="">Seleccionar país...</option>
        {/* ... country options ... */}
      </select>
      {paisDocWarning && (
        <p className="text-red-500 text-sm mt-1">{paisDocWarning}</p>
      )}
    </div>

    {/* ... rest of form ... */}
  </div>
);
```

### Step 4: Run tests to verify they pass

Run: `pnpm test client/src/features/persons/__tests__/document-validation.test.ts`

Expected: PASS (all tests including suggestion tests)

### Step 5: Commit

```bash
git add client/src/pages/PersonForm.tsx
git commit -m "feat: add country suggestion confirmation UI in person form"
```

---

## Task 5: Integration Testing

**Files:**
- Modify: `server/persons.test.ts` (add integration tests)

### Step 1: Write end-to-end integration test

Add to `server/persons.test.ts`:

```typescript
it("should create Documento_Extranjero with country suggestion and validation", async () => {
  const caller = createCaller(createContext());

  // Create person with Documento_Extranjero and country
  const result = await caller.persons.createPerson({
    nombre: "Marie",
    apellidos: "Dupont",
    fecha_nacimiento: "1985-06-15",
    idioma_principal: "es",
    canal_llegada: "boca_a_boca",
    tipo_documento: "Documento_Extranjero",
    numero_documento: "AB123456",
    pais_documento: "FR", // Provided
  });

  expect(result.id).toBeDefined();
  expect(result.tipo_documento).toBe("Documento_Extranjero");
  expect(result.pais_documento).toBe("FR");
  expect(result.validation_warnings || []).not.toContain(
    "pais_documento required"
  );
});

it("should warn but allow save for Documento_Extranjero without country", async () => {
  const caller = createCaller(createContext());

  const result = await caller.persons.createPerson({
    nombre: "Unknown",
    apellidos: "Person",
    fecha_nacimiento: "1990-01-01",
    idioma_principal: "es",
    canal_llegada: "boca_a_boca",
    tipo_documento: "Documento_Extranjero",
    numero_documento: "XX999999",
    pais_documento: null, // Missing
  });

  expect(result.id).toBeDefined();
  expect(result.validation_warnings).toContain(
    "pais_documento required for Documento_Extranjero"
  );
});
```

Run: `pnpm test server/persons.test.ts -t "integration"`

Expected: PASS

### Step 2: Commit

```bash
git add server/persons.test.ts
git commit -m "test: add integration tests for country validation"
```

---

## Task 6: Full Test Suite Verification

### Step 1: Run all tests

Run: `pnpm test`

Expected: All tests pass (no new failures, all new tests pass)

### Step 2: Run TypeScript check

Run: `pnpm tsc --noEmit`

Expected: 0 errors

### Step 3: Build production

Run: `pnpm build`

Expected: Build succeeds

### Step 4: Final commit

```bash
git add -A
git commit -m "feat: complete OCR country detection and validation implementation"
```

---

## Verification Checklist

- [ ] `suggestCountryFromDocument` function works with LLM
- [ ] Validation warnings appear for missing `pais_documento` on `Documento_Extranjero`
- [ ] Confirmation checkbox shows when suggestion exists
- [ ] Form prevents save if suggestion unconfirmed (when suggestion exists)
- [ ] Inline error UI shows for validation failures
- [ ] All 559+ tests pass
- [ ] TypeScript: 0 errors
- [ ] Production build succeeds
- [ ] No regressions in existing functionality

---

## Notes

- Country codes use ISO 3166-1 alpha-2 format (FR, ES, DE, etc.)
- LLM suggestion is non-blocking - user can override or skip
- Validation is warning-mode - saves are allowed even with warnings
- All validation happens on both frontend (UX) and backend (data integrity)
- Consider adding dashboard report of incomplete records in future enhancement
