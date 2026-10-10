import { ContentRuntime } from "./runtime";
import type { Message } from "../shared";

const runtimeWindow = window as Window & {
  __handsfreeContent?: ContentRuntime;
};
if (!runtimeWindow.__handsfreeContent) {
  const runtime = new ContentRuntime((message) =>
    chrome.runtime.sendMessage(message),
  );
  runtimeWindow.__handsfreeContent = runtime;
  chrome.runtime.onMessage.addListener((message: Message, _sender, respond) => {
    runtime
      .handle(message)
      .then(respond)
      .catch((error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "Page action failed.",
        }),
      );
    return true;
  });
}
