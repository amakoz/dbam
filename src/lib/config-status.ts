import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { MessageKey } from "@/i18n";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  messageKey: MessageKey;
  docsUrl?: string;
  docsLabelKey?: MessageKey;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    messageKey: "config.supabase.missing",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabelKey: "config.supabase.docsLabel",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
