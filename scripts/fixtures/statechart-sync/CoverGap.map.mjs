// Independent reproduction from issue #40: a settled state still has an outgoing approval.
export const readerActions = ["Approve", "Direct"];
export const state = (v) => v.s;
export const step = (action) => ({
  Start: "you start review",
  Ask: "you ask for a decision",
  Approve: "you approve the decision",
  Direct: "you approve directly",
})[action] ?? "";
