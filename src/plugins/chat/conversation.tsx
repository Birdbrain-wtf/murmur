import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowDown, Send } from "lucide-react";
import { Button } from "../../ui";
import "./conversation.css";

export interface Message {
  id: string;
  sender: string;
  body: string;
  ts: number;
  mine: boolean;
  pending?: boolean;
}

export function Timeline({ messages, room }: { messages: Message[]; room: string }) {
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [below, setBelow] = useState(false);
  const last = messages[messages.length - 1];
  const bottom = () => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
    following.current = true;
    setBelow(false);
  };
  useEffect(() => { bottom(); }, [room]);
  useEffect(() => {
    if (following.current || last?.mine) bottom();
    else setBelow(true);
  }, [messages.length, last?.id]);
  return (
    <div className="chat-timeline-wrap">
      <div ref={scroll} className="chat-timeline" role="log" aria-label="Messages" tabIndex={0}
        onScroll={() => {
          const el = scroll.current!;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          if (following.current) setBelow(false);
        }}>
        <div className="chat-messages">
          {!messages.length && <div className="chat-empty"><strong>{room ? "Start the conversation" : "Choose a room"}</strong><p>{room ? "No messages here yet. Say hello." : "Your conversations appear here."}</p></div>}
          {messages.map((m, i) => {
            const previous = messages[i - 1];
            const date = new Date(m.ts);
            const newDay = !previous || date.toDateString() !== new Date(previous.ts).toDateString();
            const grouped = !newDay && previous.sender === m.sender && m.ts - previous.ts < 300_000;
            return <div key={m.id}>
              {newDay && <div className="chat-date"><span>{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span></div>}
              <article className="chat-message" data-mine={m.mine} data-grouped={grouped}>
                <span className="chat-avatar" aria-hidden="true">{grouped ? "" : m.sender.replace(/^@/, "")[0]?.toUpperCase()}</span>
                <div className="chat-message-content">
                  {!grouped && <div className="chat-message-meta"><strong title={m.sender}>{m.mine ? "You" : m.sender.replace(/^@/, "").split(":")[0]}</strong><time dateTime={date.toISOString()}>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>}
                  <p>{m.body}</p>
                  {m.pending && <span className="chat-pending">Sending…</span>}
                </div>
              </article>
            </div>;
          })}
        </div>
      </div>
      {below && <div className="chat-latest"><Button icon={ArrowDown} onClick={bottom}>Latest messages</Button></div>}
    </div>
  );
}

export function Composer({ value, onChange, onSend, name, disabled = false, busy = false }: {
  value: string; onChange: (value: string) => void; onSend: (event: FormEvent) => void;
  name: string; disabled?: boolean; busy?: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const hint = useId();
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
  }, [value]);
  return <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); if (!disabled && !busy && value.trim()) onSend(e); }}>
    <div className="chat-compose-box">
      <textarea ref={input} rows={1} value={value} disabled={disabled || busy}
        aria-label={name ? `Message ${name}` : "Message"} aria-describedby={hint}
        placeholder={name ? `Message ${name}` : "Choose a conversation"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229 && !window.matchMedia("(pointer: coarse)").matches) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }} />
      <Button type="submit" size="md" icon={Send} busy={busy} disabled={disabled || busy || !value.trim()}>Send</Button>
    </div>
    <p id={hint} className="chat-compose-hint">Enter to send · Shift + Enter for a new line</p>
  </form>;
}
