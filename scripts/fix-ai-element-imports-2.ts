import fs from 'fs';
import path from 'path';

const dir = 'packages/ui/src/components/ai-elements';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

// Maps component name exactly to file path
const componentMap: Record<string, string> = {
  Button: '../button',
  Badge: '../badge',
  ScrollArea: '../scroll-area',
  ScrollBar: '../scroll-area',
  Input: '../input',
  Progress: '../progress',
  Avatar: '../avatar',
  AvatarFallback: '../avatar',
  DropdownMenu: '../dropdown-menu',
  DropdownMenuTrigger: '../dropdown-menu',
  DropdownMenuContent: '../dropdown-menu',
  DropdownMenuItem: '../dropdown-menu',
  DropdownMenuSeparator: '../dropdown-menu',
  Tooltip: '../tooltip',
  TooltipTrigger: '../tooltip',
  TooltipContent: '../tooltip',
  InputGroup: '../input-group',
  InputGroupTextarea: '../input-group',
  InputGroupAddon: '../input-group',
  InputGroupButton: '../input-group',
  Select: '../select',
  SelectTrigger: '../select',
  SelectContent: '../select',
  SelectItem: '../select',
  SelectValue: '../select',
  // Missing ones from my generated script
  Card: '../card',
  CardHeader: '../card',
  CardTitle: '../card',
  CardDescription: '../card',
  CardContent: '../card',
  CardFooter: '../card',
  CardAction: '../card',
  Carousel: '../carousel',
  CarouselContent: '../carousel',
  CarouselItem: '../carousel',
  CarouselPrevious: '../carousel',
  CarouselNext: '../carousel',
  Collapsible: '../collapsible',
  CollapsibleTrigger: '../collapsible',
  CollapsibleContent: '../collapsible',
};

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Find imports that look like: import { X } from "../somelowercase"
  const importRegex = /import\s+({[^}]+})\s+from\s+"..\/?([a-z-]+)";?/g;
  
  content = content.replace(importRegex, (match, importsStr, currentDest) => {
    // Check if any of these imports should map to a different base file based on our map
    const imports = importsStr.replace(/[{}]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
    
    // Group by destination file
    const byFile: Record<string, string[]> = {};
    imports.forEach((imp: string) => {
      // Handle aliases like 'Button as BaseButton'
      const baseName = imp.split(' as ')[0].trim();
      
      // Look it up in our robust map, otherwise keep current dest
      const dest = componentMap[baseName] || '../' + currentDest;
      
      if (!byFile[dest]) byFile[dest] = [];
      byFile[dest].push(imp);
    });
    
    // Only flag as modified if the new string is different
    const newStr = Object.entries(byFile).map(([dest, imps]) => {
      return `import { ${imps.join(', ')} } from "${dest}";`;
    }).join('\n');
    
    if (newStr !== match) {
      modified = true;
      return newStr;
    }
    return match;
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
