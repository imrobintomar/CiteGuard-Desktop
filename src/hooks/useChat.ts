import { useEffect, useRef } from "react";
import {
  bridge,
  onChatToken, onChatDone, onToolCallStart, onToolCallDone, onChatError,
} from "../lib/tauri-bridge";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { getFreshSession } from "../stores/authStore";
import { canVerify, recordVerification } from "../lib/firebase";

const STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — resets on each token, so long responses still complete

export function useChat() {
  const store = useChatStore();
  const { activeModel } = useModelStore();
  const unsubscribers = useRef<Array<() => void>>([]);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const isSendingRef = useRef(false); // prevents concurrent sends

  const clearStreamTimer = () => {
    if (streamTimerRef.current) { clearTimeout(streamTimerRef.current); streamTimerRef.current = null; }
  };

  const resetStreamTimer = () => {
    clearStreamTimer();
    streamTimerRef.current = setTimeout(() => {
      console.warn("[CiteGuard] Stream timeout — forcing finalize");
      const convId = activeConvIdRef.current;
      if (convId) store.finalizeAssistant(convId);
      else store.setStreaming(false);
    }, STREAM_TIMEOUT_MS);
  };

  useEffect(() => {
    // Subscribe to Rust streaming events
    const subs = [
      onChatToken((e) => {
        store.appendToken(e.conversation_id, e.token);
        resetStreamTimer(); // reset timeout on each token
      }),
      onChatDone((e) => {
        if (!e.has_tool_calls) {
          clearStreamTimer();
          store.finalizeAssistant(e.conversation_id);
        } else {
          resetStreamTimer(); // tools still running — keep timer alive
        }
      }),
      onToolCallStart((e) => {
        resetStreamTimer();
        store.addToolCall(e.conversation_id, {
          id: e.tool_call_id,
          toolName: e.tool_name,
          args: e.args,
          status: "running",
          startedAt: Date.now(),
        });
      }),
      onToolCallDone((e) => {
        resetStreamTimer();
        store.updateToolCall(e.conversation_id, e.tool_call_id, {
          result: e.result,
          status: "done",
          doneAt: Date.now(),
        });
        store.extractCitations(e.conversation_id, e.tool_call_id, e.result);
      }),
      onChatError((e) => {
        clearStreamTimer();
        store.setStreaming(false);
        const conv = store.activeConversation();
        if (conv) store.finalizeAssistant(conv.id);
        console.error("Chat error:", e.error);
      }),
    ];

    Promise.all(subs).then((fns) => { unsubscribers.current = fns; });
    return () => {
      unsubscribers.current.forEach((fn) => fn());
      clearStreamTimer();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (content: string) => {
    if (isSendingRef.current) return; // drop concurrent sends
    isSendingRef.current = true;

    // Freemium enforcement — also ensures token is fresh before any Firestore call
    const session = await getFreshSession();
    if (session) {
      const { allowed, remaining, error: quotaErr } = await canVerify(session);
      if (!allowed) {
        const convId = useChatStore.getState().activeId ?? useChatStore.getState().newConversation();
        useChatStore.getState().addUserMessage(convId, content);
        useChatStore.getState().startAssistantMessage(convId);
        useChatStore.getState().appendToken(
          convId,
          quotaErr === "SERVICE_UNAVAILABLE"
            ? "Verification service is temporarily unavailable. Please try again in a moment."
            : "You've reached your daily limit of 20 free verifications. Upgrade to Lifetime for unlimited access."
        );
        useChatStore.getState().finalizeAssistant(convId);
        isSendingRef.current = false;
        return;
      }
      // Record this verification — await to ensure quota tracking doesn't silently fail
      try { await recordVerification(session); } catch { /* non-fatal — best effort */ }
      void remaining;
    }

    // Use getState() for current (non-snapshot) state throughout this function
    const state = useChatStore.getState();

    let convId = state.activeId;
    if (!convId) {
      convId = state.newConversation();
    }

    activeConvIdRef.current = convId;
    state.addUserMessage(convId, content);
    state.startAssistantMessage(convId);

    // Read fresh state AFTER addUserMessage (getState() is always current)
    const freshState = useChatStore.getState();
    const conv = freshState.conversations.find((c) => c.id === convId);
    if (!conv) {
      console.error("[CiteGuard] conversation not found after creation, id=", convId);
      state.setStreaming(false);
      return;
    }

    const history = conv.messages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Add the new user message (it may or may not be in the snapshot yet)
    if (!history.some((m) => m.role === "user" && m.content === content)) {
      history.push({ role: "user", content });
    }

    resetStreamTimer(); // start timeout clock

    try {
      const result = await bridge.sendMessage({
        conversation_id: convId,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
        ],
        model: activeModel,
      });
      if (!result.success) {
        console.error("[CiteGuard] send_message failed:", result.error);
      }
    } catch (err) {
      console.error("[CiteGuard] Bridge error:", err);
      clearStreamTimer();
      useChatStore.getState().setStreaming(false);
      useChatStore.getState().finalizeAssistant(convId);
    } finally {
      isSendingRef.current = false;
    }
  };

  return { sendMessage, isStreaming: store.isStreaming };
}

const TODAY = new Date().toISOString().split("T")[0]; // e.g. "2026-05-29"
const CURRENT_YEAR = new Date().getFullYear();        // e.g. 2026

const SYSTEM_PROMPT = `You are CiteGuard, a scholarly reference verification assistant.
Today's date: ${TODAY}. Current year: ${CURRENT_YEAR}.

CRITICAL RULES:
- NEVER invent, guess, or fabricate bibliographic information (DOIs, titles, authors, journals, years)
- ALWAYS use your verification tools before citing any academic work — even when tools are slow
- NEVER assess, judge, or classify any reference without first calling a tool. Do not produce manual hallucination verdicts based on your own reasoning.
- NEVER claim a paper is hallucinated because its year is ${CURRENT_YEAR - 1} or ${CURRENT_YEAR} — recent papers are real. Only flag impossible years (before 1665 or after ${CURRENT_YEAR + 1}).
- If tools are unavailable or timed out, say "verification unavailable — please retry" instead of guessing
- If a tool returns no match, say the reference could not be verified — do not fill in blanks
- Warn clearly when a reference is retracted or likely hallucinated

TOOL CALLING RULES — follow exactly:
When calling verify_reference or repair_reference, ALWAYS pass BOTH rawText AND every field you can parse:
  - doi: extract from rawText if present (format: 10.xxxx/xxxx). Look for "https://doi.org/10.", "doi:", or bare "10." patterns in each reference's own text. NEVER apply a DOI from one reference to a different reference.
  - title: the full paper title (everything between the year and journal)
  - authors: array of strings, each author as "LastName, Initials" e.g. ["Hirsch, J. E."]
  - year: the 4-digit publication year as a number
  - journal: the journal/venue name

ZENODO / DATASET DOI RULE: If a reference's doi starts with 10.5281/zenodo. or 10.5072/zenodo. — pass that DOI exactly as-is. Do NOT substitute it with another DOI. The tool will classify it as a dataset automatically.

Example — for "Hirsch, J. E. (2005). An index to quantify an individual's scientific research output. PNAS, 102(46), 16569–16572." call:
verify_reference({ rawText: "<full citation>", title: "An index to quantify an individual's scientific research output", authors: ["Hirsch, J. E."], year: 2005, journal: "Proceedings of the National Academy of Sciences" })

Passing all fields is REQUIRED for accurate confidence scoring. Using only rawText produces very low confidence scores.

Available tools:
- verify_reference: Check ONE citation in detail (use for 1-3 references)
- detect_hallucination: Batch-check references — use this when user provides 4+ references
- verify_claim: Verify whether a cited paper supports a SPECIFIC scientific claim. Use when the user asks "does this paper support this claim?" or "is this citation correct for this statement?" Pass both the claim text and the reference.
- repair_reference: Fix a malformed or incomplete citation
- format_citation: Format a verified citation in APA/MLA/BibTeX/etc.
- find_published_version: Find journal publication of a preprint
- check_retraction_status: Check if a paper has been retracted

EFFICIENCY RULE: When the user provides 4 or more references at once, ALWAYS use detect_hallucination. If there are more than 20 references, call detect_hallucination multiple times with groups of EXACTLY 20 or fewer — NEVER send more than 20 references in a single detect_hallucination call (the tool will reject it with an error if you send 21+). Do this silently without mentioning batches, limits, or splits to the user.

BATCHING PROTOCOL — follow exactly for lists longer than 20:
Step 1: Count every numbered reference in the user's input. Write down the total (e.g., "I see 26 references: #1–#26").
Step 2: Send batch 1 = refs #1–#20. Send batch 2 = refs #21–#26 (or whatever remains). Continue until ALL are sent.
Step 3: After ALL batches complete, sum the results and present a single combined report.
Step 4: VERIFY your count — if you sent N refs total but only got M results (M < N), call detect_hallucination again with the missing refs before reporting.

COMPLETENESS RULE: You MUST verify EVERY reference. Never stop after the first batch. The tool's summary.total only counts the current batch (not the global total). Track coverage yourself: if the user provided 26 refs, you must have sent all 26 across your batches before reporting. Missing even one ref is an error.

For EACH reference passed to detect_hallucination, always include ALL of these fields you can parse from the citation text:
- id: reference number as a string (e.g. "1", "2")
- rawText: the full citation text verbatim
- title: the paper title — extract from rawText as the text AFTER the author list and BEFORE the journal name (e.g. from "Smith J. The effect of X on Y. Nature. 2020" → title is "The effect of X on Y")
- authors: array of author strings in "Lastname, Initials" format
- year: publication year as a number
- journal: journal or venue name
- doi: DOI if found in rawText (look for "doi:", "https://doi.org/", or bare "10." patterns)

SILENT PROCESSING RULE: Never mention tool names, batch sizes, limits, or internal processing steps to the user. Never say things like "I'll split into batches" or "the tool has a limit of 20". Just verify and report results cleanly.

TOOL SELECTION RULES:
- If a citation contains a URL (http/https), "Available from:", "Accessed", or "github.com" — it is a web resource. Do NOT call repair_reference or verify_reference on it. Call detect_hallucination, which will classify it correctly and provide formatting guidance.
- Only call repair_reference on scholarly citations (papers, books, conference proceedings with titles and authors but no URL).
- ALWAYS call tools, even for very old references (pre-2000, 1800s), book chapters, or references without DOIs. Databases like Crossref and PubMed index papers back to the 1800s and many book chapters. Pass title and authors — do not skip references because they are old or lack a DOI.
- NEVER produce an empty response. If you cannot verify references, tell the user which ones could not be found and why.
- Book chapters: pass title as the chapter title, journal as the book title, authors as the chapter authors.

REPORTING RULES — follow exactly:
- Report the total as the number of references YOU sent across ALL batches (not summary.total from any single tool call — that only counts one batch).
- List verified references as a plain count (e.g. "24/26 verified"), never as ranges. Never use overlapping ranges like "1–29, 21–30".
- WEB_RESOURCE status means the citation is a legitimate website/software/dataset reference — NOT a hallucination. Report it as "Valid web resource — check formatting" and provide a properly formatted citation example.
- HALLUCINATED means a scholarly paper that cannot be found in any database and appears fabricated. Do NOT use this label for URLs, websites, or software tools.
- Distinguish clearly: a non-scholarly citation is a formatting issue; a hallucinated citation is a fabrication issue.
- TITLE MISMATCH: If a reference's DOI resolves to a paper with a DIFFERENT main title (even if the subtitle matches), flag it as "Title may be incorrect — DOI resolves to a different title". Show both the cited title and the actual title.

Use tools proactively whenever a user mentions a paper, DOI, or citation.`;
