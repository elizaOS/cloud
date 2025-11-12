"use client";

import { useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";

interface OpenApiViewerProps {
  value: string;
}

export function OpenApiViewer({ value }: OpenApiViewerProps) {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(
    null,
  );

  const handleEditorDidMount = (
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    monaco: Monaco,
  ) => {
    editorRef.current = editor;

    // Define custom dark theme matching your color scheme
    monaco.editor.defineTheme("elizaTheme", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "string.key.json", foreground: "FE9F6D" }, // Keys - orange
        { token: "string.value.json", foreground: "D4D4D4" }, // String values - gray
        { token: "number", foreground: "D4D4D4" }, // Numbers - gray
        { token: "keyword.json", foreground: "D4D4D4" }, // true/false/null - gray
        { token: "delimiter.bracket.json", foreground: "E434BB" }, // Brackets - pink
        { token: "delimiter.array.json", foreground: "E434BB" }, // Arrays - pink
        { token: "delimiter.colon.json", foreground: "E434BB" }, // Colons - pink
        { token: "delimiter.comma.json", foreground: "E434BB" }, // Commas - pink
      ],
      colors: {
        "editor.background": "#00000000", // Transparent background
        "editor.foreground": "#D4D4D4",
        "editorLineNumber.foreground": "#858585",
        "editorLineNumber.activeForeground": "#C6C6C6",
        "editorCursor.foreground": "#FFFFFF",
        "editor.selectionBackground": "#264F78",
        "editor.inactiveSelectionBackground": "#3A3D41",
        "editorIndentGuide.background": "#404040",
        "editorIndentGuide.activeBackground": "#707070",
        "editor.lineHighlightBackground": "#FFFFFF0A",
        "editorBracketMatch.background": "#0064001A",
        "editorBracketMatch.border": "#888888",
      },
    });

    // Apply the theme
    monaco.editor.setTheme("elizaTheme");

    // Configure JSON language features
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
      enableSchemaRequest: false,
    });
  };

  return (
    <div className="h-full w-full rounded-none border border-white/10 bg-black/60 overflow-hidden">
      <Editor
        height="800px"
        defaultLanguage="json"
        value={value}
        onMount={handleEditorDidMount}
        options={{
          readOnly: true,
          fontSize: 13,
          fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", "Consolas", monospace',
          lineHeight: 21,
          tabSize: 2,
          insertSpaces: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "off",
          wrappingStrategy: "advanced",
          automaticLayout: true,
          smoothScrolling: true,
          cursorBlinking: "solid",
          renderLineHighlight: "none",
          bracketPairColorization: {
            enabled: true,
          },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          folding: true,
          foldingStrategy: "indentation",
          showFoldingControls: "mouseover",
          padding: {
            top: 16,
            bottom: 16,
          },
          // Read-only specific options
          domReadOnly: true,
          readOnlyMessage: {
            value: "This OpenAPI specification is read-only. Use the Copy buttons above to export.",
          },
          contextmenu: true,
          selectOnLineNumbers: true,
          lineNumbers: "on",
          glyphMargin: false,
          scrollbar: {
            vertical: "visible",
            horizontal: "visible",
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}

