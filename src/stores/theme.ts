import { writable } from "svelte/store";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function createThemeStore() {
  const { subscribe, set } = writable<Theme>(getInitialTheme());

  return {
    subscribe,
    set: (value: Theme) => {
      localStorage.setItem("theme", value);
      document.documentElement.dataset.theme = value;
      set(value);
    },
    toggle: () => {
      let current: Theme = "light";
      subscribe((v) => (current = v))();
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      document.documentElement.dataset.theme = next;
      set(next);
    },
  };
}

export const theme = createThemeStore();

export function toggleTheme() {
  theme.toggle();
}
