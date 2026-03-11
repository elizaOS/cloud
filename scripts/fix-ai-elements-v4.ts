import fs from 'fs';
import path from 'path';

const dir = 'packages/ui/src/components/ai-elements';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // 1. Next.js image to native img tag
  if (content.includes('import NextImage from "next/image"')) {
    content = content.replace(/import NextImage from "next\/image";?/g, '// Native img used for framework agnosticism');
    content = content.replace(/<NextImage/g, '<img');
    content = content.replace(/unoptimized/g, '');
    modified = true;
  }
  
  if (content.includes('import Image from "next/image"')) {
    content = content.replace(/import Image from "next\/image";?/g, '// Native img used for framework agnosticism');
    content = content.replace(/<Image/g, '<img');
    content = content.replace(/fill/g, 'className="w-full h-full object-cover"');
    content = content.replace(/sizes="[^"]*"/g, '');
    modified = true;
  }

  // 2. Fix @/lib/utils to point internal package
  if (content.includes('@/lib/utils')) {
    content = content.replace(/@\/lib\/utils/g, '@/lib/utils'); // This relies on tsconfig paths setup in the package
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
