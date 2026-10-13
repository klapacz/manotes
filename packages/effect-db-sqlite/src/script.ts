export const statementSeparator = "--> statement-breakpoint";

export function splitStatements(sql: string): readonly string[] {
  const tokens =
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--> statement-breakpoint|--[^\n]*|\/\*[\s\S]*?\*\//g;

  const statements: string[] = [];
  let start = 0;

  for (const token of sql.matchAll(tokens)) {
    if (token[0] !== statementSeparator) continue;
    statements.push(sql.slice(start, token.index).trim());
    start = token.index + token[0].length;
  }

  statements.push(sql.slice(start).trim());

  return statements.filter((statement) => statement.length > 0);
}

export * as EffectDbSqliteScript from "./script";
