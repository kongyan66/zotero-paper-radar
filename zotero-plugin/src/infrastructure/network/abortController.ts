interface AbortControllerHost {
  readonly AbortController?: new () => AbortController;
}

export function createAbortController(): AbortController {
  const globalController = globalThis.AbortController;
  if (typeof globalController === "function") return new globalController();

  const hiddenWindow =
    typeof Services !== "undefined"
      ? Services.appShell?.hiddenDOMWindow
      : undefined;
  const hiddenController = (
    hiddenWindow as unknown as AbortControllerHost | undefined
  )?.AbortController;
  if (typeof hiddenController === "function") return new hiddenController();

  throw new Error("当前 Zotero 宿主不支持请求取消，请升级 Zotero 9");
}
