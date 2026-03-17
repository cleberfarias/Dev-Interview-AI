/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

interface Window {
  aistudio?: {
    openSelectKey?: () => Promise<void> | void;
  };
}
