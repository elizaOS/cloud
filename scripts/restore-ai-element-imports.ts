import fs from 'fs';
import path from 'path';

const dir = 'packages/ui/src/components/ai-elements';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

// Maps broken string to original string
const restores: Record<string, string> = {
  'from "../act"': 'from "react"',
  'from "../act-syntax-highlighter"': 'from "react-syntax-highlighter"',
  'from "../cide-react"': 'from "lucide-react"',
  'from "../ass-variance-authority"': 'from "class-variance-authority"',
  'from "..xt/image"': 'from "next/image"', // (if any next/images were somehow reverted but they shouldn't be)
};

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  for (const [broken, fixed] of Object.entries(restores)) {
    if (content.includes(broken)) {
      content = content.replaceAll(broken, fixed);
      modified = true;
    }
  }

  // Also fix any `from "../"` that might have been caused generically by `from "re"` -> `from "../"`
  // Let's just fix the known bad ones.
  // One more check: react-syntax-highlighter/dist/esm/styles/prism might have become ../act-syntax-highlighter/dist...
  const brokenSyntaxHighlighter = /from\s+"..\/?act-syntax-highlighter([^"]*)"/g;
  content = content.replace(brokenSyntaxHighlighter, 'from "react-syntax-highlighter$1"');

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Restored ${file}`);
  }
});
