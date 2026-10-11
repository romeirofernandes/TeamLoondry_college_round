const form = document.querySelector("form");
const notice = document.querySelector("#provider-notice");
form.addEventListener("submit", async event => {
  event.preventDefault();
  const groq = document.querySelector("#groq-key");
  const jev = document.querySelector("#jev-key");
  const save = document.querySelector("#save-providers");
  save.disabled = true;
  try {
    const result = await browser.runtime.sendMessage({ type: "SAVE_PROVIDERS", groqKeys: groq.value.trim() ? [groq.value.trim()] : [], jevKey: jev.value.trim(), jevKeys: [] });
    if (result?.ok === false) throw new Error(result.error || "Could not save keys.");
    groq.value = ""; jev.value = "";
    notice.textContent = "Keys saved on this device. Stop and restart your session to use voice services.";
  } catch (error) { notice.textContent = error.message; }
  finally { save.disabled = false; }
});
document.querySelector("#clear-providers").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "SAVE_PROVIDERS", groqKeys: [], jevKey: "", jevKeys: [] });
  notice.textContent = "Provider keys removed. Camera controls and typed commands still work.";
});
