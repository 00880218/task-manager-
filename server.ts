import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import ExcelJS from "exceljs";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key_123";

// Database Setup
const db = new Database("tasks.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'employee'
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    deadline TEXT,
    priority TEXT,
    status TEXT DEFAULT 'pending',
    assigned_to_id INTEGER,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (assigned_to_id) REFERENCES users(id)
  );
`);

app.use(express.json());

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Auth Routes
app.post("/api/register", (req, res) => {
  const { email, password, role } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)").run(email, hashedPassword, role || 'employee');
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: "Email already exists" });
  }
});

app.post("/api/login", (req, res) => {
  const { email, password, role } = req.body;
  const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (user && bcrypt.compareSync(password, user.password)) {
    // Check if role matches
    if (user.role !== role) {
      return res.status(401).json({ error: "Invalid role selected" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/employees", authenticate, (req: any, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: "Forbidden" });
  }
  const employees = db.prepare("SELECT id, email FROM users WHERE role = 'employee'").all();
  res.json(employees);
});

// Task Routes
app.get("/api/tasks", authenticate, (req: any, res) => {
  let tasks;
  if (req.user.role === 'manager') {
    // Managers see all tasks they created or all tasks assigned to employees
    tasks = db.prepare(`
      SELECT t.*, u.email as assigned_to_name 
      FROM tasks t 
      LEFT JOIN users u ON t.assigned_to_id = u.id 
      ORDER BY t.created_at DESC
    `).all();
  } else {
    // Employees see only tasks assigned to them
    tasks = db.prepare(`
      SELECT t.*, u.email as assigned_to_name 
      FROM tasks t 
      LEFT JOIN users u ON t.assigned_to_id = u.id 
      WHERE t.assigned_to_id = ? 
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  }
  res.json(tasks);
});

app.post("/api/tasks", authenticate, (req: any, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { title, description, deadline, priority, assigned_to_id } = req.body;
  const info = db.prepare(`
    INSERT INTO tasks (title, description, deadline, priority, assigned_to_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, description, deadline, priority, assigned_to_id, req.user.email);
  
  const newTask = db.prepare(`
    SELECT t.*, u.email as assigned_to_name 
    FROM tasks t 
    LEFT JOIN users u ON t.assigned_to_id = u.id 
    WHERE t.id = ?
  `).get(info.lastInsertRowid);
  io.emit("task:created", newTask);
  res.json(newTask);
});

app.patch("/api/tasks/:id", authenticate, (req: any, res) => {
  const { status } = req.body;
  const completed_at = status === 'completed' ? new Date().toISOString() : null;
  db.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?").run(status, completed_at, req.params.id);
  const updatedTask = db.prepare(`
    SELECT t.*, u.email as assigned_to_name 
    FROM tasks t 
    LEFT JOIN users u ON t.assigned_to_id = u.id 
    WHERE t.id = ?
  `).get(req.params.id);
  io.emit("task:updated", updatedTask);
  res.json(updatedTask);
});

app.get("/api/tasks/export", authenticate, async (req: any, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: "Forbidden" });
  }

  const tasks = db.prepare(`
    SELECT t.*, u.email as assigned_to_email, u.email as assigned_to_name
    FROM tasks t 
    LEFT JOIN users u ON t.assigned_to_id = u.id 
    ORDER BY 
      CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
      CASE 
        WHEN t.priority = 'High' THEN 0 
        WHEN t.priority = 'Medium' THEN 1 
        ELSE 2 
      END,
      t.deadline ASC
  `).all();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Task Report');

  worksheet.columns = [
    { header: 'Task Title', key: 'title', width: 30 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Assigned Employee Name', key: 'assigned_to_name', width: 25 },
    { header: 'Assigned Employee Email', key: 'assigned_to_email', width: 25 },
    { header: 'Priority', key: 'priority', width: 15 },
    { header: 'Deadline', key: 'deadline', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Created Date', key: 'created_at', width: 20 },
    { header: 'Completed Date', key: 'completed_at', width: 20 },
  ];

  // Bold headers and freeze row
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  tasks.forEach((task: any) => {
    worksheet.addRow({
      title: task.title,
      description: task.description || '',
      assigned_to_name: task.assigned_to_name || 'Unassigned',
      assigned_to_email: task.assigned_to_email || 'Unassigned',
      priority: task.priority,
      deadline: task.deadline,
      status: task.status,
      created_at: task.created_at,
      completed_at: task.completed_at || 'N/A',
    });
  });

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const fileName = `Task_Report_${dateStr}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

  await workbook.xlsx.write(res);
  res.end();
});

app.delete("/api/tasks/:id", authenticate, (req: any, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  io.emit("task:deleted", req.params.id);
  res.json({ success: true });
});

// Vite Integration
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(join(__dirname, "dist", "index.html")));
  }
}

setupVite().then(() => {
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});
