const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

// Middleware to verify token
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

// Example explore route
app.get("/explore", authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM explore_items");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => console.log(`Explore service running on port ${process.env.PORT}`));
