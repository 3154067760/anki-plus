const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

function exportZip(data, uploadsDir, res, filename) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).end();
    throw err;
  });
  archive.pipe(res);

  archive.append(JSON.stringify(data, null, 2), { name: 'backup.json' });
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      const full = path.join(uploadsDir, file);
      if (fs.statSync(full).isFile()) {
        archive.file(full, { name: `uploads/${file}` });
      }
    }
  }
  return archive.finalize();
}

function clearUploads(uploadsDir) {
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    fs.unlinkSync(path.join(uploadsDir, file));
  }
}

function importZip(zipPath, uploadsDir, importDataFn, mode) {
  const zip = new AdmZip(zipPath);
  const backupEntry = zip.getEntry('backup.json');
  if (!backupEntry) throw new Error('ZIP 中缺少 backup.json');

  const data = JSON.parse(backupEntry.getData().toString('utf8'));
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  if (mode === 'replace') clearUploads(uploadsDir);

  let mediaCount = 0;
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith('uploads/') || entry.isDirectory) continue;
    const filename = path.basename(entry.entryName);
    if (!filename) continue;
    const dest = path.join(uploadsDir, filename);
    if (mode === 'merge' && fs.existsSync(dest)) continue;
    fs.writeFileSync(dest, entry.getData());
    mediaCount++;
  }

  const result = importDataFn(data, mode);
  return { ...result, mediaCount };
}

module.exports = { exportZip, importZip };
