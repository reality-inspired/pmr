declare global {
  interface AppApi {
    ping: () => void;
    versions: () => ({ [k: string]: string | undefined });
  }
  interface Window {
    api: AppApi;
  }
}

export { };
