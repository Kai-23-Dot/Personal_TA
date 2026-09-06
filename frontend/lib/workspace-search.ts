/**
 * Name of the window event that opens the workspace search overlay.
 *
 * The rail's Search row and the ⌘K shortcut both need to open the same overlay,
 * but they live in sibling components (Sidebar and Header). A window event keeps
 * them decoupled — neither needs a shared provider or a lifted state hook.
 */
export const OPEN_SEARCH_EVENT = "smartlearn:open-search";
