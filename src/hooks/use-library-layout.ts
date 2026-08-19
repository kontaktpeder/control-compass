import { useEffect, useState } from "react";

export type LibraryLayout = "grid" | "list";

const KEY = "control.libraryLayout";

export function useLibraryLayout(): [LibraryLayout, (next: LibraryLayout) => void] {
  const [layout, setLayout] = useState<LibraryLayout>("grid");

  useEffect(() => {
    if (window.localStorage.getItem(KEY) === "list") setLayout("list");
  }, []);

  return [
    layout,
    (next) => {
      setLayout(next);
      window.localStorage.setItem(KEY, next);
    },
  ];
}
