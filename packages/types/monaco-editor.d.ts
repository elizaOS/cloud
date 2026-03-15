declare module "monaco-editor" {
  export namespace editor {
    interface IStandaloneCodeEditor {
      focus(): void;
      getDomNode(): HTMLElement | null;
    }
    interface IStandaloneEditorConstructionOptions {}
    function defineTheme(name: string, theme: unknown): void;
    function setTheme(name: string): void;
  }

  export const editor: {
    defineTheme: typeof editor.defineTheme;
    setTheme: typeof editor.setTheme;
  };
}
