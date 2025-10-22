const express = require("express");
const multer = require("multer");
const path = require("path");
const { authenticateToken } = require("../middleware/auth");
const db = require("../db");

const router = express.Router();

// File upload setup
const upload = multer({ dest: "uploads/posts/" });

// 📤 Create a new post
router.post("/", authenticateToken, upload.single("image"), async (req, res) => {
  const { content } = req.body;
  const imagePath = req.file ? `/uploads/posts/${req.file.filename}` : null;

  try {
    await db.query("INSERT INTO posts (userID, content, image) VALUES (?, ?, ?)", [
      req.user.userID,
      content,
      imagePath,
    ]);
    res.json({ message: "Post created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 📋 Get all posts
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, pr.fullName, pr.photo
      FROM posts p
      JOIN profiles pr ON p.userID = pr.userID
      ORDER BY p.createdAt DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
