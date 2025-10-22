const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Register
// ✅ Register
app.post("/register", async (req, res) => {
  const { userName, email, password, phoneNumber } = req.body;

  if (!userName || !email || !password) {
    return res.status(400).json({ message: "userName, email, and password are required" });
  }

  try {
    // 1️⃣ Check if email already exists
    const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (existing.length)
      return res.status(400).json({ message: "User with this email already exists" });

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3️⃣ Insert into Auth DB
    const [result] = await db.query(
      "INSERT INTO users (userName, email, password, phoneNumber, activeStatus) VALUES (?, ?, ?, ?, ?)",
      [userName, email, hashedPassword, phoneNumber || null, true]
    );

    const newUserID = result.insertId; // ✅ newly created user's ID

    // 4️⃣ Create blank profile in App DB (call app server)
    const axios = require("axios");

    try {
      await axios.post("http://localhost:5000/profile/create", {
        userID: newUserID,
        fullName: userName,
      });
    } catch (profileErr) {
      console.error("⚠️ Could not create profile:", profileErr.message);
      // don't fail registration even if profile creation fails
    }

    // 5️⃣ Respond success
    res.json({ message: "User registered successfully", userID: newUserID });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!users.length) return res.status(400).json({ message: "Invalid email or password" });

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(400).json({ message: "Invalid email or password" });

    if (!user.activeStatus)
      return res.status(403).json({ message: "Account is inactive" });

    const token = jwt.sign(
      { userID: user.userID, userName: user.userName, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => console.log(`Auth service running on port ${process.env.PORT}`));
