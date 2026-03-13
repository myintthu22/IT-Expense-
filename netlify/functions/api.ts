import express from "express";
import serverless from "serverless-http";
import multer from "multer";
import * as pdf from "pdf-parse";
import * as xlsx from "xlsx";
import path from "path";

const app = express();
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '50mb' }));

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let extractedText = "";
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    if (fileExt === ".pdf") {
      const parsePdf = (pdf as any).default || pdf;
      const data = await parsePdf(req.file.buffer);
      extractedText = data.text;
    } else if (fileExt === ".xlsx" || fileExt === ".xls" || fileExt === ".csv") {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      extractedText = xlsx.utils.sheet_to_csv(sheet);
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    res.json({ extractedText });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process file" });
  }
});

app.use("/api", router);
app.use("/.netlify/functions/api", router);

export const handler = serverless(app, {
  binary: ['multipart/form-data']
});
