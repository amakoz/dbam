// Save feedback on a dashboard row. Adding a plan or a done record is progress (success tint); removing one only
// confirms the undo, so it stays neutral and the row doesn't look planned or done any more.

export type SavedTone = "success" | "neutral";

export interface SavedFeedback {
  /** Translated `dashboard.screenings.saved.<intent>` message. */
  text: string;
  tone: SavedTone;
}

export const SAVED_ROW_CLASS = {
  // Success tokens only (like the success badge and the saved alert), never a tier token: a saved row must not read
  // as tier styling, and a tier restyle must not change it.
  success: "rounded-lg bg-success/10 ring-2 ring-success",
  neutral: "rounded-lg bg-accent ring-2 ring-muted-foreground/30",
} as const satisfies Record<SavedTone, string>;
