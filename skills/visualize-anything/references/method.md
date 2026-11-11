# Method: modelling a subject so that it teaches

The player is fixed. The quality of an explainer is decided by the spec, and the spec is decided by how well you understood the subject and how you cut it into steps. This file is the method. It was worked out on [Network Graph](https://network-graph-sigma.vercel.app), where fourteen networking lessons are written as data and one player renders them all.

## Contents

1. Accuracy before polish
2. Choose one path
3. Choose the actors
4. Cut the path into steps
5. Show what changed
6. Include a failure
7. Use realistic values
8. Write for a reader
9. Say what you simplified, and cite sources
10. Review checklist

## 1. Accuracy before polish

A wrong explainer that looks good is worse than none: animation makes a claim feel true. So the order of work is facts first, layout last.

- Find the primary source: the standard, the specification, the official documentation or the code. Blog posts and memory are for orientation only.
- For each step you plan, be able to point at where the source says it. If you cannot, either look it up or leave the step out.
- Watch the details that are easy to get wrong: which side changes state on which message, what is and is not carried in a message, default values, which actor makes a decision.
- If you could not verify something, say so in `simplifications` and in your final message. Do not present a guess as fact.

## 2. Choose one path

A subject is usually a tree of cases. An explainer follows one path through it, plus a failure branch.

- Pick the path that a newcomer needs first: the normal case, with the smallest number of parties that still shows the idea.
- State the scenario concretely in `summary`: who is doing what, and where it starts and ends.
- Leave variants out and list them under `simplifications`. Offer to make a second explainer for an important variant rather than squeezing it in.

## 3. Choose the actors

An actor is anything that sends, receives, decides or holds state: a machine, a service, a person, a function, a queue, a slot in an array.

- Two to eight actors. Fewer is better. Merge things the reader does not need to tell apart ("the internet" instead of six routers).
- Give each actor a short name and, in `sub`, the one identifying detail the reader will need to match against field values (an address, a hostname, a role).
- Things that hold state the reader should watch (a table, a cache, a bucket) deserve to be actors, or to have a `state` table on the actor that owns them.
- Use zones for boundaries that matter to the subject: a network, a trust boundary, a process, a company. A zone that explains nothing is noise.
- Lay actors out so that the main flow reads left to right, and group by zone. See the layout section in `spec.md`.

## 4. Cut the path into steps

One idea per step. If a description needs "and then", it is two steps.

There are two kinds of step, and a good model alternates between them:

- **A hop** (`from` and `to`): something travels. A message, a call, a packet, a file, a token.
- **An inside step** (`from` only): something happens within one actor. A decision, a table lookup, a computation, a timer expiring, a state change.

Decisions are their own steps. "The router forwards the packet" hides the interesting part. "The router looks up the destination in its table and picks a route" (inside step, with the table shown) followed by "the packet goes to the next hop" (hop) teaches it.

Other rules:

- Start where the reader can follow: with the trigger, not in the middle.
- A request and its response are separate steps.
- A broadcast or fan-out is one step per recipient when what the recipients do differs, and one step otherwise.
- End on the outcome the summary promised. Then, if you add a "what if" failure branch at the end, title it so ("What if: ...").
- Six to twenty steps. Under six usually means decisions are hidden inside hops. Over twenty usually means two subjects.

## 5. Show what changed

The question a learner asks at every step is "what is different now?". Answer it in the data, not only in prose.

- **Fields**: list what the travelling thing contains at this hop (`fields`). When an intermediary rewrites something (an address translated, a header added, a counter decremented), repeat the group at the next hop and name the rewritten fields in `changed`. The player highlights them.
- **State tables**: when an actor keeps a table (routing table, session store, cache, connection record), show it in `state` at the step where it is read or written. Reuse the exact same `title` each time the same table appears: the player compares it with the previous appearance and highlights the cells that differ. Use `mark` to point at the row that matched or was chosen.
- **Status chips**: when an actor has a small piece of state that matters across many steps (a connection state, the contents of a slot, "has token"), set it with `status`. It stays under the actor until a later step changes it.
- Keep numbers consistent across steps. If a value appears in step 3 and again in step 9, it must be the same value, and derived values must add up.

## 6. Include a failure

Every explainer has at least one step where something is lost, refused or blocked, with the reason. People understand a mechanism when they see what it prevents or how it recovers.

Good failure cases:

- The loss the mechanism was designed to survive (a dropped packet followed by a retransmission).
- The request the mechanism was designed to refuse (a replayed code, a packet with no matching rule, a write that conflicts).
- The lookup that finds nothing (a cache miss, a missing key).

How to model it:

- Something that never arrives: a hop with `fail`. The token stops part-way.
- Something that arrives and is rejected: a normal hop, then an inside step at the receiver with `fail`, then (if the protocol sends one) a normal hop carrying the error back.
- The `fail` text is the reason, in a sentence: what rule or condition caused it, and who finds out. "Fails" is not a reason.
- Show what happens next: the retry, the error returned, the fallback. A failure with no consequence teaches little.

## 7. Use realistic values

- Real-looking addresses, ports, ids, headers, keys and payloads. Not `foo`, `xxx`, `<token>`.
- Use values reserved for documentation so that nothing points at a real system: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32`, `example.com`, and the sample values printed in the standard you are citing.
- Prefer small round numbers where the reader has to do arithmetic (sequence numbers 1000 and 5000 rather than 3,735,928,559) and say in a note and in `simplifications` that real values look different.
- Never include a real secret, credential, personal data or internal hostname, even if the user's material contains one. Replace it and say you did.

## 8. Write for a reader

- `label` is the few words on the arrow: what a protocol trace would show (`SYN seq=1000`, `GET /cb?code=...`, `put("cat", 7)`). At most 28 characters.
- `title` is a full plain sentence saying what happens in this step.
- `desc` is two to four sentences: what happens and why. Explain the term the first time it appears. No jargon the reader has not been given.
- `notes` hold the useful aside: the rule behind the step, the number worth remembering, what a real system does differently. One fact per note.
- Plain, direct sentences. No hype, no exclamation marks, no emoji.

## 9. Say what you simplified, and cite sources

Both are required fields, and both appear in the finished explainer.

- `simplifications`: every place the model departs from the real thing. Values chosen for readability, parties merged, variants omitted, steps collapsed, anything you could not verify. Be specific: "TLS is assumed and not drawn", not "some details are omitted".
- `sources`: each document the facts come from, with its URL and, in `note`, which part of the model it supports. Prefer primary sources and name the section. A book or offline source has no `url`; describe it in `note`.

Repeat both in your final message to the user.

## 10. Review checklist

Before you build, read the spec from the top and check:

- [ ] Can each step be traced to a source?
- [ ] Does each step carry one idea?
- [ ] Is every decision, lookup and state change its own inside step?
- [ ] Does every hop that rewrites something mark it in `changed`?
- [ ] Do tables that recur keep the same `title`?
- [ ] Do values carried across steps agree, and does the arithmetic add up?
- [ ] Is there at least one `fail` step with a reason, and does the model show what follows it?
- [ ] Are example values realistic and from documentation ranges?
- [ ] Are `simplifications` specific and `sources` primary?
- [ ] Does `node scripts/validate.mjs` print `OK` with no warnings you cannot justify?
