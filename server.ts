import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
const xlsx = require("xlsx");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = new Database("it_expenses.db");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_date TEXT,
    vendor TEXT,
    description TEXT,
    category TEXT,
    amount REAL,
    currency TEXT DEFAULT 'Kyats',
    payment_method TEXT,
    invoice_number TEXT,
    type TEXT CHECK(type IN ('Asset', 'Expense')),
    user TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER,
    asset_name TEXT,
    purchase_date TEXT,
    cost REAL,
    vendor TEXT,
    serial_number TEXT,
    assigned_to TEXT,
    user TEXT,
    status TEXT,
    warranty_expiry TEXT,
    department TEXT,
    location TEXT,
    image_url TEXT,
    asset_tag TEXT UNIQUE,
    category TEXT DEFAULT 'Hardware',
    FOREIGN KEY(expense_id) REFERENCES expenses(id)
  );

  CREATE TABLE IF NOT EXISTS asset_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER,
    change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    assigned_to TEXT,
    notes TEXT,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_name TEXT,
    vendor TEXT,
    license_key TEXT,
    start_date TEXT,
    end_date TEXT,
    cost REAL,
    currency TEXT DEFAULT 'Kyats',
    status TEXT,
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TRIGGER IF NOT EXISTS asset_initial_history_trigger
  AFTER INSERT ON assets
  BEGIN
    INSERT INTO asset_history (asset_id, status, assigned_to, notes)
    VALUES (NEW.id, NEW.status, NEW.assigned_to, 'Initial record created');
  END;

  CREATE TABLE IF NOT EXISTS system_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT,
    entity_type TEXT,
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const logActivity = (action_type: string, entity_type: string, description: string) => {
  try {
    db.prepare(`
      INSERT INTO system_activities (action_type, entity_type, description)
      VALUES (?, ?, ?)
    `).run(action_type, entity_type, description);
  } catch (error) {
    console.error("Activity logging error:", error);
  }
};

// Migration: Ensure new columns exist in existing tables
const migrations = [
  { table: 'assets', column: 'warranty_expiry', type: 'TEXT' },
  { table: 'assets', column: 'department', type: 'TEXT' },
  { table: 'assets', column: 'location', type: 'TEXT' },
  { table: 'assets', column: 'expense_id', type: 'INTEGER' },
  { table: 'assets', column: 'image_url', type: 'TEXT' },
  { table: 'assets', column: 'user', type: 'TEXT' },
  { table: 'expenses', column: 'currency', type: "TEXT DEFAULT 'Kyats'" },
  { table: 'expenses', column: 'payment_method', type: 'TEXT' },
  { table: 'expenses', column: 'invoice_number', type: 'TEXT' },
  { table: 'expenses', column: 'user', type: 'TEXT' },
  { table: 'expenses', column: 'image_url', type: 'TEXT' },
  { table: 'licenses', column: 'currency', type: "TEXT DEFAULT 'Kyats'" },
  { table: 'assets', column: 'asset_tag', type: 'TEXT UNIQUE' },
  { table: 'assets', column: 'category', type: "TEXT DEFAULT 'Hardware'" }
];

for (const m of migrations) {
  try {
    db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
    console.log(`Migration: Added column ${m.column} to ${m.table}`);
  } catch (e: any) {
    // Ignore error if column already exists
    if (!e.message.includes('duplicate column name')) {
      console.error(`Migration error for ${m.table}.${m.column}:`, e.message);
    }
  }
}

// Data Migration: Update asset category from expenses if available
try {
  const updateAssetCategory = db.prepare(`
    UPDATE assets 
    SET category = (SELECT category FROM expenses WHERE id = assets.expense_id)
    WHERE expense_id IS NOT NULL AND category = 'Hardware'
  `).run();
  if (updateAssetCategory.changes > 0) {
    console.log(`Data Migration: Updated ${updateAssetCategory.changes} asset categories from expenses.`);
  }
} catch (e: any) {
  console.error("Asset category migration error:", e.message);
}

// Data Migration: Update existing laptop expenses to "Laptop" category
try {
  const updateLaptop = db.prepare(`
    UPDATE expenses 
    SET category = 'Laptop' 
    WHERE (
      description LIKE '%laptop%' OR vendor LIKE '%laptop%' OR 
      description LIKE '%macbook%' OR description LIKE '%thinkpad%' OR
      description LIKE '%dell%' OR description LIKE '%asus%' OR 
      description LIKE '%acer%' OR description LIKE '%hp %' OR 
      description LIKE '%lenovo%'
    )
    AND category != 'Laptop'
  `).run();
  if (updateLaptop.changes > 0) {
    console.log(`Data Migration: Updated ${updateLaptop.changes} laptop records to 'Laptop' category.`);
  }
} catch (e: any) {
  console.error("Laptop data migration error:", e.message);
}

// Data Migration: Ensure all assets have the correct asset_tag format (MGAXXXXX)
try {
  const allAssets = db.prepare("SELECT id, asset_tag FROM assets").all() as any[];
  const updateStmt = db.prepare("UPDATE assets SET asset_tag = ? WHERE id = ?");
  for (const a of allAssets) {
    const expectedTag = `MGA${String(a.id).padStart(5, '0')}`;
    if (a.asset_tag !== expectedTag) {
      updateStmt.run(expectedTag, a.id);
    }
  }
} catch (e: any) {
  console.error("Asset tag migration error:", e.message);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const upload = multer({ dest: "uploads/" });

// API Routes
app.get("/api/activities", (req, res) => {
  const activities = db.prepare("SELECT * FROM system_activities ORDER BY timestamp DESC LIMIT 100").all();
  res.json(activities);
});

app.get("/api/expenses", (req, res) => {
  const expenses = db.prepare("SELECT * FROM expenses ORDER BY payment_date DESC").all();
  res.json(expenses);
});

app.get("/api/assets", (req, res) => {
  const assets = db.prepare("SELECT * FROM assets").all();
  res.json(assets);
});

app.get("/api/licenses", (req, res) => {
  const licenses = db.prepare("SELECT * FROM licenses ORDER BY end_date ASC").all();
  res.json(licenses);
});

app.get("/api/stats", (req, res) => {
  const { startDate, endDate, category } = req.query;
  
  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (startDate) {
    whereClause += " AND payment_date >= ?";
    params.push(startDate);
  }
  if (endDate) {
    whereClause += " AND payment_date <= ?";
    params.push(endDate);
  }
  if (category && category !== 'All') {
    whereClause += " AND category = ?";
    params.push(category);
  }

  const monthlySpending = db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as total
    FROM expenses
    ${whereClause}
    GROUP BY month
    ORDER BY month ASC
  `).all(...params);

  const categorySpending = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM expenses
    ${whereClause}
    GROUP BY category
  `).all(...params);

  const vendorSpending = db.prepare(`
    SELECT vendor, SUM(amount) as total
    FROM expenses
    ${whereClause}
    GROUP BY vendor
    ORDER BY total DESC
    LIMIT 10
  `).all(...params);

  const typeSpending = db.prepare(`
    SELECT type, SUM(amount) as total
    FROM expenses
    ${whereClause}
    GROUP BY type
  `).all(...params);

  const summary = db.prepare(`
    SELECT 
      SUM(amount) as totalSpending,
      COUNT(*) as totalCount,
      SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as totalOpEx,
      SUM(CASE WHEN type = 'Asset' THEN amount ELSE 0 END) as totalCapEx
    FROM expenses
    ${whereClause}
  `).get(...params);

  let assetWhereClause = "WHERE purchase_date >= COALESCE(?, '1900-01-01') AND purchase_date <= COALESCE(?, '2100-12-31')";
  const assetParams: any[] = [startDate || '1900-01-01', endDate || '2100-12-31'];

  if (category && category !== 'All') {
    assetWhereClause += " AND category = ?";
    assetParams.push(category);
  }

  const activeAssetsCount = db.prepare(`
    SELECT COUNT(id) as count 
    FROM assets
    ${assetWhereClause}
  `).get(...assetParams) as { count: number };

  res.json({ 
    monthlySpending, 
    categorySpending, 
    vendorSpending, 
    typeSpending,
    summary: {
      ...summary,
      activeAssetsCount: activeAssetsCount.count
    }
  });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    let extractedText = "";
    if (req.file.mimetype === "application/pdf") {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      extractedText = data.text;
    } else if (
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      req.file.mimetype === "application/vnd.ms-excel" ||
      req.file.mimetype === "text/csv"
    ) {
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      extractedText = JSON.stringify(xlsx.utils.sheet_to_json(sheet));
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // Clean up
    fs.unlinkSync(req.file.path);

    res.json({ extractedText });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process file" });
  }
});

app.post("/api/expenses/bulk", (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: "Invalid records" });

  const insertExpense = db.prepare(`
    INSERT INTO expenses (payment_date, vendor, description, category, amount, currency, payment_method, invoice_number, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAsset = db.prepare(`
    INSERT INTO assets (expense_id, asset_name, purchase_date, cost, vendor, status, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const results = [];
  const transaction = db.transaction((recs) => {
    for (const record of recs) {
      const info = insertExpense.run(
        record.payment_date,
        record.vendor,
        record.description,
        record.category,
        record.amount,
        record.currency || "Kyats",
        record.payment_method || "",
        record.invoice_number || "",
        record.type
      );

      if (record.type === "Asset") {
        insertAsset.run(
          info.lastInsertRowid,
          record.description,
          record.payment_date,
          record.amount,
          record.vendor,
          "In Stock",
          record.category
        );
      }
      results.push({ id: info.lastInsertRowid, ...record });
    }
  });

  try {
    transaction(records);
    logActivity('ADD', 'Expense', `Bulk added ${records.length} records`);
    res.json({ message: "Records saved successfully", records: results });
  } catch (error) {
    console.error("Bulk save error:", error);
    res.status(500).json({ error: "Failed to save records" });
  }
});

app.post("/api/expenses", (req, res) => {
  const record = req.body;
  
  const insertExpense = db.prepare(`
    INSERT INTO expenses (payment_date, vendor, description, category, amount, currency, payment_method, invoice_number, type, user, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAsset = db.prepare(`
    INSERT INTO assets (expense_id, asset_name, purchase_date, cost, vendor, status, user, image_url, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const info = insertExpense.run(
      record.payment_date,
      record.vendor,
      record.description,
      record.category,
      record.amount,
      record.currency || "Kyats",
      record.payment_method || "",
      record.invoice_number || "",
      record.type,
      record.user || "",
      record.image_url || ""
    );

    logActivity('ADD', record.type, `Added ${record.type}: ${record.vendor} - ${record.description}`);

    if (record.type === "Asset") {
      insertAsset.run(
        info.lastInsertRowid,
        record.description,
        record.payment_date,
        record.amount,
        record.vendor,
        "In Stock",
        record.user || "",
        record.image_url || "",
        record.category
      );
    }

    res.json({ id: info.lastInsertRowid, ...record });
  } catch (error) {
    console.error("Save error:", error);
    res.status(500).json({ error: "Failed to save record" });
  }
});

app.patch("/api/expenses/:id", (req, res) => {
  const { id } = req.params;
  const { payment_date, vendor, description, category, amount, currency, payment_method, invoice_number, type, user, image_url } = req.body;
  
  try {
    db.prepare(`
      UPDATE expenses 
      SET payment_date = COALESCE(?, payment_date),
          vendor = COALESCE(?, vendor),
          description = COALESCE(?, description),
          category = COALESCE(?, category),
          amount = COALESCE(?, amount),
          currency = COALESCE(?, currency),
          payment_method = COALESCE(?, payment_method),
          invoice_number = COALESCE(?, invoice_number),
          type = COALESCE(?, type),
          user = COALESCE(?, user),
          image_url = COALESCE(?, image_url)
      WHERE id = ?
    `).run(payment_date, vendor, description, category, amount, currency, payment_method, invoice_number, type, user, image_url, id);
    logActivity('UPDATE', 'Expense', `Updated expense ID: ${id} (${vendor})`);
    res.json({ message: "Expense updated successfully" });
  } catch (error) {
    console.error("Expense update error:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

app.delete("/api/expenses/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const transaction = db.transaction(() => {
      const assets = db.prepare("SELECT id FROM assets WHERE expense_id = ?").all(id) as any[];
      for (const asset of assets) {
        db.prepare("DELETE FROM asset_history WHERE asset_id = ?").run(asset.id);
      }
      db.prepare("DELETE FROM assets WHERE expense_id = ?").run(id);
      db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
    });
    transaction();
    logActivity('DELETE', 'Expense', `Deleted expense ID: ${id} and associated assets`);
    res.json({ success: true });
  } catch (error) {
    console.error("Expense delete error:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

app.post("/api/expenses/delete-bulk", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid IDs" });

  const getAssetsStmt = db.prepare("SELECT id FROM assets WHERE expense_id = ?");
  const deleteHistoryStmt = db.prepare("DELETE FROM asset_history WHERE asset_id = ?");
  const deleteAssetsStmt = db.prepare("DELETE FROM assets WHERE expense_id = ?");
  const deleteExpenseStmt = db.prepare("DELETE FROM expenses WHERE id = ?");
  
  const transaction = db.transaction((expenseIds) => {
    for (const id of expenseIds) {
      const assets = getAssetsStmt.all(id) as any[];
      for (const asset of assets) {
        deleteHistoryStmt.run(asset.id);
      }
      deleteAssetsStmt.run(id);
      deleteExpenseStmt.run(id);
    }
  });

  try {
    transaction(ids);
    logActivity('DELETE', 'Expense', `Bulk deleted ${ids.length} expenses and associated assets`);
    res.json({ success: true });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({ error: "Failed to delete expenses" });
  }
});

app.post("/api/assets", (req, res) => {
  const asset = req.body;
  try {
    // First insert to get the ID
    const info = db.prepare(`
      INSERT INTO assets (asset_name, purchase_date, cost, vendor, serial_number, assigned_to, user, status, warranty_expiry, department, location, image_url, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.asset_name,
      asset.purchase_date,
      asset.cost,
      asset.vendor,
      asset.serial_number || "",
      asset.assigned_to || "",
      asset.user || "",
      asset.status || "Active",
      asset.warranty_expiry || "",
      asset.department || "",
      asset.location || "",
      asset.image_url || "",
      asset.category || "Hardware"
    );

    const newId = info.lastInsertRowid;
    const assetTag = `MGA${String(newId).padStart(5, '0')}`;
    
    // Update with tag
    db.prepare("UPDATE assets SET asset_tag = ? WHERE id = ?").run(assetTag, newId);

    logActivity('ADD', 'Asset', `Added asset: ${asset.asset_name} (${assetTag})`);
    res.json({ id: newId, asset_tag: assetTag, ...asset });
  } catch (error) {
    console.error("Asset save error:", error);
    res.status(500).json({ error: "Failed to save asset" });
  }
});

// Update Asset Status/Details
app.patch("/api/assets/:id", (req, res) => {
  const { id } = req.params;
  const { assigned_to, user, status, serial_number, warranty_expiry, department, location, asset_name, vendor, cost, purchase_date, image_url, action_note, category } = req.body;
  
  try {
    db.prepare(`
      UPDATE assets 
      SET assigned_to = COALESCE(?, assigned_to), 
          user = COALESCE(?, user),
          status = COALESCE(?, status),
          serial_number = COALESCE(?, serial_number),
          warranty_expiry = COALESCE(?, warranty_expiry),
          department = COALESCE(?, department),
          location = COALESCE(?, location),
          asset_name = COALESCE(?, asset_name),
          vendor = COALESCE(?, vendor),
          cost = COALESCE(?, cost),
          purchase_date = COALESCE(?, purchase_date),
          image_url = COALESCE(?, image_url),
          category = COALESCE(?, category)
      WHERE id = ?
    `).run(assigned_to, user, status, serial_number, warranty_expiry, department, location, asset_name, vendor, cost, purchase_date, image_url, category, id);
    
    logActivity('UPDATE', 'Asset', `Updated asset ID: ${id} (${asset_name})`);

    if (action_note) {
      db.prepare(`
        INSERT INTO asset_history (asset_id, status, assigned_to, notes)
        VALUES (?, (SELECT status FROM assets WHERE id = ?), (SELECT assigned_to FROM assets WHERE id = ?), ?)
      `).run(id, id, id, action_note);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Asset update error:", error);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

app.get("/api/assets/:id/history", (req, res) => {
  const { id } = req.params;
  const history = db.prepare(`
    SELECT * FROM asset_history 
    WHERE asset_id = ? 
    ORDER BY change_date DESC
  `).all(id);
  res.json(history);
});

app.delete("/api/assets/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const asset = db.prepare("SELECT asset_name FROM assets WHERE id = ?").get(id) as any;
    db.prepare("DELETE FROM asset_history WHERE asset_id = ?").run(id);
    db.prepare("DELETE FROM assets WHERE id = ?").run(id);
    if (asset) {
      logActivity('DELETE', 'Asset', `Deleted asset: ${asset.asset_name}`);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Asset delete error:", error);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

app.post("/api/assets/delete-bulk", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid IDs" });

  const deleteHistoryStmt = db.prepare("DELETE FROM asset_history WHERE asset_id = ?");
  const deleteStmt = db.prepare("DELETE FROM assets WHERE id = ?");
  const transaction = db.transaction((assetIds) => {
    for (const id of assetIds) {
      deleteHistoryStmt.run(id);
      deleteStmt.run(id);
    }
  });

  try {
    transaction(ids);
    logActivity('DELETE', 'Asset', `Bulk deleted ${ids.length} assets`);
    res.json({ success: true });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({ error: "Failed to delete assets" });
  }
});

app.get("/api/backup/db", (req, res) => {
  const dbPath = path.resolve("it_expenses.db");
  res.download(dbPath, `it_inventory_backup_${new Date().toISOString().split('T')[0]}.db`, (err) => {
    if (err) {
      console.error("DB Backup error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to backup database" });
      }
    }
  });
});

app.post("/api/restore/db", upload.single("db_file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  try {
    // Verify the uploaded file is a valid SQLite DB
    const testDb = new Database(req.file.path);
    testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    testDb.close();

    // Close existing connection
    db.close();
    
    // Replace file
    const dbPath = path.resolve("it_expenses.db");
    fs.copyFileSync(req.file.path, dbPath);
    fs.unlinkSync(req.file.path);
    
    // Reopen connection
    db = new Database("it_expenses.db");
    
    logActivity('RESTORE', 'System', `System database restored from .db file`);
    res.json({ success: true });
  } catch (error) {
    console.error("DB Restore error:", error);
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Try to reopen if it failed after closing
    try {
      if (!db.open) db = new Database("it_expenses.db");
    } catch (e) {}
    
    res.status(500).json({ error: "Invalid database file or restore failed" });
  }
});

app.post("/api/restore", (req, res) => {
  const { expenses, assets, licenses } = req.body;
  
  const transaction = db.transaction(() => {
    // Clear existing data
    db.prepare("DELETE FROM asset_history").run();
    db.prepare("DELETE FROM assets").run();
    db.prepare("DELETE FROM expenses").run();
    db.prepare("DELETE FROM licenses").run();

    // Restore expenses
    if (Array.isArray(expenses)) {
      const insert = db.prepare(`
        INSERT INTO expenses (id, payment_date, vendor, description, category, amount, currency, payment_method, invoice_number, type, user, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of expenses) {
        insert.run(e.id, e.payment_date, e.vendor, e.description, e.category, e.amount, e.currency || 'Kyats', e.payment_method || '', e.invoice_number || '', e.type, e.user || '', e.image_url || '');
      }
    }

    // Restore assets
    if (Array.isArray(assets)) {
      const insert = db.prepare(`
        INSERT INTO assets (id, expense_id, asset_name, purchase_date, cost, vendor, serial_number, assigned_to, user, status, warranty_expiry, department, location, image_url, asset_tag, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of assets) {
        const assetTag = a.asset_tag || `MGA${String(a.id).padStart(5, '0')}`;
        const category = a.category || 'Hardware';
        insert.run(a.id, a.expense_id || null, a.asset_name, a.purchase_date, a.cost, a.vendor, a.serial_number || '', a.assigned_to || '', a.user || '', a.status, a.warranty_expiry || '', a.department || '', a.location || '', a.image_url || '', assetTag, category);
      }
    }

    // Restore licenses
    if (Array.isArray(licenses)) {
      const insert = db.prepare(`
        INSERT INTO licenses (id, software_name, vendor, license_key, start_date, end_date, cost, currency, status, assigned_to)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const l of licenses) {
        insert.run(l.id, l.software_name, l.vendor, l.license_key, l.start_date, l.end_date, l.cost, l.currency || 'Kyats', l.status, l.assigned_to || '');
      }
    }
  });

  try {
    transaction();
    logActivity('RESTORE', 'System', `System data restored from backup`);
    res.json({ success: true });
  } catch (error) {
    console.error("Restore error:", error);
    res.status(500).json({ error: "Failed to restore data" });
  }
});

app.post("/api/licenses", (req, res) => {
  const license = req.body;
  try {
    const info = db.prepare(`
      INSERT INTO licenses (software_name, vendor, license_key, start_date, end_date, cost, currency, status, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      license.software_name,
      license.vendor,
      license.license_key || "",
      license.start_date,
      license.end_date,
      license.cost || 0,
      license.currency || "Kyats",
      license.status || "Active",
      license.assigned_to || ""
    );
    logActivity('ADD', 'License', `Added license: ${license.software_name}`);
    res.json({ id: info.lastInsertRowid, ...license });
  } catch (error) {
    console.error("License save error:", error);
    res.status(500).json({ error: "Failed to save license" });
  }
});

app.patch("/api/licenses/:id", (req, res) => {
  const { id } = req.params;
  const { software_name, vendor, license_key, start_date, end_date, cost, currency, status, assigned_to } = req.body;
  
  try {
    db.prepare(`
      UPDATE licenses 
      SET software_name = COALESCE(?, software_name), 
          vendor = COALESCE(?, vendor),
          license_key = COALESCE(?, license_key),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          cost = COALESCE(?, cost),
          currency = COALESCE(?, currency),
          status = COALESCE(?, status),
          assigned_to = COALESCE(?, assigned_to)
      WHERE id = ?
    `).run(software_name, vendor, license_key, start_date, end_date, cost, currency, status, assigned_to, id);
    logActivity('UPDATE', 'License', `Updated license ID: ${id} (${software_name})`);
    res.json({ success: true });
  } catch (error) {
    console.error("License update error:", error);
    res.status(500).json({ error: "Failed to update license" });
  }
});

app.delete("/api/licenses/:id", (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM licenses WHERE id = ?").run(id);
    logActivity('DELETE', 'License', `Deleted license ID: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("License delete error:", error);
    res.status(500).json({ error: "Failed to delete license" });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
