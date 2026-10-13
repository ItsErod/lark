// @lark name: Squad post
// @lark description: Drop a looking-for-group card into the composer. You send it. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Squad",
    nameEditable: true,
    tools: ["lfg"],
    roles: ["Any", "Flex", "Lead"],
    modes: ["Casual", "Ranked", "Custom"],
    sizes: ["2", "3", "4", "5"]
  };
}
