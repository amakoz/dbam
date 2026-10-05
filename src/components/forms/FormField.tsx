import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  endContent,
}: FormFieldProps) {
  const descriptionId = `${id}-description`;
  const hasDescription = Boolean(error) || Boolean(hint);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className={cn(endContent != null && "pr-10")}
        />
        {endContent}
      </div>
      {hasDescription && (
        <div id={descriptionId} className="text-muted-foreground text-sm">
          {error ? (
            <p className="text-destructive flex items-center gap-1 text-sm">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
              {error}
            </p>
          ) : (
            hint
          )}
        </div>
      )}
    </div>
  );
}
