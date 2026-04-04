/// <reference lib="dom" />

export {};

declare global {
  interface Window {
    __GRANOLA_SERVER__?: {
      passwordRequired?: boolean;
    };
  }
}
