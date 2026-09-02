const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "CHANGE_ME_BEFORE_DEPLOYMENT";

if (SESSION_SECRET === "CHANGE_ME_BEFORE_DEPLOYMENT") {
  console.warn("WARNING: Set SESSION_SECRET before deploying to the Internet.");
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "platform.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "1234";
if (!db.prepare("SELECT id FROM users WHERE username = ?").get(adminUsername)) {
  db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)")
    .run(adminUsername, bcrypt.hashSync(adminPassword, 12), "admin");
  console.log(`Initial admin created: ${adminUsername}`);
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

function requireAuth(req,res,next) {
  if (!req.session.user) return res.redirect("/login.html");
  next();
}
function requireAdmin(req,res,next) {
  if (!req.session.user || req.session.user.role !== "admin")
    return res.status(403).json({error:"غير مصرح"});
  next();
}

// Public login endpoint and login page only.
app.get("/login.html", (req,res) => {
  if (req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname,"public","login.html"));
});
app.get("/login-logo.png", (req,res) =>
  res.sendFile(path.join(__dirname,"public","logo.png"))
);

app.post("/api/login", (req,res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = db.prepare(
    "SELECT id,username,password_hash,role,active FROM users WHERE username=?"
  ).get(username);

  if (!user || !user.active || !bcrypt.compareSync(password,user.password_hash))
    return res.status(401).json({error:"اسم المستخدم أو كلمة المرور غير صحيحة."});

  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"تعذر إنشاء جلسة الدخول."});
    req.session.user = {id:user.id, username:user.username, role:user.role};
    res.json({ok:true,user:req.session.user});
  });
});

app.post("/api/logout",(req,res)=>{
  req.session.destroy(()=>{ res.clearCookie("connect.sid"); res.json({ok:true}); });
});
app.get("/api/me",(req,res)=>{
  res.json({authenticated:!!req.session.user,user:req.session.user||null});
});

app.get("/api/users",requireAdmin,(req,res)=>{
  res.json(db.prepare(
    "SELECT id,username,role,active,created_at FROM users ORDER BY id DESC"
  ).all());
});
app.post("/api/users",requireAdmin,(req,res)=>{
  const username=String(req.body.username||"").trim();
  const password=String(req.body.password||"");
  const role=req.body.role==="admin"?"admin":"student";
  if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username))
    return res.status(400).json({error:"اسم المستخدم: 3-40 حرفًا، A-Z أو 0-9 أو _ . -"});
  if(password.length<8)
    return res.status(400).json({error:"كلمة المرور يجب ألا تقل عن 8 أحرف."});
  try {
    const result=db.prepare(
      "INSERT INTO users(username,password_hash,role) VALUES(?,?,?)"
    ).run(username,bcrypt.hashSync(password,12),role);
    res.json({ok:true,id:result.lastInsertRowid});
  } catch {
    res.status(409).json({error:"اسم المستخدم موجود مسبقًا."});
  }
});
app.patch("/api/users/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)) return res.status(400).json({error:"معرّف غير صحيح."});
  db.prepare("UPDATE users SET active=? WHERE id=?").run(req.body.active?1:0,id);
  res.json({ok:true});
});
app.delete("/api/users/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  if(id===req.session.user.id)
    return res.status(400).json({error:"لا يمكنك حذف حساب المدير الحالي."});
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  res.json({ok:true});
});

// IMPORTANT: all platform files are behind authentication.
// Direct URLs to simulations therefore require a valid session.
app.use(requireAuth);
app.use(express.static(path.join(__dirname,"public"), {
  index: false,
  dotfiles: "deny"
}));

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/admin.html",requireAdmin,(req,res)=>
  res.sendFile(path.join(__dirname,"public","admin.html"))
);

app.listen(PORT,()=>console.log(`Physics platform: http://localhost:${PORT}`));
