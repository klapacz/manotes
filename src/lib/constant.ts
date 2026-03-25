export const DEFAULT_ACCOUNT_ID = import.meta.env.VITE_ACCOUNT_ID;

if (!DEFAULT_ACCOUNT_ID || typeof DEFAULT_ACCOUNT_ID !== "string") {
  throw new Error("VITE_ACCOUNT_ID is not defined");
}
