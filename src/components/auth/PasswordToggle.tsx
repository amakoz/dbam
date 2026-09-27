import { Eye, EyeOff } from "lucide-react";
import type { Translate } from "@/i18n";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
  t: Translate;
}

export function PasswordToggle({ visible, onToggle, t }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute top-1/2 right-3 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
      aria-label={visible ? t("auth.form.hidePassword") : t("auth.form.showPassword")}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
