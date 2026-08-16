/**
 * LLMSettingsPage — Superadmin page to configure the LLM provider.
 *
 * Shows:
 * - Current provider detection (OpenRouter, OpenAI, Anthropic, etc.)
 * - Dropdown of available models fetched from the provider
 * - Save button to persist the selected model
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function LLMSettingsPage() {
  const configQuery = trpc.llmSettings.getConfig.useQuery();
  const modelsQuery = trpc.llmSettings.listModels.useQuery(undefined, {
    enabled: !!configQuery.data?.hasApiKey,
    retry: false,
  });
  const updateMutation = trpc.llmSettings.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada — el modelo LLM ha sido actualizado.");
      configQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  const [selectedModel, setSelectedModel] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState("");

  const currentModel = configQuery.data?.model ?? "";
  const provider = configQuery.data?.provider ?? "unknown";
  const hasApiKey = configQuery.data?.hasApiKey ?? false;

  const filteredModels = (modelsQuery.data?.models ?? []).filter((m) =>
    m.id.toLowerCase().includes(searchFilter.toLowerCase()) ||
    m.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleSave = () => {
    const model = selectedModel || currentModel;
    if (!model) return;
    updateMutation.mutate({ model });
  };

  const providerLabels: Record<string, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    local: "Local (Ollama/LM Studio)",
    "manus-forge": "Manus Forge (built-in)",
    custom: "Custom Provider",
  };

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración LLM</h1>
        <p className="text-muted-foreground mt-1">
          Configura el proveedor y modelo de lenguaje para la generación de informes sociales.
        </p>
      </div>

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Proveedor actual</CardTitle>
          <CardDescription>
            El sistema detecta automáticamente el proveedor según la URL base configurada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Proveedor</Label>
              <p className="font-medium">{providerLabels[provider] ?? provider}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <p className="font-medium">
                {hasApiKey ? (
                  <span className="text-green-600">Configurada</span>
                ) : (
                  <span className="text-red-600">No configurada</span>
                )}
              </p>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Modelo actual</Label>
              <p className="font-mono text-sm">{currentModel || "—"}</p>
            </div>
          </div>

          {!hasApiKey && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Para usar un proveedor externo, configura las variables de entorno:
              <code className="block mt-1 font-mono text-xs">
                LLM_BASE_URL=https://openrouter.ai/api/v1<br />
                LLM_API_KEY=sk-or-...<br />
                LLM_MODEL=google/gemini-2.5-flash
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Selection */}
      {hasApiKey && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Seleccionar modelo</CardTitle>
            <CardDescription>
              Elige el modelo a usar para la generación de informes. La lista se obtiene del proveedor configurado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modelsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Cargando modelos disponibles...</p>
            )}

            {modelsQuery.error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                Error al cargar modelos: {modelsQuery.error.message}
              </div>
            )}

            {modelsQuery.data && (
              <>
                <div>
                  <Label htmlFor="model-search">Buscar modelo</Label>
                  <Input
                    id="model-search"
                    placeholder="Filtrar por nombre..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Modelo</Label>
                  <Select
                    value={selectedModel || currentModel}
                    onValueChange={setSelectedModel}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecciona un modelo" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredModels.slice(0, 50).map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <span className="font-mono text-xs">{model.id}</span>
                          {model.context_length && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({Math.round(model.context_length / 1000)}k ctx)
                            </span>
                          )}
                        </SelectItem>
                      ))}
                      {filteredModels.length > 50 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          +{filteredModels.length - 50} más — usa el filtro para encontrar tu modelo
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filteredModels.length} modelos disponibles
                  </p>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || (!selectedModel && !currentModel)}
                >
                  {updateMutation.isPending ? "Guardando..." : "Guardar modelo"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Proveedores compatibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p>El sistema es compatible con cualquier proveedor que exponga la API de OpenAI Chat Completions:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>OpenRouter</strong> — acceso a 200+ modelos con una sola API key</li>
              <li><strong>OpenAI</strong> — GPT-4o, GPT-4o-mini</li>
              <li><strong>Anthropic</strong> — Claude 3.5 Sonnet, Claude 4</li>
              <li><strong>Google</strong> — Gemini 2.5 Flash/Pro (via OpenRouter)</li>
              <li><strong>Local</strong> — Ollama, LM Studio, vLLM</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
