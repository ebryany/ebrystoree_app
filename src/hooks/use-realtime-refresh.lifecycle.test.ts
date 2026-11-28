import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  effect: vi.fn(),
  setAuth: vi.fn<() => Promise<void>>(),
  subscribe: vi.fn<(callback: (status: string) => void) => void>(),
  on: vi.fn(),
  removeChannel: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("react", () => ({ useEffect: mock.effect, useId: () => "instance", useRef: (current: unknown) => ({ current }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mock }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    realtime: { setAuth: mock.setAuth },
    channel: () => ({ on: mock.on, subscribe: mock.subscribe }),
    removeChannel: mock.removeChannel,
  },
}));

import { useRealtimeRefresh } from "./use-realtime-refresh";

describe("Realtime subscription lifecycle with mocked socket", () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal("document", new EventTarget());
    vi.stubGlobal("window", new EventTarget());
    mock.effect.mockImplementation((fn: () => () => void) => { dispose = fn(); });
    mock.setAuth.mockResolvedValue(undefined);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits for auth before joining and resyncs once after reconnect without event invalidations", async () => {
    let finishAuth!: () => void;
    mock.setAuth.mockReturnValueOnce(new Promise<void>((resolve) => { finishAuth = resolve; }));
    const onResync = vi.fn();
    const onEvent = vi.fn();
    useRealtimeRefresh({ channel: "threads", tables: ["social_posts"], keys: [], onResync, onEvent });
    expect(mock.subscribe).not.toHaveBeenCalled();
    finishAuth();
    await Promise.resolve();

    const status = mock.subscribe.mock.calls[0][0];
    status("SUBSCRIBED");
    await vi.runAllTimersAsync();
    expect(onResync).not.toHaveBeenCalled();

    mock.on.mock.calls[0][2]({ eventType: "UPDATE", new: { id: "post-a" } });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ table: "social_posts" }));
    await vi.runAllTimersAsync();
    expect(onResync).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("offline"));
    status("CHANNEL_ERROR");
    window.dispatchEvent(new Event("online"));
    status("SUBSCRIBED");
    await vi.runAllTimersAsync();
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(mock.invalidateQueries).not.toHaveBeenCalled();
  });

  it("does not subscribe after unmount while auth is pending", async () => {
    let finishAuth!: () => void;
    mock.setAuth.mockReturnValueOnce(new Promise<void>((resolve) => { finishAuth = resolve; }));
    useRealtimeRefresh({ channel: "threads", tables: ["social_posts"], keys: [] });
    dispose?.();
    dispose = undefined;
    finishAuth();
    await Promise.resolve();
    expect(mock.subscribe).not.toHaveBeenCalled();
    expect(mock.removeChannel).not.toHaveBeenCalled();
  });

  it("retries failed initial auth on network recovery without joining anonymously", async () => {
    mock.setAuth.mockRejectedValueOnce(new Error("offline"));
    const onResync = vi.fn();
    useRealtimeRefresh({ channel: "threads", tables: ["social_posts"], keys: [], onResync });
    await Promise.resolve();
    expect(mock.subscribe).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    expect(mock.subscribe).toHaveBeenCalledTimes(1);
    mock.subscribe.mock.calls[0][0]("SUBSCRIBED");
    await vi.runAllTimersAsync();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("resyncs on initial join when requested and replaces a closed channel", async () => {
    const onResync = vi.fn();
    const onEvent = vi.fn();
    useRealtimeRefresh({ channel: "threads", tables: ["social_posts"], keys: [], resyncOnJoin: true, onResync, onEvent });
    await Promise.resolve();
    const first = mock.subscribe.mock.calls[0][0];
    first("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(300);
    expect(onResync).toHaveBeenCalledTimes(1);

    first("CLOSED");
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.subscribe).toHaveBeenCalledTimes(2);
    mock.on.mock.calls[0][2]({ eventType: "UPDATE" });
    expect(onEvent).not.toHaveBeenCalled();
    mock.subscribe.mock.calls[1][0]("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(300);
    expect(onResync).toHaveBeenCalledTimes(2);
  });
});
