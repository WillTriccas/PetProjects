"use client";

import { useRouter } from "next/navigation";
import { QuestionThread } from "@/components/QuestionThread";
import { postQuestion } from "@/actions/events";
import type { EventQuestion, Profile } from "@/lib/supabase/types";

export function QuestionSection({
  eventId,
  questions,
  membersById,
}: {
  eventId: string;
  questions: EventQuestion[];
  membersById: Record<string, Profile>;
}) {
  const router = useRouter();

  return (
    <QuestionThread
      eventId={eventId}
      questions={questions}
      membersById={membersById}
      onReply={async (id, parentId, body) => {
        await postQuestion(id, parentId, body);
        router.refresh();
      }}
    />
  );
}
