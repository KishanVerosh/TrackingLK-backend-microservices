const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [existing] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (existing.length) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed]);
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (!users.length) return res.status(400).json({ message: "Invalid username or password" });

    const valid = await bcrypt.compare(password, users[0].password);
    if (!valid) return res.status(400).json({ message: "Invalid username or password" });

    const token = jwt.sign({ id: users[0].id, username }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => console.log(`Auth service running on port ${process.env.PORT}`));
