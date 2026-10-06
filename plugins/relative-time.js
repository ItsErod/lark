// @lark name: Relative time
// @lark description: Show 3m ago instead of the clock. The tooltip stays the local date and time.

function onMessage(message, api) {
  api.effect(message, "relative-time");
  return message;
}

function describe() {
  return { relativeTime: true };
}
