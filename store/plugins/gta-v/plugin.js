// @lark name: GTA V
// @lark description: Heist roles, crew checks, and a session clock for GTA V. Stats are numbers you type. Nothing reads the game.

function describe() {
  return { gameDesk: true };
}

function catalog() {
  return {
    game: "GTA V",
    nameEditable: false,
    tools: ["session", "lfg", "build", "callouts", "crew", "stats"],
    roles: ["Leader", "Driver", "Gunner", "Hacker", "Demo", "Lookout"],
    modes: ["Heist", "Freemode", "Race", "Deathmatch"],
    sizes: ["2", "3", "4"],
    slots: ["Vehicle", "Weapon", "Outfit", "Approach"],
    callouts: ["Ready", "Go", "Wait", "Police", "Moving", "At the door", "Package secure"],
    stats: {
      kinds: ["card"],
      label: "Share card",
      placeholder: "Social Club name",
      hint: "Rockstar does not publish a keyless stats API. Lark does not sign in. The card is the numbers you type.",
      fields: ["Rank", "Cash", "K/D"]
    }
  };
}
