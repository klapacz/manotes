import { TextAttributes } from "@opentui/core";
import dedent from "dedent";
import { Theme } from "./theme";

export function HelpDialog() {
  const theme = Theme.use();

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={20}
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.surface.default}
    >
      <box
        width="90%"
        height="90%"
        border
        borderColor={theme.border.default}
        backgroundColor={theme.surface.default}
        paddingX={1}
        flexDirection="column"
      >
        <text height={2} flexShrink={0} fg={theme.text.default} attributes={TextAttributes.BOLD}>
          Keyboard shortcuts
        </text>
        <scrollbox
          flexGrow={1}
          minHeight={1}
          scrollX={false}
          focused
          scrollbarOptions={{
            trackOptions: {
              foregroundColor: theme.scrollbar.thumb,
              backgroundColor: theme.scrollbar.track,
            },
          }}
        >
          <text fg={theme.text.default}>{shortcuts}</text>
        </scrollbox>
        <text height={1} flexShrink={0} fg={theme.text.default} attributes={TextAttributes.DIM}>
          ? / Space / Escape / q close help
        </text>
      </box>
    </box>
  );
}

const shortcuts = dedent`
  Task list
    j/k, arrows       Next / previous task
    { / }             Previous / next section
    PgUp / PgDn       Previous / next page
    g / G, Home/End   First / last task
    Tab / Shift-Tab   Next / previous tab
    Space, d          Preview selected task
    Enter             Open task in Manotes
    q, Escape         Quit

  Preview
    j/k, arrows       Scroll one line
    Ctrl-U / Ctrl-D   Scroll half a viewport
    PgUp / PgDn       Scroll one viewport
    g / G, Home/End   Scroll to start / end
    J / K             Preview next / previous task
    Enter             Open task in Manotes
    Space, Escape, q  Close preview

  Anywhere
    ?                 Show help
    Ctrl-C            Quit
`;
