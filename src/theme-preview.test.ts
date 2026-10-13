import { describe, expect, it } from "vitest";
import { beginThemePreview, revertThemePreview, swapThemePreview } from "./theme-preview";

const nord = ":root { color-scheme: dark; --bg-0: #2e3440; --text: #eceff4; --accent: #88c0d0; }";
const oled = ":root { color-scheme: dark; --bg-0: #000; --text: #fff; --accent: #fff; }";

describe("store theme preview", () => {
  it("applies a theme and reverts to the previous look", () => {
    const current = { css: null, theme: "discord", builtin: true };
    const session = beginThemePreview(current, { id: "nord", css: nord });
    expect(session).toEqual({
      id: "nord",
      css: nord,
      previous: { css: null, theme: "discord", builtin: true },
    });
    expect(revertThemePreview(session!)).toEqual(current);
    expect(beginThemePreview(current, { id: " ", css: nord })).toBeNull();
    expect(beginThemePreview(current, { id: "nord", css: "  " })).toBeNull();
  });

  it("keeps the original look when the preview switches themes", () => {
    const session = beginThemePreview(
      { css: ":root { --bg-0: #111; --text: #eee; --accent: #fff; }", theme: "discord", builtin: false },
      { id: "nord", css: nord },
    )!;
    const next = swapThemePreview(session, { id: "oled", css: oled });
    expect(next?.id).toBe("oled");
    expect(next?.css).toBe(oled);
    expect(revertThemePreview(next!)).toEqual(session.previous);
    expect(revertThemePreview(next!).css).not.toBe(nord);
  });
});