import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChoiceGroupProps {
  name: string;
  legend: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

// A single-choice field as native radios in a fieldset; hint and error are wired to the group via aria-describedby.
export function ChoiceGroup({ name, legend, hint, options, value, onChange, error }: ChoiceGroupProps) {
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  return (
    <fieldset
      className="space-y-2"
      aria-describedby={
        [hint ? hintId : null, error ? errorId : null].filter((id) => id !== null).join(" ") || undefined
      }
    >
      <legend className="mb-2 text-sm leading-none font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-within:ring-2",
              value === option.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-input bg-card hover:bg-accent",
              error ? "focus-within:ring-destructive" : "focus-within:ring-ring",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
              className="accent-primary"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive flex items-center gap-1 text-sm">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
