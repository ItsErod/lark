// @lark name: Build card
// @lark description: Share a loadout you typed. The card waits in the composer. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Build",
    nameEditable: true,
    tools: ["build"],
    slots: ["Weapon", "Attachment", "Perk", "Gear"]
  };
}
