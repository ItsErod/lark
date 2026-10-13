// @lark name: Crew check
// @lark description: Post a crew list and ask who is ready. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Crew",
    nameEditable: true,
    tools: ["crew"],
    roles: ["Lead", "Flex", "Reserve"]
  };
}
