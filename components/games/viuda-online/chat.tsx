"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  commandBlockReason,
  eventLine,
  MAX_CHAT_LENGTH,
  parseChatCommand,
  type ChatCommand,
} from "@/lib/games/viuda/online/chat";
import {
  publicEvents,
  type ChatMessage,
  type OnlineAction,
  type PublicTable,
} from "@/lib/games/viuda/online/protocol";

type Entry =
  | { id: string; kind: "message"; message: ChatMessage; mine: boolean }
  | { id: string; kind: "system"; text: string }
  | { id: string; kind: "notice"; text: string }; // solo para quien escribió

const MAX_ENTRIES = 80;

interface Props {
  table: PublicTable;
  playerId: string;
  chat: readonly ChatMessage[];
  sendChat: (text: string) => boolean;
  onAction: (action: OnlineAction) => void;
}

// Chat de la sala. Los comandos «paso» y «llamo» (escritos o con los chips) ejecutan la
// misma acción que el botón del canvas; el resto del texto es un mensaje para todos.
export function RoomChat({ table, playerId, chat, sendChat, onAction }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenMessages = useRef(new Set<string>());
  // Último evento de la mesa ya visto; null hasta la primera mesa, que no deja líneas
  // (un `rejoin` no repite lo atrasado).
  const lastEvent = useRef<number | null>(null);
  const noticeSeq = useRef(0);

  const push = (entry: Entry) =>
    setEntries((list) => [...list, entry].slice(-MAX_ENTRIES));

  // Mensajes de los jugadores, en orden de llegada.
  useEffect(() => {
    for (const message of chat) {
      if (seenMessages.current.has(message.id)) continue;
      seenMessages.current.add(message.id);
      push({
        id: `m-${message.id}`,
        kind: "message",
        message,
        mine: message.playerId === playerId,
      });
    }
  }, [chat, playerId]);

  // Líneas de sistema a partir de los eventos de la mesa (PASO y LLAMO de cualquiera).
  useEffect(() => {
    const events = publicEvents(table);
    if (lastEvent.current === null) {
      lastEvent.current = events.reduce((max, e) => Math.max(max, e.n), -1);
      return;
    }
    const fresh = events.filter((e) => e.n > (lastEvent.current ?? -1));
    if (fresh.length === 0) return;
    lastEvent.current = Math.max(...fresh.map((e) => e.n));
    for (const event of fresh) {
      const line = eventLine(event, table);
      if (line) push({ id: `e-${event.n}`, kind: "system", text: line });
    }
  }, [table]);

  // Siempre se ve lo último: plegado, la última línea; con el campo enfocado, el final de la lista.
  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  };
  useEffect(scrollToEnd, [entries]);

  const notice = (message: string) =>
    push({ id: `n-${noticeSeq.current++}`, kind: "notice", text: message });

  const blockedPass = commandBlockReason(table, playerId, "pass");
  const blockedCall = commandBlockReason(table, playerId, "call");

  function run(command: ChatCommand): boolean {
    const reason = commandBlockReason(table, playerId, command);
    if (reason) {
      notice(reason);
      return false;
    }
    onAction({ type: command });
    return true;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    const command = parseChatCommand(value);
    const done = command ? run(command) : sendChat(value);
    if (!command && !done) notice("Espera un segundo entre mensajes");
    if (done) setText("");
  }

  return (
    <section className="vd-chat" aria-label="Chat de la sala">
      <div
        ref={listRef}
        className="vd-chat-log"
        role="log"
        aria-live="polite"
        tabIndex={0}
        onClick={() => inputRef.current?.focus()}
      >
        {entries.length === 0 && (
          <p className="vd-chat-empty">
            Escribe un mensaje, o «paso» / «llamo» para jugar.
          </p>
        )}
        {entries.map((entry) =>
          entry.kind === "message" ? (
            <p
              key={entry.id}
              className={`vd-chat-msg${entry.mine ? " mine" : ""}`}
            >
              <b>{entry.message.alias}</b> {entry.message.text}
            </p>
          ) : (
            <p
              key={entry.id}
              className={
                entry.kind === "system" ? "vd-chat-sys" : "vd-chat-warn"
              }
            >
              {entry.text}
            </p>
          ),
        )}
      </div>
      <div className="vd-chat-bar">
        <button
          type="button"
          className="vd-chip pass"
          disabled={blockedPass !== null}
          onClick={() => run("pass")}
        >
          PASO
        </button>
        <button
          type="button"
          className="vd-chip call"
          disabled={blockedCall !== null}
          onClick={() => run("call")}
        >
          LLAMO
        </button>
        <form className="vd-chat-form" onSubmit={submit}>
          <input
            ref={inputRef}
            className="vd-chat-input"
            type="text"
            value={text}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Escribir un mensaje"
            aria-label="Escribir un mensaje"
            enterKeyHint="send"
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            onFocus={scrollToEnd}
          />
          <button
            type="submit"
            className="vd-chat-send"
            aria-label="Enviar mensaje"
            disabled={!text.trim()}
          >
            ↵
          </button>
        </form>
      </div>
    </section>
  );
}
