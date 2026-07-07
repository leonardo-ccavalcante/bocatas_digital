import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RepartoNumberList } from "./RepartoNumberList";

interface Props {
  kgAlimentos: string;
  kgCarne: string;
  albaranes: string[];
  facturas: string[];
  onKgAlimentos: (v: string) => void;
  onKgCarne: (v: string) => void;
  onAlbaranes: (v: string[]) => void;
  onFacturas: (v: string[]) => void;
}

/** Kg totals + the repeatable albarán / factura lists (up to 4 each). */
export function RepartoExtrasFields(props: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reparto-kg-alimentos">Kg totales de alimentos</Label>
          <Input
            id="reparto-kg-alimentos"
            type="number"
            value={props.kgAlimentos}
            onChange={(e) => props.onKgAlimentos(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reparto-kg-carne">Kg totales de carne</Label>
          <Input
            id="reparto-kg-carne"
            type="number"
            value={props.kgCarne}
            onChange={(e) => props.onKgCarne(e.target.value)}
          />
        </div>
      </div>
      <RepartoNumberList
        label="Nº albarán Banco de Alimentos (hasta 4)"
        addLabel="Añadir albarán"
        placeholder="p. ej. ALB-2026-001"
        values={props.albaranes}
        onChange={props.onAlbaranes}
      />
      <RepartoNumberList
        label="Nº factura de la carne (hasta 4)"
        addLabel="Añadir factura"
        placeholder="p. ej. FAC-CARNE-001"
        values={props.facturas}
        onChange={props.onFacturas}
      />
    </div>
  );
}
