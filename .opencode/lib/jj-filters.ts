// Revset filter to exclude noisy files from diffs
export const EXCLUDE_FILTER = "~(file:pnpm-lock.yaml | glob:**/*.gen.ts)";
