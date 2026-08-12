"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { EventQuestion, Profile } from "@/lib/supabase/types";

export interface QuestionNode extends EventQuestion {
  children: QuestionNode[];
}

/** Build a tree of question/answer nodes from a flat list, keyed by parent_id. */
export function buildQuestionTree(questions: EventQuestion[]): QuestionNode[] {
  const byId = new Map<string, QuestionNode>();
  for (const q of questions) byId.set(q.id, { ...q, children: [] });

  const roots: QuestionNode[] = [];
  for (const q of byId.values()) {
    if (q.parent_id && byId.has(q.parent_id)) {
      byId.get(q.parent_id)!.children.push(q);
    } else {
      roots.push(q);
    }
  }
  return roots;
}

export function QuestionThread({
  questions,
  membersById,
  eventId,
  onReply,
}: {
  questions: EventQuestion[];
  membersById: Record<string, Profile>;
  eventId: string;
  onReply: (eventId: string, parentId: string | null, body: string) => Promise<void>;
}) {
  const tree = buildQuestionTree(questions);

  return (
    <div className="flex flex-col gap-4">
      {tree.length === 0 && (
        <p className="text-sm text-burgundy-dark/60">No questions yet — start the conversation.</p>
      )}
      {tree.map((node) => (
        <QuestionNodeView key={node.id} node={node} membersById={membersById} eventId={eventId} onReply={onReply} depth={0} />
      ))}
      <ReplyForm eventId={eventId} parentId={null} onReply={onReply} placeholder="Ask a question…" />
    </div>
  );
}

function QuestionNodeView({
  node,
  membersById,
  eventId,
  onReply,
  depth,
}: {
  node: QuestionNode;
  membersById: Record<string, Profile>;
  eventId: string;
  onReply: (eventId: string, parentId: string | null, body: string) => Promise<void>;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const author = membersById[node.author_id];

  return (
    <div className={depth > 0 ? "ml-6 border-l-2 border-gold/20 pl-4" : ""}>
      <div className="rounded-lg bg-cream-dark/60 p-3">
        <div className="flex items-center justify-between text-xs text-burgundy-dark/60">
          <span className="font-semibold text-burgundy-dark">{author?.display_name ?? "Member"}</span>
          <span>{formatDateTime(node.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-burgundy-dark">{node.body}</p>
        <button
          type="button"
          onClick={() => setReplying((r) => !r)}
          className="mt-2 text-xs font-medium text-burgundy hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
        >
          {replying ? "Cancel" : "Reply"}
        </button>
        {replying && (
          <div className="mt-2">
            <ReplyForm
              eventId={eventId}
              parentId={node.id}
              onReply={async (e, p, body) => {
                await onReply(e, p, body);
                setReplying(false);
              }}
              placeholder="Write a reply…"
            />
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {node.children.map((child) => (
            <QuestionNodeView
              key={child.id}
              node={child}
              membersById={membersById}
              eventId={eventId}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyForm({
  eventId,
  parentId,
  onReply,
  placeholder,
}: {
  eventId: string;
  parentId: string | null;
  onReply: (eventId: string, parentId: string | null, body: string) => Promise<void>;
  placeholder: string;
}) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        startTransition(async () => {
          await onReply(eventId, parentId, body.trim());
          setBody("");
        });
      }}
      className="flex flex-col gap-2"
    >
      <Textarea
        aria-label={placeholder}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="min-h-[3rem]"
      />
      <Button type="submit" size="sm" disabled={isPending || !body.trim()} className="self-end">
        {isPending ? "Posting…" : "Post"}
      </Button>
    </form>
  );
}
