// @lark name: Deadlock
// @lark description: Lane posts, hero builds, callouts, and a public Steam profile for Deadlock. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Deadlock",
    nameEditable: false,
    tools: ["session", "lfg", "build", "callouts", "crew", "stats"],
    roles: ["Lane", "Roam", "Flex"],
    modes: ["Normal", "Ranked"],
    sizes: ["2", "4", "6"],
    slots: ["Hero", "Spirit", "Vitality", "Weapon", "Flex"],
    callouts: ["Walker down", "Urn", "Need heal", "Fall back", "Ultimate ready", "Push lane", "Defend base", "Mid"],
    stats: {
      kinds: ["steam"],
      label: "Steam profile",
      placeholder: "Vanity name or SteamID64",
      hint: "Valve does not publish Deadlock match stats. This uses the public Steam profile only.",
      fields: ["Hero", "Note"]
    }
  };
}
