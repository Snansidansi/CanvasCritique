const fs = require('fs');
let content = fs.readFileSync('src/lib/db/media.ts', 'utf8');

// For mediaId
content = content.replace(/\[mediaId,\s*'',\s*(mimeType|parsed\.mimeType)\]/g, "[mediaId, `media/${mediaId}`, $1]");

// For iconMediaId
content = content.replace(/\[iconMediaId,\s*'',\s*mimeType\]/g, "[iconMediaId, `media/${iconMediaId}`, mimeType]");

fs.writeFileSync('src/lib/db/media.ts', content);
console.log("Fixed migrate!");
