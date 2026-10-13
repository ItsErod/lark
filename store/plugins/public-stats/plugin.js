// @lark name: Public stats
// @lark description: Look up a public Steam profile, open an Overwatch career link, or share numbers you typed.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Stats",
    nameEditable: true,
    tools: ["stats"],
    stats: {
      kinds: ["steam", "overwatch", "card"],
      label: "Public profile",
      placeholder: "Steam name, SteamID64, or career link",
      hint: "Steam reads the public community profile. Overwatch opens a career link on overwatch.blizzard.com and does not download it. A card is only the numbers you type. No other site is contacted.",
      fields: ["Note"]
    }
  };
}
