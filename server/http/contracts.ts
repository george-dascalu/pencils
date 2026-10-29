import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyReply, FastifyRequest } from "fastify";

// Compatibility boundary for the existing, incrementally migrated vault services.
// New HTTP infrastructure is checked strictly; domain validation stays in the vault.
export type LegacyService = Record<string, any>;
export type Input = Record<string, any>;
export interface User {
  username: string;
  name?: string;
  admin?: boolean;
  automatic?: boolean;
  [field: string]: unknown;
}
export interface Services {
  store: LegacyService;
  auth: LegacyService;
  sources: LegacyService;
  miro: LegacyService;
  automations: LegacyService;
  index: LegacyService;
  diagnostics: LegacyService;
  requests: LegacyService;
  rooms: Map<string, Map<string, any>>;
}
export interface RequestContext extends Services {
  req: IncomingMessage & {
    pencilsInput?: Input;
    socket: IncomingMessage["socket"] & { encrypted?: boolean };
  };
  res: ServerResponse;
  request: FastifyRequest;
  reply: FastifyReply;
  url: URL;
  method: string;
  write: boolean;
  parts: string[];
  resource: string;
  project: string;
  kind: string;
  id: string;
  user: User;
  headers: Record<string, string>;
  json(status: number, data: unknown): FastifyReply;
  bytes(
    data: string | Buffer,
    type: string,
    extra?: Record<string, string>,
  ): FastifyReply;
  authorizeWrite(): Promise<void>;
  mutate<T>(fn: () => Promise<T>): Promise<T>;
}
export type Handler = (context: RequestContext) => Promise<unknown>;

export interface TaskInput {
  title?: string;
  body?: string;
  revision?: string;
  priority?: "none" | "low" | "medium" | "high" | "urgent";
  status?: string;
  type?: string;
  assignee?: string;
  start?: string | null;
  due?: string | null;
}
export interface DocumentInput {
  title?: string;
  body?: string;
  revision?: string;
  folder?: string | null;
}
