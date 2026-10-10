# Call the find provider from Chrome's service worker

Arbitrary find calls OpenAI directly from the extension service worker using a locally stored user key. This keeps the no-backend constraint and isolates provider requests from page CORS and content scripts. Only target labels/roles/IDs and the phrase enter the body; the key is used in the authorization header. A bundled shared key would expose credentials, so users bring their own key and can disable find by removing it.
