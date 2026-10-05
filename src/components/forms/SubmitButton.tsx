import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pending: boolean;
  pendingText: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pending, pendingText, icon, children }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="w-full">
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          {pendingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
}
