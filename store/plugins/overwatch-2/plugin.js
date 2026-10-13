// @lark name: Overwatch 2
// @lark description: Roles, group posts, hero builds, callouts, and a session clock for Overwatch 2. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Overwatch 2",
    nameEditable: false,
    tools: ["session", "lfg", "build", "callouts", "crew", "stats"],
    roles: ["Tank", "Damage", "Support", "Flex"],
    modes: ["Unranked", "Competitive", "Arcade", "Custom"],
    sizes: ["2", "3", "4", "5"],
    slots: ["Hero", "Perk", "Perk", "Stadium"],
    callouts: ["Group up", "Need healing", "Ultimate ready", "Fall back", "Flank left", "Flank right", "Push", "Hold"],
    stats: {
      kinds: ["overwatch", "card"],
      label: "Career link",
      placeholder: "https://overwatch.blizzard.com/...",
      hint: "Paste a public career link. Lark opens overwatch.blizzard.com and does not download the page. Blizzard does not offer a keyless stats API, so a card is only what you type.",
      fields: ["Role", "Rank", "Hero"]
    }
  };
}
