import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function worker(visible = false, supported = true) {
  const events: Record<string, (event: unknown) => void> = {};
  const calls: string[] = [];
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { URL, self: {
    navigator: supported ? { clearAppBadge: async () => { calls.push("clear"); }, setAppBadge: async () => { calls.push("set"); } } : {},
    location: { origin: "https://mojo.example" },
    addEventListener: (name: string, handler: (event: unknown) => void) => { events[name] = handler; },
    registration: { showNotification: async () => { calls.push("notify"); } },
    clients: { matchAll: async () => visible ? [{ visibilityState: "visible" }] : [], openWindow: async () => { calls.push("open"); } },
  }});
  const fire = (name: string, data = {}) => new Promise<void>((resolve, reject) => events[name]({ ...data, waitUntil: (p: Promise<unknown>) => p.then(() => resolve(), reject) }));
  return { fire, calls };
}
test("background push badges; opening app clears", async () => {
  const w = worker(); await w.fire("push"); assert.deepEqual(w.calls, ["notify", "set"]);
  await w.fire("message", { data: { type: "CLEAR_BADGE" } }); assert.equal(w.calls.at(-1), "clear");
});
test("foreground push notifies without leaving a badge", async () => {
  const w = worker(true); await w.fire("push"); assert.deepEqual(w.calls, ["notify", "clear"]);
});
test("notification tap clears before opening song", async () => {
  const w = worker(); await w.fire("notificationclick", { notification: { close() {}, data: { url: "/song/example" } } });
  assert.deepEqual(w.calls, ["clear", "open"]);
});
test("unsupported badge API never breaks alerts", async () => {
  const w = worker(false, false); await w.fire("push"); assert.deepEqual(w.calls, ["notify"]);
  await w.fire("message", { data: { type: "CLEAR_BADGE" } });
});
