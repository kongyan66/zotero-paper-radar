import type { RecommendationFeedbackAction } from "../../domain/feedback/feedbackPolicy.ts";

export interface FeedbackActionCallbacks {
  readonly onAction: (
    action: RecommendationFeedbackAction,
  ) => void | Promise<void>;
}

export function renderFeedbackActions(
  doc: Document,
  callbacks: FeedbackActionCallbacks,
): HTMLElement {
  const root = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  root.className = "zad-feedback-actions";
  append(doc, root, "保存", () => callbacks.onAction("saved"));
  append(doc, root, "稍后", () => callbacks.onAction("deferred"));
  const reasonSelect = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "select",
  ) as unknown as HTMLSelectElement;
  reasonSelect.dataset.role = "feedback-reason";
  const placeholder = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "option",
  ) as unknown as HTMLOptionElement;
  placeholder.value = "";
  placeholder.textContent = "不感兴趣原因";
  placeholder.selected = true;
  reasonSelect.appendChild(placeholder);
  for (const reason of [
    ["rejected-topic", "主题不相关"],
    ["already-read", "已经读过"],
    ["duplicate", "重复论文"],
  ] as const) {
    const option = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "option",
    ) as unknown as HTMLOptionElement;
    option.value = reason[0];
    option.textContent = reason[1];
    reasonSelect.appendChild(option);
  }
  const submit = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as unknown as HTMLButtonElement;
  submit.type = "button";
  submit.textContent = "提交原因";
  submit.disabled = true;
  reasonSelect.addEventListener("change", () => {
    submit.disabled = !reasonSelect.value;
  });
  submit.addEventListener("click", () => {
    if (reasonSelect.value)
      void callbacks.onAction(
        reasonSelect.value as RecommendationFeedbackAction,
      );
  });
  root.append(reasonSelect, submit);
  return root;
}

function append(
  doc: Document,
  parent: Element,
  label: string,
  callback: () => void | Promise<void>,
): void {
  const button = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as unknown as HTMLButtonElement;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => void callback());
  parent.appendChild(button);
}
