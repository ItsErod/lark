// @lark name: Send later
// @lark description: Queue one message at a time from the composer. Nothing sends early, and nothing sends in a burst.

function describe() {
  return { schedule: true };
}
