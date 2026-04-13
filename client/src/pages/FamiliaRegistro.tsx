import { useSearch } from "wouter";
import { IntakeWizard } from "@/features/families/components/IntakeWizard";

export default function FamiliaRegistro() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const titularId = params.get("titular_id") ?? undefined;
  return (
    <div className="container py-6">
      <IntakeWizard titularId={titularId} />
    </div>
  );
}
