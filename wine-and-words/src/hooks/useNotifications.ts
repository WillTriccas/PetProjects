"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/supabase/types";

/**
 * Load a member's notifications and keep them live via Supabase Realtime.
 * New rows (and updates, e.g. mark-as-read) are merged into local state.
 */
export function useNotifications(recipientId: string | null | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!recipientId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications(data ?? []);
    setLoading(false);
  }, [recipientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!recipientId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`notifications:${recipientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${recipientId}`,
        },
        (payload) => {
          setNotifications((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Notification;
              return [row, ...prev.filter((n) => n.id !== row.id)];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Notification;
              return prev.map((n) => (n.id === row.id ? row : n));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as Notification;
              return prev.filter((n) => n.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [recipientId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, loading, refresh };
}
