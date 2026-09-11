/**
 * Public API surface for Tauri commands, split by domain under `./api/`.
 *
 * This file is a pure re-export barrel: every existing `@/lib/api` import must
 * keep resolving here with the same names and types. Never import a domain
 * module directly from outside `src/lib/api/`.
 */
export * from "./api/core";
export * from "./api/live";
export * from "./api/history";
export * from "./api/analytics";
export * from "./api/players";
export * from "./api/settings";
export * from "./api/cloud";
export * from "./api/overlay";
export * from "./api/tracker";
export * from "./api/updates";
