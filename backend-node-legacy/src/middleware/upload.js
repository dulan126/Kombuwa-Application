'use strict';
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10');

function diskStorage(destDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.env.UPLOAD_DIR || './uploads', destDir);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

function mimeFilter(allowed) {
  return (req, file, cb) => {
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error(`Only ${allowed.join(', ')} allowed`), { status: 415 }));
  };
}

/** Forum image upload (up to 3 images, 5 MB each) */
const forumImages = multer({
  storage:  diskStorage('forum-images'),
  limits:   { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/webp']),
}).array('images', 3);

/** Essay PDF upload (single file, up to MAX_MB) */
const essayPdf = multer({
  storage:  diskStorage('essays'),
  limits:   { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: mimeFilter(['application/pdf']),
}).single('pdf');

/** Marking scheme PDF */
const schemePdf = multer({
  storage:  diskStorage('marking-schemes'),
  limits:   { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: mimeFilter(['application/pdf']),
}).single('pdf');

/** Question image (optional, single) */
const questionImage = multer({
  storage:  diskStorage('papers'),
  limits:   { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/webp']),
}).single('image');

/** Wrap multer in a promise so async routes can await it */
function uploadWrap(handler) {
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (err) return next(Object.assign(err, { status: err.code === 'LIMIT_FILE_SIZE' ? 413 : 415 }));
      next();
    });
}

module.exports = { forumImages, essayPdf, schemePdf, questionImage, uploadWrap };
