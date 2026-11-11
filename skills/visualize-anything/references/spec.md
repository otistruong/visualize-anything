# Spec format

A spec is one JSON file that describes one explainer. `scripts/validate.mjs` checks it and `scripts/build.mjs` embeds it into the player. All text values are plain text: no HTML, no Markdown.

## Contents

1. Top level
2. `kinds`
3. `actors`
4. `zones`
5. `links`
6. `steps`
7. `simplifications` and `sources`
8. Layout guidance
9. Length limits
10. A complete example

## 1. Top level

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `version` | number | yes | Always `1`. |
| `id` | string | yes | Lowercase letters, digits and hyphens. Used for file names. |
| `title` | string | yes | Page title, for example "TCP three-way handshake". |
| `summary` | string | yes | One or two sentences: the concrete scenario and what the reader will see. |
| `kinds` | object | yes | The categories of step and their colours. See section 2. |
| `actors` | array | yes | At least 2. See section 3. |
| `zones` | array | no | Labelled areas on the ground. See section 4. |
| `links` | array | no | Fixed connections drawn between actors. See section 5. |
| `steps` | array | yes | At least 1; normally 6 to 20. See section 6. |
| `simplifications` | array of strings | yes | At least 1. What the model leaves out. |
| `sources` | array | yes | At least 1. Where the facts come from. See section 7. |

Unknown keys are reported as warnings and ignored by the player.

## 2. `kinds`

An object. Each key is a kind id (lowercase, starts with a letter); each value is `{ "label", "color" }`.

```json
"kinds": {
  "request":  { "label": "Request",  "color": "blue" },
  "response": { "label": "Response", "color": "green" },
  "decision": { "label": "Decision", "color": "gray" }
}
```

- `label`: shown in the legend and on the step's badge.
- `color`: one of `blue`, `green`, `amber`, `purple`, `pink`, `orange`, `cyan`, `gray`. Red is reserved for failures and cannot be chosen.

Every step names one kind. Use kinds to separate things the reader should tell apart at a glance: protocols, channels, or message versus decision. Two to five kinds is typical. Use `gray` for inside steps such as decisions.

## 3. `actors`

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique. Lowercase, starts with a letter; letters, digits, `-`, `_`. Steps refer to it. |
| `label` | string | yes | Name shown under the actor and at the top of the timeline. At most 22 characters. |
| `sub` | string | no | Second line under the name, in a monospace face: an address, hostname or role. At most 30 characters. |
| `shape` | string | no | How it is drawn. Default `box`. See below. |
| `pos` | `[x, y]` | yes | Position on the ground, in grid units. See section 8. |
| `color` | string | no | A colour name from section 2, to tint the actor permanently. Leave it out normally: the active actor is tinted with the step's colour. |

Shapes:

| Shape | Looks like | Use for |
| --- | --- | --- |
| `box` | a low block | a service, a process, a component, anything generic |
| `tower` | a tall block with slots | a server |
| `screen` | a laptop | a client, a browser, a program a person runs |
| `cylinder` | a drum | a database, a store, an API with data behind it |
| `person` | a figure | a human, an attacker, an approver |
| `cloud` | a cloud | a network or a group of machines treated as one |
| `tile` | a flat slab | a slot: an array cell, a bucket, a memory page, a commit |
| `page` | an upright sheet | a document, a file, a message at rest |

## 4. `zones`

A zone is a labelled, outlined rectangle on the ground.

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `label` | string | yes | Shown at the zone's front-left corner. |
| `x`, `y` | number | yes | The back-left corner, in grid units. |
| `w`, `h` | number | yes | Width along x and depth along y. Both greater than 0. |
| `color` | string | no | A colour name. Default `gray`. |

Zones do not affect behaviour. An actor is "in" a zone only because its position is inside the rectangle.

## 5. `links`

An array of `[actorId, actorId]` pairs. Each is drawn as a dashed line on the ground and lit up when a step travels along it. A step may go between two actors that have no link (a broadcast, an out-of-band call); the player draws a temporary dashed path for it.

## 6. `steps`

Steps play in array order.

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `from` | actor id | yes | Who acts. |
| `to` | actor id | no | Who receives. Leave it out for something that happens inside `from`: a decision, a lookup, a computation. Must differ from `from`. |
| `kind` | kind id | yes | One of the keys of `kinds`. |
| `label` | string | yes | The few words that ride on the token and the timeline arrow. At most 28 characters. |
| `title` | string | yes | One plain sentence: what happens. |
| `desc` | string | yes | Two to four sentences: what happens and why. |
| `fields` | array | no | What the travelling thing contains. See below. |
| `payload` | string | no | Raw content shown in a monospace block: an HTTP message, a JSON body, a command. Use `\n` for line breaks. |
| `state` | array | no | Tables an actor keeps. See below. |
| `notes` | array of strings | no | Short asides shown under "Good to know". |
| `fail` | string | no | Present only when this step fails. The reason, as a sentence. See below. |
| `status` | object | no | Sets the status chip under one or more actors. See below. |

### `fields`

An array of groups. Each group is one layer or part of the thing in transit (a header, a body, a set of parameters).

```json
"fields": [
  {
    "group": "IPv4 header",
    "color": "blue",
    "rows": [
      ["Source address", "203.0.113.5", "Rewritten by the NAT router."],
      ["Destination address", "198.51.100.20"],
      ["TTL", "63"]
    ],
    "changed": ["Source address", "TTL"]
  }
]
```

- `group` (required): the group's name.
- `rows` (required): each row is `[name, value]` or `[name, value, note]`. All strings; write numbers in quotes. Names are unique within a group.
- `changed` (optional): names of rows whose value differs from the previous hop. They are highlighted and tagged "changed". Every name must exist in `rows`.
- `color` (optional): a colour name for the group's side bar. Defaults to the step's kind colour.

### `state`

An array of tables.

```json
"state": [
  {
    "title": "NAT translation table",
    "head": ["Inside", "Outside", "Remote"],
    "rows": [["192.168.1.10:51000", "203.0.113.5:40001", "198.51.100.20:443"]],
    "mark": [0]
  }
]
```

- `title` (required): the table's name. When a later step shows a table with exactly the same title, the player highlights every cell that differs from the earlier one. Keep titles identical to get this, and keep rows in the same order.
- `head` (required): column names.
- `rows` (required): arrays of strings, each as long as `head`.
- `mark` (optional): indexes (from 0) of rows to point at: the route that matched, the entry that was found.

### `fail`

A string saying why the step fails. Its presence changes how the step is drawn.

- On a hop (`to` present): the token stops a little over half way, turns red and is crossed out. The receiver is not activated. The inspector shows "Never arrives" with your reason. Use it for loss, a timeout, a block in between.
- On an inside step (no `to`): the actor is marked red. The inspector shows "Refused here" with your reason. Use it for a check that rejects, a lookup that finds nothing, a rule that denies.

To model "the request arrives and is refused, and an error goes back", use three steps: a normal hop, an inside step with `fail`, a normal hop carrying the error.

### `status`

An object mapping actor ids to a short string (at most 26 characters). When the step completes, each named actor's chip is set to that string and stays until a later step sets it again. An empty string removes the chip.

```json
"status": { "client": "SYN-SENT", "server": "LISTEN" }
```

Use it for state the reader should keep in view: a connection state, a role, the contents of a slot.

## 7. `simplifications` and `sources`

```json
"simplifications": [
  "Sequence numbers start at 1000 for readability. Real ones are 32-bit values that are hard to guess."
],
"sources": [
  { "title": "RFC 9293: Transmission Control Protocol", "url": "https://www.rfc-editor.org/rfc/rfc9293", "note": "Section 3.5, connection establishment." },
  { "title": "Tanenbaum, Computer Networks, chapter 6", "note": "Book; no link." }
]
```

- `simplifications`: one sentence each. Be specific.
- `sources`: `title` is required. Give a `url` (http or https) or, for an offline source, a `note`. `note` may also say which part of the model the source supports.

Both are shown at the bottom of the explainer.

## 8. Layout guidance

The scene is a ground plane seen from the front and slightly above. `x` grows to the right. `y` grows toward the viewer: a larger `y` is nearer the front and lower on screen. One grid unit is about one actor wide.

- Put the main flow left to right along one row (`y` equal), in the order things first happen.
- Keep neighbours on the same row **at least 3 apart on x**; 4.5 to 6 leaves room for long labels and for the token's label.
- Keep rows **at least 3 apart on y**; 4 or more when the back row has `sub` text or status chips. Each actor's name, `sub` and status chip are drawn in front of it and need the space.
- Two rows are enough for most subjects: the main parties in front, shared services or stores behind (or the other way round).
- A column (same `x`, different `y`) works well for a set of like things: buckets, replicas, queue slots.
- A zone should start about 1.5 behind its rear-most actor and reach about 2.5 in front of its front-most actor, so the labels under the actors stay inside it. The zone's own label is drawn just outside its front-left corner; keep other actors clear of that spot.
- Coordinates may be negative and need not start at 0. The player fits the scene to the screen. On a narrow screen the scene scrolls sideways and follows the current step.

The validator reports actors that overlap (an error) and labels that would collide (warnings). Trust it, adjust positions, and run it again.

## 9. Length limits

The validator warns past these. They exist because the text has to fit on a phone.

| Text | Limit |
| --- | --- |
| actor `label` | 22 characters |
| actor `sub` | 30 characters |
| `status` value | 26 characters |
| step `label` | 28 characters |
| step `title` | 80 characters |
| step `desc` | 480 characters |
| actors | 9 |
| steps | 6 to 26 |

## 10. A complete example

A caching proxy answers one request. The first attempt to reach the origin times out, the retry succeeds, and the answer is stored. This spec validates with no warnings.

```json
{
  "version": 1,
  "id": "cache-miss",
  "title": "A cache miss, a timeout and a retry",
  "summary": "A browser asks a caching proxy for an image the proxy has not stored yet. The proxy's first request to the origin server times out; the second succeeds and the answer is cached.",
  "kinds": {
    "request": { "label": "Request", "color": "blue" },
    "response": { "label": "Response", "color": "green" },
    "decision": { "label": "Decision", "color": "gray" }
  },
  "actors": [
    { "id": "browser", "label": "Browser", "sub": "192.0.2.10", "shape": "screen", "pos": [0, 0] },
    { "id": "proxy", "label": "Caching proxy", "sub": "cache.example.com", "shape": "box", "pos": [5, 0] },
    { "id": "origin", "label": "Origin server", "sub": "origin.example.com", "shape": "tower", "pos": [10, 0] }
  ],
  "zones": [
    { "label": "Provider network", "x": 3.2, "y": -1.5, "w": 8.6, "h": 4.2, "color": "cyan" }
  ],
  "links": [["browser", "proxy"], ["proxy", "origin"]],
  "steps": [
    {
      "from": "browser", "to": "proxy", "kind": "request", "label": "GET /logo.png",
      "title": "The browser asks the proxy for an image",
      "desc": "The browser does not know or care whether the proxy has the image stored. It sends an ordinary HTTP request.",
      "payload": "GET /logo.png HTTP/1.1\nHost: www.example.com"
    },
    {
      "from": "proxy", "kind": "decision", "label": "in the cache? no",
      "title": "The proxy looks the URL up in its cache",
      "desc": "The cache is keyed by URL. There is no entry for /logo.png, so this is a miss and the proxy has to ask the origin server.",
      "state": [
        { "title": "Proxy cache", "head": ["URL", "Stored response", "Fresh for"], "rows": [["/logo.png", "(none)", "-"]], "mark": [0] }
      ],
      "status": { "proxy": "miss" }
    },
    {
      "from": "proxy", "to": "origin", "kind": "request", "label": "GET /logo.png",
      "title": "The first request to the origin gets no answer",
      "desc": "The proxy forwards the request and starts a timer. No response comes back before the timer runs out.",
      "fail": "The origin did not answer within the proxy's 2 second timeout. The proxy cannot tell whether the request or the reply was lost."
    },
    {
      "from": "proxy", "kind": "decision", "label": "timed out, retry once",
      "title": "The proxy decides to try again",
      "desc": "A GET request is safe to repeat because it does not change anything on the server. This proxy is configured to retry once before giving up.",
      "notes": ["If the retry failed too, the proxy would answer the browser with 504 Gateway Timeout."]
    },
    {
      "from": "proxy", "to": "origin", "kind": "request", "label": "GET /logo.png (retry)",
      "title": "The retry reaches the origin",
      "desc": "The same request is sent again, and this time it arrives."
    },
    {
      "from": "origin", "to": "proxy", "kind": "response", "label": "200 OK, max-age=60",
      "title": "The origin answers and says how long the answer stays fresh",
      "desc": "The response carries the image and a Cache-Control header. max-age=60 allows a cache to reuse this response for 60 seconds without asking again.",
      "fields": [
        { "group": "Response headers", "rows": [["Status", "200 OK"], ["Content-Type", "image/png"], ["Cache-Control", "max-age=60", "Reusable for 60 seconds."]] }
      ]
    },
    {
      "from": "proxy", "kind": "decision", "label": "store for 60 s",
      "title": "The proxy stores the response",
      "desc": "The response is allowed to be cached, so the proxy saves it under the URL together with its freshness lifetime.",
      "state": [
        { "title": "Proxy cache", "head": ["URL", "Stored response", "Fresh for"], "rows": [["/logo.png", "200 OK, image/png", "60 s"]], "mark": [0] }
      ],
      "status": { "proxy": "has /logo.png" }
    },
    {
      "from": "proxy", "to": "browser", "kind": "response", "label": "200 OK",
      "title": "The proxy answers the browser",
      "desc": "The browser gets its image. The next request for /logo.png within 60 seconds will be answered from the cache without contacting the origin.",
      "fields": [
        { "group": "Response headers", "rows": [["Status", "200 OK"], ["Content-Type", "image/png"], ["Cache-Control", "max-age=60"], ["Age", "0", "Added by the proxy: seconds since it got the response from the origin."]], "changed": ["Age"] }
      ]
    }
  ],
  "simplifications": [
    "The retry policy and the 2 second timeout are choices made for this example. HTTP does not prescribe them, and proxies differ.",
    "The cache key is the URL alone. Real caches also take the request method and the headers named by Vary into account.",
    "Validation of a stored response that is no longer fresh (If-None-Match, 304 Not Modified) is not shown."
  ],
  "sources": [
    { "title": "RFC 9111: HTTP Caching", "url": "https://www.rfc-editor.org/rfc/rfc9111", "note": "Storing responses, max-age, the Age header." },
    { "title": "RFC 9110: HTTP Semantics, sections 9.2.1, 9.2.2 and 15.6.5", "url": "https://www.rfc-editor.org/rfc/rfc9110", "note": "Safe and idempotent methods, and 504 Gateway Timeout." }
  ]
}
```
