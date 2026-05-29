const fs = require('fs');
const path = require('path');

const replacements = [
  // Layout specific ones
  { regex: /bg-white transition-colors duration-300 dark:bg-black/g, replacement: 'bg-background transition-colors duration-300' },
  { regex: /bg-white dark:bg-black/g, replacement: 'bg-surface' },
  { regex: /bg-black dark:bg-white/g, replacement: 'bg-accent' },
  { regex: /text-black dark:text-white/g, replacement: 'text-text-primary' },
  { regex: /text-white dark:text-black/g, replacement: 'text-text-inverse' },
  
  // Specific input classes (complex combinations)
  { regex: /bg-\[#F5F5F5\](.*?)focus:border-black\s+focus:bg-white\s+dark:bg-\[#171717\]\s+dark:text-white\s+dark:focus:border-white\s+dark:focus:bg-\[#1A1A1A\]/g, 
    replacement: 'bg-input-bg$1focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary' },
  { regex: /bg-\[#F5F5F5\](.*?)focus:border-black\s+focus:bg-white\s+dark:bg-\[#141414\]\s+dark:text-white\s+dark:focus:border-white\s+dark:focus:bg-\[#1A1A1A\]/g, 
    replacement: 'bg-input-bg$1focus:border-input-border-focus focus:bg-input-bg-hover text-text-primary' },

  { regex: /bg-\[#F5F5F5\]\s+dark:bg-\[#171717\]/g, replacement: 'bg-input-bg' },

  // Buttons generic
  { regex: /bg-black(.*?)text-white(.*?)hover:bg-black\/90(.*?)dark:bg-white\s+dark:text-black\s+dark:hover:bg-white\/90/g, replacement: 'bg-accent$1text-text-inverse$2hover:bg-accent-hover' },
  
  // Borders
  { regex: /border-black\/20(.*?)dark:border-white\/20/g, replacement: 'border-border-hover$1' },
  { regex: /border-black\/10(.*?)dark:border-white\/10/g, replacement: 'border-border$1' },
  { regex: /border-black\/30(.*?)dark:border-white\/30/g, replacement: 'border-border-hover$1' },
  
  // Opacities & text colors
  { regex: /text-black\/70(.*?)dark:group-hover:text-white/g, replacement: 'text-text-secondary$1' },
  { regex: /text-[a-zA-Z0-9-\/]*\s+hover:text-text-primary\/[0-9]*\s+dark:hover:text-white/g, replacement: 'text-text-secondary hover:text-text-primary' },
  { regex: /text-black\/60\s+hover:text-text-primary\/60\s+dark:hover:text-white/g, replacement: 'text-text-secondary hover:text-text-primary' },
  { regex: /text-text-primary\/[0-9]*\s+dark:hover:text-white/g, replacement: 'text-text-primary hover:text-text-primary' },
  
  // Success / Error alerts
  { regex: /border-red-200(.*?)bg-red-50(.*?)text-red-600\s+dark:border-red-900\/20\s+dark:bg-red-900\/10\s+dark:text-red-400/g, replacement: 'border-danger-200$1bg-danger-50$2text-danger-600' },
  { regex: /border-red-500(.*?)text-red-500(.*?)dark:text-red-400/g, replacement: 'border-danger$1text-danger$2' },
  { regex: /text-red-500(.*?)dark:text-red-400/g, replacement: 'text-danger$1' },

  // Brand / decorative backgrounds
  { regex: /from-black via-\[#0A0A0A\] to-black dark:block/g, replacement: 'from-brand-black via-brand-black to-brand-black block' },
  { regex: /bg-gradient-to-r from-transparent to-black\/40 dark:to-white\/40/g, replacement: 'bg-gradient-to-r from-transparent to-border' },
  { regex: /bg-gradient-to-l from-transparent to-black\/40 dark:to-white\/40/g, replacement: 'bg-gradient-to-l from-transparent to-border' },
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
// also do components
processDirectory(path.join(__dirname, 'apps/web-client/src/components'));
