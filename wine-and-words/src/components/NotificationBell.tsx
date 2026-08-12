"use client";

import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { markRead, markAllRead } from "@/actions/notifications";
import { Button } from "@/components/ui/Button";
import { cn, formatDateTime } from "@/lib/utils";

export function NotificationBell({ recipientId }: { recipientId: string | null }) {
  const { notifications, unreadCount, loading, refresh } = useNotifications(recipientId);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-cream hover:bg-cream/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-burgundy-dark">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-gold/30 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gold/20 px-4 py-2">
            <span className="font-serif font-semibold text-burgundy-dark">Notifications</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await markAllRead();
                refresh();
              }}
              disabled={unreadCount === 0}
            >
              Mark all read
            </Button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {loading && <li className="px-4 py-6 text-sm text-burgundy-dark/60">Loading…</li>}
            {!loading && notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-burgundy-dark/60">
                You&apos;re all caught up.
              </li>
            )}
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!n.read) {
                      await markRead(n.id);
                      refresh();
                    }
                  }}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-gold/10 px-4 py-3 text-left text-sm hover:bg-cream",
                    !n.read && "bg-gold/10"
                  )}
                >
                  <span className="font-medium text-burgundy-dark">{describe(n.type)}</span>
                  <span className="text-xs text-burgundy-dark/60">{formatDateTime(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function describe(type: string): string {
  switch (type) {
    case "new_event":
      return "A new event was scheduled.";
    case "new_question":
      return "New activity in an event's Q&A.";
    default:
      return "You have a new notification.";
  }
}
