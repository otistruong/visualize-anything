I wrote `oauth-authorization-code.json` and built `oauth-authorization-code.html`. Open the HTML file in a browser; it needs no server.

It follows one sign-in for a server-side web app in 20 steps: the redirects through the browser, the token request from server to server, the API call, and a final case in which a copied authorization code is replayed and refused with invalid_grant.

Simplifications:
- TLS is assumed and not drawn.
- Login and consent are two steps; real sign-in is several requests.
- Refresh tokens, revocation and OpenID Connect are left out.

Sources:
- RFC 6749: https://www.rfc-editor.org/rfc/rfc6749
- RFC 7636 (PKCE): https://www.rfc-editor.org/rfc/rfc7636
- RFC 6750 (bearer tokens): https://www.rfc-editor.org/rfc/rfc6750

This is a teaching model. Check it against the sources before relying on it.
