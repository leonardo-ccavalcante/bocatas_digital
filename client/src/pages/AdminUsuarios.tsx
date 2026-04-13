/**
 * AdminUsuarios.tsx — D-E3: Staff user management page.
 * Route: /admin/usuarios
 * Access: superadmin-only (Job 6, AC1).
 * Features: staff list + invite modal (Job 6, AC2–AC8).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, Users } from "lucide-react";
import { StaffUserList } from "@/features/admin/components/StaffUserList";
import { InviteStaffModal } from "@/features/admin/components/InviteStaffModal";

export default function AdminUsuarios() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Usuarios del sistema</h1>
              <p className="text-xs text-muted-foreground">Solo superadmin</p>
            </div>
          </div>
          <Button
            onClick={() => setInviteOpen(true)}
            size="sm"
            className="gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Invitar usuario
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <StaffUserList />
      </div>

      {/* Invite modal */}
      <InviteStaffModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
