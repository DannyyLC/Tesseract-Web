const fs = require('fs');
const path = require('path');

const replacements = [
  { regex: /bg-white\s+dark:bg-\[#0A0A0A\]/g, replacement: 'bg-surface' },
  { regex: /bg-white\s+dark:bg-black/g, replacement: 'bg-surface' },
  { regex: /bg-\[#0A0A0A\]\s+dark:bg-white/g, replacement: 'bg-accent' },
  { regex: /bg-black\s+dark:bg-white/g, replacement: 'bg-accent' },
  { regex: /bg-black\s+dark:bg-[#]?[eE]\[0-9a-fA-F]*\]?/gi, replacement: 'bg-accent' },
  { regex: /text-black\s+dark:text-white/g, replacement: 'text-text-primary' },
  { regex: /text-white\s+dark:text-black/g, replacement: 'text-text-inverse' },
  { regex: /text-black\/[56]0\s+dark:text-white\/[56]0/g, replacement: 'text-text-secondary' },
  { regex: /text-black\/[789]0\s+dark:text-white\/[789]0/g, replacement: 'text-text-primary' },
  { regex: /text-black\/[234]0\s+dark:text-white\/[234]0/g, replacement: 'text-text-tertiary' },
  { regex: /text-white\/[56]0\s+dark:text-black\/[56]0/g, replacement: 'text-text-secondary' },
  { regex: /border-black\/[5]?[0]?\s+dark:border-white\/[5]?[0]?/g, replacement: 'border-border' },
  { regex: /border-black\/[12]0\s+dark:border-white\/[12]0/g, replacement: 'border-border' },
  { regex: /hover:bg-black\/[345]\s+dark:hover:bg-white\/[345]/g, replacement: 'hover:bg-surface-secondary' },
  { regex: /hover:bg-black\/[1]0\s+dark:hover:bg-white\/[1]0/g, replacement: 'hover:bg-surface-elevated' },
  { regex: /bg-black\/[45]\s+dark:bg-white\/[45]/g, replacement: 'bg-surface-secondary' },
  { regex: /bg-black\/10\s+dark:bg-white\/10/g, replacement: 'bg-surface-secondary' },
  { regex: /shadow-black\/10\s+dark:shadow-black\/30/g, replacement: 'shadow-md' },
  { regex: /ring-white\s+dark:ring-\[#0A0A0A\]/g, replacement: 'ring-surface' },
  { regex: /bg-\[#F9FAFB\]\s+dark:bg-\[#1A1A1A\]/g, replacement: 'bg-surface-secondary' },
  { regex: /bg-\[#FAFAFA\]\s+dark:bg-\[#141414\]/g, replacement: 'bg-surface-secondary' },
  
  // Specific common cases that only miss by a space
  { regex: /bg-red-500\s+text-white\s+dark:bg-red-[56]00\s+dark:text-white/g, replacement: 'bg-danger text-text-inverse' },
  { regex: /bg-red-500/g, replacement: 'bg-danger' },
  { regex: /text-red-500/g, replacement: 'text-danger' },
  { regex: /bg-blue-500/g, replacement: 'bg-info' },
  { regex: /text-blue-500/g, replacement: 'text-info' }
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  files.forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      
      replacements.forEach(({ regex, replacement }) => {
        content = content.replace(regex, replacement);
      });
      
      if (original !== content) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  });
}

processDirectory(path.join(__dirname, 'apps/web-client/src/app'));
