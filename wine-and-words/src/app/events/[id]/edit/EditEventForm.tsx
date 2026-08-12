"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEvent } from "@/actions/events";
import type { Event, EventStatus } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

interface BookOption {
  id: string;
  title: string;
}

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "unscheduled", label: "Unscheduled (date TBD)" },
];

export function EditEventForm({ event, books }: { event: Event; books: BookOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [status, setStatus] = useState<EventStatus>(event.status ?? "upcoming");
  const [eventDate, setEventDate] = useState(event.event_date ? toLocalInput(event.event_date) : "");
  const [venueName, setVenueName] = useState(event.venue_name ?? "");
  const [locality, setLocality] = useState(event.locality ?? "");
  const [lat, setLat] = useState(event.lat?.toString() ?? "");
  const [lon, setLon] = useState(event.lon?.toString() ?? "");
  const [foodDescription, setFoodDescription] = useState(event.food_description ?? "");
  const [bookId, setBookId] = useState(event.book_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dateRequired = status !== "unscheduled";

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateEvent({
            id: event.id,
            title,
            description,
            status,
            eventDate: dateRequired ? (eventDate ? new Date(eventDate).toISOString() : undefined) : null,
            venueName,
            locality,
            lat: lat ? Number(lat) : undefined,
            lon: lon ? Number(lon) : undefined,
            foodDescription,
            bookId: bookId || undefined,
          });
          if (result.success) {
            router.push(`/events/${event.id}`);
          } else {
            setError(result.error ?? "Something went wrong.");
          }
        });
      }}
    >
      <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium text-burgundy-dark">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as EventStatus)}
          className="rounded-lg border border-gold/40 bg-white px-3 py-2 text-sm text-burgundy-dark focus:outline-none focus:ring-2 focus:ring-burgundy"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {dateRequired && (
        <Input
          label="Date & time"
          type="datetime-local"
          required
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
        />
      )}

      <Input label="Venue name" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
      <Input label="Locality" value={locality} onChange={(e) => setLocality(e.target.value)} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Latitude" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
        <Input label="Longitude" type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} />
      </div>
      <Textarea label="Food & drink" value={foodDescription} onChange={(e) => setFoodDescription(e.target.value)} />

      <div className="flex flex-col gap-1">
        <label htmlFor="book" className="text-sm font-medium text-burgundy-dark">
          Book (optional)
        </label>
        <select
          id="book"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="rounded-lg border border-gold/40 bg-white px-3 py-2 text-sm text-burgundy-dark focus:outline-none focus:ring-2 focus:ring-burgundy"
        >
          <option value="">No book selected</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving\u2026" : "Save changes"}
      </Button>
    </form>
  );
}

function toLocalInput(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}