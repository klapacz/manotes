import { defineRule, eslintCompatPlugin, type ESTree } from "@oxlint/plugins";

const readableBodies = defineRule({
  meta: {
    type: "layout",
    docs: {
      description: "Use braces for multiline bodies and keep short if statements on one line.",
    },
    fixable: "code",
    schema: [],
    messages: {
      braces: "Use braces when the body spans multiple lines.",
      compact: "Keep this short if statement on one line without braces.",
    },
  },
  create(context) {
    const source = context.sourceCode;

    function wrap(body: ESTree.Statement, startLine: number) {
      if (body.type === "BlockStatement" || body.loc.end.line === startLine) return;

      context.report({
        node: body,
        messageId: "braces",
        fix: (fixer) => fixer.replaceText(body, `{ ${source.getText(body)} }`),
      });
    }

    return {
      IfStatement(node) {
        const body = node.consequent;
        const statement = body.type === "BlockStatement" ? body.body[0] : body;

        // Collapse only simple statements with no comments or else branch to preserve scope.
        if (
          !node.alternate &&
          (body.type !== "BlockStatement" || body.body.length === 1) &&
          statement &&
          [
            "ReturnStatement",
            "ThrowStatement",
            "ExpressionStatement",
            "BreakStatement",
            "ContinueStatement",
          ].includes(statement.type) &&
          !source.getCommentsInside(node).length
        ) {
          const compact = `if (${source.getText(node.test)}) ${source.getText(statement)}`;

          // Match the formatter's default 100-column width, including indentation.
          if (!compact.includes("\n") && node.loc.start.column + compact.length <= 100) {
            if (source.getText(node) === compact) return;

            context.report({
              node,
              messageId: "compact",
              fix: (fixer) => fixer.replaceText(node, compact),
            });

            return;
          }
        }

        wrap(body, node.loc.start.line);

        if (node.alternate && node.alternate.type !== "IfStatement") {
          const before = source.getTokenBefore(node.alternate);

          if (before) wrap(node.alternate, before.loc.end.line);
        }
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === "BlockStatement") return;

        let body = node.body;

        while (
          body.type === "ParenthesizedExpression" ||
          body.type === "TSAsExpression" ||
          body.type === "TSSatisfiesExpression" ||
          body.type === "TSNonNullExpression" ||
          body.type === "TSTypeAssertion"
        ) {
          body = body.expression;
        }

        // JSX and object literals already have clear delimiters and stay concise.
        if (
          body.type === "ObjectExpression" ||
          body.type === "JSXElement" ||
          body.type === "JSXFragment"
        ) {
          return;
        }

        const arrow = source.getTokenBefore(node.body, (token) => token.value === "=>");

        if (!arrow || arrow.loc.end.line === node.loc.end.line) return;

        const range: [number, number] = [arrow.range[1], node.range[1]];
        const expression = source.text.slice(...range).trim();

        context.report({
          node: node.body,
          messageId: "braces",
          fix(fixer) {
            // Parentheses keep leading comments inside the returned expression, avoiding ASI.
            return fixer.replaceTextRange(range, ` { return (\n${expression}\n); }`);
          },
        });
      },
    };
  },
});

export default eslintCompatPlugin({
  meta: { name: "manotes" },
  rules: { "readable-bodies": readableBodies },
});
