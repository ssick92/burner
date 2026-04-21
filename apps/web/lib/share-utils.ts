export async function copyText(text: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Copy is unavailable in this environment.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy failed");
  }
}

export function buildShareEmailHref(input: {
  senderName: string;
  shareUrl: string;
  title: string;
}) {
  const normalizedTitle = input.title.trim() || "a Burner CD";
  const normalizedSender = input.senderName.trim() || "Someone";
  const subject = `Listen to ${normalizedTitle}`;
  const body = [
    `${normalizedSender} burned you ${normalizedTitle} on Burner.`,
    "",
    input.shareUrl,
  ].join("\n");

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
