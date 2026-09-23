/// <reference types="vite/client" />

declare module "dayjs" {
  interface Dayjs {
    fromNow(withoutSuffix?: boolean): string;
  }
}

declare module "*.less" {
  const classes: { [key: string]: string };
  export default classes;
}

interface PyWebViewAPI {
  open_external_link: (url: string) => void;
  save_file: (url: string, filename: string) => Promise<boolean>;
  /** 在系统文件管理器中选中并显示指定文件 */
  reveal_file: (file_path: string) => Promise<boolean>;
  /** Show a native folder selection dialog, returns chosen path or "" */
  select_folder: () => Promise<string>;
  /** Clear SSO cookies from webview (for logout) */
  clear_sso_cookies: () => Promise<boolean>;
  /** Open a local file with the OS default application (e.g. PDF in Preview) */
  preview_file: (file_path: string) => Promise<boolean>;
}

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewAPI;
    };
  }
}

export {};
