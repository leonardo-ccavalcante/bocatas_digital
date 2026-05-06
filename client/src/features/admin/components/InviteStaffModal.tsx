/**
 * InviteStaffModal.tsx — D-D9: Modal to invite new staff user.
 * Job 6, AC3: email (required), nombre (required), role selector (admin | voluntario).
 * Job 6, AC5: Supabase sends invite email; user sets own password.
 * Job 6, AC7: email already in use → "Este email ya tiene una cuenta".
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateStaffUserSchema, type CreateStaffUserValues } from "../schemas";
import { useCreateStaffUser } from "../hooks/useStaffUsers";
import { Mail } from "lucide-react";

interface InviteStaffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteStaffModal({ open, onOpenChange }: InviteStaffModalProps) {
  const createMutation = useCreateStaffUser();

  const form = useForm<CreateStaffUserValues>({
    // tRPC error boundary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreateStaffUserSchema) as any,
    defaultValues: {
      email: "",
      nombre: "",
      role: "voluntario",
    },
  });

  const handleSubmit = async (values: CreateStaffUserValues) => {
    try {
      await createMutation.mutateAsync(values);
      form.reset();
      onOpenChange(false);
    // tRPC error boundary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Handle specific error cases (Job 6, AC7)
      const message = error?.message ?? "";
      if (
        message.toLowerCase().includes("ya tiene una cuenta") ||
        message.toLowerCase().includes("conflict")
      ) {
        form.setError("email", {
          type: "manual",
          message: "Este email ya tiene una cuenta en el sistema",
        });
      } else {
        form.setError("root", {
          type: "manual",
          message: message || "Error al enviar la invitación",
        });
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Se enviará una invitación al email indicado. El usuario deberá aceptarla para acceder.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="usuario@bocatas.org"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="voluntario">Voluntario</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Root-level form error */}
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="gap-2"
              >
                <Mail className="w-4 h-4" />
                {createMutation.isPending ? "Enviando..." : "Enviar invitación"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
