import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ImageIcon, X } from "lucide-react";

interface Step6FotoProps {
  profilePhotoPreview: string | null;
  setProfilePhotoBase64: (v: string | null) => void;
  setProfilePhotoPreview: (v: string | null) => void;
  profileInputRef: RefObject<HTMLInputElement | null>;
  handleProfilePhotoFile: (file: File) => Promise<void>;
}

export function Step6Foto({
  profilePhotoPreview,
  setProfilePhotoBase64,
  setProfilePhotoPreview,
  profileInputRef,
  handleProfilePhotoFile,
}: Step6FotoProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Foto de perfil (opcional)</p>
            <p className="text-xs text-muted-foreground">Ayuda a identificar a la persona en el check-in</p>
          </div>
        </div>

        {profilePhotoPreview ? (
          <div className="space-y-2">
            <img
              src={profilePhotoPreview}
              alt="Vista previa"
              className="h-36 w-36 rounded-full object-cover mx-auto border-2 border-primary"
            />
            <div className="flex gap-2 justify-center">
              <Button type="button" size="sm" variant="outline"
                onClick={() => { setProfilePhotoBase64(null); setProfilePhotoPreview(null); }}>
                <X className="mr-1 h-3 w-3" /> Eliminar
              </Button>
              <Button type="button" size="sm" variant="outline"
                onClick={() => profileInputRef.current?.click()}>
                <Camera className="mr-1 h-3 w-3" /> Repetir
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1"
              onClick={() => {
                if (profileInputRef.current) {
                  profileInputRef.current.accept = "image/*";
                  profileInputRef.current.setAttribute("capture", "user");
                  profileInputRef.current.click();
                }
              }}>
              <Camera className="mr-2 h-4 w-4" /> Usar cámara
            </Button>
            <Button type="button" variant="outline" className="flex-1"
              onClick={() => {
                if (profileInputRef.current) {
                  profileInputRef.current.accept = "image/*";
                  profileInputRef.current.removeAttribute("capture");
                  profileInputRef.current.click();
                }
              }}>
              <ImageIcon className="mr-2 h-4 w-4" /> Desde galería
            </Button>
          </div>
        )}

        <input ref={profileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleProfilePhotoFile(file);
            e.target.value = "";
          }} />
      </div>
      <p className="text-xs text-center text-muted-foreground">
        Puedes añadir o cambiar la foto más adelante desde el perfil.
      </p>
    </div>
  );
}
