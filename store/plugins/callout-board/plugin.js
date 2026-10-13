// @lark name: Callout board
// @lark description: Insert a short callout at the cursor. Add your own lines. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Callouts",
    nameEditable: true,
    tools: ["callouts"],
    callouts: ["On my way", "Need help", "Fall back", "Enemy spotted", "Clear", "Hold"]
  };
}
