# Handsfree tickets

Local tracker selected for this request. The user asked for ticket creation and implementation in one pass, so the ticket quiz was skipped under that explicit instruction. No external tracker was configured or contacted.

| Ticket                          | Blocked by     | Delivers                                                                 |
| ------------------------------- | -------------- | ------------------------------------------------------------------------ |
| [01](issues/01-session.md)      | None           | Chrome session, popup, controls, permissions and local settings          |
| [02](issues/02-tracking.md)     | 01             | Local face/hand tracking and calibration                                 |
| [03](issues/03-selection.md)    | 01,02          | Snapped target, dwell/hold, scrolling and form confirmation              |
| [04](issues/04-voice.md)        | 01,03          | Fixed voice actions and isolated dictation                               |
| [05](issues/05-tabs.md)         | 01,04          | Chrome tab/title commands and close confirmation                         |
| [06](issues/06-find.md)         | 03,04          | Optional text-only find and explicit tie/no-match handling               |
| [07](issues/07-verification.md) | 02,03,04,05,06 | Local metrics, automated checks and manual installation/evaluation guide |

Tickets represent the in-scope v1 behaviors. Wake word, automatic form filling, and read aloud are deliberately deferred by spec.md, not silently omitted implementation tickets. The next validation step is real-laptop evaluation, recorded separately in docs/testing.md.
