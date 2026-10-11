const groups = [
  {
    name: "Browsing",
    description:
      "Find things, navigate pages, operate media, fill forms and dictate short replies. Typing a search query keeps you in Browsing.",
    commands: [
      ["Browsing mode", "Choose Browsing until a clear new task."],
      ["Use automatic modes", "Return to conservative automatic detection."],
      ["Next tab / previous tab", "Move between browser tabs."],
      [
        "Fill city with Pune",
        "Fill a named field. Review a form separately before submitting.",
      ],
    ],
  },
  {
    name: "Writing and Rambler",
    description:
      "Create longer content in a supported editor. Speak naturally, see a live preview, then pause to insert a cleaned segment. Groq can process the current segment or an explicitly requested revision. Whole documents and page navigation context are excluded from cleanup requests.",
    commands: [
      [
        "Writing mode",
        "Use the focused long-form editor. In Google Docs, place the caret in the document body.",
      ],
      [
        "Start dictation / stop dictation",
        "Start or stop text entry. Stopping stays stopped.",
      ],
      [
        "Scratch that / put that back",
        "Remove or restore the last unchanged Handsfree segment.",
      ],
      [
        "Use verbatim dictation",
        "Keep your speech as recognized. Say literal followed by a phrase to bypass cleanup once.",
      ],
      [
        "Use cleaned dictation",
        "Remove clear hesitation and self-repairs while preserving meaning.",
      ],
      ["New paragraph", "Insert a paragraph break."],
      [
        "Replace Tuesday with Wednesday",
        "Correct a unique phrase in the last unchanged segment.",
      ],
      [
        "Cut the last sentence",
        "Remove the last sentence of the recent segment.",
      ],
      [
        "Read back what I just wrote",
        "Speak the most recent unchanged segment.",
      ],
      [
        "Make this more professional",
        "Propose a revision of the last unchanged segment. Review the preview, then say apply revision or cancel revision.",
      ],
    ],
  },
  {
    name: "Reading",
    description:
      "Follow substantial article text, including Wikipedia, with magnification, page zoom, spoken playback and paragraph navigation. Entering Reading never starts audio.",
    commands: [
      [
        "Reading mode",
        "Show reading controls. You can operate them with the head pointer and dwell selection.",
      ],
      [
        "Magnify this paragraph",
        "Enlarge the current paragraph. With hover enabled, hold the pointer over readable text for about 1.2 seconds.",
      ],
      ["Magnify more / magnify less", "Adjust the lens between 1.5× and 3×."],
      [
        "Zoom this page to 150 percent",
        "Change the browser's page zoom independently from lens scale.",
      ],
      [
        "Restore previous page zoom",
        "Restore the saved zoom while your current zoom still belongs to Handsfree.",
      ],
      [
        "Read this article aloud",
        "Read the chosen article, starting at the current paragraph.",
      ],
      [
        "Pause reading / resume reading / stop reading aloud",
        "Control playback. The reading toolbar also provides direct controls.",
      ],
      ["Next paragraph / previous paragraph", "Move within the article."],
      ["Read from Methods / list sections", "Use article headings."],
      ["Read slower / read faster", "Adjust the reading speed."],
      [
        "List reading voices / use reading voice 2",
        "Choose an available English voice. Presentation and voice preferences are remembered.",
      ],
      [
        "Highlight what you are reading",
        "Toggle paragraph highlighting and follow scrolling.",
      ],
      [
        "Open a simplified reading view",
        "Show the article text with an adjustable reading presentation.",
      ],
      [
        "Make the reading text larger / use relaxed spacing",
        "Adjust the owned reading presentation.",
      ],
      [
        "Use warm paper / use dark reading colors",
        "Change reading-presentation colors without restyling the original website.",
      ],
    ],
  },
  {
    name: "Highlight words and sentences",
    description:
      "Numbers belong to the current paragraph. Use numbers when names or technical terms are difficult to pronounce. Selection stays tied to the article revision; changed text requires a fresh request.",
    commands: [
      [
        "Number the words",
        "Show a numbered list of words in the current paragraph.",
      ],
      [
        "Highlight words 3 to 8",
        "Select those exact words, including both endpoints.",
      ],
      [
        "Number the sentences",
        "Show numbered sentences in the current paragraph.",
      ],
      ["Highlight sentence 2", "Select a complete sentence."],
      ["Highlight sentences 1 to 3", "Select a range of sentences."],
      [
        "Highlight the last three words of sentence 2",
        "Select only those last three words.",
      ],
      [
        "Highlight from 'first phrase' to 'last phrase'",
        "Select a uniquely identified range. Repeated phrases need clarification or word numbers.",
      ],
      [
        "Start highlight / finish highlight",
        "Start a selection at the head pointer, move across the text and finish. The toolbar offers the same controls for dwell selection.",
      ],
      ["Clear highlight", "Clear the article selection."],
      ["Read the selected passage", "Speak the highlighted article text."],
    ],
  },
];
export function ModeGuide() {
  return (
    <section id="activity-modes" className="docs-section">
      <h2>Reading, browsing and writing</h2>
      <p>
        The popup shows your current task mode and whether it was detected
        automatically or selected by you. Head, hand and voice are input
        methods; these modes describe what you are doing. Automatic changes need
        deliberate task evidence.
      </p>
      <div className="docs-disclosures">
        {groups.map((group) => (
          <details key={group.name}>
            <summary>{group.name}</summary>
            <p className="docs-mode-description">{group.description}</p>
            <dl className="docs-command-list">
              {group.commands.map(([command, meaning]) => (
                <div key={command}>
                  <dt>{command}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
      <h3>Google Docs setup</h3>
      <p>
        Use the Chrome extension in an editable document. Reload the updated
        extension and then reload the document so its reading annotations can
        initialize. If document text is unavailable, enable Google Docs screen
        reader support with Ctrl + Alt + Z on Windows/Linux or Command + Option
        + Z on macOS, then place the caret in the document body. Chrome may
        display a native-input debugging banner while a Docs edit runs. Dictate
        one paragraph at a time and say new paragraph between them. View-only
        documents cannot receive dictation.
      </p>
      <h3>Cloud processing and limits</h3>
      <p>
        Cleaned Writing can send the current spoken segment to Groq using the
        configured extension keys. Explicit revisions send the recent revision
        target and your instruction. Requests reserve response space within a
        conservative 7,000-token budget; oversized segments are refused rather
        than silently cut. Say use verbatim dictation to bypass cleanup. Speech
        recognition uses your configured local or browser service. Local
        recognition needs browser support and an installed language pack.
      </p>
      <p>
        Complex highlight instructions can send the current paragraph and its
        numbered words/sentences to Groq. Straight word and sentence number
        selections run locally. Unclear requests need clarification. Check every
        generated revision and important names, numbers and dates.
      </p>
      <h3>Rambler reliability</h3>
      <p>
        Rambler follows a segment-based workflow. Cleanup and recent-segment
        corrections have been checked in an editable Google Doc. Ambiguous
        self-repairs need clarification. Google Docs support depends on its
        rendered accessibility annotations and native input; editor changes can
        interrupt it. Exact reproduction of Google's proprietary behavior cannot
        be guaranteed.
      </p>
      <h3>Support boundaries</h3>
      <p>
        Reading works with accessible HTML text. Scanned PDFs need OCR, and
        charts or equations do not become readable text through magnification.
        The isolated Firefox package has separate capabilities and is not
        updated by the Chrome implementation. Physical head tracking, microphone
        recognition and live editor behavior need device-specific verification.
      </p>
    </section>
  );
}
