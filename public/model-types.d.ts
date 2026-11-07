// Shapes the shared rule modules work on (F0.22-43). The browser and the server both run these
// modules; `// @ts-check` modules name the shapes in JSDoc, and `npm run check` checks them.

export interface Hierarchy {
  mode: "free" | "enforced";
  roots: string[];
  children: Record<string, string[]>;
}

export interface CardField {
  id: string;
  name?: string;
  type: string;
  options?: string[];
}

// A project's schema: its workflow, card types, own fields and what it turned off.
export interface ProjectConfig {
  statuses: string[];
  types: string[];
  done: string[];
  fields?: CardField[];
  initial_status?: string;
  transitions?: Record<string, string[]>;
  status_labels?: Record<string, string>;
  hierarchy?: Hierarchy;
  off?: string[];
  views_off?: string[];
  create_off?: string[];
  [setting: string]: unknown;
}

export interface Recurrence {
  unit: "day" | "week" | "month";
  interval: number;
}

// A record read from its Markdown file: frontmatter fields, then the text.
export interface MarkdownRecord {
  title?: string;
  body?: string;
  tags?: unknown;
  [property: string]: unknown;
}

// A card linked to an external source (Obsidian, Jira, Excel), and a record read from one.
export interface SourceLink {
  provider: string;
  key?: string;
  external_id?: string;
  local_fields?: string[];
}
export interface SourcedCard {
  source?: SourceLink | null;
  [field: string]: unknown;
}
export interface SourceRecord {
  id: string;
  // Raw values from the provider, checked as they are mapped.
  fields?: Record<string, any>;
}
