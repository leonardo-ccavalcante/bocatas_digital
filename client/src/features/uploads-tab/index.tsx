interface UploadsTabProps {
  programaId: string;
}

// Phase 1 Task 11+ fills this in.
export default function UploadsTab({ programaId }: UploadsTabProps) {
  void programaId;
  return (
    <div className="p-8 text-center text-muted-foreground">
      Uploads — próximamente
    </div>
  );
}
