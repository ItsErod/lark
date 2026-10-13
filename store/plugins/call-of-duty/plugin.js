// @lark name: Call of Duty
// @lark description: Group posts, loadouts, and callouts for Call of Duty. Stats are numbers you type. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "Call of Duty",
    nameEditable: false,
    tools: ["session", "lfg", "build", "callouts", "crew", "stats"],
    roles: ["Assault", "Support", "Sniper", "Flex"],
    modes: ["Multiplayer", "Warzone", "Zombies", "Ranked"],
    sizes: ["2", "3", "4"],
    slots: ["Weapon", "Muzzle", "Barrel", "Optic", "Stock", "Perk"],
    callouts: ["Enemy spotted", "Reloading", "One shot", "Holding", "Push", "Fall back", "UAV up", "Need plates"],
    stats: {
      kinds: ["card"],
      label: "Share card",
      placeholder: "Activision ID",
      hint: "Activision does not publish a keyless stats API. Lark does not sign in. The card is the numbers you type.",
      fields: ["K/D", "Wins", "Playlist"]
    }
  };
}
