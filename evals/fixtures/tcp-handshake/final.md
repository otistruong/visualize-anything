I wrote `tcp-handshake.json` (the spec) and built `tcp-handshake.html` from it. Open the HTML file in any browser; Space plays and the arrow keys step.

It covers a client opening a connection to a server on port 443 in 11 steps. The first SYN is lost and retransmitted after a 1 second timeout, then both sides exchange initial sequence numbers and reach ESTABLISHED.

Simplifications:
- Sequence numbers start at 1000 and 5000 so the arithmetic is easy to follow. Real ones are 32-bit values chosen to be hard to guess.
- Only one loss is shown, and connection teardown is left out.
- The IP header is reduced to three fields.

Sources:
- RFC 9293, sections 3.4, 3.5 and 3.10.7: https://www.rfc-editor.org/rfc/rfc9293
- RFC 6298 (retransmission timer): https://www.rfc-editor.org/rfc/rfc6298

This is a teaching model. Check it against the sources before relying on it.
