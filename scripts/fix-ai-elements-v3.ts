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

  // 1. Replace @elizaos/ui with mapped relatives
  const elizaosImportRegex = /import\s+({[^}]+})\s+from\s+"@elizaos\/ui";?/g;
  content = content.replace(elizaosImportRegex, (match, importsStr) => {
    modified = true;
    const imports = importsStr.replace(/[{}]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
    
    const byFile: Record<string, string[]> = {};
    imports.forEach((imp: string) => {
      const baseName = imp.split(' as ')[0].trim();
      const dest = componentMap[baseName] || '../' + baseName.toLowerCase().replace(/([a-z])([A-Z])/g, "$1-$2");
      if (!byFile[dest]) byFile[dest] = [];
      byFile[dest].push(imp);
    });
    
    return Object.entries(byFile).map(([dest, imps]) => {
      return `import { ${imps.join(', ')} } from "${dest}";`;
    }).join('\n');
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
