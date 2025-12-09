/**
 * Fragment Preview API
 * 
 * Serves stored fragments as executable web pages.
 * Uses the sandbox store to retrieve fragment data and renders it.
 */

import { NextRequest, NextResponse } from "next/server";
import { fragmentSandboxStore } from "@/lib/services/fragment-sandbox-store";
import { getTemplateId } from "@/lib/fragments/templates";

/**
 * GET /api/fragments/preview/[containerId]
 * Renders a stored fragment as an HTML page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ containerId: string }> }
) {
  const { containerId } = await params;
  
  const entry = fragmentSandboxStore.get(containerId);
  if (!entry) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Fragment Not Found</title>
  <style>
    body { 
      font-family: system-ui, sans-serif; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      min-height: 100vh; 
      margin: 0;
      background: #0a0a0a;
      color: #fff;
    }
    .error { text-align: center; }
    h1 { color: #ff5800; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Fragment Not Found</h1>
    <p>This preview has expired or does not exist.</p>
    <p>Fragments are temporary and expire after 30 minutes.</p>
  </div>
</body>
</html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  const { fragment } = entry;
  const templateId = getTemplateId(fragment.template);

  // Generate appropriate HTML based on template
  const html = generatePreviewHtml(fragment.code, fragment.template, templateId);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    },
  });
}

function generatePreviewHtml(
  code: string,
  template: string,
  templateId: string
): string {
  // For React/Next.js templates, create a live preview using Babel + React
  if (templateId === "nextjs-developer" || template.includes("react")) {
    return generateReactPreview(code);
  }

  // For Vue templates
  if (templateId === "vue-developer" || template.includes("vue")) {
    return generateVuePreview(code);
  }

  // For Streamlit/Gradio (Python), show code with message
  if (templateId === "streamlit-developer" || templateId === "gradio-developer") {
    return generatePythonPreview(code, template);
  }

  // Fallback: just show the code
  return generateCodePreview(code, template);
}

function generateReactPreview(code: string): string {
  // Escape the code for embedding in script
  const escapedCode = code
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fragment Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #root { min-height: 100vh; }
    .error-container { 
      padding: 2rem; 
      background: #fee2e2; 
      color: #991b1b; 
      border-radius: 0.5rem;
      margin: 1rem;
    }
    .error-title { font-weight: bold; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } = React;
    
    // Error boundary
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      render() {
        if (this.state.hasError) {
          return (
            <div className="error-container">
              <div className="error-title">Error rendering component</div>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.message}</pre>
            </div>
          );
        }
        return this.props.children;
      }
    }

    try {
      // User code - we'll try to extract the default export
      ${escapedCode}
      
      // Try to find and render the component
      const AppComponent = typeof App !== 'undefined' ? App : 
                          typeof Counter !== 'undefined' ? Counter :
                          typeof ColorButton !== 'undefined' ? ColorButton :
                          typeof default !== 'undefined' ? default :
                          (() => <div>No component found</div>);
      
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(
        <ErrorBoundary>
          <AppComponent />
        </ErrorBoundary>
      );
    } catch (e) {
      document.getElementById('root').innerHTML = 
        '<div class="error-container"><div class="error-title">Compilation Error</div><pre>' + 
        e.message + '</pre></div>';
    }
  </script>
</body>
</html>`;
}

function generateVuePreview(code: string): string {
  const escapedCode = code
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vue Fragment Preview</title>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #app { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted } = Vue;
    
    try {
      ${escapedCode}
      
      // Try to create and mount the app
      const app = createApp(typeof App !== 'undefined' ? App : {
        template: '<div>No Vue component found</div>'
      });
      app.mount('#app');
    } catch (e) {
      document.getElementById('app').innerHTML = 
        '<div style="padding: 2rem; background: #fee2e2; color: #991b1b; border-radius: 0.5rem; margin: 1rem;">' +
        '<strong>Error:</strong><pre style="white-space: pre-wrap;">' + e.message + '</pre></div>';
    }
  </script>
</body>
</html>`;
}

function generatePythonPreview(code: string, template: string): string {
  const escapedCode = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const appType = template.includes("streamlit") ? "Streamlit" : "Gradio";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appType} Fragment Preview</title>
  <style>
    body { 
      margin: 0; 
      font-family: system-ui, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #ff5800; }
    .info { 
      background: #1a1a1a; 
      border: 1px solid #333;
      border-radius: 0.5rem; 
      padding: 1rem;
      margin-bottom: 1rem;
    }
    pre { 
      background: #111;
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      border: 1px solid #333;
    }
    code { color: #22c55e; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${appType} App</h1>
    <div class="info">
      <p>This ${appType} app requires a Python runtime to execute.</p>
      <p>To run locally:</p>
      <pre><code>${appType === "Streamlit" ? "streamlit run app.py" : "python app.py"}</code></pre>
    </div>
    <h2>Source Code</h2>
    <pre><code>${escapedCode}</code></pre>
  </div>
</body>
</html>`;
}

function generateCodePreview(code: string, template: string): string {
  const escapedCode = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fragment Preview</title>
  <style>
    body { 
      margin: 0; 
      font-family: system-ui, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #ff5800; }
    .badge { 
      background: #1a1a1a;
      border: 1px solid #333;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.875rem;
      color: #888;
    }
    pre { 
      background: #111;
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      border: 1px solid #333;
    }
    code { color: #22c55e; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Fragment Preview</h1>
    <p><span class="badge">${template}</span></p>
    <pre><code>${escapedCode}</code></pre>
  </div>
</body>
</html>`;
}


