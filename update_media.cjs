const fs = require('fs');

let file = fs.readFileSync('src/lib/db/media.ts', 'utf8');

// Update saveMediaToDb to store "media/${id}" in data column
file = file.replace(/INSERT INTO media \(id, data, mime_type, sha256_hash\) VALUES \(\?, \?, \?, \?\)',\s*\[id, '', parsed.mimeType, hash\]/g, "INSERT INTO media (id, data, mime_type, sha256_hash) VALUES (?, ?, ?, ?)',\n    [id, `media/${id}`, parsed.mimeType, hash]");

// Make sure clipboard text is saved to media table in TaskEditor.svelte
let editorFile = fs.readFileSync('src/lib/views/TaskEditor.svelte', 'utf8');

// The line is: const base64Data = \`data:text/plain;base64,\${btoa(unescape(encodeURIComponent(text)))}\`;
// We need to add saveMediaToDb for it.
editorFile = editorFile.replace(/const base64Data = `data:text\/plain;base64,\$\{btoa\(unescape\(encodeURIComponent\(text\)\)\)\}`;/g, `const base64Data = \`data:text/plain;base64,\${btoa(unescape(encodeURIComponent(text)))}\`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data); } catch (_) {}`);

// In TaskEditor.svelte, newFile for text needs mediaId
editorFile = editorFile.replace(/const newFile = \{\s*name: `clipboard_text_\$\{Date\.now\(\)\}\.txt`,\s*dataUrl: base64Data\s*\};/g, `const newFile = {
            name: \`clipboard_text_\${Date.now()}.txt\`,
            dataUrl: base64Data,
            mediaId: mediaId || undefined
          };`);

fs.writeFileSync('src/lib/db/media.ts', file);
fs.writeFileSync('src/lib/views/TaskEditor.svelte', editorFile);
console.log("Updated files");
