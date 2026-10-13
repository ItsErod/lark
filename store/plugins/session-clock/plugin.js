// @lark name: Session clock
// @lark description: Start a session timer and, if you ask, show it on your status. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Session",
    nameEditable: true,
    tools: ["session"]
  };
}
