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
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors outline-none focus-visible:ring-2"
      aria-label={visible ? t("auth.form.hidePassword") : t("auth.form.showPassword")}
    >
      {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
    </button>
  );
}
