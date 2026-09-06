const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

export function createXHTMLOption(doc: Document): HTMLOptionElement {
  return doc.createElementNS(XHTML_NAMESPACE, "option") as HTMLOptionElement;
}
